import { useEffect, useRef, useState } from "react";

// Global tooltip for any [data-tip] element. Renders a fixed-position bubble (escapes
// overflow:hidden), centered under the trigger, clamped to the viewport, with a clip-path
// arrow that always points at the trigger's center.
interface Anchor {
  text: string;
  rect: DOMRect;
}

export function Tooltip() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const cur = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const enter = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-tip]") as HTMLElement | null;
      if (!el || el === cur.current) return;
      const text = el.getAttribute("data-tip");
      if (!text) return;
      cur.current = el;
      setAnchor({ text, rect: el.getBoundingClientRect() });
      setPos(null);
    };
    const leave = (e: Event) => {
      const from = (e.target as HTMLElement | null)?.closest?.("[data-tip]");
      const to = ((e as MouseEvent).relatedTarget as HTMLElement | null)?.closest?.("[data-tip]");
      if (from && from !== to) {
        cur.current = null;
        setAnchor(null);
        setPos(null);
      }
    };
    document.addEventListener("mouseover", enter);
    document.addEventListener("mouseout", leave);
    document.addEventListener("focusin", enter);
    document.addEventListener("focusout", leave);
    return () => {
      document.removeEventListener("mouseover", enter);
      document.removeEventListener("mouseout", leave);
      document.removeEventListener("focusin", enter);
      document.removeEventListener("focusout", leave);
    };
  }, []);

  // Measure + place one frame after mount (keeps setState out of the effect body).
  useEffect(() => {
    if (!anchor) return;
    const raf = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const b = el.getBoundingClientRect();
      const M = 8;
      const center = anchor.rect.left + anchor.rect.width / 2;
      const left = Math.max(M, Math.min(center - b.width / 2, window.innerWidth - b.width - M));
      const arrow = Math.max(9, Math.min(center - left, b.width - 9));
      setPos({ left, top: anchor.rect.bottom + 8, arrow });
    });
    return () => cancelAnimationFrame(raf);
  }, [anchor]);

  if (!anchor) return null;
  return (
    <div
      ref={ref}
      className="tip"
      role="tooltip"
      style={{
        left: pos ? pos.left : anchor.rect.left,
        top: pos ? pos.top : anchor.rect.bottom + 8,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {anchor.text}
      <span className="tip__arrow" style={{ left: pos ? pos.arrow : 12 }} />
    </div>
  );
}
