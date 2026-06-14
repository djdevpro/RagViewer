// Detection auto du type de fond : on echantillonne l'anneau de pixels du bord
// et on mesure l'ecart-type couleur. Faible -> fond uni (sticker). Eleve -> photo.

export function backgroundStdDev(img: ImageData): number {
  const { width: w, height: h, data: d } = img;
  let n = 0, sr = 0, sg = 0, sb = 0, sr2 = 0, sg2 = 0, sb2 = 0;
  const acc = (i: number) => {
    const o = i * 4, r = d[o], g = d[o + 1], b = d[o + 2];
    sr += r; sg += g; sb += b;
    sr2 += r * r; sg2 += g * g; sb2 += b * b;
    n++;
  };
  for (let x = 0; x < w; x++) { acc(x); acc((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { acc(y * w); acc(y * w + (w - 1)); }
  const varc = (s: number, s2: number) => Math.max(0, s2 / n - (s / n) ** 2);
  return Math.sqrt((varc(sr, sr2) + varc(sg, sg2) + varc(sb, sb2)) / 3);
}

export function isSolidBackground(img: ImageData, threshold = 28): boolean {
  return backgroundStdDev(img) < threshold;
}
