import { useRef } from "react";
import { useStore } from "@tanstack/react-store";
import { docStore, activeDoc } from "../store/doclang-store";
import { usePanZoom } from "../hooks/usePanZoom";
import { ZonesOverlay } from "./ZonesOverlay";
import { PanZoomControls } from "./PanZoomControls";

export function PageViewer() {
  const doc = useStore(docStore, activeDoc);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pg = doc?.pages[doc.currentPage];
  // Pan/zoom over the rendered page (image + zone overlay scale together).
  const pz = usePanZoom(wrapRef, pg?.width ?? 1, pg?.height ?? 1, `${doc?.id}:${doc?.currentPage}:${pg?.imageUrl ?? ""}`);

  if (!doc || !pg) return null;

  const wrapCls = "pageview" + (pz.panning ? " pageview--grabbing" : pz.handTool || pz.spaceHeld ? " pageview--grab" : "");

  return (
    <div className={wrapCls} ref={wrapRef}>
      <div
        className="page__inner"
        style={{ width: pg.width, height: pg.height, transform: pz.transform, transformOrigin: "0 0" }}
        onPointerDown={pz.onPointerDown}
      >
        <img src={pg.imageUrl} alt={`page ${doc.currentPage + 1}`} className="page__img" draggable={false} />
        <ZonesOverlay />
      </div>
      {pg.status !== "done" && (
        <div className="page-busy">
          <span className="page-busy__spin" />
          Processing…
        </div>
      )}
      <PanZoomControls pz={pz} />
    </div>
  );
}
