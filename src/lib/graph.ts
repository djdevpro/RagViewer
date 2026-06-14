// Build a k-nearest-neighbour graph from chunk embeddings for the embedding
// "cloud" visualization (force-directed layout clusters similar chunks).
import type { Chunk } from "./chunking";

export interface GraphNode {
  id: string;
  chunkId: string;
  label: string;
  text: string;
  headingPath: string[];
  page?: number;
  elementIds: string[];
  vec: number[];
}

export interface GraphLink {
  source: string;
  target: string;
  sim: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export function cosine(a: number[], b: number[]): number {
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

function nodeLabel(c: Chunk): string {
  const head = c.headingPath.length ? c.headingPath[c.headingPath.length - 1] : "";
  const base = head || c.rawText;
  return base.length > 42 ? base.slice(0, 41) + "…" : base;
}

/** k-NN graph: each chunk linked to its `k` most-similar peers (undirected, deduped). */
export function buildGraph(chunks: Chunk[], vectors: number[][], k = 3): GraphData {
  const nodes: GraphNode[] = chunks.map((c, i) => ({
    id: String(i),
    chunkId: c.id,
    label: nodeLabel(c),
    text: c.rawText,
    headingPath: c.headingPath,
    page: c.page,
    elementIds: c.elementIds,
    vec: vectors[i] ?? [],
  }));

  const n = chunks.length;
  const seen = new Set<string>();
  const links: GraphLink[] = [];
  for (let i = 0; i < n; i++) {
    const sims: { j: number; s: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      sims.push({ j, s: cosine(vectors[i], vectors[j]) });
    }
    sims.sort((a, b) => b.s - a.s);
    for (let t = 0; t < Math.min(k, sims.length); t++) {
      const { j, s } = sims[t];
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const key = `${a}-${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source: String(a), target: String(b), sim: s });
    }
  }
  return { nodes, links };
}

/** Indices of the `topK` nodes most similar to a query vector, in descending order. */
export function nearestNodeIds(nodes: GraphNode[], queryVec: number[], topK: number): string[] {
  return nodes
    .map((node) => ({ id: node.id, s: cosine(node.vec, queryVec) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topK)
    .map((x) => x.id);
}
