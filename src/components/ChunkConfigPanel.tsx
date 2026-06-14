import { useState, type ReactNode } from "react";
import { useStore } from "@tanstack/react-store";
import { ragStore, setChunkPreset, setChunkConfig, setMode } from "../store/rag-store";
import { CHUNK_PRESETS, type ChunkStrategy, type ContextMode, type SizeUnit } from "../lib/chunking";
import { computeIndex } from "../lib/rag";
import { Icon } from "./icons";

const PRESET_LABELS: Record<string, string> = {
  balanced: "Balanced (RAG)",
  precision: "Precision",
  wideContext: "Wide context",
  recursive: "Recursive + overlap",
  semantic: "Semantic",
  fixed: "Fixed size + overlap",
  custom: "Custom",
};

function Accordion({ id, title, open, onToggle, children }: {
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

export function ChunkConfigPanel() {
  const cfg = useStore(ragStore, (s) => s.settings.chunk);
  const preset = useStore(ragStore, (s) => s.settings.chunkPreset);
  const topK = useStore(ragStore, (s) => s.settings.topK);
  const chunks = useStore(ragStore, (s) => s.chunks);
  const indexState = useStore(ragStore, (s) => s.indexState);
  const status = useStore(ragStore, (s) => s.status);
  const error = useStore(ragStore, (s) => s.error);
  const [open, setOpen] = useState<string>("strategy");
  const toggle = (id: string) => setOpen((o) => (o === id ? "" : id));

  const computing = indexState === "computing";

  const compute = async () => {
    await computeIndex();
    if (ragStore.state.indexState === "ready") setMode("drag");
  };

  const toggleLevel = (lvl: number) => {
    const has = cfg.headingLevelsToSplitOn.includes(lvl);
    const next = has
      ? cfg.headingLevelsToSplitOn.filter((l) => l !== lvl)
      : [...cfg.headingLevelsToSplitOn, lvl].sort();
    setChunkConfig({ headingLevelsToSplitOn: next });
  };

  return (
    <div className="cfg">
      <div className="cfg__scroll">
        <Accordion id="strategy" title="Strategy" open={open === "strategy"} onToggle={toggle}>
          <label className="server-field">
            <span>Preset</span>
            <select value={preset} onChange={(e) => setChunkPreset(e.target.value)}>
              {preset === "custom" && <option value="custom">Custom</option>}
              {Object.keys(CHUNK_PRESETS).map((k) => (
                <option key={k} value={k}>{PRESET_LABELS[k] ?? k}</option>
              ))}
            </select>
          </label>
          <label className="server-field">
            <span>Method</span>
            <select value={cfg.strategy} onChange={(e) => setChunkConfig({ strategy: e.target.value as ChunkStrategy })}>
              <option value="hybrid">Hybrid (structure + tokens)</option>
              <option value="structural">Structural (per element)</option>
              <option value="recursive">Recursive (separators)</option>
              <option value="fixed">Fixed size</option>
              <option value="semantic">Semantic (embeddings)</option>
            </select>
          </label>
        </Accordion>

        <Accordion id="size" title="Size" open={open === "size"} onToggle={toggle}>
          <label className="server-field">
            <span>Unit</span>
            <select value={cfg.unit} onChange={(e) => setChunkConfig({ unit: e.target.value as SizeUnit })}>
              <option value="tokens">Tokens</option>
              <option value="chars">Characters</option>
            </select>
          </label>
          <label className="server-field">
            <span>Max size: {cfg.maxSize}</span>
            <input type="range" min={32} max={1024} step={16} value={cfg.maxSize}
              onChange={(e) => setChunkConfig({ maxSize: Number(e.target.value) })} />
          </label>
          <label className="server-field">
            <span>Min size (merge): {cfg.minSize}</span>
            <input type="range" min={0} max={512} step={8} value={cfg.minSize}
              onChange={(e) => setChunkConfig({ minSize: Number(e.target.value) })} />
          </label>
        </Accordion>

        <Accordion id="structure" title="Structure" open={open === "structure"} onToggle={toggle}>
          <div className="cfg-field">
            <span>Heading levels that start a section</span>
            <div className="cfg-levels">
              {[1, 2, 3, 4].map((l) => (
                <button key={l} type="button"
                  className={"cfg-chip" + (cfg.headingLevelsToSplitOn.includes(l) ? " cfg-chip--on" : "")}
                  onClick={() => toggleLevel(l)}>H{l}</button>
              ))}
            </div>
          </div>
          <label className="cfg-check">
            <input type="checkbox" checked={cfg.mergeListItems} onChange={(e) => setChunkConfig({ mergeListItems: e.target.checked })} />
            <span>Merge list items</span>
          </label>
          <label className="cfg-check">
            <input type="checkbox" checked={cfg.keepTablesIntact} onChange={(e) => setChunkConfig({ keepTablesIntact: e.target.checked })} />
            <span>Keep tables whole</span>
          </label>
          <label className="cfg-check">
            <input type="checkbox" checked={cfg.keepCodeIntact} onChange={(e) => setChunkConfig({ keepCodeIntact: e.target.checked })} />
            <span>Keep code blocks whole</span>
          </label>
        </Accordion>

        <Accordion id="context" title="Context" open={open === "context"} onToggle={toggle}>
          <label className="server-field">
            <span>Prefix added before the embedding</span>
            <select value={cfg.contextualize} onChange={(e) => setChunkConfig({ contextualize: e.target.value as ContextMode })}>
              <option value="none">None</option>
              <option value="headingPath">Heading path</option>
              <option value="headingPath+captions">Heading path + captions</option>
            </select>
          </label>
        </Accordion>

        <Accordion id="overlap" title="Overlap" open={open === "overlap"} onToggle={toggle}>
          <label className="server-field">
            <span>Overlap: {Math.round(cfg.overlap * 100)}% <small>(recursive / fixed)</small></span>
            <input type="range" min={0} max={0.5} step={0.05} value={cfg.overlap}
              onChange={(e) => setChunkConfig({ overlap: Number(e.target.value) })} />
          </label>
        </Accordion>

        <Accordion id="semantic" title="Semantic" open={open === "semantic"} onToggle={toggle}>
          <label className="server-field">
            <span>Split threshold: {cfg.semanticThreshold}th percentile</span>
            <input type="range" min={50} max={99} step={1} value={cfg.semanticThreshold}
              onChange={(e) => setChunkConfig({ semanticThreshold: Number(e.target.value) })} />
            <small>Higher = only splits at sharp meaning shifts.</small>
          </label>
        </Accordion>

        <Accordion id="search" title="Search" open={open === "search"} onToggle={toggle}>
          <label className="server-field">
            <span>Results per query: {topK}</span>
            <input type="range" min={1} max={20} step={1} value={topK}
              onChange={(e) => ragStore.setState((s) => ({ ...s, settings: { ...s.settings, topK: Number(e.target.value) } }))} />
          </label>
        </Accordion>
      </div>

      <div className="cfg__foot">
        <div className="cfg__count">
          {cfg.strategy === "semantic" && indexState !== "ready"
            ? "Semantic chunking appears after computing."
            : `${chunks.length} chunk(s)`}
        </div>
        {error && <div className="cfg__err">{error}</div>}
        {computing && status && <div className="cfg__status">{status}</div>}
        <button className="cfg__go" onClick={() => void compute()} disabled={computing}>
          {computing ? <Icon name="spinner" size={15} className="spin" /> : <Icon name="database" size={15} />}
          <span>{indexState === "ready" ? "Recompute & explore" : "Compute & explore"}</span>
        </button>
      </div>
    </div>
  );
}
