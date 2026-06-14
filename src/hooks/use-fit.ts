import { useEffect, useRef, useState, type CSSProperties } from "react";

// Calcule la plus grande taille au ratio donne qui tient dans le conteneur parent
// (le .stage), pour que l'image remplisse 100% du cadre — sans bandes ni distorsion.
// CSS aspect-ratio + max-height casse le ratio quand la hauteur contraint : on calcule en JS.
export function useFit(ratio?: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | undefined>();

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el || !ratio) { setStyle(undefined); return; }
    const compute = () => {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      let w = Math.min(1100, cw);
      let h = w / ratio;
      if (h > ch) { h = ch; w = h * ratio; }
      setStyle({ width: Math.round(w), height: Math.round(h) });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);

  return { ref, style };
}
