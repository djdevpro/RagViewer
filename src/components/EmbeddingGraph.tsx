import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useStore } from "@tanstack/react-store";
import ForceGraph2DImport from "react-force-graph-2d";
import { ragStore, selectedOrLatestVersion, setActiveChunk, setHoverChunk } from "../store/rag-store";
import { patchActive } from "../store/doclang-store";
import { chunkColor } from "../lib/chunk-palette";
import type { GraphNode } from "../lib/graph";

// The lib's prop/callback types are awkward with React 19; treat it as an
// any-props component and type our own callbacks against GraphNode.
const ForceGraph2D = ForceGraph2DImport as unknown as (props: Record<string, unknown>) => ReactElement;

const DIM = "rgba(140,140,140,0.22)";

// Embedding "cloud": a k-NN force graph where similar chunks cluster together.
export function EmbeddingGraph() {
  const graph = useStore(ragStore, (s) => selectedOrLatestVersion(s)?.graph ?? null);
  const highlight = useStore(ragStore, (s) => s.highlightIds);
  const activeChunkId = useStore(ragStore, (s) => s.activeChunkId);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clone so the force simulation can mutate positions without touching the store.
  const data = useMemo(
    () =>
      graph
        ? { nodes: graph.nodes.map((n) => ({ ...n })), links: graph.links.map((l) => ({ ...l })) }
        : { nodes: [], links: [] },
    [graph],
  );

  const hl = useMemo(() => new Set(highlight), [highlight]);

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="cloud cloud--empty" ref={wrapRef}>
        <p>The embedding cloud will appear here once the chunking is computed.</p>
      </div>
    );
  }

  const colorFor = (n: GraphNode): string => {
    if (hl.size) return hl.has(n.id) ? chunkColor(Number(n.id)) : DIM;
    if (activeChunkId && n.chunkId === activeChunkId) return chunkColor(Number(n.id));
    return chunkColor(Number(n.id));
  };

  return (
    <div className="cloud" ref={wrapRef}>
      {size.w > 0 && (
        <ForceGraph2D
          width={size.w}
          height={size.h}
          graphData={data}
          nodeId="id"
          nodeRelSize={5}
          nodeColor={(n: GraphNode) => colorFor(n)}
          nodeVal={(n: GraphNode) => (hl.has(n.id) || n.chunkId === activeChunkId ? 4 : 1.2)}
          nodeLabel={(n: GraphNode) =>
            `${n.headingPath.length ? n.headingPath.join(" › ") : "Document"}\n${n.text.slice(0, 140)}`
          }
          linkColor={() => DIM}
          linkWidth={(l: { sim: number }) => Math.max(0.3, (l.sim - 0.5) * 4)}
          cooldownTicks={120}
          onNodeClick={(n: GraphNode) => {
            setActiveChunk(n.chunkId);
            patchActive({ currentPage: n.page ?? 0, activeZoneId: n.elementIds[0] ?? null });
          }}
          onNodeHover={(n: GraphNode | null) => setHoverChunk(n ? n.chunkId : null)}
        />
      )}
    </div>
  );
}
