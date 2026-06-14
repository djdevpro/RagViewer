/// <reference lib="webworker" />
// Web Worker : tout le travail lourd tourne ICI (hors thread principal).
// Annonce le PLAN complet des etapes, puis avance dedans (pour afficher l'a-venir).
import { isSolidBackground } from "./lib/detect-bg";
import { removeSolid } from "./lib/solid";
import { loadModel, removeWithModel, type LoadedModel } from "./lib/ai-model";

let modelPromise: Promise<LoadedModel> | null = null;
const getModel = (onP: (p: unknown) => void) => (modelPromise ??= loadModel(onP));

async function toImageData(blob: Blob): Promise<ImageData> {
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, c.width, c.height);
}

async function toBlob(img: ImageData): Promise<Blob> {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c.convertToBlob({ type: "image/png" });
}

self.onmessage = async (e: MessageEvent) => {
  const { id, file, mode, tol } = e.data as { id: string; file: Blob; mode: string; tol: number };
  const post = (m: Record<string, unknown>) => self.postMessage({ id, ...m });
  try {
    const img = await toImageData(file);
    const isSolid = mode === "solid" || (mode === "auto" && isSolidBackground(img));
    const dims = `${img.width} × ${img.height} px`;
    const det = mode === "auto"
      ? (isSolid ? "Fond uni détecté" : "Fond complexe — bascule modèle IA")
      : (isSolid ? "Fond uni (manuel)" : "Modèle IA (manuel)");

    const plan = isSolid
      ? [
          { key: "decode", label: "Lecture de l'image", detail: dims },
          { key: "detect", label: "Détection du fond", detail: det },
          { key: "flood", label: "Détourage géométrique", detail: `flood-fill · tolérance ${tol}` },
          { key: "encode", label: "Finalisation", detail: "masque alpha → PNG" },
        ]
      : [
          { key: "decode", label: "Lecture de l'image", detail: dims },
          { key: "detect", label: "Détection du fond", detail: det },
          { key: "model", label: "Chargement du modèle", detail: "RMBG-1.4 · WASM · fp32" },
          { key: "inference", label: "Génération du masque", detail: "segmentation neuronale du sujet" },
        ];

    // decode + detect deja faits -> on demarre a l'etape index 2
    post({ type: "plan", solid: isSolid, steps: plan });
    post({ type: "advance", index: 2 });

    let out: ImageData;
    if (isSolid) {
      out = removeSolid(img, { tol });
      post({ type: "advance", index: 3 });
    } else {
      const lm = await getModel((p) => {
        const pp = p as { status?: string; progress?: number };
        if (pp?.status === "progress" && typeof pp.progress === "number") post({ type: "progress", progress: pp.progress });
      });
      post({ type: "advance", index: 3 });
      out = await removeWithModel(img, lm);
    }

    const blob = await toBlob(out);
    post({ type: "done", blob, used: isSolid ? "solid" : "ai" });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
