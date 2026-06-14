// Orchestration for the RAG workspace:
//  - recomputePreview(): cheap, synchronous chunking for the live boundary overlay
//  - computeIndex(): chunk → embed → store → build the embedding cloud (unlocks drag)
//  - runQuery(): embed a keyword and highlight the nearest chunks in the cloud
import { chunkDocument } from "./chunking";
import { createVectorStore, parseQdrant, type VectorStore } from "./vector-store";
import { buildGraph } from "./graph";
import { ragStore, setRag, addVersion, selectedOrLatestVersion, type RagSettings } from "../store/rag-store";
import { docStore, activeDoc } from "../store/doclang-store";
import type { Zone } from "../types";

// One vector store per computed chunking version.
const stores = new Map<string, VectorStore>();

function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Route embeddings to the configured provider (Transformers.js or Ollama).
async function embedWith(s: RagSettings, texts: string[]): Promise<number[][]> {
  if (s.embedProvider === "ollama") {
    const { ollamaEmbed } = await import("./ollama");
    return ollamaEmbed(s.ollamaUrl, s.model, texts);
  }
  const { embedTexts } = await import("./embeddings");
  return embedTexts(s.model, texts);
}

function collectionName(docId: string, sig: string): string {
  return `doclang_${docId.replace(/[^a-zA-Z0-9_]/g, "")}_${hashKey(sig)}`;
}

// Cache sentence embeddings so semantic-threshold tweaks don't re-embed the doc.
let embedCache: { key: string; vecs: number[][] } | null = null;
async function cachedEmbed(s: RagSettings, texts: string[]): Promise<number[][]> {
  const key = `${s.embedProvider}|${s.ollamaUrl}|${s.model}|${texts.length}|${texts[0] ?? ""}|${texts[texts.length - 1] ?? ""}`;
  if (embedCache && embedCache.key === key) return embedCache.vecs;
  const vecs = await embedWith(s, texts);
  embedCache = { key, vecs };
  return vecs;
}

let semTimer: ReturnType<typeof setTimeout> | null = null;
let semSeq = 0;

/** Live preview of the découpage. Sync for non-semantic; debounced+async (with an
 *  embedding cache) for semantic so the découpage is always visible in step 2. */
export function recomputePreview(): void {
  const doc = activeDoc(docStore.state);
  const s = ragStore.state.settings;
  if (!doc || doc.status !== "done") {
    setRag({ chunks: [], previewBusy: false });
    return;
  }
  if (s.chunk.strategy === "semantic") {
    // Semantic needs embeddings → debounced async preview.
    setRag({ previewBusy: true });
    if (semTimer) clearTimeout(semTimer);
    const id = doc.id;
    semTimer = setTimeout(() => void semanticPreview(id), 350);
    return;
  }
  if (semTimer) {
    clearTimeout(semTimer);
    semTimer = null;
  }
  try {
    setRag({ chunks: chunkDocument(doc.zones, s.chunk), previewBusy: false });
  } catch {
    /* ignore preview errors */
  }
}

async function semanticPreview(docId: string): Promise<void> {
  const seq = ++semSeq;
  try {
    const doc = activeDoc(docStore.state);
    const s = ragStore.state.settings;
    if (!doc || doc.id !== docId || s.chunk.strategy !== "semantic") {
      setRag({ previewBusy: false });
      return;
    }
    const { chunkSemantic } = await import("./chunking");
    const chunks = await chunkSemantic(doc.zones, s.chunk, (texts) => cachedEmbed(s, texts));
    if (seq !== semSeq) return; // a newer preview superseded this one
    setRag({ chunks, previewBusy: false, error: null });
  } catch (e) {
    if (seq === semSeq) setRag({ previewBusy: false, error: e instanceof Error ? e.message : String(e) });
  }
}

async function buildChunks(zones: Zone[], s: RagSettings) {
  if (s.chunk.strategy === "semantic") {
    const { chunkSemantic } = await import("./chunking");
    return chunkSemantic(zones, s.chunk, (texts) => embedWith(s, texts));
  }
  return chunkDocument(zones, s.chunk);
}

export async function computeIndex(): Promise<void> {
  const doc = activeDoc(docStore.state);
  if (!doc) {
    setRag({ indexState: "error", error: "No active document." });
    return;
  }
  if (doc.status !== "done") {
    setRag({ indexState: "error", error: "The document is still being converted." });
    return;
  }
  const s = ragStore.state.settings;
  const versionId = crypto.randomUUID();

  setRag({ indexState: "computing", error: null, status: "Chunking the document…", highlightIds: [], rankedChunkIds: [] });
  try {
    const chunks = await buildChunks(doc.zones, s);
    if (!chunks.length) throw new Error("Empty document: nothing to index.");
    setRag({ chunks, status: "Computing embeddings…" });

    const vectors = await embedWith(s, chunks.map((c) => c.text));

    const qdrant = s.dbMode === "qdrant" ? parseQdrant(s.qdrantUrl, s.qdrantApiKey) : undefined;
    if (s.dbMode === "qdrant" && !qdrant?.url) throw new Error("Set the Qdrant URL in Settings.");
    const store = createVectorStore({ dbMode: s.dbMode, model: s.model, collection: collectionName(doc.id, versionId), qdrant });

    setRag({ status: `Indexing ${chunks.length} chunks…` });
    await store.upsert(chunks, vectors, (d, t) => setRag({ status: `Indexing ${d}/${t}…` }));

    setRag({ status: "Building the embedding cloud…" });
    const graph = buildGraph(chunks, vectors, 3);

    // New version (the bottom strip) → becomes active.
    stores.set(versionId, store);
    const n = ragStore.state.versions.length + 1;
    addVersion({ id: versionId, label: `Chunking ${n}`, createdAt: Date.now(), docId: doc.id, strategy: s.chunk.strategy, chunks, graph });
    setRag({ indexState: "ready", status: null });
  } catch (e) {
    setRag({ indexState: "error", status: null, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Retrieve the top-K most relevant chunks for a query. A conversation passes its
 *  bound versionId so the LLM always queries the right chunking's index; falls back
 *  to the active version when none is bound. */
export async function retrieve(query: string, topK: number, versionId?: string | null) {
  const id = versionId ?? ragStore.state.activeVersionId ?? "";
  const store = stores.get(id) ?? null;
  if (!store) throw new Error("No chunking version for this conversation — run “Compute & explore” first.");
  const [vec] = await embedWith(ragStore.state.settings, [query]);
  return store.search(vec, topK);
}

/** Embed a keyword, highlight the nearest chunks (nodes) in the cloud AND rank every
 *  chunk by distance so the chunk panel can re-sort (closest first). Operates on the
 *  version currently shown in Explore (selected, else the latest). */
export async function runQuery(text: string): Promise<void> {
  setRag({ query: text });
  const q = text.trim();
  const st = ragStore.state;
  const v = selectedOrLatestVersion(st);
  const store = stores.get(v?.id ?? "") ?? null;
  if (!q || !store || !v?.graph) {
    setRag({ highlightIds: [], rankedChunkIds: [] });
    return;
  }
  try {
    const [vec] = await embedWith(st.settings, [q]);
    // Rank ALL chunks (so the panel can re-sort); the cloud keeps only the top-K lit.
    const hits = await store.search(vec, Math.max(st.settings.topK, v.chunks.length));
    const rankedChunkIds = hits.map((h) => h.chunkId);
    const byChunk = new Map(v.graph.nodes.map((n) => [n.chunkId, n.id]));
    const highlightIds = hits
      .slice(0, st.settings.topK)
      .map((h) => byChunk.get(h.chunkId))
      .filter((x): x is string => !!x);
    setRag({ highlightIds, rankedChunkIds });
  } catch (e) {
    setRag({ error: e instanceof Error ? e.message : String(e) });
  }
}
