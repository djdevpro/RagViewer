// Client-side text embeddings via Transformers.js (feature-extraction pipeline).
// Used for Qdrant indexing/search and for semantic chunking. The model is
// cached across calls; switching model rebuilds the pipeline.
import { pipeline } from "@huggingface/transformers";

export const DEFAULT_EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
export type ProgressFn = (p: unknown) => void;

type FeatureOutput = { tolist?: () => number[][]; data?: ArrayLike<number>; dims?: number[] };
type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<FeatureOutput>;

let cached: { model: string; extractor: Extractor } | null = null;

export async function getExtractor(model: string, onProgress?: ProgressFn): Promise<Extractor> {
  if (cached && cached.model === model) return cached.extractor;
  const extractor = (await pipeline("feature-extraction", model, {
    progress_callback: onProgress,
  } as Record<string, unknown>)) as unknown as Extractor;
  cached = { model, extractor };
  return extractor;
}

function toMatrix(out: FeatureOutput, n: number): number[][] {
  if (typeof out.tolist === "function") return out.tolist();
  const dims = out.dims ?? [n, (out.data?.length ?? 0) / Math.max(1, n)];
  const dim = dims[dims.length - 1];
  const data = out.data ?? [];
  const m: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < dim; j++) row.push(Number(data[i * dim + j]));
    m.push(row);
  }
  return m;
}

/** Mean-pooled, L2-normalized sentence embeddings. */
export async function embedTexts(model: string, texts: string[], onProgress?: ProgressFn): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor(model, onProgress);
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  return toMatrix(out, texts.length);
}
