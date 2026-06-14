import { useEffect, useState } from "react";
import { useStore } from "@tanstack/react-store";
import {
  docStore,
  activeDoc,
  addDoc,
  patchDoc,
  setActiveDoc,
  setState,
  resetAll,
  type DocEntry,
} from "../store/doclang-store";
import type { Zone, PageData } from "../types";
import { renderFile } from "../lib/pdf";
import { convertWithDoclingServe } from "../lib/docling-serve";
import { mapDoclingToZones } from "../lib/docling-map";
import { convertLocal, pageZones } from "../lib/doclang-engine";
import { colorizeZones } from "../lib/zone-colors";
import { ragStore, addVersion, newConversation, toggleVersion, setMode as setRagMode } from "../store/rag-store";
import { computeIndex as ragComputeIndex } from "../lib/rag";
import { DocDropzone } from "../components/DocDropzone";
import { DocToolbar } from "../components/DocToolbar";
import { DocStrip } from "../components/DocStrip";
import { VersionStrip } from "../components/VersionStrip";
import { Workspace } from "../components/Workspace";
import { Icon } from "../components/icons";

async function convertOne(file: File, id: string) {
  patchDoc(id, { status: "rendering" });
  try {
    const pages = await renderFile(file);
    // Show the rendered pages immediately; each is "processing" until its zones arrive.
    pages.forEach((p) => (p.status = "processing"));
    const { engine, serverUrl } = docStore.state;
    patchDoc(id, { pages: [...pages], zones: [], status: "converting", currentPage: 0, engine });
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

    if (engine === "local") {
      if (!isPdf) {
        throw new Error("The local (headless) engine only handles PDFs — switch to 'Server' for images.");
      }
      // Stream each page's zones as soon as the worker finishes it.
      const res = await convertLocal(id, file, {
        onPage: (index, wp) => {
          const d = docStore.state.docs.find((x) => x.id === id);
          const rendered = d?.pages[index];
          if (!d || !rendered) return;
          const zs = pageZones(wp, index, rendered);
          patchDoc(id, {
            zones: [...d.zones, ...zs],
            pages: d.pages.map((p, i) => (i === index ? { ...p, status: "done" } : p)),
          });
        },
      });
      // Finalize: full-document XML + dominant-colour tinting of all zones.
      const d = docStore.state.docs.find((x) => x.id === id);
      const colored = d ? await colorizeZones(d.pages, d.zones) : [];
      patchDoc(id, { xml: res.xml ?? "", zones: colored, status: "done" });
    } else {
      const doc = await convertWithDoclingServe(file, serverUrl);
      const { zones, xml } = mapDoclingToZones(doc, pages);
      const colored = await colorizeZones(pages, zones);
      patchDoc(id, {
        pages: pages.map((p) => ({ ...p, status: "done" as const })),
        zones: colored,
        xml,
        status: "done",
      });
    }
  } catch (e) {
    patchDoc(id, { status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

async function convertFiles(files: File[]) {
  const accepted = files.filter((f) => f.type === "application/pdf" || f.type.startsWith("image/") || /\.pdf$/i.test(f.name));
  if (!accepted.length) return;
  const ids = accepted.map(() => crypto.randomUUID());
  accepted.forEach((f, i) => {
    const entry: DocEntry = {
      id: ids[i],
      name: f.name,
      file: f,
      status: "pending",
      error: null,
      pages: [],
      zones: [],
      xml: "",
      currentPage: 0,
      activeZoneId: null,
    };
    addDoc(entry);
  });
  for (let i = 0; i < accepted.length; i++) await convertOne(accepted[i], ids[i]);
}

// Dev-only: convert from a served URL (validation). Stripped in prod.
declare global {
  interface Window {
    __convertUrl?: (url?: string) => Promise<void>;
    __injectDoc?: () => void;
    __rag?: typeof import("../store/rag-store");
  }
}
if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
  window.__convertUrl = async (url = "/sample.pdf") => {
    const r = await fetch(url);
    const blob = await r.blob();
    await convertFiles([new File([blob], url.split("/").pop() ?? "file.pdf", { type: blob.type })]);
  };

  // Inject a synthetic document (no PDF.js / docling) to validate layout in
  // headless previews where canvas rendering hangs. Stripped in prod.
  window.__injectDoc = () => {
    const W = 794;
    const H = 1123;
    const z = (
      type: Zone["type"],
      text: string,
      box: [number, number, number, number],
      level?: number,
    ): Zone => ({
      id: crypto.randomUUID(),
      type,
      text,
      bbox: { x0: box[0], y0: box[1], x1: box[2], y1: box[3] },
      loc: [0, 0, 0, 0],
      level,
      xml: "",
      page: 0,
    });
    const toc =
      "1  Introduction and overall scope of the specification document\t1\n" +
      "2  Document structure, layout zones and geometry preservation\t3\n" +
      "3  Tables encoded as OTSL tokens with header and body cells\t7\n" +
      "4  Reading order, lists, forms and key-value field regions\t12\n" +
      "5  Coordinate systems, bounding boxes and location anchoring\t18\n" +
      "6  Retrieval augmented generation over structured DocLang output\t24";
    const table =
      "Field name\tType\tRequired\tDescription of the column\n" +
      "document_id\tstring\tyes\tStable identifier for the source document instance\n" +
      "page_no\tinteger\tyes\tOne-based page index the element was found on\n" +
      "bbox\tobject\tyes\tBounding box left top right bottom in page coordinates\n" +
      "label\tenum\tno\tSemantic role such as heading list_item or table";
    const zones: Zone[] = [
      z("heading", "DocLang Viewer Test", [60, 60, 734, 110], 1),
      z("text", "Fit-to-height layout validation across the left page and the right A4 HTML rendering.", [60, 130, 734, 200]),
      z("heading", "Table of Contents", [60, 230, 420, 270], 2),
      z("index", toc, [60, 290, 734, 520]),
      z("heading", "3  OTSL Table Example", [60, 560, 520, 600], 2),
      z("table", table, [60, 620, 734, 830]),
      z("text", "Each row maps to a record; body cells use <fcel> and header cells use <ched>.", [60, 860, 734, 910]),
    ];
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>` +
      `<rect width='100%' height='100%' fill='white'/>` +
      `<text x='60' y='95' font-family='Georgia' font-size='30' font-weight='bold'>DocLang Viewer Test</text>` +
      `<text x='60' y='160' font-family='Georgia' font-size='15'>Fit-to-height layout validation.</text>` +
      `<text x='60' y='262' font-family='Georgia' font-size='20' font-weight='bold'>Table of Contents</text>` +
      `<text x='60' y='592' font-family='Georgia' font-size='18' font-weight='bold'>3  OTSL Table Example</text>` +
      `<rect x='60' y='620' width='674' height='210' fill='none' stroke='gray'/>` +
      `</svg>`;
    const page: PageData = {
      index: 0,
      width: W,
      height: H,
      imageUrl: "data:image/svg+xml;utf8," + encodeURIComponent(svg),
      status: "done",
    };
    resetAll();
    const id = crypto.randomUUID();
    addDoc({
      id,
      name: "synthetic.pdf",
      status: "done",
      error: null,
      pages: [page],
      zones,
      xml: "<doclang></doclang>",
      currentPage: 0,
      activeZoneId: null,
    });
    setActiveDoc(id);
    setState({ viewMode: "html" });
  };

  // Expose the real rag store + a couple of actions so headless previews can seed
  // versions/conversations without computing embeddings. Stripped in prod.
  window.__rag = { ragStore, addVersion, newConversation, toggleVersion, setMode: setRagMode } as unknown as typeof import("../store/rag-store");
  (window as unknown as { __computeIndex?: () => Promise<void> }).__computeIndex = ragComputeIndex;
}

export function DoclangViewer() {
  const docs = useStore(docStore, (s) => s.docs);
  const doc = useStore(docStore, activeDoc);
  const ragMode = useStore(ragStore, (s) => s.mode);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cnt = 0;
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      cnt++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = () => {
      cnt = Math.max(0, cnt - 1);
      if (cnt === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      cnt = 0;
      setDragging(false);
      if (e.dataTransfer?.files?.length) void convertFiles(Array.from(e.dataTransfer.files));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <div className="doc-app">
      <DocToolbar />

      {dragging && (
        <div className="drop-overlay">
          <div className="drop-box">
            <Icon name="upload" size={42} />
            <span>Drop PDFs or images</span>
          </div>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="doc-intro">
          <DocDropzone onFiles={(f) => void convertFiles(f)} />
        </div>
      ) : (
        <div className="doc-main">
          {doc?.status === "error" ? <p className="doc-error">{doc.error}</p> : <Workspace />}
          {ragMode === "preview" ? <DocStrip /> : <VersionStrip />}
        </div>
      )}
    </div>
  );
}
