import { useState } from "react";
import { useStore } from "@tanstack/react-store";
import { docStore, activeDoc, resetAll } from "../store/doclang-store";
import { appStore, setTheme } from "../store/app-store";
import { ragStore, setMode } from "../store/rag-store";
import { Icon } from "./icons";
import { SettingsModal } from "./SettingsModal";
import { Tooltip } from "./Tooltip";

function download(xml: string, name: string) {
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function DocToolbar() {
  const doc = useStore(docStore, activeDoc);
  const theme = useStore(appStore, (s) => s.theme);
  const mode = useStore(ragStore, (s) => s.mode);
  const indexReady = useStore(ragStore, (s) => s.versions.length > 0);
  const [settings, setSettings] = useState(false);

  const ready = doc?.status === "done";
  const baseName = doc?.name.replace(/\.[^.]+$/, "") ?? "document";

  return (
    <header className="doc-bar">
      <div className="doc-bar__brand">
        <span>RagViewer</span>
      </div>

      <div className="stepper" role="group" aria-label="Steps">
        <button
          type="button"
          className={"stepper__step" + (mode === "preview" ? " stepper__step--on" : "")}
          onClick={() => setMode("preview")}
          disabled={!doc}
          title="Document preview"
        >
          <span className="stepper__num">1</span>
          <span>Preview</span>
        </button>
        <span className="stepper__sep" />
        <button
          type="button"
          className={"stepper__step" + (mode === "weave" ? " stepper__step--on" : "")}
          onClick={() => setMode("weave")}
          disabled={!ready}
          title={ready ? "Configure chunking" : "Load a document first"}
        >
          <span className="stepper__num">2</span>
          <span>Chunking</span>
        </button>
        <span className="stepper__sep" />
        <button
          type="button"
          className={"stepper__step" + (mode === "drag" ? " stepper__step--on" : "")}
          onClick={() => setMode("drag")}
          disabled={!indexReady}
          title={indexReady ? "Explore the embeddings" : "Compute the chunking first (step 2)"}
        >
          <span className="stepper__num">3</span>
          <span>Explore</span>
        </button>
        <span className="stepper__sep" />
        <button
          type="button"
          className={"stepper__step" + (mode === "chat" ? " stepper__step--on" : "")}
          onClick={() => setMode("chat")}
          disabled={!indexReady}
          title={indexReady ? "Chat with the document" : "Compute the chunking first (step 2)"}
        >
          <span className="stepper__num">4</span>
          <span>Chat</span>
        </button>
      </div>

      <div className="doc-bar__spacer" />

      {ready && doc && (
        <>
          <button
            className="doc-bar__icon"
            data-tip="Copy XML"
            aria-label="Copy XML"
            onClick={() => void navigator.clipboard.writeText(doc.xml)}
          >
            <Icon name="copy" />
          </button>
          <button
            className="doc-bar__icon"
            data-tip="Export (.dclg.xml)"
            aria-label="Export"
            onClick={() => download(doc.xml, `${baseName}.dclg.xml`)}
          >
            <Icon name="download" />
          </button>
        </>
      )}
      {doc && (
        <button className="doc-bar__icon" data-tip="New document" aria-label="New document" onClick={resetAll}>
          <Icon name="plus" />
        </button>
      )}

      <button className="doc-bar__icon" data-tip="Settings" aria-label="Settings" onClick={() => setSettings(true)}>
        <Icon name="sliders" />
      </button>
      <button
        className="doc-bar__icon"
        data-tip="Toggle theme"
        aria-label="Toggle theme"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} />
      </button>

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
      <Tooltip />
    </header>
  );
}
