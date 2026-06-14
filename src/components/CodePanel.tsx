import { useEffect, useRef } from "react";
import { useStore } from "@tanstack/react-store";
import { docStore, activeDoc, patchActive, setState } from "../store/doclang-store";
import { TYPE_COLORS } from "../lib/colors";

export function CodePanel() {
  const doc = useStore(docStore, activeDoc);
  const hoverId = useStore(docStore, (s) => s.hoverZoneId);
  const ref = useRef<HTMLDivElement>(null);
  const activeId = doc?.activeZoneId ?? null;

  useEffect(() => {
    if (!activeId || !ref.current) return;
    ref.current.querySelector(`[data-zone="${activeId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  if (!doc) return null;
  const zones = doc.zones.filter((z) => z.page === doc.currentPage);

  return (
    <div className="code" ref={ref}>
      {zones.length === 0 && <p className="code__empty">No zones on this page.</p>}
      {zones.map((z) => {
        const active = z.id === activeId || z.id === hoverId;
        return (
          <pre
            key={z.id}
            data-zone={z.id}
            className={"code__frag" + (active ? " code__frag--active" : "")}
            style={{ borderLeftColor: TYPE_COLORS[z.type] }}
            onClick={() => patchActive({ activeZoneId: z.id })}
            onMouseEnter={() => setState({ hoverZoneId: z.id })}
            onMouseLeave={() => setState({ hoverZoneId: null })}
          >
            {z.xml}
          </pre>
        );
      })}
    </div>
  );
}
