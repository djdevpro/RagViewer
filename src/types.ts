export type DocLangElementType =
  | "heading"
  | "text"
  | "table"
  | "index"
  | "list"
  | "list_item"
  | "picture"
  | "code"
  | "formula"
  | "caption"
  | "key"
  | "value"
  | "page_header"
  | "page_footer"
  | "footnote"
  | "unknown";

/** Inference backend. "auto" tries GPU (WebGPU) then falls back to CPU (WASM). */
export type Device = "auto" | "gpu" | "cpu";

export type PageStatus = "pending" | "processing" | "done" | "error";

/** Pixel bounding box on the rendered page image. */
export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Zone {
  id: string;
  type: DocLangElementType;
  text: string;
  bbox: BBox;
  loc: [number, number, number, number]; // raw doctags grid coords (0..GRID)
  level?: number;
  xml: string; // DocLang fragment
  page: number; // 0-based
  color?: string; // dominant non-white color sampled from the page image (hex)
}

export interface PageData {
  index: number;
  width: number; // rendered px
  height: number;
  imageUrl: string; // dataURL
  status: PageStatus;
}

export interface DocResult {
  pages: PageData[];
  zones: Zone[];
  xml: string; // full DocLang document
}

export type Status =
  | "idle"
  | "rendering"
  | "loading-model"
  | "converting"
  | "done"
  | "error";
