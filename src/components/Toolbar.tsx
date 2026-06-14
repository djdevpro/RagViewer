import { useStore } from "@tanstack/react-store";
import { appStore, setSettings, setTheme, type Mode } from "../store/app-store";
import { Icon } from "./icons";

const METHODS: { key: Mode; icon: string; label: string }[] = [
  { key: "auto", icon: "auto", label: "Auto" },
  { key: "solid", icon: "solid", label: "Fond uni" },
  { key: "ai", icon: "ai", label: "IA" },
];
const BGS = ["checker", "white", "black"] as const;
const BG_LABEL = { checker: "Damier", white: "Blanc", black: "Noir" } as const;

interface Props {
  onDownload: () => void;
  onClear: () => void;
  onToggleParams: () => void;
  onInstall: () => void;
  paramsOpen: boolean;
  canDownload: boolean;
  canInstall: boolean;
  hasItems: boolean;
}

export function Toolbar({ onDownload, onClear, onToggleParams, onInstall, paramsOpen, canDownload, canInstall, hasItems }: Props) {
  const mode = useStore(appStore, (s) => s.settings.mode);
  const previewBg = useStore(appStore, (s) => s.settings.previewBg);
  const theme = useStore(appStore, (s) => s.theme);

  const cycleBg = () => setSettings({ previewBg: BGS[(BGS.indexOf(previewBg) + 1) % BGS.length] });

  return (
    <header className="bar">
      <div className="brand"><Icon name="solid" size={17} /><span>Détourage</span></div>

      <div className="seg" role="group" aria-label="Méthode">
        {METHODS.map((m) => (
          <button
            key={m.key}
            className={"seg-btn" + (mode === m.key ? " on" : "")}
            onClick={() => setSettings({ mode: m.key })}
            title={m.label}
          >
            <Icon name={m.icon} size={16} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      <div className="spacer" />

      {canInstall && (
        <button className="ibtn-label" onClick={onInstall} title="Installer l'application (utilisable hors-ligne)">
          <Icon name="install" size={16} /><span>Installer</span>
        </button>
      )}
      <button className={"ibtn" + (paramsOpen ? " active" : "")} onClick={onToggleParams} title="Paramètres">
        <Icon name="sliders" />
      </button>
      <button className="ibtn" onClick={cycleBg} title={`Fond d'aperçu : ${BG_LABEL[previewBg]}`}>
        <Icon name="grid" />
      </button>
      <span className="bar-sep" />
      {canDownload && (
        <button className="ibtn primary" onClick={onDownload} title="Télécharger le PNG">
          <Icon name="download" />
        </button>
      )}
      {hasItems && (
        <button className="ibtn" onClick={onClear} title="Tout effacer">
          <Icon name="trash" />
        </button>
      )}
      <button
        className="ibtn"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title={theme === "dark" ? "Mode clair" : "Mode sombre"}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} />
      </button>
    </header>
  );
}
