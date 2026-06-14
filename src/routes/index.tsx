import { useEffect, useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import {
  appStore, addItems, clearItems, removeItem, setActive, setSettings, updateItem, type ImgItem,
} from "../store/app-store";
import { detour, type StatusMsg } from "../lib/detour-worker";
import { Toolbar } from "../components/Toolbar";
import { Dropzone } from "../components/Dropzone";
import { BeforeAfter } from "../components/BeforeAfter";
import { StageWait } from "../components/StageWait";
import { Slider } from "../components/Slider";
import { Icon } from "../components/icons";

interface InstallPrompt { prompt: () => void; userChoice: Promise<unknown>; }

export function Home() {
  const items = useStore(appStore, (s) => s.items);
  const activeId = useStore(appStore, (s) => s.activeId);
  const previewBg = useStore(appStore, (s) => s.settings.previewBg);
  const mode = useStore(appStore, (s) => s.settings.mode);
  const tol = useStore(appStore, (s) => s.settings.tol);
  const fileRef = useRef<HTMLInputElement>(null);
  const onFilesRef = useRef<(f: File[]) => void>(() => {});
  const [dragging, setDragging] = useState(false);
  const [showParams, setShowParams] = useState(false);
  const [installEvt, setInstallEvt] = useState<InstallPrompt | null>(null);
  const active = items.find((it) => it.id === activeId) ?? null;
  const ratio = active?.w && active?.h ? active.w / active.h : undefined;

  const process = async (it: ImgItem) => {
    const st = appStore.state.settings;
    updateItem(it.id, { status: "processing", plan: undefined, stepIndex: -1, progress: undefined, error: undefined });
    try {
      const { blob, used } = await detour(it.id, it.file, st.mode, st.tol, (m: StatusMsg) => {
        if (m.type === "plan") updateItem(it.id, { plan: m.steps, solid: m.solid, stepIndex: 2, progress: undefined });
        else if (m.type === "advance") updateItem(it.id, { stepIndex: m.index });
        else if (m.type === "progress") updateItem(it.id, { progress: m.progress });
      });
      const prev = appStore.state.items.find((i) => i.id === it.id)?.resultUrl;
      if (prev) URL.revokeObjectURL(prev);
      updateItem(it.id, { status: "done", resultUrl: URL.createObjectURL(blob), used });
    } catch (e) {
      updateItem(it.id, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const onFiles = (files: File[]) => {
    const list = files.filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    const newItems: ImgItem[] = list.map((f) => ({
      id: crypto.randomUUID(), name: f.name, file: f, srcUrl: URL.createObjectURL(f), status: "pending",
    }));
    addItems(newItems);
    newItems.forEach((it) => {
      const im = new Image();
      im.onload = () => updateItem(it.id, { w: im.naturalWidth, h: im.naturalHeight });
      im.src = it.srcUrl;
      process(it);
    });
  };

  // Drop possible n'importe ou sur la fenetre.
  onFilesRef.current = onFiles;
  useEffect(() => {
    let cnt = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); cnt++; setDragging(true); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = () => { cnt = Math.max(0, cnt - 1); if (cnt === 0) setDragging(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault(); cnt = 0; setDragging(false);
      if (e.dataTransfer?.files?.length) onFilesRef.current(Array.from(e.dataTransfer.files));
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

  // Proposition d'installation PWA.
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as unknown as InstallPrompt); };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const install = async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    setInstallEvt(null);
  };

  // Recalcul auto de l'image active des qu'un reglage change (debounce).
  useEffect(() => {
    const id = appStore.state.activeId;
    if (!id) return;
    const t = setTimeout(() => { const it = appStore.state.items.find((i) => i.id === id); if (it) process(it); }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tol]);

  const download = () => {
    if (!active?.resultUrl) return;
    const a = document.createElement("a");
    a.href = active.resultUrl;
    a.download = active.name.replace(/\.[^.]+$/, "") + "_nobg.png";
    a.click();
  };

  return (
    <>
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-box"><Icon name="upload" size={42} /><span>Lâche tes images ici</span></div>
        </div>
      )}

      <Toolbar
        onDownload={download}
        onClear={clearItems}
        onToggleParams={() => setShowParams((v) => !v)}
        onInstall={install}
        paramsOpen={showParams}
        canDownload={active?.status === "done"}
        canInstall={!!installEvt}
        hasItems={items.length > 0}
      />

      {showParams && (
        <div className="params">
          <div className="params-title">Paramètres</div>
          <Slider label="Tolérance fond uni" value={tol} min={0} max={120} onChange={(v) => setSettings({ tol: v })} />
          <p className="params-hint">
            Mode <b>Fond uni</b> : plus la tolérance est haute, plus on efface de couleurs proches du fond.
            Recalcul automatique de l'image affichée.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          <Dropzone onFiles={onFiles} />
        </div>
      ) : (
        <div className="editor">
          <div className="stage">
            {active && active.status === "done" && active.resultUrl ? (
              <BeforeAfter key={active.id} before={active.srcUrl} after={active.resultUrl} bg={previewBg} ratio={ratio} />
            ) : (
              <StageWait item={active} bg={previewBg} ratio={ratio} />
            )}
          </div>

          <div className="filmstrip">
            {items.map((it) => (
              <button
                key={it.id}
                className={"thumb-mini " + (it.id === activeId ? "sel " : "") + previewBg}
                onClick={() => setActive(it.id)}
                title={it.name}
              >
                <img src={it.resultUrl ?? it.srcUrl} alt="" draggable={false} />
                {it.status === "processing" && <span className="mini-spin" />}
                <span className="thumb-x" onClick={(e) => { e.stopPropagation(); removeItem(it.id); }}>
                  <Icon name="x" size={12} />
                </span>
              </button>
            ))}
            <button className="add" onClick={() => fileRef.current?.click()} title="Ajouter une image">
              <Icon name="plus" size={22} />
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { if (e.target.files) onFiles(Array.from(e.target.files)); e.target.value = ""; }}
      />
    </>
  );
}
