import { useStore } from "@tanstack/react-store";
import { docStore, activeDoc } from "../store/doclang-store";

export function ZoneInspector() {
  const doc = useStore(docStore, activeDoc);
  const z = doc?.zones.find((x) => x.id === doc.activeZoneId);

  if (!z) {
    return <div className="inspector inspector--empty">Click a zone to see its text.</div>;
  }
  return (
    <div className="inspector">
      <div className="inspector__row">
        <b>type</b>
        <span>
          {z.type}
          {z.level ?? ""}
        </span>
      </div>
      <div className="inspector__row">
        <b>loc</b>
        <span>[{z.loc.join(", ")}]</span>
      </div>
      {(z.type === "table" || z.type === "index") && z.text ? (
        <table className="inspector__table">
          <tbody>
            {z.text.split("\n").map((row, ri) => (
              <tr key={ri}>
                {row.split("\t").map((cell, ci) => (
                  <td key={ci}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="inspector__text">{z.text || <i>(no text)</i>}</div>
      )}
    </div>
  );
}
