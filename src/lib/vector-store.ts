// Vector store abstraction with two backends:
//  - "local"  : EntityDB (fully client-side, IndexedDB, embeds via Transformers.js)
//  - "qdrant" : a remote Qdrant server reached over its REST API (we embed locally)
import type { Chunk } from "./chunking";

export interface SearchHit {
  chunkId: string;
  score: number;
  text: string; // contextualized text (what was embedded)
  rawText: string; // chunk text without the context prefix
  headingPath: string[];
  page?: number;
  elementIds: string[];
}

export type UpsertProgress = (done: number, total: number) => void;

export interface VectorStore {
  upsert(chunks: Chunk[], vectors: number[][], onProgress?: UpsertProgress): Promise<void>;
  search(queryVector: number[], topK: number): Promise<SearchHit[]>;
}

export interface QdrantConn {
  url: string;
  apiKey: string;
}

export interface StoreConfig {
  dbMode: "local" | "qdrant";
  model: string;
  collection: string;
  qdrant?: QdrantConn;
}

/**
 * Accept a single Qdrant link that may already embed the API key
 * (`https://<key>@host:6333`, `https://user:<key>@host`, or `?api_key=<key>`),
 * with an optional separate key as fallback. Returns a clean url + key.
 */
export function parseQdrant(raw: string, apiKey = ""): QdrantConn {
  let url = (raw || "").trim();
  let key = (apiKey || "").trim();
  try {
    const u = new URL(url);
    if (u.password) {
      key = decodeURIComponent(u.password);
      u.password = "";
      u.username = "";
    } else if (u.username && !key) {
      key = decodeURIComponent(u.username);
      u.username = "";
    }
    const qp = u.searchParams.get("api_key") ?? u.searchParams.get("apiKey");
    if (qp) {
      key = qp;
      u.searchParams.delete("api_key");
      u.searchParams.delete("apiKey");
    }
    url = u.toString().replace(/\/+$/, "");
  } catch {
    /* not a parseable URL — leave as typed */
  }
  return { url, apiKey: key };
}

function payloadOf(c: Chunk): Record<string, unknown> {
  return {
    chunkId: c.id,
    text: c.text,
    rawText: c.rawText,
    headingPath: c.headingPath,
    page: c.page ?? null,
    elementIds: c.elementIds,
  };
}

function toHit(r: Record<string, unknown>, score: number): SearchHit {
  return {
    chunkId: String(r.chunkId ?? ""),
    score,
    text: String(r.text ?? ""),
    rawText: String(r.rawText ?? r.text ?? ""),
    headingPath: Array.isArray(r.headingPath) ? (r.headingPath as string[]) : [],
    page: r.page == null ? undefined : Number(r.page),
    elementIds: Array.isArray(r.elementIds) ? (r.elementIds as string[]) : [],
  };
}

// --------------------------------------------------------------------------
// EntityDB (local / headless)
// --------------------------------------------------------------------------

interface EntityDBManual {
  insertManualVectors(d: Record<string, unknown>): Promise<number>;
  queryManualVectors(v: number[], o?: { limit?: number }): Promise<Record<string, unknown>[]>;
}

// EntityDB stores everything in one global IndexedDB ("EntityDB"/"vectors") and
// its auto-`insert({text})` path embeds via a CDN-loaded Transformers.js v2
// (fails offline). We therefore embed with our own bundled model and use the
// manual-vector API, tagging every record with `idxKey` so a single store can
// hold one document at a time without cross-contamination.
class EntityVectorStore implements VectorStore {
  private dbPromise: Promise<EntityDBManual> | null = null;
  private model: string;
  private idxKey: string;
  private vectorKey = "vector";

  constructor(model: string, idxKey: string) {
    this.model = model;
    this.idxKey = idxKey;
  }

  private async db(): Promise<EntityDBManual> {
    if (!this.dbPromise) {
      this.dbPromise = import("@babycommando/entity-db").then(
        (m) => new m.EntityDB({ vectorPath: this.vectorKey, model: this.model }) as unknown as EntityDBManual,
      );
    }
    return this.dbPromise;
  }

  async upsert(chunks: Chunk[], vectors: number[][], onProgress?: UpsertProgress): Promise<void> {
    const db = await this.db();
    // Idempotent across reloads: skip if this exact index is already persisted.
    const existing = await db.queryManualVectors([0], { limit: 100000 });
    if (existing.some((r) => r.idxKey === this.idxKey)) {
      onProgress?.(chunks.length, chunks.length);
      return;
    }
    for (let i = 0; i < chunks.length; i++) {
      await db.insertManualVectors({ [this.vectorKey]: vectors[i], idxKey: this.idxKey, ...payloadOf(chunks[i]) });
      onProgress?.(i + 1, chunks.length);
    }
  }

  async search(queryVector: number[], topK: number): Promise<SearchHit[]> {
    const db = await this.db();
    // EntityDB stores every index in one global DB, so we over-fetch then filter by
    // idxKey — the window must be wide enough to still contain this index's chunks
    // even when other versions' vectors rank higher.
    const rows = await db.queryManualVectors(queryVector, { limit: Math.max(topK * 10, 500) });
    const seen = new Set<string>();
    const hits: SearchHit[] = [];
    for (const r of rows) {
      if (r.idxKey !== this.idxKey) continue; // isolate to the current document
      const id = String(r.chunkId ?? "");
      if (seen.has(id)) continue; // dedupe leftover duplicates
      seen.add(id);
      hits.push(toHit(r, Number(r.similarity ?? 0)));
      if (hits.length >= topK) break;
    }
    return hits;
  }
}

// --------------------------------------------------------------------------
// Qdrant (remote server, REST API)
// --------------------------------------------------------------------------

class QdrantVectorStore implements VectorStore {
  private created = false;
  private conn: QdrantConn;
  private collection: string;

  constructor(conn: QdrantConn, collection: string) {
    this.conn = conn;
    this.collection = collection;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.conn.apiKey) h["api-key"] = this.conn.apiKey;
    return h;
  }

  private base(): string {
    return `${this.conn.url}/collections/${encodeURIComponent(this.collection)}`;
  }

  private async ensureCollection(dim: number): Promise<void> {
    if (this.created) return;
    const head = await fetch(this.base(), { headers: this.headers() });
    if (head.status === 404) {
      const res = await fetch(this.base(), {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify({ vectors: { size: dim, distance: "Cosine" } }),
      });
      if (!res.ok) throw new Error(`Qdrant: collection creation failed (HTTP ${res.status}).`);
    } else if (!head.ok) {
      throw new Error(`Qdrant: access denied (HTTP ${head.status}). Check the URL and API key.`);
    }
    this.created = true;
  }

  async upsert(chunks: Chunk[], vectors: number[][], onProgress?: UpsertProgress): Promise<void> {
    if (!chunks.length) return;
    await this.ensureCollection(vectors[0].length);
    const points = chunks.map((c, i) => ({ id: i, vector: vectors[i], payload: payloadOf(c) }));
    const res = await fetch(`${this.base()}/points?wait=true`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ points }),
    });
    if (!res.ok) throw new Error(`Qdrant: indexing failed (HTTP ${res.status}).`);
    onProgress?.(chunks.length, chunks.length);
  }

  async search(queryVector: number[], topK: number): Promise<SearchHit[]> {
    const res = await fetch(`${this.base()}/points/search`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ vector: queryVector, limit: topK, with_payload: true }),
    });
    if (!res.ok) throw new Error(`Qdrant: search failed (HTTP ${res.status}).`);
    const data = (await res.json()) as { result?: { score: number; payload?: Record<string, unknown> }[] };
    return (data.result ?? []).map((r) => toHit(r.payload ?? {}, r.score));
  }
}

export function createVectorStore(cfg: StoreConfig): VectorStore {
  if (cfg.dbMode === "qdrant") {
    if (!cfg.qdrant?.url) throw new Error("Qdrant URL missing.");
    return new QdrantVectorStore(cfg.qdrant, cfg.collection);
  }
  return new EntityVectorStore(cfg.model, cfg.collection);
}
