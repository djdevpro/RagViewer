// LLM chat completion via OpenAI (API key) or Ollama (local server).
import type { SearchHit } from "./vector-store";

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatProviders {
  provider: "openai" | "ollama";
  openai: { apiKey: string; model: string };
  ollama: { url: string; model: string };
}

export function buildContext(hits: SearchHit[]): string {
  return hits
    .map((h, i) => `[${i + 1}] ${h.headingPath.length ? h.headingPath.join(" > ") : "Document"}\n${h.rawText}`)
    .join("\n\n");
}

export const SYSTEM_PROMPT =
  "Answer the user's questions using ONLY the provided document excerpts. " +
  "Cite the relevant passages by their number [n]. If the answer is not in the excerpts, say so clearly. " +
  "Reply in the language of the question.";

export type OnDelta = (full: string) => void;

// Read a line-delimited stream, accumulate the answer, and emit it on every delta.
async function readStream(
  body: ReadableStream<Uint8Array>,
  parseLine: (line: string) => string | null,
  onDelta: OnDelta,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  const consume = (line: string) => {
    const piece = line.trim() ? parseLine(line.trim()) : null;
    if (piece) {
      full += piece;
      onDelta(full);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      consume(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  consume(buffer);
  return full;
}

/** Stream a chat completion, calling `onDelta` with the growing answer. Returns the final text. */
export async function chatStream(cfg: ChatProviders, messages: ChatTurn[], onDelta: OnDelta): Promise<string> {
  if (cfg.provider === "openai") {
    if (!cfg.openai.apiKey) throw new Error("OpenAI API key missing (Settings).");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.openai.apiKey}` },
      body: JSON.stringify({ model: cfg.openai.model, messages, temperature: 0.2, stream: true }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      throw new Error(`OpenAI (HTTP ${res.status}) ${t}`.slice(0, 240));
    }
    return readStream(res.body, (line) => {
      if (!line.startsWith("data:")) return null;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return null;
      try {
        const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        return j.choices?.[0]?.delta?.content ?? null;
      } catch {
        return null;
      }
    }, onDelta);
  }

  const base = cfg.ollama.url.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.ollama.model, messages, stream: true, think: false }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama (HTTP ${res.status}) — check the URL, the installed model and CORS access (OLLAMA_ORIGINS).`);
  }
  return readStream(res.body, (line) => {
    try {
      const j = JSON.parse(line) as { message?: { content?: string } };
      return j.message?.content ?? null;
    } catch {
      return null;
    }
  }, onDelta);
}
