import { useMemo } from "react";
import { useStore } from "@tanstack/react-store";
import { docStore, activeDoc, setState } from "../store/doclang-store";
import { ZoneInspector } from "./ZoneInspector";
import { CodePanel } from "./CodePanel";
import { MarkdownEditor } from "./MarkdownEditor";
import { HtmlView } from "./HtmlView";
import { pageToMarkdown } from "../lib/render-page";

const TABS = [
  { k: "html", label: "HTML" },
  { k: "xml", label: "XML" },
  { k: "md", label: "Markdown" },
] as const;

export function RightPanel() {
  const mode = useStore(docStore, (s) => s.viewMode);
  const doc = useStore(docStore, activeDoc);

  const md = useMemo(
    () => (mode === "md" && doc ? pageToMarkdown(doc.zones.filter((z) => z.page === doc.currentPage)) : ""),
    [mode, doc],
  );

  return (
    <div className="rp">
      <div className="rp__tabs">
        {TABS.map((t) => (
          <button
            key={t.k}
            className={"rp__tab" + (mode === t.k ? " rp__tab--on" : "")}
            onClick={() => setState({ viewMode: t.k })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rp__body">
        {mode === "xml" && (
          <>
            <ZoneInspector />
            <CodePanel />
          </>
        )}
        {mode === "md" && <MarkdownEditor value={md} />}
        {mode === "html" && <HtmlView />}
      </div>
    </div>
  );
}
