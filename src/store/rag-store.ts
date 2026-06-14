// RAG workspace state (TanStack Store). Two steps: "weave" (configure chunking,
// preview boundaries) and "drag" (explore the embedding cloud, unlocked once the
// index is computed). Settings persist to localStorage; the rest is session-only.
import { Store } from "@tanstack/store";
import { DEFAULT_CHUNK_CONFIG, CHUNK_PRESETS, type Chunk, type ChunkConfig } from "../lib/chunking";
import { SYSTEM_PROMPT } from "../lib/chat";
import type { GraphData } from "../lib/graph";

// Kept local so the heavy Transformers.js module stays out of the initial bundle.
const DEFAULT_EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

export type DbMode = "local" | "qdrant";
export type WorkMode = "preview" | "weave" | "drag" | "chat";
export type IndexState = "idle" | "computing" | "ready" | "error";
export type ChatProvider = "openai" | "ollama";
export type EmbedProvider = "transformers" | "ollama";

export interface RagSettings {
  dbMode: DbMode;
  // Embeddings: Transformers.js (in-browser) or an Ollama model. `model` holds the
  // model id either way (a Xenova id, or an Ollama model name).
  embedProvider: EmbedProvider;
  model: string;
  qdrantUrl: string;
  qdrantApiKey: string;
  chunkPreset: string; // key of CHUNK_PRESETS, or "custom"
  chunk: ChunkConfig;
  topK: number;
  // Chat (RAG Q&A) provider
  chatProvider: ChatProvider;
  openaiKey: string;
  openaiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  chatSystemPrompt: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: { rawText: string; headingPath: string[]; page?: number; elementIds: string[] }[];
  pending?: boolean;
}

// A computed chunking "version" — a snapshot you can switch between to test
// different chunkings against your chats/searches.
export interface ChunkVersion {
  id: string;
  label: string; // "Chunking 1"
  createdAt: number;
  docId: string;
  strategy: string;
  chunks: Chunk[];
  graph: GraphData | null;
}

export interface Conversation {
  id: string;
  createdAt: number;
  title: string;
  versionId: string | null; // the chunking version this conversation queries (its RAG)
  messages: ChatMsg[];
}

export interface RagState {
  settings: RagSettings;
  mode: WorkMode;
  chunks: Chunk[]; // live découpage preview (chunking step)
  indexState: IndexState;
  status: string | null;
  error: string | null;
  query: string;
  highlightIds: string[]; // node ids highlighted by the last query
  rankedChunkIds: string[]; // chunk ids ordered by distance to the last query (closest first)
  activeChunkId: string | null; // selected chunk (accordion / node click)
  hoverChunkId: string | null;
  previewBusy: boolean; // computing the semantic découpage preview
  // Chunking versions (the bottom strip)
  versions: ChunkVersion[];
  activeVersionId: string | null;
  // Chat conversations
  conversations: Conversation[];
  activeConversationId: string | null;
  chatBusy: boolean;
}

const KEY = "doclang-rag-settings";

function loadSettings(): RagSettings {
  const base: RagSettings = {
    dbMode: "local",
    embedProvider: "transformers",
    model: DEFAULT_EMBED_MODEL,
    qdrantUrl: "",
    qdrantApiKey: "",
    chunkPreset: "balanced",
    chunk: DEFAULT_CHUNK_CONFIG,
    topK: 5,
    chatProvider: "ollama",
    openaiKey: "",
    openaiModel: "gpt-4o-mini",
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "",
    chatSystemPrompt: SYSTEM_PROMPT,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<RagSettings>;
      const merged = { ...base, ...p, chunk: { ...DEFAULT_CHUNK_CONFIG, ...(p.chunk ?? {}) } };
      // Drop any stale/removed strategy (e.g. the former "llm") → fall back to default.
      const valid = ["structural", "hybrid", "recursive", "fixed", "semantic"];
      if (!valid.includes(merged.chunk.strategy)) {
        merged.chunk = { ...merged.chunk, strategy: DEFAULT_CHUNK_CONFIG.strategy };
        merged.chunkPreset = "balanced";
      }
      return merged;
    }
  } catch {
    /* ignore */
  }
  return base;
}

export const ragStore = new Store<RagState>({
  settings: loadSettings(),
  mode: "preview",
  chunks: [],
  indexState: "idle",
  status: null,
  error: null,
  query: "",
  highlightIds: [],
  rankedChunkIds: [],
  activeChunkId: null,
  hoverChunkId: null,
  previewBusy: false,
  versions: [],
  activeVersionId: null,
  conversations: [],
  activeConversationId: null,
  chatBusy: false,
});

export const activeVersion = (s: RagState): ChunkVersion | null =>
  s.versions.find((v) => v.id === s.activeVersionId) ?? null;
// For Explore/Découpage: the selected version, or the latest if none is selected.
export const selectedOrLatestVersion = (s: RagState): ChunkVersion | null =>
  activeVersion(s) ?? s.versions[s.versions.length - 1] ?? null;
export const activeConversation = (s: RagState): Conversation | null =>
  s.conversations.find((c) => c.id === s.activeConversationId) ?? null;
// Version a new conversation binds to (the selected one, else the latest).
function bindVersionId(s: RagState): string | null {
  return s.activeVersionId ?? s.versions[s.versions.length - 1]?.id ?? null;
}

function persist(settings: RagSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

// Settings changes reset the live index state (a new compute makes a new version);
// existing versions are kept so you can keep comparing them.
function invalidate(s: RagState, settings: RagSettings): RagState {
  persist(settings);
  return { ...s, settings, indexState: "idle", highlightIds: [], rankedChunkIds: [] };
}

export const setRagSettings = (patch: Partial<RagSettings>) =>
  ragStore.setState((s) => invalidate(s, { ...s.settings, ...patch }));

// Editing the chunking config deselects the active version so the découpe panel
// shows the LIVE preview of the new config (not a frozen version snapshot).
export const setChunkPreset = (preset: string) =>
  ragStore.setState((s) => ({
    ...invalidate(s, { ...s.settings, chunkPreset: preset, chunk: CHUNK_PRESETS[preset] ?? DEFAULT_CHUNK_CONFIG }),
    activeVersionId: null,
  }));

export const setChunkConfig = (patch: Partial<ChunkConfig>) =>
  ragStore.setState((s) => ({
    ...invalidate(s, { ...s.settings, chunk: { ...s.settings.chunk, ...patch }, chunkPreset: "custom" }),
    activeVersionId: null,
  }));

// Chat settings change WITHOUT invalidating the vector index.
export const setChatSettings = (patch: Partial<RagSettings>) =>
  ragStore.setState((s) => {
    const settings = { ...s.settings, ...patch };
    persist(settings);
    return { ...s, settings };
  });

// ---- Chunking versions ----
export const addVersion = (v: ChunkVersion) =>
  ragStore.setState((s) => ({ ...s, versions: [...s.versions, v], activeVersionId: v.id }));
export const setActiveVersion = (id: string) =>
  ragStore.setState((s) => ({ ...s, activeVersionId: id, highlightIds: [], rankedChunkIds: [], query: "" }));
// Toggle: click a selected version again to deselect it (back to "all").
export const toggleVersion = (id: string) =>
  ragStore.setState((s) => ({ ...s, activeVersionId: s.activeVersionId === id ? null : id, highlightIds: [], rankedChunkIds: [], query: "" }));

// ---- Chat conversations (messages live inside the active conversation) ----
function withConversation(s: RagState): { state: RagState; id: string } {
  if (s.activeConversationId && s.conversations.some((c) => c.id === s.activeConversationId)) {
    return { state: s, id: s.activeConversationId };
  }
  const id = crypto.randomUUID();
  const conv: Conversation = { id, createdAt: Date.now(), title: "New chat", versionId: bindVersionId(s), messages: [] };
  return { state: { ...s, conversations: [conv, ...s.conversations], activeConversationId: id }, id };
}

export const newConversation = (): void =>
  ragStore.setState((s) => {
    const id = crypto.randomUUID();
    const conv: Conversation = { id, createdAt: Date.now(), title: "New chat", versionId: bindVersionId(s), messages: [] };
    return { ...s, conversations: [conv, ...s.conversations], activeConversationId: id };
  });

export const setActiveConversation = (id: string) =>
  ragStore.setState((s) => ({ ...s, activeConversationId: id }));

export const deleteConversation = (id: string) =>
  ragStore.setState((s) => {
    const conversations = s.conversations.filter((c) => c.id !== id);
    const activeConversationId = s.activeConversationId === id ? (conversations[0]?.id ?? null) : s.activeConversationId;
    return { ...s, conversations, activeConversationId };
  });

export const pushChat = (m: ChatMsg) =>
  ragStore.setState((s) => {
    const { state, id } = withConversation(s);
    return {
      ...state,
      conversations: state.conversations.map((c) =>
        c.id === id
          ? {
              ...c,
              messages: [...c.messages, m],
              title: c.title === "New chat" && m.role === "user" ? m.text.slice(0, 80) : c.title,
            }
          : c,
      ),
    };
  });

export const updateChat = (mid: string, patch: Partial<ChatMsg>) =>
  ragStore.setState((s) => ({
    ...s,
    conversations: s.conversations.map((c) =>
      c.id === s.activeConversationId ? { ...c, messages: c.messages.map((m) => (m.id === mid ? { ...m, ...patch } : m)) } : c,
    ),
  }));

export const clearChat = () =>
  ragStore.setState((s) => ({
    ...s,
    conversations: s.conversations.map((c) => (c.id === s.activeConversationId ? { ...c, messages: [] } : c)),
  }));

export const setMode = (mode: WorkMode) => ragStore.setState((s) => ({ ...s, mode }));
export const setRag = (patch: Partial<RagState>) => ragStore.setState((s) => ({ ...s, ...patch }));
export const setChunks = (chunks: Chunk[]) => ragStore.setState((s) => ({ ...s, chunks }));
export const setQuery = (query: string) => ragStore.setState((s) => ({ ...s, query }));
export const setHighlight = (highlightIds: string[]) => ragStore.setState((s) => ({ ...s, highlightIds }));
export const setActiveChunk = (activeChunkId: string | null) => ragStore.setState((s) => ({ ...s, activeChunkId }));
export const setHoverChunk = (hoverChunkId: string | null) => ragStore.setState((s) => ({ ...s, hoverChunkId }));
