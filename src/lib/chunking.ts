import type { BBox, DocLangElementType } from "../types";

/**
 * Document chunking for RAG, operating on the structured DocLang element list
 * (`Zone[]`) rather than raw markdown. This mirrors Docling's approach: chunk
 * over document structure, contextualize each chunk with its heading path, and
 * apply token-aware split/merge. Five strategies are exposed via presets.
 *
 * The four deterministic strategies are synchronous (`chunkDocument`). The
 * embedding-based `semantic` strategy is async and receives an injected
 * `embed` function so it can reuse the model already loaded by the app.
 */

export type ChunkStrategy = "structural" | "hybrid" | "recursive" | "fixed" | "semantic";
export type ContextMode = "none" | "headingPath" | "headingPath+captions";
export type SizeUnit = "tokens" | "chars";

export interface ChunkConfig {
  /** Splitting strategy. Default "hybrid" (Docling-style). */
  strategy: ChunkStrategy;
  /** Size unit for maxSize/minSize. */
  unit: SizeUnit;
  /** Hard cap per chunk (incl. context prefix). Should match the embedding model. */
  maxSize: number;
  /** Undersized chunks below this are merged with same-heading neighbours. 0 = off. */
  minSize: number;
  /** Overlap fraction 0..0.9 (recursive/fixed only). */
  overlap: number;
  /** Heading levels that open a new section/context. */
  headingLevelsToSplitOn: number[];
  mergeListItems: boolean;
  keepTablesIntact: boolean;
  keepCodeIntact: boolean;
  /** What gets prepended before embedding. */
  contextualize: ContextMode;
  /** Cosine-distance percentile (0..100) for semantic breakpoints. */
  semanticThreshold: number;
  /** Emit a stable parentId per section (enables small-to-big retrieval). */
  emitParentLinks: boolean;
}

/** Structural subset of `Zone` accepted as chunker input. `Zone[]` is assignable. */
export interface ChunkElement {
  id: string;
  type: DocLangElementType;
  text: string;
  level?: number;
  page?: number;
  bbox?: BBox;
}

export interface Chunk {
  id: string;
  /** Contextualized text — this is what gets embedded. */
  text: string;
  /** Chunk text without the context prefix. */
  rawText: string;
  headingPath: string[];
  type: DocLangElementType | "mixed";
  page?: number;
  bbox?: BBox;
  elementIds: string[];
  parentId?: string;
  /** Measured size of `text` in `config.unit`. */
  size: number;
}

export type SizeFn = (text: string) => number;
export type EmbedFn = (texts: string[]) => Promise<number[][]>;
export interface ChunkOpts {
  /** Token counter; defaults to a ~4 chars/token heuristic. Wire the real tokenizer here. */
  countTokens?: SizeFn;
}

/** ~4 chars/token heuristic — good enough until the model tokenizer is wired in. */
export const approxTokenCount: SizeFn = (t) => Math.ceil(t.length / 4);

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  strategy: "hybrid",
  unit: "tokens",
  maxSize: 256,
  minSize: 64,
  overlap: 0,
  headingLevelsToSplitOn: [1, 2, 3],
  mergeListItems: true,
  keepTablesIntact: true,
  keepCodeIntact: true,
  contextualize: "headingPath",
  semanticThreshold: 95,
  emitParentLinks: true,
};

/** Ready-to-use presets (the user-facing "modes" of chunking). */
export const CHUNK_PRESETS: Record<string, ChunkConfig> = {
  balanced: DEFAULT_CHUNK_CONFIG,
  precision: { ...DEFAULT_CHUNK_CONFIG, strategy: "structural", maxSize: 128, minSize: 0 },
  wideContext: { ...DEFAULT_CHUNK_CONFIG, strategy: "hybrid", maxSize: 256, minSize: 192 },
  recursive: { ...DEFAULT_CHUNK_CONFIG, strategy: "recursive", overlap: 0.15 },
  semantic: { ...DEFAULT_CHUNK_CONFIG, strategy: "semantic", semanticThreshold: 95 },
  fixed: { ...DEFAULT_CHUNK_CONFIG, strategy: "fixed", overlap: 0.15 },
};

interface Annotated {
  el: ChunkElement;
  path: string[];
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export function chunkDocument(
  elements: ChunkElement[],
  config: ChunkConfig,
  opts: ChunkOpts = {},
): Chunk[] {
  const sizeFn = makeSizer(config, opts.countTokens ?? approxTokenCount);
  const ann = annotate(elements, config);
  if (config.strategy === "structural") return chunkStructural(ann, config, sizeFn);
  if (config.strategy === "hybrid") return chunkHybrid(ann, config, sizeFn);
  if (config.strategy === "recursive") return chunkBySplit(ann, config, sizeFn, "recursive");
  if (config.strategy === "fixed") return chunkBySplit(ann, config, sizeFn, "fixed");
  throw new Error(`Strategy "${config.strategy}" requires chunkSemantic().`);
}

export async function chunkSemantic(
  elements: ChunkElement[],
  config: ChunkConfig,
  embed: EmbedFn,
  opts: ChunkOpts = {},
): Promise<Chunk[]> {
  const sizeFn = makeSizer(config, opts.countTokens ?? approxTokenCount);
  const ann = annotate(elements, config);
  const sents: { text: string; path: string[]; el: ChunkElement }[] = [];
  for (const a of ann) {
    if (a.el.type === "heading") continue;
    for (const s of splitSentences(a.el.text)) sents.push({ text: s, path: a.path, el: a.el });
  }
  if (sents.length === 0) return [];

  const vecs = await embed(sents.map((s) => s.text));
  const dists: number[] = [];
  for (let i = 1; i < sents.length; i++) dists.push(1 - cosine(vecs[i - 1], vecs[i]));
  const thr = percentile(dists, config.semanticThreshold);

  const groups: (typeof sents)[] = [[sents[0]]];
  for (let i = 1; i < sents.length; i++) {
    const brk = !samePath(sents[i].path, sents[i - 1].path) || dists[i - 1] > thr;
    if (brk) groups.push([]);
    groups[groups.length - 1].push(sents[i]);
  }

  const out: Chunk[] = [];
  for (const g of groups) {
    const path = g[0].path;
    const els = uniqueEls(g.map((s) => s.el));
    const raw = g.map((s) => s.text).join(" ");
    if (sizeFn(applyContext(raw, path, config)) <= config.maxSize) {
      out.push(textToChunk(raw, path, config, sizeFn, els));
    } else {
      for (const part of recursiveSplit(raw, contentBudget(config, path, sizeFn), sizeFn)) {
        out.push(textToChunk(part, path, config, sizeFn, els));
      }
    }
  }
  return linkParents(out, config);
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

function chunkStructural(ann: Annotated[], config: ChunkConfig, sizeFn: SizeFn): Chunk[] {
  const out: Chunk[] = [];
  for (let i = 0; i < ann.length; i++) {
    const a = ann[i];
    const el = a.el;
    if (el.type === "heading") continue;

    if (config.mergeListItems && el.type === "list_item") {
      const group = [el];
      let j = i + 1;
      while (j < ann.length && ann[j].el.type === "list_item" && samePath(ann[j].path, a.path)) {
        group.push(ann[j].el);
        j++;
      }
      out.push(elementsToChunk(group, a.path, config, sizeFn));
      i = j - 1;
      continue;
    }

    if ((el.type === "table" || el.type === "picture") && config.contextualize === "headingPath+captions") {
      const group = [el];
      if (i + 1 < ann.length && ann[i + 1].el.type === "caption" && samePath(ann[i + 1].path, a.path)) {
        group.push(ann[i + 1].el);
        i++;
      }
      out.push(elementsToChunk(group, a.path, config, sizeFn));
      continue;
    }

    if (sizeFn(applyContext(el.text, a.path, config)) > config.maxSize) {
      for (const part of recursiveSplit(el.text, contentBudget(config, a.path, sizeFn), sizeFn)) {
        out.push(textToChunk(part, a.path, config, sizeFn, [el]));
      }
      continue;
    }

    out.push(elementsToChunk([el], a.path, config, sizeFn));
  }
  return linkParents(out, config);
}

function chunkHybrid(ann: Annotated[], config: ChunkConfig, sizeFn: SizeFn): Chunk[] {
  const out: Chunk[] = [];
  let buf: ChunkElement[] = [];
  let path: string[] = [];
  const flush = () => {
    if (buf.length) {
      out.push(elementsToChunk(buf, path, config, sizeFn));
      buf = [];
    }
  };

  for (const a of ann) {
    const el = a.el;
    if (el.type === "heading") {
      flush();
      path = a.path;
      continue;
    }
    if (!samePath(a.path, path)) {
      flush();
      path = a.path;
    }

    const atomic =
      (el.type === "table" && config.keepTablesIntact) || (el.type === "code" && config.keepCodeIntact);
    if (atomic) {
      flush();
      path = a.path;
      out.push(elementsToChunk([el], a.path, config, sizeFn));
      continue;
    }

    if (sizeFn(applyContext(el.text, a.path, config)) > config.maxSize) {
      flush();
      path = a.path;
      for (const part of recursiveSplit(el.text, contentBudget(config, a.path, sizeFn), sizeFn)) {
        out.push(textToChunk(part, a.path, config, sizeFn, [el]));
      }
      continue;
    }

    const tentative = sizeFn(applyContext([...buf, el].map((e) => e.text).join("\n\n"), a.path, config));
    if (buf.length && tentative > config.maxSize) {
      flush();
      path = a.path;
    }
    buf.push(el);
    path = a.path;
  }
  flush();
  return linkParents(mergePeers(out, config, sizeFn), config);
}

function chunkBySplit(
  ann: Annotated[],
  config: ChunkConfig,
  sizeFn: SizeFn,
  mode: "recursive" | "fixed",
): Chunk[] {
  const out: Chunk[] = [];
  let i = 0;
  while (i < ann.length) {
    if (ann[i].el.type === "heading") {
      i++;
      continue;
    }
    const path = ann[i].path;
    const els: ChunkElement[] = [];
    while (i < ann.length && ann[i].el.type !== "heading" && samePath(ann[i].path, path)) {
      els.push(ann[i].el);
      i++;
    }
    const text = els.map((e) => e.text).join("\n\n");
    const budget = contentBudget(config, path, sizeFn);
    let parts = mode === "fixed" ? fixedSplit(text, budget, config, sizeFn) : recursiveSplit(text, budget, sizeFn);
    if (mode === "recursive" && config.overlap > 0) parts = applyOverlap(parts, config);
    for (const p of parts) out.push(textToChunk(p, path, config, sizeFn, els));
  }
  return linkParents(out, config);
}

// ---------------------------------------------------------------------------
// Merge / context / builders
// ---------------------------------------------------------------------------

function mergePeers(chunks: Chunk[], config: ChunkConfig, sizeFn: SizeFn): Chunk[] {
  if (config.minSize <= 0) return chunks;
  const out: Chunk[] = [];
  for (const c of chunks) {
    const prev = out[out.length - 1];
    if (prev && c.size < config.minSize && samePath(prev.headingPath, c.headingPath)) {
      const rawText = `${prev.rawText}\n\n${c.rawText}`;
      const text = applyContext(rawText, prev.headingPath, config);
      if (sizeFn(text) <= config.maxSize) {
        out[out.length - 1] = {
          ...prev,
          rawText,
          text,
          size: sizeFn(text),
          elementIds: [...prev.elementIds, ...c.elementIds],
          type: prev.type === c.type ? prev.type : "mixed",
          bbox: unionBBox2(prev.bbox, c.bbox),
        };
        continue;
      }
    }
    out.push(c);
  }
  return out;
}

function applyContext(rawText: string, path: string[], config: ChunkConfig, captions: string[] = []): string {
  if (config.contextualize === "none") return rawText;
  const parts: string[] = [];
  if (path.length) parts.push(path.join(" > "));
  if (config.contextualize === "headingPath+captions" && captions.length) parts.push(captions.join(" "));
  const head = parts.join("\n");
  return head ? `${head}\n\n${rawText}` : rawText;
}

function elementsToChunk(els: ChunkElement[], path: string[], config: ChunkConfig, sizeFn: SizeFn): Chunk {
  const captions = els.filter((e) => e.type === "caption").map((e) => e.text);
  const rawText = els.map((e) => e.text).join("\n\n");
  const text = applyContext(rawText, path, config, captions);
  const types = new Set(els.map((e) => e.type));
  return {
    id: "",
    text,
    rawText,
    headingPath: path,
    type: types.size === 1 ? els[0].type : "mixed",
    page: minPage(els),
    bbox: unionBBox(els),
    elementIds: els.map((e) => e.id),
    size: sizeFn(text),
  };
}

function textToChunk(
  part: string,
  path: string[],
  config: ChunkConfig,
  sizeFn: SizeFn,
  els: ChunkElement[],
): Chunk {
  const text = applyContext(part, path, config);
  const types = new Set(els.map((e) => e.type));
  return {
    id: "",
    text,
    rawText: part,
    headingPath: path,
    type: els.length === 0 ? "text" : types.size === 1 ? els[0].type : "mixed",
    page: minPage(els),
    bbox: unionBBox(els),
    elementIds: els.map((e) => e.id),
    size: sizeFn(text),
  };
}

function linkParents(chunks: Chunk[], config: ChunkConfig): Chunk[] {
  return chunks.map((c, i) => ({
    ...c,
    id: `c${i}`,
    parentId: config.emitParentLinks && c.headingPath.length ? `sec:${c.headingPath.join(" > ")}` : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Text splitting helpers
// ---------------------------------------------------------------------------

function recursiveSplit(
  text: string,
  budget: number,
  sizeFn: SizeFn,
  seps: string[] = ["\n\n", "\n", ". ", " "],
): string[] {
  const t = text.trim();
  if (!t) return [];
  if (sizeFn(t) <= budget) return [t];
  for (let s = 0; s < seps.length; s++) {
    const sep = seps[s];
    if (!t.includes(sep)) continue;
    const pieces = t.split(sep).filter(Boolean);
    const out: string[] = [];
    let cur = "";
    for (const p of pieces) {
      const cand = cur ? cur + sep + p : p;
      if (sizeFn(cand) <= budget) {
        cur = cand;
      } else {
        if (cur) out.push(cur);
        if (sizeFn(p) > budget) {
          out.push(...recursiveSplit(p, budget, sizeFn, seps.slice(s + 1)));
          cur = "";
        } else {
          cur = p;
        }
      }
    }
    if (cur) out.push(cur);
    return out;
  }
  return hardSplit(t, budget, sizeFn);
}

function fixedSplit(text: string, budget: number, config: ChunkConfig, sizeFn: SizeFn): string[] {
  const t = text.trim();
  if (!t) return [];
  const total = sizeFn(t) || 1;
  const charsPerUnit = t.length / total;
  const win = Math.max(1, Math.round(budget * charsPerUnit));
  const step = Math.max(1, Math.round(win * (1 - config.overlap)));
  const out: string[] = [];
  for (let i = 0; i < t.length; i += step) {
    out.push(t.slice(i, i + win));
    if (i + win >= t.length) break;
  }
  return out;
}

function hardSplit(text: string, budget: number, sizeFn: SizeFn): string[] {
  const total = sizeFn(text) || 1;
  const charsPerUnit = text.length / total;
  const win = Math.max(1, Math.floor(budget * charsPerUnit));
  const out: string[] = [];
  for (let i = 0; i < text.length; i += win) out.push(text.slice(i, i + win));
  return out;
}

function applyOverlap(parts: string[], config: ChunkConfig): string[] {
  if (parts.length < 2) return parts;
  const out = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1];
    const ov = Math.round(prev.length * config.overlap);
    const tail = ov > 0 ? prev.slice(prev.length - ov) : "";
    out.push(tail ? `${tail} ${parts[i]}` : parts[i]);
  }
  return out;
}

function splitSentences(t: string): string[] {
  return t
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function makeSizer(config: ChunkConfig, countTokens: SizeFn): SizeFn {
  return config.unit === "chars" ? (t) => t.length : countTokens;
}

function annotate(elements: ChunkElement[], config: ChunkConfig): Annotated[] {
  const stack: { level: number; text: string }[] = [];
  const out: Annotated[] = [];
  for (const el of elements) {
    if (el.type === "heading") {
      const lvl = el.level ?? 1;
      if (config.headingLevelsToSplitOn.includes(lvl)) {
        while (stack.length && stack[stack.length - 1].level >= lvl) stack.pop();
        stack.push({ level: lvl, text: el.text });
      }
    }
    out.push({ el, path: stack.map((s) => s.text) });
  }
  return out;
}

function contentBudget(config: ChunkConfig, path: string[], sizeFn: SizeFn): number {
  const prefix = config.contextualize === "none" ? 0 : sizeFn(applyContext("", path, config));
  return Math.max(1, config.maxSize - prefix);
}

function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function uniqueEls(els: ChunkElement[]): ChunkElement[] {
  const seen = new Set<string>();
  const out: ChunkElement[] = [];
  for (const e of els) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

function minPage(els: ChunkElement[]): number | undefined {
  const ps = els.map((e) => e.page).filter((p): p is number => p != null);
  return ps.length ? Math.min(...ps) : undefined;
}

function unionBBox(els: ChunkElement[]): BBox | undefined {
  const bs = els.map((e) => e.bbox).filter((b): b is BBox => b != null);
  if (!bs.length) return undefined;
  return bs.reduce((u, b) => ({
    x0: Math.min(u.x0, b.x0),
    y0: Math.min(u.y0, b.y0),
    x1: Math.max(u.x1, b.x1),
    y1: Math.max(u.y1, b.y1),
  }));
}

function unionBBox2(a: BBox | undefined, b: BBox | undefined): BBox | undefined {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return Infinity;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
