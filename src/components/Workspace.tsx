import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStore } from "@tanstack/react-store";
import { ragStore, setMode, setQuery } from "../store/rag-store";
import { docStore, activeDoc } from "../store/doclang-store";
import { recomputePreview, runQuery } from "../lib/rag";
import { useResizablePane } from "../hooks/useResizablePane";
import { ChunkConfigPanel } from "./ChunkConfigPanel";
import { RightPanel } from "./RightPanel";
import { DecoupageDoc } from "./DecoupageDoc";
import { EmbeddingGraph } from "./EmbeddingGraph";
import { ChatPanel } from "./ChatPanel";
import { PageBar } from "./PageBar";
import { PageViewer } from "./PageViewer";
import { LoadingPanel } from "./LoadingPanel";
import { Icon } from "./icons";

const DOC_KEY = "doclang-doc-col-px";

// Step 1 — plain document preview: original page image + HTML/XML/Markdown tabs.
function PreviewView() {
  const doc = useStore(docStore, activeDoc);
  const { containerRef, width, dragging, onMouseDown, onKeyDown } = useResizablePane();
  return (
    <div className="doc-split" ref={containerRef}>
      <section className="doc-pane doc-pane--left" style={width != null ? { width: `${width}px` } : undefined}>
        <PageBar />
        {doc && doc.pages.length > 0 ? (
          <div className="doc-scroll">
            <PageViewer />
          </div>
        ) : (
          <LoadingPanel />
        )}
      </section>
      <div
        className={"doc-sep" + (dragging ? " doc-sep--drag" : "")}
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner"
        tabIndex={0}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
      />
      <section className="doc-pane doc-pane--right">
        <RightPanel />
      </section>
    </div>
  );
}

// Step 3 — bottom keyword search that highlights the nearest chunks in the cloud.
function CloudPane() {
  const query = useStore(ragStore, (s) => s.query);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void runQuery(query);
  };
  return (
    <div className="cloudpane">
      <div className="cloudpane__head">
        <Icon name="grid" size={14} />
        <span>Embedding cloud</span>
      </div>
      <div className="cloudpane__graph">
        <EmbeddingGraph />
      </div>
      <form className="cloudpane__search" onSubmit={submit}>
        <input
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            if (!v.trim()) void runQuery(""); // clearing reverts the cloud + chunk panel
          }}
          placeholder="Search chunks by meaning…"
          spellCheck={false}
          aria-label="Keyword"
        />
        <button type="submit" aria-label="Highlight">
          <Icon name="search" size={15} />
        </button>
      </form>
    </div>
  );
}

export function Workspace() {
  const mode = useStore(ragStore, (s) => s.mode);
  const hasVersions = useStore(ragStore, (s) => s.versions.length > 0);
  const chunkSig = useStore(ragStore, (s) => JSON.stringify(s.settings.chunk));
  const docId = useStore(docStore, (s) => s.activeId);
  const docStatus = useStore(docStore, (s) => activeDoc(s)?.status ?? null);

  // Live boundary preview whenever the config, document, or step changes.
  // Re-running on `mode` hands HtmlView a fresh `chunks` reference so the overlay
  // re-applies reliably when entering the découpage step from the preview.
  useEffect(() => {
    recomputePreview();
  }, [chunkSig, docId, docStatus, mode]);

  // No computed version yet → can't explore/chat; fall back to the chunking step.
  useEffect(() => {
    if ((mode === "drag" || mode === "chat") && !hasVersions) setMode("weave");
  }, [mode, hasVersions]);

  // Resizer between the document and the cloud (drag mode only).
  const docRef = useRef<HTMLElement>(null);
  const [docW, setDocW] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(DOC_KEY);
      return v ? parseInt(v, 10) : null;
    } catch {
      return null;
    }
  });
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const el = docRef.current;
      if (!el) return;
      const w = Math.max(280, e.clientX - el.getBoundingClientRect().left);
      setDocW(w);
      try {
        localStorage.setItem(DOC_KEY, String(Math.round(w)));
      } catch {
        /* ignore */
      }
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging]);

  if (mode === "preview") return <PreviewView />;

  if (mode === "chat") {
    // Chat takes the full width — no document/pages column here.
    return (
      <div className="ws">
        <ChatPanel />
      </div>
    );
  }

  const drag = mode === "drag";
  return (
    <div className="ws">
      <aside className="ws__cfg">
        <ChunkConfigPanel />
      </aside>
      <section
        className="ws__doc"
        ref={docRef}
        style={drag && docW != null ? { flex: `0 0 ${docW}px` } : undefined}
      >
        <DecoupageDoc />
      </section>
      {drag && (
        <>
          <div
            className={"ws__sep" + (dragging ? " ws__sep--drag" : "")}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize"
            onMouseDown={() => setDragging(true)}
          />
          <section className="ws__cloud">
            <CloudPane />
          </section>
        </>
      )}
    </div>
  );
}
