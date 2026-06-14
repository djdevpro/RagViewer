import { useStore } from "@tanstack/react-store";
import { docStore, setActiveDoc } from "../store/doclang-store";
import { Icon } from "./icons";

// Bottom strip: one chip per uploaded document (first-page thumbnail). Click to switch.
export function DocStrip() {
  const docs = useStore(docStore, (s) => s.docs);
  const activeId = useStore(docStore, (s) => s.activeId);
  if (!docs.length) return null;

  return (
    <div className="docstrip">
      {docs.map((d) => (
        <button
          key={d.id}
          className={"docchip" + (d.id === activeId ? " docchip--sel" : "")}
          onClick={() => setActiveDoc(d.id)}
          title={d.name}
        >
          <span className="docchip__thumb">
            {d.pages[0] ? (
              <img src={d.pages[0].imageUrl} alt="" draggable={false} />
            ) : (
              <Icon name="grid" size={16} />
            )}
            {d.status === "done" && <span className="docchip__ok">✓</span>}
            {d.status === "error" && <span className="docchip__err">!</span>}
            {(d.status === "pending" || d.status === "rendering" || d.status === "converting") && (
              <span className="docchip__spin" />
            )}
          </span>
          <span className="docchip__name">{d.name}</span>
        </button>
      ))}
    </div>
  );
}
