// Utilitaires canvas <-> ImageData (tout en mémoire, côté client).

export async function fileToImageData(file: Blob): Promise<ImageData> {
  const bmp = await createImageBitmap(file);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, c.width, c.height);
}

export async function imageDataToPngBlob(img: ImageData): Promise<Blob> {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext("2d")!.putImageData(img, 0, 0);
  return await c.convertToBlob({ type: "image/png" });
}

// Redimensionne un ImageData (utilisé pour remettre le masque du modèle a la taille source).
export function resizeImageData(src: ImageData, w: number, h: number): ImageData {
  const a = new OffscreenCanvas(src.width, src.height);
  a.getContext("2d")!.putImageData(src, 0, 0);
  const b = new OffscreenCanvas(w, h);
  const ctx = b.getContext("2d")!;
  ctx.drawImage(a, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
