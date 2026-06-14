// Headless (client-side) DocLang engine: bridges the main thread to the Web Worker
// that runs the @doclith pipeline (PDF -> layout -> DocLang) off-thread.
import type { LayoutBlock, LayoutLabel } from "@doclith/pdf";
import type { DocLangElementType, PageData, Zone } from "../types";
import { docStore, patchDoc } from "../store/doclang-store";
import { colorizeZones } from "./zone-colors";

/** Per-page layout result returned by the worker (boxes in PDF points, top-left origin). */
/** A layout block plus, for `table` blocks, the reconstructed cell grid. */
export type PreviewBlock = LayoutBlock & { grid?: string[][] };

export interface WorkerPage {
  width: number;
  height: number;
  blocks: PreviewBlock[];
}

export interface WorkerStatus {
  stage: "parse" | "model" | "page";
  message: string;
  page?: number;
  total?: number;
}

export type WorkerMsg =
  | ({ id: string; type: "status" } & WorkerStatus)
  | { id: string; type: "page"; index: number; page: WorkerPage }
  | { id: string; type: "done"; xml?: string }
  | { id: string; type: "error"; message: string };

export interface LocalHandlers {
  /** Convert only this page index (re-run). Omit to convert the whole document. */
  only?: number;
  onStatus?: (s: WorkerStatus) => void;
  onPage?: (index: number, page: WorkerPage) => void;
}

// --- worker client (singleton; routes messages by request id) ---
let worker: Worker | null = null;
const pending = new Map<
  string,
  { resolve: (r: { xml?: string }) => void; reject: (e: Error) => void; h: LocalHandlers }
>();

function ensure(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../doclang-worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
    const m = e.data;
    const entry = pending.get(m.id);
    if (!entry) return;
    if (m.type === "status") entry.h.onStatus?.(m);
    else if (m.type === "page") entry.h.onPage?.(m.index, m.page);
    else if (m.type === "done") {
      entry.resolve({ xml: m.xml });
      pending.delete(m.id);
    } else if (m.type === "error") {
      entry.reject(new Error(m.message));
      pending.delete(m.id);
    }
  };
  return worker;
}

/** Convert a PDF client-side, streaming per-page results via `onPage`. Images unsupported. */
export function convertLocal(reqId: string, file: File, h: LocalHandlers = {}): Promise<{ xml?: string }> {
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject, h });
    ensure().postMessage({ id: reqId, file, only: h.only });
  });
}

// --- region label -> DocLang zone type (overlay/inspector) ---
const LABEL: Record<LayoutLabel, DocLangElementType> = {
  heading: "heading",
  text: "text",
  list: "list",
  table: "table",
  caption: "caption",
  figure: "picture",
  other: "unknown",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Per-zone DocLang fragment shown in the XML slices (CodePanel). The authoritative
// document XML comes from serializeDocLang; this is a readable per-zone preview.
function fragmentXml(type: DocLangElementType, text: string, level?: number): string {
  const tag = type === "unknown" ? "custom" : type;
  const attrs = type === "heading" && level ? ` level="${level}"` : "";
  return `<${tag}${attrs}>${esc(text)}</${tag}>`;
}

/**
 * Maps one worker page's layout blocks onto its rendered page. Boxes are in PDF points
 * (scale 1); rescale to the rendered page's pixel size. Zone ids are page-scoped.
 */
export function pageZones(wp: WorkerPage, pageIndex: number, rendered: PageData): Zone[] {
  if (!wp.width || !wp.height) return [];
  const sx = rendered.width / wp.width;
  const sy = rendered.height / wp.height;
  const zones: Zone[] = [];
  let k = 0;
  for (const b of wp.blocks) {
    if (!b.box) continue;
    const type = LABEL[b.label] ?? "unknown";
    // Tables: emit a tab/newline grid so the preview renders a real <table>.
    const text = type === "table" && b.grid ? b.grid.map((r) => r.join("\t")).join("\n") : b.text;
    zones.push({
      id: `p${pageIndex}z${k++}`,
      type,
      text,
      bbox: { x0: b.box.x0 * sx, y0: b.box.y0 * sy, x1: b.box.x1 * sx, y1: b.box.y1 * sy },
      loc: [0, 0, 0, 0],
      level: b.level,
      xml: fragmentXml(type, text, b.level),
      page: pageIndex,
    });
  }
  return zones;
}

let rerunSeq = 0;

/** Re-run layout inference on a single page (local engine); replaces that page's zones. */
export async function rerunPage(docId: string, index: number): Promise<void> {
  const d0 = docStore.state.docs.find((x) => x.id === docId);
  // Only for finished, local-engine docs (re-running a server doc would mix engines).
  if (!d0?.file || !d0.pages[index] || d0.status !== "done" || d0.engine !== "local") return;
  patchDoc(docId, { pages: d0.pages.map((p, i) => (i === index ? { ...p, status: "processing" } : p)) });

  let captured: WorkerPage | null = null;
  try {
    await convertLocal(`${docId}:rerun:${index}:${rerunSeq++}`, d0.file, {
      only: index,
      onPage: (idx, wp) => {
        if (idx === index) captured = wp;
      },
    });
  } catch {
    /* fall through and clear the spinner below */
  }

  const mid = docStore.state.docs.find((x) => x.id === docId);
  const rendered = mid?.pages[index];
  if (mid && rendered && captured) {
    const zs = await colorizeZones(mid.pages, pageZones(captured, index, rendered));
    // Re-read live AFTER the async colorize so concurrent re-runs/patches compose.
    const live = docStore.state.docs.find((x) => x.id === docId);
    if (!live) return;
    patchDoc(docId, {
      zones: [...live.zones.filter((z) => z.page !== index), ...zs],
      pages: live.pages.map((p, i) => (i === index ? { ...p, status: "done" } : p)),
      activeZoneId: null,
    });
  } else if (mid) {
    patchDoc(docId, { pages: mid.pages.map((p, i) => (i === index ? { ...p, status: "done" } : p)) });
  }
}
