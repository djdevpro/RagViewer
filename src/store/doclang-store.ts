// DocLang viewer state (TanStack Store) — multi-document.
import { Store } from "@tanstack/store";
import type { PageData, Zone } from "../types";

export type DocStatus = "pending" | "rendering" | "converting" | "done" | "error";

// Conversion engine: "local" = headless, all client-side in a Web Worker via the
// @doclith libs (default target). "server" = offload to a docling-serve backend.
export type Engine = "local" | "server";

const ENGINE_KEY = "doclang-engine";
const SERVER_KEY = "doclang-server-url";

function loadEngine(): Engine {
  try {
    const e = localStorage.getItem(ENGINE_KEY);
    if (e === "local" || e === "server") return e;
  } catch { /* ignore */ }
  // Default = headless: PDF -> DocLang fully client-side via @doclith in a Web Worker.
  return "local";
}

function loadServerUrl(): string {
  try {
    return localStorage.getItem(SERVER_KEY) || "/docling";
  } catch { return "/docling"; }
}

export interface DocEntry {
  id: string;
  name: string;
  file?: File; // kept to allow re-running inference on a single page
  engine?: Engine; // engine that produced this doc (re-run is local-only)
  status: DocStatus;
  error: string | null;
  pages: PageData[];
  zones: Zone[];
  xml: string;
  currentPage: number;
  activeZoneId: string | null;
}

export interface DocState {
  docs: DocEntry[];
  activeId: string | null;
  showZones: boolean;
  viewMode: "xml" | "md" | "html";
  hoverZoneId: string | null;
  engine: Engine;
  serverUrl: string;
}

const initial: DocState = {
  docs: [],
  activeId: null,
  showZones: true,
  viewMode: "xml",
  hoverZoneId: null,
  engine: loadEngine(),
  serverUrl: loadServerUrl(),
};

export const docStore = new Store<DocState>(initial);

export const setState = (patch: Partial<DocState>) =>
  docStore.setState((s) => ({ ...s, ...patch }));

export const activeDoc = (s: DocState): DocEntry | null =>
  s.docs.find((d) => d.id === s.activeId) ?? null;

export const addDoc = (entry: DocEntry) =>
  docStore.setState((s) => ({
    ...s,
    docs: [...s.docs, entry],
    activeId: s.activeId ?? entry.id,
  }));

export const patchDoc = (id: string, patch: Partial<DocEntry>) =>
  docStore.setState((s) => ({
    ...s,
    docs: s.docs.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  }));

export const setActiveDoc = (id: string) => setState({ activeId: id });

export const patchActive = (patch: Partial<DocEntry>) => {
  const id = docStore.state.activeId;
  if (id) patchDoc(id, patch);
};

export const resetAll = () =>
  docStore.setState((s) => ({
    ...initial,
    viewMode: s.viewMode,
    showZones: s.showZones,
    engine: s.engine,
    serverUrl: s.serverUrl,
  }));

export const setEngine = (engine: Engine) => {
  docStore.setState((s) => ({ ...s, engine }));
  try { localStorage.setItem(ENGINE_KEY, engine); } catch { /* ignore */ }
};

export const setServerUrl = (serverUrl: string) => {
  docStore.setState((s) => ({ ...s, serverUrl }));
  try { localStorage.setItem(SERVER_KEY, serverUrl); } catch { /* ignore */ }
};
