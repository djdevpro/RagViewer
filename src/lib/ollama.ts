// Query a local Ollama server for its installed models. A failure means the
// server isn't running (or blocks browser access via CORS).
export async function listOllamaModels(url: string): Promise<string[]> {
  const base = (url || "").replace(/\/+$/, "");
  if (!base) throw new Error("Ollama URL missing.");
  let res: Response;
  try {
    res = await fetch(`${base}/api/tags`);
  } catch {
    throw new Error("Ollama server not running (or browser access blocked — see OLLAMA_ORIGINS).");
  }
  if (!res.ok) throw new Error(`Ollama server unreachable (HTTP ${res.status}).`);
  const data = (await res.json()) as { models?: { name?: string }[] };
  return (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);
}

/** Compute embeddings with an Ollama model (e.g. qwen3-embedding). */
export async function ollamaEmbed(url: string, model: string, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!model) throw new Error("No Ollama embedding model selected (Settings).");
  const base = (url || "").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
    });
  } catch {
    throw new Error("Ollama server not running (or browser access blocked — see OLLAMA_ORIGINS).");
  }
  if (!res.ok) throw new Error(`Ollama embeddings (HTTP ${res.status}) — check the URL and model.`);
  const data = (await res.json()) as { embeddings?: number[][] };
  if (!data.embeddings || !data.embeddings.length) throw new Error("Ollama returned no embeddings for this model.");
  return data.embeddings;
}
