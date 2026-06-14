// Pont main-thread <-> Web Worker. Relaie le tracing (etapes + progression) par callback.
export interface Step { key: string; label: string; detail?: string; }

export type StatusMsg =
  | { type: "plan"; solid: boolean; steps: Step[] }
  | { type: "advance"; index: number }
  | { type: "progress"; progress: number };

export interface DoneResult { blob: Blob; used: "solid" | "ai"; }

interface Handler {
  resolve: (r: DoneResult) => void;
  reject: (e: Error) => void;
  onStatus: (m: StatusMsg) => void;
}

let worker: Worker | null = null;
const pending = new Map<string, Handler>();

function ensure(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent) => {
    const { id, type } = e.data;
    const h = pending.get(id);
    if (!h) return;
    if (type === "plan" || type === "advance" || type === "progress") h.onStatus(e.data);
    else if (type === "done") { h.resolve({ blob: e.data.blob, used: e.data.used }); pending.delete(id); }
    else if (type === "error") { h.reject(new Error(e.data.message)); pending.delete(id); }
  };
  return worker;
}

export function detour(
  id: string,
  file: File,
  mode: string,
  tol: number,
  onStatus: (m: StatusMsg) => void,
): Promise<DoneResult> {
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onStatus });
    ensure().postMessage({ id, file, mode, tol });
  });
}
