/// <reference lib="webworker" />
// Headless DocLang engine — runs ENTIRELY here (off the main thread):
// PDF text+positions (pdfjs) + block typing (layout model, onnxruntime-web/WASM) -> DocLang.
// Uses the @doclith libs (browser backend). No server, no OCR.
import * as ort from "onnxruntime-web";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  createBrowserLayoutPredictor,
  groupLines,
  layoutedPagesToDocLang,
  pageLayoutBlocks,
  reconstructTable,
  type LayoutPage,
  type LayoutPredictor,
  type OrtWebModule,
  type PdfBox,
  type PdfLine,
  type RenderablePage,
  type TextItemLike,
} from "@doclith/pdf";
import { serializeDocLang } from "@doclith/xml";
import type { ElementNode } from "@doclith/core";

// Lines whose center falls within a region box (for table reconstruction).
function linesIn(box: PdfBox, lines: readonly PdfLine[]): PdfLine[] {
  return lines.filter((l) => {
    const b = l.box;
    if (!b) return false;
    const cy = (b.y0 + b.y1) / 2;
    const cx = (b.x0 + b.x1) / 2;
    return cy >= box.y0 - 2 && cy <= box.y1 + 2 && cx >= box.x0 - 4 && cx <= box.x1 + 4;
  });
}

// Walk a reconstructed OTSL <table> (token element + following text node, `nl` = row break)
// into a plain 2D grid of cell strings.
function otslToGrid(table: ElementNode): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  const kids = table.children;
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i]!;
    if (c.type !== "element") continue;
    const name = c.localName || c.name;
    if (name === "nl") {
      grid.push(row);
      row = [];
    } else if (name === "ecel") {
      row.push("");
    } else if (name === "fcel" || name === "ched") {
      const next = kids[i + 1];
      row.push(next && next.type === "text" ? next.value.trim() : "");
    }
  }
  if (row.length) grid.push(row);
  return grid;
}

function tableGrid(box: PdfBox, lines: readonly PdfLine[]): string[][] | undefined {
  const node = reconstructTable(box, linesIn(box, lines));
  if (!node) return undefined;
  const grid = otslToGrid(node);
  return grid.length ? grid : undefined;
}

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// pdfjs' default DOMCanvasFactory uses `document` (absent in a Web Worker) — it crashes
// ("undefined.createElement") on pages with images. Provide an OffscreenCanvas-based factory.
class OffscreenCanvasFactory {
  create(width: number, height: number) {
    const canvas = new OffscreenCanvas(Math.max(1, width || 1), Math.max(1, height || 1));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(cc: { canvas: OffscreenCanvas; context: unknown }, width: number, height: number) {
    cc.canvas.width = Math.max(1, width || 1);
    cc.canvas.height = Math.max(1, height || 1);
  }
  destroy(cc: { canvas: OffscreenCanvas | null; context: unknown }) {
    if (cc.canvas) {
      cc.canvas.width = 0;
      cc.canvas.height = 0;
    }
    cc.canvas = null;
    cc.context = null;
  }
}

// Predictor is heavy (loads ort-web + downloads/caches the layout model) -> reuse across docs.
let predictor: Promise<LayoutPredictor> | null = null;
const getPredictor = () =>
  (predictor ??= createBrowserLayoutPredictor({ ort: ort as unknown as OrtWebModule }));

self.onmessage = async (e: MessageEvent<{ id: string; file: Blob; only?: number }>) => {
  const { id, file, only } = e.data;
  const post = (m: Record<string, unknown>) =>
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, ...m });
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    post({ type: "status", stage: "parse", message: "Reading PDF…" });
    const doc = await pdfjs.getDocument({
      data,
      CanvasFactory: OffscreenCanvasFactory,
      isOffscreenCanvasSupported: true,
    }).promise;

    post({ type: "status", stage: "model", message: "Loading layout model…" });
    const pred = await getPredictor();

    // Process one page (1-based): infer layout, stream its blocks, return the LayoutPage.
    const processPage = async (i: number): Promise<LayoutPage> => {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const dims = { width: vp.width, height: vp.height };
      const content = await page.getTextContent();
      const lines = groupLines(content.items as unknown as TextItemLike[], vp.height);
      const regions = await pred.predict(page as unknown as RenderablePage, dims);
      const lp: LayoutPage = { width: dims.width, height: dims.height, lines, regions };
      const blocks = pageLayoutBlocks(lp).map((b) =>
        b.label === "table" && b.box ? { ...b, grid: tableGrid(b.box, lines) } : b,
      );
      post({ type: "page", index: i - 1, page: { width: dims.width, height: dims.height, blocks } });
      return lp;
    };

    // Re-run a single page (no full-document XML recompute).
    if (only !== undefined) {
      await processPage(only + 1);
      post({ type: "done" });
      return;
    }

    const lpPages: LayoutPage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      post({ type: "status", stage: "page", message: `Page ${i}/${doc.numPages}`, page: i, total: doc.numPages });
      lpPages.push(await processPage(i));
    }

    const xml = serializeDocLang(layoutedPagesToDocLang(lpPages), { pretty: true });
    post({ type: "done", xml });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
