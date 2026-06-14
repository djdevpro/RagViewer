import { useRef } from "react";
import { Icon } from "./icons";

export function DocDropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="dropzone" onClick={() => inputRef.current?.click()}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.currentTarget.value = "";
        }}
      />
      <div className="ico">
        <Icon name="upload" size={26} />
      </div>
      <p>Drop PDFs or images, or click to choose</p>
      <small>DocLang conversion via docling-serve — drop several at once</small>
    </div>
  );
}
