import type { Zone } from "../types";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function gridRows(text: string): string[][] {
  if (!text) return [];
  return text.split("\n").map((r) => r.split("\t"));
}

// ---------- Markdown (current page only) ----------
function mdTable(text: string): string {
  const rows = gridRows(text);
  if (!rows.length) return "";
  const line = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "\\|") || " ").join(" | ")} |`;
  const sep = `| ${rows[0].map(() => "---").join(" | ")} |`;
  return [line(rows[0]), sep, ...rows.slice(1).map(line)].join("\n");
}

export function pageToMarkdown(zones: Zone[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < zones.length) {
    const z = zones[i];
    if (z.type === "list_item") {
      while (i < zones.length && zones[i].type === "list_item") {
        out.push(`- ${zones[i].text}`);
        i++;
      }
      out.push("");
      continue;
    }
    switch (z.type) {
      case "heading":
        out.push(`${"#".repeat(Math.min(z.level ?? 1, 6))} ${z.text}`);
        break;
      case "table":
      case "index":
        out.push(mdTable(z.text));
        break;
      case "code":
        out.push("```\n" + z.text + "\n```");
        break;
      case "formula":
        out.push(`$$ ${z.text} $$`);
        break;
      case "caption":
        out.push(`*${z.text}*`);
        break;
      case "picture":
        out.push(`*[picture]*`);
        break;
      default:
        if (z.text) out.push(z.text);
    }
    out.push("");
    i++;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- HTML body (current page only, each block tagged data-zone) ----------
function htmlTable(text: string, attr: string): string {
  const rows = gridRows(text);
  if (!rows.length) return `<table${attr}></table>`;
  const body = rows
    .map(
      (row, ri) =>
        `<tr>${row.map((c) => (ri === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join("")}</tr>`,
    )
    .join("");
  return `<table${attr}>${body}</table>`;
}

// data-zone only — the per-zone detected colour is intentionally NOT applied
// (text uses the theme colour).
function zoneAttr(z: Zone): string {
  return ` data-zone="${z.id}"`;
}

export function pageToHtmlBody(zones: Zone[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < zones.length) {
    const z = zones[i];
    if (z.type === "list_item") {
      const items: string[] = [];
      while (i < zones.length && zones[i].type === "list_item") {
        items.push(`<li${zoneAttr(zones[i])}>${esc(zones[i].text)}</li>`);
        i++;
      }
      parts.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    const dz = zoneAttr(z);
    switch (z.type) {
      case "heading": {
        const lv = Math.min(z.level ?? 1, 6);
        parts.push(`<h${lv}${dz}>${esc(z.text)}</h${lv}>`);
        break;
      }
      case "table":
      case "index":
        parts.push(htmlTable(z.text, dz));
        break;
      case "code":
        parts.push(`<pre${dz}><code>${esc(z.text)}</code></pre>`);
        break;
      case "formula":
        parts.push(`<p class="formula"${dz}>${esc(z.text)}</p>`);
        break;
      case "caption":
        parts.push(`<figcaption${dz}>${esc(z.text)}</figcaption>`);
        break;
      case "picture":
        parts.push(`<div class="pic"${dz}>[picture]</div>`);
        break;
      case "page_header":
      case "page_footer":
      case "footnote":
        parts.push(`<p class="furniture"${dz}>${esc(z.text)}</p>`);
        break;
      default:
        if (z.text) parts.push(`<p${dz}>${esc(z.text)}</p>`);
    }
    i++;
  }
  return parts.join("\n");
}
