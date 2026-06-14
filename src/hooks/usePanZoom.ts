import { type PointerEvent as RPE, useCallback, useEffect, useRef, useState } from "react";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 6;
const PAD = 14; // px breathing room when fitting

interface State {
  fitScale: number;
  zoom: number;
  tx: number;
  ty: number;
  panning: boolean;
  handTool: boolean;
  spaceHeld: boolean;
}

/**
 * Pan + zoom over a fixed-size content box (e.g. an A4 sheet) inside a viewport.
 * Effective scale = fitScale * zoom; transform-origin must be "0 0". The content
 * element should be position:absolute top/left:0 inside a position:relative viewport.
 * Pan triggers: hand tool, held Space, or middle mouse button. Wheel = zoom to cursor.
 */
export function usePanZoom(
  wrapRef: { readonly current: HTMLDivElement | null },
  contentW: number,
  contentH: number,
  resetKey: unknown,
) {
  const [s, setS] = useState<State>({ fitScale: 1, zoom: 1, tx: 0, ty: 0, panning: false, handTool: false, spaceHeld: false });
  const ref = useRef(s);
  useEffect(() => {
    ref.current = s;
  }, [s]);
  const space = useRef(false);

  const computeFit = useCallback(() => {
    const w = wrapRef.current;
    if (!w) return 1;
    return Math.max(0.1, Math.min((w.clientWidth - 2 * PAD) / contentW, (w.clientHeight - 2 * PAD) / contentH, 1.4));
  }, [wrapRef, contentW, contentH]);

  const centered = useCallback(
    (fitScale: number, zoom: number) => {
      const w = wrapRef.current;
      const cw = w ? w.clientWidth : contentW;
      const ch = w ? w.clientHeight : contentH;
      const k = fitScale * zoom;
      return { tx: (cw - contentW * k) / 2, ty: Math.max(PAD, (ch - contentH * k) / 2) };
    },
    [wrapRef, contentW, contentH],
  );

  const fit = useCallback(() => {
    const fitScale = computeFit();
    const { tx, ty } = centered(fitScale, 1);
    setS((p) => ({ ...p, fitScale, zoom: 1, tx, ty, panning: false }));
  }, [computeFit, centered]);

  // Recompute fit on viewport resize; recenter only when not user-zoomed.
  useEffect(() => {
    const w = wrapRef.current;
    if (!w) return;
    const onResize = () => {
      const fitScale = computeFit();
      setS((p) => (p.zoom === 1 ? { ...p, fitScale, ...centered(fitScale, 1) } : { ...p, fitScale }));
    };
    const ro = new ResizeObserver(onResize); // fires once on observe -> initial fit
    ro.observe(w);
    return () => ro.disconnect();
  }, [wrapRef, computeFit, centered]);

  // Reset (recenter + zoom 1) when content changes (next frame -> no sync setState in effect).
  useEffect(() => {
    const r = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(r);
  }, [resetKey, fit]);

  // Wheel = zoom to cursor (non-passive so we can preventDefault).
  useEffect(() => {
    const w = wrapRef.current;
    if (!w) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = w.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setS((p) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, p.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const f = zoom / p.zoom; // effective scale = fitScale*zoom; fitScale cancels in the ratio
        return { ...p, zoom, tx: cx - (cx - p.tx) * f, ty: cy - (cy - p.ty) * f };
      });
    };
    const onAux = (e: globalThis.MouseEvent) => {
      if (e.button === 1) e.preventDefault(); // suppress middle-click autoscroll
    };
    w.addEventListener("wheel", onWheel, { passive: false });
    w.addEventListener("auxclick", onAux);
    return () => {
      w.removeEventListener("wheel", onWheel);
      w.removeEventListener("auxclick", onAux);
    };
  }, [wrapRef]);

  // Track Space for pan (ignored while typing; drives the grab cursor via spaceHeld).
  useEffect(() => {
    const typing = () => {
      const t = document.activeElement?.tagName;
      return t === "INPUT" || t === "TEXTAREA";
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing()) {
        space.current = true;
        setS((p) => (p.spaceHeld ? p : { ...p, spaceHeld: true }));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        space.current = false;
        setS((p) => (p.spaceHeld ? { ...p, spaceHeld: false } : p));
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const onPointerDown = useCallback((e: RPE<HTMLDivElement>) => {
    if (!(e.button === 1 || ref.current.handTool || space.current)) return;
    e.preventDefault();
    const el = e.currentTarget;
    const pid = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    const { tx, ty } = ref.current;
    try {
      el.setPointerCapture(pid);
    } catch {
      /* ignore */
    }
    setS((p) => ({ ...p, panning: true }));
    const move = (ev: globalThis.PointerEvent) => setS((p) => ({ ...p, tx: tx + (ev.clientX - sx), ty: ty + (ev.clientY - sy) }));
    const upp = () => {
      setS((p) => ({ ...p, panning: false }));
      try {
        el.releasePointerCapture(pid);
      } catch {
        /* ignore */
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", upp);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", upp);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const w = wrapRef.current;
      const cx = w ? w.clientWidth / 2 : 0;
      const cy = w ? w.clientHeight / 2 : 0;
      setS((p) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, p.zoom * factor));
        const f = zoom / p.zoom;
        return { ...p, zoom, tx: cx - (cx - p.tx) * f, ty: cy - (cy - p.ty) * f };
      });
    },
    [wrapRef],
  );

  const setHandTool = useCallback((v: boolean) => setS((p) => ({ ...p, handTool: v })), []);

  return {
    transform: `translate(${s.tx}px, ${s.ty}px) scale(${s.fitScale * s.zoom})`,
    zoom: s.zoom,
    panning: s.panning,
    handTool: s.handTool,
    spaceHeld: s.spaceHeld,
    setHandTool,
    onPointerDown,
    zoomBy,
    fit,
  };
}
