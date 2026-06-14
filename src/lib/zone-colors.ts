import type { PageData, Zone } from "../types";

// Sample each zone's region on the rendered page image and pick its dominant
// non-white color (white = paper, ignored). Colors are coarsely bucketed; the
// heaviest bucket wins and is returned as its average. Used to tint zone overlays.

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Dominant non-white color of a region (RGBA pixels), or null if essentially blank. */
function dominantColor(data: Uint8ClampedArray): string | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  // step over pixels (every 2nd) for speed
  for (let i = 0; i < data.length; i += 8) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (a < 128) continue;
    if (r > 235 && g > 235 && b > 235) continue; // skip white / paper
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); // 16 levels / channel
    const e = buckets.get(key);
    if (e) {
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best || best.n < 4) return null;
  return toHex(Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n));
}

/** Returns a copy of `zones` with `color` set from the page image (best-effort). */
export async function colorizeZones(pages: PageData[], zones: Zone[]): Promise<Zone[]> {
  if (typeof document === "undefined" || zones.length === 0) return zones;

  const byPage = new Map<number, Zone[]>();
  for (const z of zones) {
    const arr = byPage.get(z.page);
    if (arr) arr.push(z);
    else byPage.set(z.page, [z]);
  }

  const colors = new Map<string, string>();
  for (const [pi, zs] of byPage) {
    const pg = pages[pi];
    if (!pg) continue;
    let img: HTMLImageElement;
    try {
      img = await loadImage(pg.imageUrl);
    } catch {
      continue;
    }
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || pg.width;
    canvas.height = img.naturalHeight || pg.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;
    ctx.drawImage(img, 0, 0);
    const sx = canvas.width / pg.width;
    const sy = canvas.height / pg.height;
    for (const z of zs) {
      const x = Math.max(0, Math.floor(z.bbox.x0 * sx));
      const y = Math.max(0, Math.floor(z.bbox.y0 * sy));
      const w = Math.min(canvas.width - x, Math.ceil((z.bbox.x1 - z.bbox.x0) * sx));
      const h = Math.min(canvas.height - y, Math.ceil((z.bbox.y1 - z.bbox.y0) * sy));
      if (w <= 1 || h <= 1) continue;
      let region: ImageData;
      try {
        region = ctx.getImageData(x, y, w, h);
      } catch {
        continue;
      }
      const c = dominantColor(region.data);
      if (c) colors.set(z.id, c);
    }
  }

  return zones.map((z) => {
    const c = colors.get(z.id);
    return c ? { ...z, color: c } : z;
  });
}
