// Etat global (TanStack Store) : file d'images + image active + reglages + theme.
import { Store } from "@tanstack/store";
import type { Step } from "../lib/detour-worker";

export type Mode = "auto" | "solid" | "ai";
export type Theme = "light" | "dark";

export interface ImgItem {
  id: string;
  name: string;
  file: File;
  srcUrl: string;
  status: "pending" | "processing" | "done" | "error";
  plan?: Step[];        // tracing : plan complet des etapes (incl. a venir)
  stepIndex?: number;   // tracing : index de l'etape en cours
  solid?: boolean;      // methode retenue (titre du panneau)
  progress?: number;    // tracing : % de telechargement du modele
  w?: number;           // dimensions naturelles -> ratio d'affichage
  h?: number;
  resultUrl?: string;
  used?: "solid" | "ai";
  error?: string;
}

export interface Settings {
  mode: Mode;
  tol: number;
  previewBg: "checker" | "white" | "black";
}

export interface AppState {
  items: ImgItem[];
  settings: Settings;
  activeId: string | null;
  theme: Theme;
}

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem("detourage-theme");
    if (t === "light" || t === "dark") return t;
  } catch { /* ignore */ }
  return "light";
}

export const appStore = new Store<AppState>({
  items: [],
  settings: { mode: "auto", tol: 45, previewBg: "checker" },
  activeId: null,
  theme: initialTheme(),
});

export const addItems = (items: ImgItem[]) =>
  appStore.setState((s) => ({
    ...s,
    items: [...s.items, ...items],
    activeId: items.length ? items[items.length - 1].id : s.activeId,
  }));

export const setActive = (id: string) => appStore.setState((s) => ({ ...s, activeId: id }));

export const updateItem = (id: string, patch: Partial<ImgItem>) =>
  appStore.setState((s) => ({ ...s, items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

export const removeItem = (id: string) =>
  appStore.setState((s) => {
    const items = s.items.filter((it) => it.id !== id);
    const activeId = s.activeId === id ? (items[items.length - 1]?.id ?? null) : s.activeId;
    return { ...s, items, activeId };
  });

export const clearItems = () => appStore.setState((s) => ({ ...s, items: [], activeId: null }));

export const setSettings = (patch: Partial<Settings>) =>
  appStore.setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));

// Applique le theme au DOM + la couleur de la barre de titre (PWA) qui suit le theme.
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#171920" : "#ffffff");
}

export const setTheme = (theme: Theme) => {
  appStore.setState((s) => ({ ...s, theme }));
  try { localStorage.setItem("detourage-theme", theme); } catch { /* ignore */ }
  applyTheme(theme);
};
