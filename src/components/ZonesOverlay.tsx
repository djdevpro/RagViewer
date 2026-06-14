import { useStore } from "@tanstack/react-store";
import { docStore, activeDoc, patchActive, setState } from "../store/doclang-store";
import { TYPE_COLORS } from "../lib/colors";

export function ZonesOverlay() {
  const doc = useStore(docStore, activeDoc);
  const show = useStore(docStore, (s) => s.showZones);
  const hoverId = useStore(docStore, (s) => s.hoverZoneId);

  if (!doc || !show) return null;
  const pg = doc.pages[doc.currentPage];
  if (!pg) return null;
  const zones = doc.zones.filter((z) => z.page === doc.currentPage);
  const activeId = doc.activeZoneId;

  return (
    <div className="overlay">
      {zones.map((z) => {
        if (z.bbox.x1 <= z.bbox.x0 || z.bbox.y1 <= z.bbox.y0) return null;
        const left = (z.bbox.x0 / pg.width) * 100;
        const top = (z.bbox.y0 / pg.height) * 100;
        const w = ((z.bbox.x1 - z.bbox.x0) / pg.width) * 100;
        const h = ((z.bbox.y1 - z.bbox.y0) / pg.height) * 100;
        const color = TYPE_COLORS[z.type];
        const active = z.id === activeId || z.id === hoverId;
        return (
          <div
            key={z.id}
            className={"zone" + (active ? " zone--active" : "")}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${w}%`,
              height: `${h}%`,
              borderColor: color,
              background: active ? color + "33" : color + "12",
            }}
            onClick={() => patchActive({ activeZoneId: z.id })}
            onMouseEnter={() => setState({ hoverZoneId: z.id })}
            onMouseLeave={() => setState({ hoverZoneId: null })}
            title={z.type}
          >
            <span className="zone__tag" style={{ background: color }}>
              {z.type}
              {z.level ?? ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
