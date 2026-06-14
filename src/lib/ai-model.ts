// Detourage IA (photos / fonds charges) avec RMBG-1.4 via Transformers.js, 100% navigateur.
// RMBG-1.4 : leger (~44 Mo), concu pour le browser (WebGPU OK), entree dynamique.
// /!\ LICENCE : RMBG-1.4 (BRIA) est NON-COMMERCIALE. OK perso/test ; pour la prod
//     OpteamOPS -> deporter les photos sur serveur ou prendre une licence BRIA.
import { AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";
import { resizeImageData } from "./image";

const MODEL_ID = "briaai/RMBG-1.4";

export interface LoadedModel { model: unknown; processor: unknown; device: string; }

export function webgpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export async function loadModel(onProgress?: (p: unknown) => void): Promise<LoadedModel> {
  // WebGPU plante sur ces segmentations via onnxruntime-web (>16 storage buffers
  // dans le shader). On force WASM : plus lent mais fiable partout. RMBG-1.4 est leger.
  const device = "wasm";
  const dtype = "fp32";
  const model = await AutoModel.from_pretrained(MODEL_ID, {
    device, dtype, progress_callback: onProgress,
  } as Record<string, unknown>);
  const processor = await AutoProcessor.from_pretrained(MODEL_ID);
  return { model, processor, device };
}

export async function removeWithModel(img: ImageData, lm: LoadedModel): Promise<ImageData> {
  const processor = lm.processor as (i: unknown) => Promise<Record<string, unknown>>;
  const model = lm.model as (i: unknown) => Promise<Record<string, { dims: number[]; data: ArrayLike<number> }>>;

  const raw = new RawImage(new Uint8ClampedArray(img.data), img.width, img.height, 4).rgb();
  const inputs = await processor(raw);
  const pv = (inputs as Record<string, unknown>).pixel_values ?? Object.values(inputs)[0];
  const output = await model({ input: pv });

  // Carte de saillance -> alpha (normalisation min-max robuste).
  const t = Object.values(output)[0];
  const dims = t.dims;
  const H = dims[dims.length - 2], W = dims[dims.length - 1];
  const src = t.data;
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < src.length; i++) { const v = src[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const rng = mx - mn || 1;

  const maskRGBA = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const a = Math.round(((src[i] - mn) / rng) * 255);
    maskRGBA[i * 4] = maskRGBA[i * 4 + 1] = maskRGBA[i * 4 + 2] = a;
    maskRGBA[i * 4 + 3] = 255;
  }
  const mask = resizeImageData(new ImageData(maskRGBA, W, H), img.width, img.height);

  const out = new ImageData(img.width, img.height);
  out.data.set(img.data);
  for (let i = 0; i < img.width * img.height; i++) out.data[i * 4 + 3] = mask.data[i * 4];
  return out;
}
