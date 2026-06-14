import { useFit } from "../hooks/use-fit";
import { Icon } from "./icons";
import type { ImgItem } from "../store/app-store";

// Vue pendant le traitement : sujet en fond (scan) + panneau d'etapes (done / en cours / a venir).
export function StageWait({ item, bg, ratio }: { item: ImgItem | null; bg: string; ratio?: number }) {
  const { ref, style } = useFit(ratio);
  const plan = item?.plan ?? [];
  const done = item?.status === "done";
  const idx = done ? plan.length : item?.stepIndex ?? -1;
  const title = item?.solid ? "Détourage géométrique" : "Détourage automatique";

  return (
    <div ref={ref} className={"stage-wait " + bg} style={style}>
      {item && <img src={item.srcUrl} alt="" draggable={false} />}
      <div className="tracing">
        {item?.status === "error" ? (
          <div className="trace-err"><b>Échec du détourage</b><span>{item.error}</span></div>
        ) : (
          <>
            <div className="tracing-head">
              <span className="tracing-title">{title}</span>
              <span className="tracing-status">{done ? "Terminé" : "En cours"}</span>
            </div>
            <ul className="steps">
              {plan.length === 0 ? (
                <li className="step active">
                  <span className="step-ico"><span className="step-dot" /></span>
                  <span className="step-txt"><span className="step-line"><span className="step-label">Analyse…</span></span></span>
                </li>
              ) : (
                plan.map((s, i) => {
                  const state = i < idx ? "done" : i === idx ? "active" : "pending";
                  const showPct = s.key === "model" && state === "active" && item!.progress != null;
                  return (
                    <li className={"step " + state} key={s.key} style={{ animationDelay: `${i * 55}ms` }}>
                      <span className="step-ico">
                        {state === "done" ? <Icon name="check" size={12} /> : state === "active" ? <span className="step-dot" /> : null}
                      </span>
                      <span className="step-txt">
                        <span className="step-line">
                          <span className="step-label">{s.label}</span>
                          {showPct && <span className="step-pct">{Math.round(item!.progress!)} %</span>}
                        </span>
                        {s.detail && <span className="step-detail">{s.detail}</span>}
                        {showPct && <span className="step-bar"><span style={{ width: `${item!.progress}%` }} /></span>}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
