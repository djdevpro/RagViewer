import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

const KEY = "doclang-left-pane-px";
const MIN = 240; // px floor for both panes

/**
 * Drag-to-resize for the DocLang viewer split. `width` is the left pane width in px
 * (null = use the CSS default 50%). Persisted in localStorage; clamped to [MIN, total-MIN].
 * Keyboard: ←/→ on the focused separator nudge the width.
 */
export function useResizablePane() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(KEY);
      return v ? parseInt(v, 10) : null;
    } catch {
      return null;
    }
  });
  const [dragging, setDragging] = useState(false);

  const apply = useCallback((px: number) => {
    const el = containerRef.current;
    const total = el ? el.getBoundingClientRect().width : px + MIN;
    const w = Math.round(Math.max(MIN, Math.min(px, total - MIN)));
    setWidth(w);
    try {
      localStorage.setItem(KEY, String(w));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el) apply(e.clientX - el.getBoundingClientRect().left);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, apply]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const el = containerRef.current;
      const cur = width ?? (el ? el.getBoundingClientRect().width / 2 : MIN);
      apply(cur + (e.key === "ArrowLeft" ? -24 : 24));
    },
    [width, apply],
  );

  return { containerRef, width, dragging, onMouseDown: () => setDragging(true), onKeyDown };
}
