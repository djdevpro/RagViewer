import { Icon } from "./icons";

// Vertical zoom/pan control panel (top-right of a preview). Shared by the PDF and HTML views.
type Pz = ReturnType<typeof import("../hooks/usePanZoom").usePanZoom>;

export function PanZoomControls({ pz }: { pz: Pz }) {
  return (
    <div className="pz">
      <button className="pz__btn" data-tip="Zoom in" aria-label="Zoom in" onClick={() => pz.zoomBy(1.2)}>
        <Icon name="plus" size={13} />
      </button>
      <span className="pz__zoom">{Math.round(pz.zoom * 100)}%</span>
      <button className="pz__btn" data-tip="Zoom out" aria-label="Zoom out" onClick={() => pz.zoomBy(1 / 1.2)}>
        <Icon name="minus" size={13} />
      </button>
      <span className="pz__div" />
      <button className="pz__btn" data-tip="Fit to view" aria-label="Fit to view" onClick={pz.fit}>
        <Icon name="maximize" size={12} />
      </button>
      <button
        className={"pz__btn" + (pz.handTool ? " pz__btn--on" : "")}
        data-tip="Pan (Space / middle-click)"
        aria-label="Pan tool"
        aria-pressed={pz.handTool}
        onClick={() => pz.setHandTool(!pz.handTool)}
      >
        <Icon name="hand" size={13} />
      </button>
    </div>
  );
}
