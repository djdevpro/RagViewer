import type { CSSProperties } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}

// Slider "maison" : input range entierement stylise via CSS (track rempli + thumb).
export function Slider({ label, value, min, max, step = 1, suffix = "", onChange }: Props) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <span className="slider-val">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--pct": `${pct}%` } as CSSProperties}
      />
    </label>
  );
}
