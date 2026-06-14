import { useStore } from "@tanstack/react-store";
import { ragStore, toggleVersion } from "../store/rag-store";

const STRATEGY_LABEL: Record<string, string> = {
  hybrid: "Hybrid",
  structural: "Structural",
  recursive: "Recursive",
  fixed: "Fixed",
  semantic: "Semantic",
};

// Bottom strip: one tile per computed chunking version. Click a tile to select it
// (Explore shows it; Chat filters to its conversations). Click the selected tile
// again to deselect — back to "all conversations".
export function VersionStrip() {
  const versions = useStore(ragStore, (s) => s.versions);
  const activeId = useStore(ragStore, (s) => s.activeVersionId);

  if (versions.length === 0) {
    return <div className="vstrip vstrip--empty">No chunking version yet — run “Compute &amp; explore” in the Chunking step.</div>;
  }

  return (
    <div className="vstrip">
      {versions.map((v) => (
        <button
          key={v.id}
          type="button"
          className={"vtile" + (v.id === activeId ? " vtile--on" : "")}
          onClick={() => toggleVersion(v.id)}
          title={`${v.label} · ${STRATEGY_LABEL[v.strategy] ?? v.strategy} · ${v.chunks.length} chunks`}
        >
          <span className="vtile__label">{v.label}</span>
          <span className="vtile__meta">
            {STRATEGY_LABEL[v.strategy] ?? v.strategy} · {v.chunks.length} chunks
          </span>
        </button>
      ))}
    </div>
  );
}
