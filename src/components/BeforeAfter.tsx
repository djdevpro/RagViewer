import { useEffect, useRef, useState } from "react";
import { useFit } from "../hooks/use-fit";

interface Props {
  before: string; // image originale
  after: string;  // image detouree (fond transparent)
  bg: "checker" | "white" | "black";
  ratio?: number; // largeur / hauteur : le cadre epouse l'image (remplit 100%)
}

// Apercu avant/apres. Au montage, le detoure se revele de DROITE vers GAUCHE.
// Ensuite : glisser pour comparer, double-clic pour rejouer.
export function BeforeAfter({ before, after, bg, ratio }: Props) {
  const { ref, style } = useFit(ratio);
  const interacted = useRef(false);
  const [line, setLine] = useState(100); // 100 = original plein, 0 = detoure plein

  const animate = () => {
    interacted.current = false;
    let start = 0;
    const dur = 1200;
    const tick = (t: number) => {
      if (interacted.current) return;
      if (!start) start = t;
      const k = Math.min(1, (t - start) / dur);
      setLine(100 - (1 - (1 - k) ** 3) * 100); // 100 -> 0 : revele de droite a gauche
      if (k < 1) requestAnimationFrame(tick);
    };
    setLine(100);
    requestAnimationFrame(tick);
  };

  useEffect(animate, [before, after]);

  const move = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setLine(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      ref={ref}
      className={"ba " + bg}
      style={style}
      title="Glisse pour comparer · double-clic pour rejouer"
      onPointerDown={(e) => { interacted.current = true; ref.current?.setPointerCapture(e.pointerId); move(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons) move(e.clientX); }}
      onDoubleClick={animate}
    >
      <img className="ba-img" src={after} alt="détouré" draggable={false} />
      <img
        className="ba-img"
        src={before}
        alt="original"
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - line}% 0 0)` }}
      />
      <div className="ba-line" style={{ left: `${line}%` }}><span /></div>
    </div>
  );
}
