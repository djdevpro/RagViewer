import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "@tanstack/react-store";
import { docStore, setEngine, setServerUrl, type Engine } from "../store/doclang-store";
import { ragStore, setRagSettings, setChatSettings, type ChatProvider, type EmbedProvider } from "../store/rag-store";
import { listOllamaModels } from "../lib/ollama";
import { Icon } from "./icons";

function Acc({ id, title, open, onToggle, children }: {
  id: string;
  title: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className={"cfg-acc" + (open ? " cfg-acc--open" : "")}>
      <button type="button" className="cfg-acc__head" onClick={() => onToggle(id)} aria-expanded={open}>
        <span>{title}</span>
        <Icon name={open ? "minus" : "plus"} size={15} />
      </button>
      {open && <div className="cfg-acc__body">{children}</div>}
    </div>
  );
}

// Settings, grouped into accordions: Conversion · Embeddings · Vector database · Chat · Ollama server.
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engine = useStore(docStore, (s) => s.engine);
  const serverUrl = useStore(docStore, (s) => s.serverUrl);
  const dbMode = useStore(ragStore, (s) => s.settings.dbMode);
  const embedProvider = useStore(ragStore, (s) => s.settings.embedProvider);
  const model = useStore(ragStore, (s) => s.settings.model);
  const qdrantUrl = useStore(ragStore, (s) => s.settings.qdrantUrl);
  const qdrantApiKey = useStore(ragStore, (s) => s.settings.qdrantApiKey);
  const chatProvider = useStore(ragStore, (s) => s.settings.chatProvider);
  const openaiKey = useStore(ragStore, (s) => s.settings.openaiKey);
  const openaiModel = useStore(ragStore, (s) => s.settings.openaiModel);
  const ollamaUrl = useStore(ragStore, (s) => s.settings.ollamaUrl);
  const ollamaModel = useStore(ragStore, (s) => s.settings.ollamaModel);
  const chatSystemPrompt = useStore(ragStore, (s) => s.settings.chatSystemPrompt);

  const [shown, setShown] = useState(open);
  const [acc, setAcc] = useState("embeddings");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaErr, setOllamaErr] = useState<string | null>(null);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const toggle = (id: string) => setAcc((o) => (o === id ? "" : id));

  const refreshOllama = () => {
    setOllamaLoading(true);
    setOllamaErr(null);
    listOllamaModels(ollamaUrl)
      .then((m) => setOllamaModels(m))
      .catch((e: unknown) => setOllamaErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setOllamaLoading(false));
  };

  // Fetch the Ollama model list when the modal opens (used by Embeddings & Chat).
  useEffect(() => {
    if (open) refreshOllama();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (open && !shown) setShown(true);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      prevFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!shown) return null;
  const closing = !open;

  const switchEmbedProvider = (p: EmbedProvider) => {
    if (p === "ollama") {
      const pick = ollamaModels.find((m) => /embed/i.test(m)) ?? ollamaModels[0] ?? "";
      setRagSettings(pick ? { embedProvider: p, model: pick } : { embedProvider: p });
    } else {
      setRagSettings({ embedProvider: p, model: "Xenova/all-MiniLM-L6-v2" });
    }
  };

  // Shared Ollama model picker (used for embeddings and chat).
  const ollamaModelPicker = (value: string, onPick: (m: string) => void) => {
    if (ollamaErr) return <div className="cfg__err">⚠ {ollamaErr}</div>;
    if (ollamaModels.length === 0)
      return <div className="server-field-note">{ollamaLoading ? "Detecting models…" : "No model detected."}</div>;
    return (
      <select value={value} onChange={(e) => onPick(e.target.value)}>
        {value && !ollamaModels.includes(value) && <option value={value}>{value}</option>}
        {ollamaModels.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    );
  };

  return (
    <div
      className={"modal-backdrop" + (closing ? " modal-backdrop--out" : "")}
      onClick={onClose}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) setShown(false);
      }}
    >
      <div
        className={"modal" + (closing ? " modal--out" : "")}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <h2 className="modal__title">Settings</h2>
          <button ref={closeRef} className="modal__close" onClick={onClose} title="Close" aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="modal__body modal__body--acc">
          {/* ---- Conversion ---- */}
          <Acc id="conversion" title="Conversion engine" open={acc === "conversion"} onToggle={toggle}>
            <button
              type="button"
              className={"engine-opt" + (engine === "local" ? " engine-opt--on" : "")}
              onClick={() => setEngine("local" as Engine)}
            >
              <span className="engine-opt__dot" />
              <span className="engine-opt__txt">
                <b>Local · in your browser</b>
                <small>PDF → DocLang runs locally. No data sent, works offline.</small>
              </span>
            </button>
            <button
              type="button"
              className={"engine-opt" + (engine === "server" ? " engine-opt--on" : "")}
              onClick={() => setEngine("server" as Engine)}
            >
              <span className="engine-opt__dot" />
              <span className="engine-opt__txt">
                <b>Server · docling-serve</b>
                <small>Offload conversion to a docling-serve server (layout, tables, OCR).</small>
              </span>
            </button>
            {engine === "server" && (
              <label className="server-field">
                <span>Server address</span>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://localhost:5001"
                  spellCheck={false}
                />
                <small>e.g. <code>http://localhost:5001</code>. The server must allow browser access (CORS).</small>
              </label>
            )}
          </Acc>

          {/* ---- Embeddings ---- */}
          <Acc id="embeddings" title="Embeddings" open={acc === "embeddings"} onToggle={toggle}>
            <button
              type="button"
              className={"engine-opt" + (embedProvider === "transformers" ? " engine-opt--on" : "")}
              onClick={() => switchEmbedProvider("transformers")}
            >
              <span className="engine-opt__dot" />
              <span className="engine-opt__txt">
                <b>Transformers.js · in your browser</b>
                <small>Embeddings computed in the browser (WASM). Works offline.</small>
              </span>
            </button>
            <button
              type="button"
              className={"engine-opt" + (embedProvider === "ollama" ? " engine-opt--on" : "")}
              onClick={() => switchEmbedProvider("ollama")}
            >
              <span className="engine-opt__dot" />
              <span className="engine-opt__txt">
                <b>Ollama · local model</b>
                <small>Use an Ollama embedding model (e.g. <code>qwen3-embedding</code>). Set the server below.</small>
              </span>
            </button>

            {embedProvider === "transformers" ? (
              <label className="server-field">
                <span>Model</span>
                <input list="embed-models" value={model} onChange={(e) => setRagSettings({ model: e.target.value })} spellCheck={false} />
                <datalist id="embed-models">
                  <option value="Xenova/all-MiniLM-L6-v2" />
                  <option value="Xenova/all-MiniLM-L12-v2" />
                  <option value="Xenova/bge-small-en-v1.5" />
                  <option value="Xenova/gte-small" />
                  <option value="Xenova/multilingual-e5-small" />
                </datalist>
                <small>Default: <code>Xenova/all-MiniLM-L6-v2</code> (light, 384 dim). Must be a Transformers.js model.</small>
              </label>
            ) : (
              <label className="server-field">
                <span>Ollama embedding model</span>
                {ollamaModelPicker(model, (m) => setRagSettings({ model: m }))}
                <small>Pick a model suited for embeddings (e.g. <code>qwen3-embedding:8b</code>).</small>
              </label>
            )}
          </Acc>

          {/* ---- Vector database ---- */}
          <Acc id="vectordb" title="Vector database" open={acc === "vectordb"} onToggle={toggle}>
            <button
              type="button"
              className={"engine-opt" + (dbMode === "local" ? " engine-opt--on" : "")}
              onClick={() => setRagSettings({ dbMode: "local" })}
            >
              <span className="engine-opt__dot" />
              <span className="engine-opt__txt">
                <b>Local · EntityDB (browser)</b>
                <small>100% client-side vector index (IndexedDB). No data sent, works offline.</small>
              </span>
            </button>
            <button
              type="button"
              className={"engine-opt" + (dbMode === "qdrant" ? " engine-opt--on" : "")}
              onClick={() => setRagSettings({ dbMode: "qdrant" })}
            >
              <span className="engine-opt__dot" />
              <span className="engine-opt__txt">
                <b>Server · Qdrant</b>
                <small>Connect your Qdrant database via its URL + API key.</small>
              </span>
            </button>
            {dbMode === "qdrant" && (
              <>
                <label className="server-field">
                  <span>Qdrant URL</span>
                  <input
                    type="text"
                    value={qdrantUrl}
                    onChange={(e) => setRagSettings({ qdrantUrl: e.target.value })}
                    placeholder="https://xxxx.cloud.qdrant.io:6333"
                    spellCheck={false}
                  />
                  <small>
                    Key can be included: <code>https://&lt;key&gt;@host:6333</code> or <code>…?api_key=&lt;key&gt;</code>. CORS required.
                  </small>
                </label>
                <label className="server-field">
                  <span>API key (optional if in the URL)</span>
                  <input type="password" value={qdrantApiKey} onChange={(e) => setRagSettings({ qdrantApiKey: e.target.value })} placeholder="api-key" spellCheck={false} />
                </label>
              </>
            )}
          </Acc>

          {/* ---- Chat ---- */}
          <Acc id="chat" title="Chat" open={acc === "chat"} onToggle={toggle}>
            <button
              type="button"
              className={"engine-opt" + (chatProvider === "openai" ? " engine-opt--on" : "")}
              onClick={() => setChatSettings({ chatProvider: "openai" as ChatProvider })}
            >
              <span className="engine-opt__dot" />
              <span className="engine-opt__txt">
                <b>OpenAI · API key</b>
                <small>Answers via the OpenAI API. Your key stays in this browser.</small>
              </span>
            </button>
            <button
              type="button"
              className={"engine-opt" + (chatProvider === "ollama" ? " engine-opt--on" : "")}
              onClick={() => setChatSettings({ chatProvider: "ollama" as ChatProvider })}
            >
              <span className="engine-opt__dot" />
              <span className="engine-opt__txt">
                <b>Ollama · local</b>
                <small>Answers via a local Ollama model. 100% on your machine.</small>
              </span>
            </button>

            {chatProvider === "openai" ? (
              <>
                <label className="server-field">
                  <span>OpenAI API key</span>
                  <input type="password" value={openaiKey} onChange={(e) => setChatSettings({ openaiKey: e.target.value })} placeholder="sk-…" spellCheck={false} />
                </label>
                <label className="server-field">
                  <span>Model</span>
                  <input type="text" value={openaiModel} onChange={(e) => setChatSettings({ openaiModel: e.target.value })} placeholder="gpt-4o-mini" spellCheck={false} />
                </label>
              </>
            ) : (
              <label className="server-field">
                <span>Ollama model</span>
                {ollamaModelPicker(ollamaModel, (m) => setChatSettings({ ollamaModel: m }))}
              </label>
            )}

            <label className="server-field">
              <span>System prompt</span>
              <textarea
                className="cfg-textarea"
                value={chatSystemPrompt}
                onChange={(e) => setChatSettings({ chatSystemPrompt: e.target.value })}
                rows={6}
                spellCheck={false}
              />
              <small>Instructions sent to the model before each answer.</small>
            </label>
          </Acc>

          {/* ---- Ollama server (shared) ---- */}
          <Acc id="ollama" title="Ollama server" open={acc === "ollama"} onToggle={toggle}>
            <label className="server-field">
              <div className="server-field__row">
                <span>Server URL</span>
                <button type="button" className="link-btn" onClick={refreshOllama} disabled={ollamaLoading}>
                  <Icon name="refresh" size={12} /> {ollamaLoading ? "Detecting…" : "Refresh"}
                </button>
              </div>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setChatSettings({ ollamaUrl: e.target.value })}
                placeholder="http://localhost:11434"
                spellCheck={false}
              />
              {ollamaErr ? (
                <div className="cfg__err">⚠ {ollamaErr}</div>
              ) : (
                <small>
                  {ollamaModels.length > 0 ? `${ollamaModels.length} model(s) detected. ` : ""}
                  The server must allow this site (<code>OLLAMA_ORIGINS</code>). Used for embeddings and chat.
                </small>
              )}
            </label>
          </Acc>
        </div>
      </div>
    </div>
  );
}
