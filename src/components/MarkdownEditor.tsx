import { useEffect, useState } from "react";

// Simple editor for the current page's Markdown (editable textarea, nicer than a <pre>).
export function MarkdownEditor({ value }: { value: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]); // reset when the page/doc changes

  return (
    <div className="mde">
      <div className="mde__bar">
        <span className="mde__title">Markdown · current page</span>
        <button onClick={() => void navigator.clipboard.writeText(text)}>Copy</button>
      </div>
      <textarea
        className="mde__area"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
