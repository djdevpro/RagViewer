// Detourage de fond UNI, 100% client, sans modele.
// Portage TS de detourage.py (_detour_solid) :
//   fond = mediane des bords -> flood-fill BFS depuis les bords -> anti-fuite
//   (ouverture morphologique) -> alpha. Preserve l'interieur du sujet.

export interface SolidOptions {
  tol?: number;       // tolerance couleur (distance RGB)
  openIter?: number;  // iterations d'ouverture anti-fuite
}

export function removeSolid(img: ImageData, opts: SolidOptions = {}): ImageData {
  const tol = opts.tol ?? 45;
  const openIter = opts.openIter ?? 2;
  const w = img.width, h = img.height, N = w * h, d = img.data;

  // 1. couleur de fond = mediane des pixels de bordure
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const sample = (i: number) => { const o = i * 4; rs.push(d[o]); gs.push(d[o + 1]); bs.push(d[o + 2]); };
  for (let x = 0; x < w; x++) { sample(x); sample((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { sample(y * w); sample(y * w + (w - 1)); }
  const median = (a: number[]) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const br = median(rs), bgc = median(gs), bb = median(bs), tol2 = tol * tol;

  // 2. flood-fill BFS depuis les bords -> isBg
  const isBg = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const near = (i: number) => {
    const o = i * 4, dr = d[o] - br, dg = d[o + 1] - bgc, db = d[o + 2] - bb;
    return dr * dr + dg * dg + db * db < tol2;
  };
  const seed = (i: number) => { if (!isBg[i] && near(i)) { isBg[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + (w - 1)); }
  while (sp > 0) {
    const i = stack[--sp], x = i % w, y = (i / w) | 0;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }

  // 3. anti-fuite : ouverture (erosion puis dilatation) -> retire les penetrations
  //    fines du fond dans le sujet (contour non ferme) sans toucher le fond principal
  const mask = opening(isBg, w, h, openIter);

  // 4. alpha : 0 sur le fond, 255 sur le sujet
  const out = new ImageData(w, h);
  out.data.set(d);
  for (let i = 0; i < N; i++) out.data[i * 4 + 3] = mask[i] ? 0 : 255;
  return out;
}

function erode(m: Uint8Array, w: number, h: number): Uint8Array {
  const r = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!m[i]) continue;
    const up = y > 0 ? m[i - w] : 1, dn = y < h - 1 ? m[i + w] : 1;
    const lf = x > 0 ? m[i - 1] : 1, rt = x < w - 1 ? m[i + 1] : 1;
    r[i] = up && dn && lf && rt ? 1 : 0;
  }
  return r;
}

function dilate(m: Uint8Array, w: number, h: number): Uint8Array {
  const r = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (m[i]) { r[i] = 1; continue; }
    const up = y > 0 && m[i - w], dn = y < h - 1 && m[i + w];
    const lf = x > 0 && m[i - 1], rt = x < w - 1 && m[i + 1];
    r[i] = up || dn || lf || rt ? 1 : 0;
  }
  return r;
}

function opening(m: Uint8Array, w: number, h: number, iter: number): Uint8Array {
  let r = m;
  for (let k = 0; k < iter; k++) r = erode(r, w, h);
  for (let k = 0; k < iter; k++) r = dilate(r, w, h);
  return r;
}
