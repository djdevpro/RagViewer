import { useMemo } from "react";
import { useStore } from "@tanstack/react-store";
import { docStore, activeDoc, patchDoc, setActiveDoc, patchActive } from "../store/doclang-store";
import { ragStore, activeVersion, setActiveChunk, setHoverChunk } from "../store/rag-store";
import { chunkColor } from "../lib/chunk-palette";
import { Icon } from "./icons";

// Découpage view: renders the ACTUAL chunks (one card per segment) so the slices
// faithfully reflect every setting — including splits/overlap *inside* an element
// that a zone-based overlay could never show. The pretty rendered document lives
// in step 1 (Aperçu). Page + multi-PDF navigation (next at last page → next PDF).
export function DecoupageDoc() {
  const doc = useStore(docStore, activeDoc);
  const docs = useStore(docStore, (s) => s.docs);
  // Chunking step shows the live preview; Explore shows the selected version's chunks,
  // falling back to the live preview when no version is selected (e.g. while editing
  // the config — the version auto-deselects so the découpe stays visible).
  const chunks = useStore(ragStore, (s) => (s.mode === "drag" ? activeVersion(s)?.chunks ?? s.chunks : s.chunks));
  const previewBusy = useStore(ragStore, (s) => s.mode !== "drag" && s.previewBusy);
  const activeChunkId = useStore(ragStore, (s) => s.activeChunkId);
  const hoverChunkId = useStore(ragStore, (s) => s.hoverChunkId);
  const isDrag = useStore(ragStore, (s) => s.mode === "drag");
  const rankedChunkIds = useStore(ragStore, (s) => s.rankedChunkIds);
  // While exploring with an active keyword search, the panel switches from
  // page-by-page document order to a flat list sorted by distance (closest first).
  const searching = isDrag && rankedChunkIds.length > 0;

  const page = doc?.currentPage ?? 0;
  const nPages = doc?.pages.length ?? 0;
  const docIdx = docs.findIndex((d) => d.id === doc?.id);

  const rankPos = useMemo(() => {
    const m = new Map<string, number>();
    rankedChunkIds.forEach((id, idx) => m.set(id, idx));
    return m;
  }, [rankedChunkIds]);

  // Keep the original index `i` (stable colour/number) regardless of display order.
  const listChunks = useMemo(() => {
    const withIdx = chunks.map((c, i) => ({ c, i }));
    if (searching) {
      // Ranked chunks first (closest → farthest); any chunk the store didn't return
      // is appended in document order so nothing disappears during a search.
      const ranked = withIdx
        .filter(({ c }) => rankPos.has(c.id))
        .sort((a, b) => (rankPos.get(a.c.id) ?? 0) - (rankPos.get(b.c.id) ?? 0));
      const rest = withIdx.filter(({ c }) => !rankPos.has(c.id));
      return [...ranked, ...rest];
    }
    return withIdx.filter(({ c }) => (c.page ?? 0) === page);
  }, [chunks, page, searching, rankPos]);

  const go = (dir: 1 | -1) => {
    if (!doc) return;
    const p = page + dir;
    if (p >= 0 && p < nPages) {
      patchDoc(doc.id, { currentPage: p });
      return;
    }
    const ni = docIdx + dir;
    if (ni >= 0 && ni < docs.length) {
      const nd = docs[ni];
      setActiveDoc(nd.id);
      patchDoc(nd.id, { currentPage: dir > 0 ? 0 : Math.max(0, (nd.pages.length || 1) - 1) });
    }
  };

  const atFirst = docIdx <= 0 && page <= 0;
  const atLast = docIdx >= docs.length - 1 && page >= nPages - 1;
  const focus = activeChunkId ?? hoverChunkId;

  return (
    <div className="decoupe">
      <div className="decoupe__bar">
        <span className="decoupe__title" title={doc?.name}>{doc?.name ?? "—"}</span>
        <span className="decoupe__count">
          {searching
            ? `${listChunks.length} chunk(s) · sorted by relevance`
            : `${docs.length > 1 ? `PDF ${docIdx + 1}/${docs.length} · ` : ""}page ${page + 1}/${nPages || 1} · ${listChunks.length} chunk(s)`}
        </span>
        {!searching && (
          <div className="decoupe__nav">
            <button className="decoupe__btn" onClick={() => go(-1)} disabled={atFirst} aria-label="Previous">
              <Icon name="chevronLeft" size={16} />
            </button>
            <button className="decoupe__btn" onClick={() => go(1)} disabled={atLast} aria-label="Next">
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        )}
      </div>

      {previewBusy && (
        <div className="decoupe__note">
          <Icon name="spinner" size={14} className="spin" /> Computing chunking preview…
        </div>
      )}
      {!previewBusy && listChunks.length === 0 && (
        <div className="decoupe__note">
          {chunks.length === 0
            ? "No chunking yet. Run “Compute & explore”, or pick a non-semantic strategy for an instant preview."
            : searching
              ? "No match for this search."
              : "No chunk on this page."}
        </div>
      )}

      <div className="decoupe__scroll">
        <div className="decoupe__list">
          {listChunks.map(({ c, i }, rank) => {
            const foc = focus != null && c.id === focus;
            const dim = focus != null && c.id !== focus;
            return (
              <button
                key={c.id}
                type="button"
                className={"chk-grp" + (foc ? " chk-grp--focus" : "") + (dim ? " chk-grp--dim" : "")}
                style={{ ["--chk" as string]: chunkColor(i) }}
                onClick={() => {
                  setActiveChunk(c.id);
                  patchActive({ currentPage: c.page ?? page, activeZoneId: c.elementIds[0] ?? null });
                }}
                onMouseEnter={() => setHoverChunk(c.id)}
                onMouseLeave={() => setHoverChunk(null)}
              >
                <span className="chk-tag" style={{ background: chunkColor(i) }}>{i + 1}</span>
                {searching && rankPos.has(c.id) && <span className="chk-rank">#{rank + 1}</span>}
                {c.headingPath.length > 0 && <div className="chk-crumb">{c.headingPath.join(" › ")}</div>}
                <div className="chk-text">{c.rawText}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
