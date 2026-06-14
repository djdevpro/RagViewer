import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PageData } from "../types";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const RENDER_SCALE = 2;

export type RenderedPage = PageData;

export async function renderPdf(file: File): Promise<RenderedPage[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: RenderedPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    // `canvas` field is required in newer pdfjs, ignored in older — cast to stay version-agnostic.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = { canvasContext: ctx, viewport, canvas };
    await page.render(params).promise;
    pages.push({
      index: i - 1,
      width: canvas.width,
      height: canvas.height,
      imageUrl: canvas.toDataURL("image/png"),
      status: "pending",
    });
  }
  return pages;
}

export async function renderImageFile(file: File): Promise<RenderedPage[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.drawImage(img, 0, 0);
    return [
      {
        index: 0,
        width: canvas.width,
        height: canvas.height,
        imageUrl: canvas.toDataURL("image/png"),
        status: "pending",
      },
    ];
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderFile(file: File): Promise<RenderedPage[]> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return renderPdf(file);
  }
  return renderImageFile(file);
}
