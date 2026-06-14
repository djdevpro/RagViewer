import type { BBox, DocLangElementType } from "../types";

/** DocTags <loc_n> coordinates are normalized to a 0..GRID grid. */
export const DOCTAGS_GRID = 500;

const TYPE_MAP: Record<string, DocLangElementType> = {
  title: "heading",
  section_header: "heading",
  text: "text",
  paragraph: "text",
  otsl: "table",
  table: "table",
  ordered_list: "list",
  unordered_list: "list",
  list_item: "list_item",
  picture: "picture",
  code: "code",
  formula: "formula",
  caption: "caption",
  footnote: "footnote",
  page_header: "page_header",
  page_footer: "page_footer",
  key: "key",
  value: "value",
};

function mapType(rawTag: string): { type: DocLangElementType; level?: number } {
  const m = rawTag.match(/^(.*?)_level_(\d+)$/);
  const base = m ? m[1] : rawTag;
  const level = m ? parseInt(m[2], 10) : undefined;
  return { type: TYPE_MAP[base] ?? "unknown", level };
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedZone {
  rawTag: string;
  type: DocLangElementType;
  level?: number;
  loc?: [number, number, number, number];
  text: string;
}

// Tolerant: match any paired <name>…</name> element. Location tokens (<loc_n>)
// may appear anywhere inside; we pick the first four. Elements without location
// are still kept (text is shown even if it can't be overlaid).
const ELEMENT_RE = /<([a-z_][a-z0-9_]*)>([\s\S]*?)<\/\1>/g;
const LOC_RE = /<loc_(\d+)>/g;

function parseSegment(seg: string): ParsedZone[] {
  const zones: ParsedZone[] = [];
  ELEMENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ELEMENT_RE.exec(seg)) !== null) {
    const rawTag = m[1];
    if (rawTag.startsWith("loc_")) continue;
    const inner = m[2];
    const nums = [...inner.matchAll(LOC_RE)].map((x) => Number(x[1]));
    const loc =
      nums.length >= 4
        ? ([nums[0], nums[1], nums[2], nums[3]] as [number, number, number, number])
        : undefined;
    const { type, level } = mapType(rawTag);
    const text = stripTags(inner);
    if (!text && !loc) continue;
    zones.push({ rawTag, type, level, loc, text });
  }
  return zones;
}

// Strip the single <doctag>…</doctag> wrapper so children match individually.
const unwrap = (doctags: string) => doctags.replace(/<\/?doctag>/g, "");

export function parseDocTags(doctags: string): ParsedZone[] {
  return parseSegment(unwrap(doctags));
}

/** Split a whole-document DocTags string by <page_break> and parse each page. */
export function parseDocTagsByPage(doctags: string): ParsedZone[][] {
  return unwrap(doctags)
    .split(/<page_break\s*\/?>/)
    .map(parseSegment);
}

/** Same page split, but returns the raw per-page DocTags segments (debug). */
export function splitRawByPage(doctags: string): string[] {
  return unwrap(doctags)
    .split(/<page_break\s*\/?>/)
    .map((s) => s.trim());
}

export function locToBBox(
  loc: [number, number, number, number],
  imgW: number,
  imgH: number,
): BBox {
  const [x0, y0, x1, y1] = loc;
  return {
    x0: (x0 / DOCTAGS_GRID) * imgW,
    y0: (y0 / DOCTAGS_GRID) * imgH,
    x1: (x1 / DOCTAGS_GRID) * imgW,
    y1: (y1 / DOCTAGS_GRID) * imgH,
  };
}
