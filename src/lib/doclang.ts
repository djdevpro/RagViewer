import type { Zone } from "../types";
import { DOCTAGS_GRID, locToBBox, type ParsedZone } from "./doctags";

const NS = "https://www.doclang.ai/ns/v0";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function locationXml(loc?: [number, number, number, number]): string {
  if (!loc) return "";
  return (
    "\n" +
    loc
      .map((v) => `    <location value="${v}" resolution="${DOCTAGS_GRID}"/>`)
      .join("\n") +
    "\n  "
  );
}

function zoneToXml(p: ParsedZone): string {
  const tag = p.type === "unknown" ? "custom" : p.type;
  const attrs = p.type === "heading" && p.level ? ` level="${p.level}"` : "";
  return `  <${tag}${attrs}>${locationXml(p.loc)}${esc(p.text)}</${tag}>`;
}

export function toZone(
  p: ParsedZone,
  id: string,
  page: number,
  imgW: number,
  imgH: number,
): Zone {
  const bbox = p.loc
    ? locToBBox(p.loc, imgW, imgH)
    : { x0: 0, y0: 0, x1: 0, y1: 0 };
  return {
    id,
    type: p.type,
    text: p.text,
    bbox,
    loc: p.loc ?? [0, 0, 0, 0],
    level: p.level,
    xml: zoneToXml(p),
    page,
  };
}

export function assembleDocLang(zones: Zone[]): string {
  const body = zones.map((z) => z.xml).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<doclang xmlns="${NS}" version="0.6">\n${body}\n</doclang>\n`;
}
