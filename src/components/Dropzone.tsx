import { useRef } from "react";

// Zone de depot de l'etat vide. Le drag&drop reel est gere au niveau de la
// fenetre entiere (voir routes/index.tsx) ; ici on ne gere que le clic.
export function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (files.length) onFiles(files);
  };

  return (
    <div className="dropzone" onClick={() => inputRef.current?.click()}>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />
      <div className="ico">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <p>Glisse tes images n'importe où, ou clique pour choisir</p>
      <small>Stickers, logos, photos — traitement 100 % dans ton navigateur</small>
    </div>
  );
}
