// Client for a local docling-serve container (full Docling pipeline: layout +
// TableFormer + OCR). Proxied through Vite at /docling -> :5001.
// We use the JSON (DoclingDocument) output: it carries explicit per-element page
// numbers and bounding boxes, which map reliably onto the PDF.js-rendered pages
// (unlike DocTags <page_break>, whose page count does not match the PDF).
export const DOCLING_LABEL = "docling-serve";

export interface DoclingBBox {
  l: number;
  t: number;
  r: number;
  b: number;
  coord_origin?: string; // "BOTTOMLEFT" | "TOPLEFT"
}

export interface DoclingProv {
  page_no: number;
  bbox: DoclingBBox;
}

export interface DoclingRef {
  $ref: string;
}

export interface DoclingGroup {
  label?: string;
  self_ref?: string;
  children?: DoclingRef[];
}

export interface DoclingItem {
  label?: string;
  level?: number;
  text?: string;
  self_ref?: string;
  prov?: DoclingProv[];
  data?: {
    num_rows?: number;
    num_cols?: number;
    table_cells?: {
      text?: string;
      start_row_offset_idx?: number;
      start_col_offset_idx?: number;
      column_header?: boolean;
      row_header?: boolean;
    }[];
  };
}

export interface DoclingDoc {
  pages: Record<string, { size: { width: number; height: number }; page_no: number }>;
  body?: { children?: DoclingRef[] };
  groups?: DoclingGroup[];
  texts?: DoclingItem[];
  tables?: DoclingItem[];
  pictures?: DoclingItem[];
}

export async function convertWithDoclingServe(file: File, baseUrl = "/docling"): Promise<DoclingDoc> {
  const form = new FormData();
  form.append("files", file);
  form.append("to_formats", "json");

  const url = `${baseUrl.replace(/\/$/, "")}/v1/convert/file`;
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: form });
  } catch {
    throw new Error(`Cannot reach docling-serve at ${baseUrl} — is the server running?`);
  }
  if (!res.ok) {
    throw new Error(`docling-serve error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { document?: { json_content?: unknown } };
  let doc = data?.document?.json_content;
  if (typeof doc === "string") doc = JSON.parse(doc);
  const d = doc as DoclingDoc | undefined;
  if (!d?.pages) throw new Error("docling-serve returned no DoclingDocument");
  return d;
}
