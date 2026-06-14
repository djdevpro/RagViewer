import type { DoclingDoc, DoclingItem } from "./docling-serve";
import type { DocLangElementType, PageData, Zone } from "../types";

const GRID = 500; // normalized resolution used in DocLang <location>
const NS = "https://www.doclang.ai/ns/v0";

const LABEL_MAP: Record<string, DocLangElementType> = {
  title: "heading",
  section_header: "heading",
  text: "text",
  paragraph: "text",
  table: "table",
  document_index: "index",
  picture: "picture",
  code: "code",
  formula: "formula",
  caption: "caption",
  list_item: "list_item",
  footnote: "footnote",
  page_header: "page_header",
  page_footer: "page_footer",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function locationXml(loc: [number, number, number, number]): string {
  return "\n" + loc.map((v) => `    <location value="${v}" resolution="${GRID}"/>`).join("\n");
}

function tagFor(type: DocLangElementType): string {
  if (type === "unknown") return "custom";
  if (type === "list_item") return "ldiv"; // DocLang list items are <ldiv>
  return type;
}

// --- table OTSL (DocLang canonical: self-closing token + <text>, <ecel/> empty, <nl/>) ---
interface Cell {
  text: string;
  col_header: boolean;
  row_header: boolean;
}
function cellToken(c: Cell): string {
  if (!c.text) return "<ecel/>";
  const tag = c.col_header ? "ched" : c.row_header ? "rhed" : "fcel";
  return `<${tag}/><text>${esc(c.text)}</text>`;
}
function buildTable(it: DoclingItem): { text: string; otsl: string } {
  const d = it.data;
  const cells = d?.table_cells ?? [];
  const rows = d?.num_rows ?? 0;
  const cols = d?.num_cols ?? 0;
  if (!rows || !cols || !cells.length) {
    const flat = cells.map((c) => (c.text ?? "").trim()).filter(Boolean);
    const otsl = flat.length
      ? "\n    " + flat.map((t) => `<fcel/><text>${esc(t)}</text><nl/>`).join("\n    ")
      : "";
    return { text: flat.join("\n"), otsl };
  }
  const grid: Cell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ text: "", col_header: false, row_header: false })),
  );
  for (const c of cells) {
    const r = c.start_row_offset_idx ?? 0;
    const col = c.start_col_offset_idx ?? 0;
    if (r < rows && col < cols)
      grid[r][col] = {
        text: (c.text ?? "").trim(),
        col_header: !!c.column_header,
        row_header: !!c.row_header,
      };
  }
  const text = grid.map((row) => row.map((c) => c.text).join("\t")).join("\n");
  const otsl = "\n    " + grid.map((row) => row.map(cellToken).join("") + "<nl/>").join("\n    ");
  return { text, otsl };
}

/**
 * Map a DoclingDocument onto PDF.js pages. Every leaf keeps Docling's page_no + bbox
 * (overlay alignment); elements are ordered top-to-bottom per page (reading order),
 * and consecutive list items are wrapped in <list> (DocLang structure).
 */
export function mapDoclingToZones(doc: DoclingDoc, pages: PageData[]): { zones: Zone[]; xml: string } {
  const raw: Zone[] = [];
  let n = 0;

  function bboxOf(it: DoclingItem): { bbox: Zone["bbox"]; loc: Zone["loc"]; page: number } | null {
    const prov = it.prov?.[0];
    const size = prov ? doc.pages[String(prov.page_no)]?.size : undefined;
    const pg = prov ? pages[prov.page_no - 1] : undefined;
    if (!prov || !size || !pg) return null;
    const sx = pg.width / size.width;
    const sy = pg.height / size.height;
    const { l, t, r, b } = prov.bbox;
    const bl = (prov.bbox.coord_origin ?? "BOTTOMLEFT") === "BOTTOMLEFT";
    const topPt = bl ? size.height - t : t;
    const botPt = bl ? size.height - b : b;
    return {
      bbox: { x0: l * sx, y0: topPt * sy, x1: r * sx, y1: botPt * sy },
      loc: [
        Math.round((l / size.width) * GRID),
        Math.round((topPt / size.height) * GRID),
        Math.round((r / size.width) * GRID),
        Math.round((botPt / size.height) * GRID),
      ],
      page: prov.page_no - 1,
    };
  }

  for (const it of [...(doc.texts ?? []), ...(doc.tables ?? []), ...(doc.pictures ?? [])]) {
    const geo = bboxOf(it);
    if (!geo) continue;
    const type = LABEL_MAP[it.label ?? ""] ?? "unknown";

    let text: string;
    let xml: string;
    if (type === "table" || type === "index") {
      const tbl = buildTable(it);
      text = tbl.text;
      xml = `  <${type}>${locationXml(geo.loc)}${tbl.otsl}\n  </${type}>`;
    } else {
      text = it.text?.trim() ?? "";
      const tag = tagFor(type);
      const attrs = type === "heading" && it.level ? ` level="${it.level}"` : "";
      xml = `  <${tag}${attrs}>${locationXml(geo.loc)}\n  ${esc(text)}</${tag}>`;
    }
    raw.push({ id: `z${n++}`, type, text, bbox: geo.bbox, loc: geo.loc, level: it.level, page: geo.page, xml });
  }

  // docling sometimes emits a table/index AND its cells as standalone elements;
  // drop leaves that sit inside a table/index on the same page (avoid duplicates).
  const containers = raw.filter((z) => z.type === "table" || z.type === "index");
  const contained = (a: Zone["bbox"], b: Zone["bbox"]) => {
    const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
    const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const area = Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));
    return (ix * iy) / area > 0.6;
  };
  const zones = raw.filter(
    (z) =>
      z.type === "table" ||
      z.type === "index" ||
      !containers.some((t) => t.page === z.page && contained(z.bbox, t.bbox)),
  );

  // Reading order: page, then top-to-bottom.
  zones.sort((a, b) => a.page - b.page || a.bbox.y0 - b.bbox.y0);

  // Assemble DocLang, wrapping consecutive list items in <list>.
  const lines: string[] = [];
  let i = 0;
  while (i < zones.length) {
    if (zones[i].type === "list_item") {
      const items: string[] = [];
      while (i < zones.length && zones[i].type === "list_item") {
        items.push("  " + zones[i].xml.trim());
        i++;
      }
      lines.push(`  <list>\n${items.join("\n")}\n  </list>`);
    } else {
      lines.push(zones[i].xml);
      i++;
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<doclang xmlns="${NS}" version="0.6">\n${lines.join("\n")}\n</doclang>\n`;
  return { zones, xml };
}
