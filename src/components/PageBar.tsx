import { useState } from "react";
import { useStore } from "@tanstack/react-store";
import { docStore, activeDoc, patchActive } from "../store/doclang-store";
import { rerunPage } from "../lib/doclang-engine";
import { Icon } from "./icons";

// Left-pane header bar: document name + page nav with a direct page input.
export function PageBar() {
  const doc = useStore(docStore, activeDoc);
  const page = doc?.currentPage ?? 0;
  const n = doc?.pages.length ?? 0;

  const [val, setVal] = useState(String(page + 1));
  const [synced, setSynced] = useState(page);
  // Resync the field when the page changes elsewhere (arrows / new doc) — render-time pattern.
  if (page !== synced) {
    setSynced(page);
    setVal(String(page + 1));
  }

  if (!doc) return null;

  // Commit reads the LIVE page from the store, so an Enter+blur pair never re-applies
  // the same page twice (the guard sees the page already changed).
  const commit = () => {
    const num = parseInt(val, 10);
    const live = activeDoc(docStore.state);
    const cur = live?.currentPage ?? page;
    const total = live?.pages.length ?? n;
    if (Number.isNaN(num)) {
      setVal(String(cur + 1));
      return;
    }
    const target = Math.max(0, Math.min(total - 1, num - 1));
    if (target !== cur) patchActive({ currentPage: target, activeZoneId: null });
    setVal(String(target + 1));
  };

  return (
    <div className="pagebar">
      <span className="pagebar__name" title={doc.name}>
        {doc.name}
      </span>
      <div className="pagebar__spacer" />
      <div className="pagebar__group">
        <span className="pagebar__lbl">page</span>
        <button disabled={page <= 0} onClick={() => patchActive({ currentPage: page - 1, activeZoneId: null })}>
          ‹
        </button>
        <input
          className="pagebar__input"
          value={val}
          inputMode="numeric"
          aria-label="Page number"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.currentTarget.blur();
            }
          }}
          onBlur={commit}
        />
        <span className="pagebar__count">/ {n}</span>
        <button disabled={page >= n - 1} onClick={() => patchActive({ currentPage: page + 1, activeZoneId: null })}>
          ›
        </button>
      </div>
      {doc.engine === "local" && (
        <button
          className={"pagebar__rerun" + (doc.pages[page]?.status === "processing" ? " is-spinning" : "")}
          data-tip="Re-run inference on this page"
          aria-label="Re-run inference on this page"
          disabled={doc.status !== "done" || doc.pages[page]?.status === "processing"}
          onClick={() => void rerunPage(doc.id, page)}
        >
          <Icon name="refresh" size={14} />
        </button>
      )}
    </div>
  );
}
