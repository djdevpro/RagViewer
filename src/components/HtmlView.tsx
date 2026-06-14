import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { useStore } from "@tanstack/react-store";
import { docStore, activeDoc, setState, patchActive } from "../store/doclang-store";
import { pageToHtmlBody } from "../lib/render-page";
import { usePanZoom } from "../hooks/usePanZoom";
import { PanZoomControls } from "./PanZoomControls";

const A4_W = 794;
const A4_H = 1123;

// A4 render of the current page with pan/zoom (wheel = zoom, hand tool / Space / middle-click = pan).
// Each block is tagged data-zone, so hovering a zone on the left highlights it here (and vice-versa).
export function HtmlView() {
  const doc = useStore(docStore, activeDoc);
  const hoverId = useStore(docStore, (s) => s.hoverZoneId);
  const wrapRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const activeId = doc?.activeZoneId ?? null;
  const loading = !!doc && doc.pages[doc.currentPage]?.status !== "done";

  const body = useMemo(
    () => (doc ? pageToHtmlBody(doc.zones.filter((z) => z.page === doc.currentPage)) : ""),
    [doc],
  );

  const pz = usePanZoom(wrapRef, A4_W, A4_H, body);

  // Highlight the element matching the hovered/active zone.
  useEffect(() => {
    const el = docRef.current;
    if (!el) return;
    el.querySelectorAll(".is-active").forEach((n) => n.classList.remove("is-active"));
    const id = hoverId ?? activeId;
    if (id) el.querySelector(`[data-zone="${id}"]`)?.classList.add("is-active");
  }, [hoverId, activeId, body]);

  const zoneAt = (e: MouseEvent) =>
    (e.target as HTMLElement).closest("[data-zone]")?.getAttribute("data-zone") ?? null;

  const wrapCls =
    "a4wrap" + (pz.panning ? " a4wrap--grabbing" : pz.handTool || pz.spaceHeld ? " a4wrap--grab" : "");

  return (
    <div className={wrapCls} ref={wrapRef} onPointerDown={pz.onPointerDown}>
      {loading ? (
        <div
          ref={docRef}
          className="a4doc a4doc--skel"
          style={{ transform: pz.transform, transformOrigin: "0 0" }}
        >
          <div className="skel skel-h" />
          <div className="skel skel-l" style={{ width: "96%" }} />
          <div className="skel skel-l" style={{ width: "88%" }} />
          <div className="skel skel-gap" />
          <div className="skel skel-h" style={{ width: "42%" }} />
          <div className="skel skel-l" style={{ width: "92%" }} />
          <div className="skel skel-l" style={{ width: "99%" }} />
          <div className="skel skel-l" style={{ width: "68%" }} />
          <div className="skel skel-gap" />
          <div className="skel skel-block" />
          <div className="skel skel-gap" />
          <div className="skel skel-l" style={{ width: "48%" }} />
        </div>
      ) : (
        <div
          ref={docRef}
          className="a4doc"
          style={{ transform: pz.transform, transformOrigin: "0 0" }}
          onMouseOver={(e) => {
            const id = zoneAt(e);
            if (id) setState({ hoverZoneId: id });
          }}
          onMouseLeave={() => setState({ hoverZoneId: null })}
          onClick={(e) => {
            if (pz.panning || pz.handTool) return;
            const id = zoneAt(e);
            if (id) patchActive({ activeZoneId: id });
          }}
          dangerouslySetInnerHTML={{ __html: body }}
        />
      )}

      <PanZoomControls pz={pz} />
    </div>
  );
}
