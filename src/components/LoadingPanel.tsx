import { useEffect, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { docStore, activeDoc } from "../store/doclang-store";

const TIPS = [
  "DocLang keeps layout geometry, so answers can cite the exact spot on a page.",
  "Tables are encoded as OTSL tokens (fcel / nl), keeping rows and columns intact.",
  "docling-serve runs the full pipeline: layout + TableFormer + OCR.",
  "Pages render locally (PDF.js); structure comes from the docling-serve pipeline.",
];

export function LoadingPanel() {
  const doc = useStore(docStore, activeDoc);
  const [tip, setTip] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 3500);
    return () => clearInterval(id);
  }, []);

  const msg = doc?.status === "rendering" ? "Rendering pages…" : "Converting via docling-serve…";

  return (
    <div className="loader">
      <div className="loader__spin" />
      <h2 className="loader__title">{msg}</h2>
      <p className="loader__meta">{doc?.name ?? ""}</p>
      <p className="loader__tip" key={tip}>
        {TIPS[tip]}
      </p>
    </div>
  );
}
