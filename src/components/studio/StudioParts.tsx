"use client";
import type { ToothShape } from "@/lib/types";

export const SHAPES: { name: string; shape: ToothShape; description: string }[] = [
  { name: "Square", shape: "Square", description: "Straight sides, flat edge" },
  { name: "Triangle", shape: "Triangular", description: "Tapered towards the gum" },
  { name: "Round", shape: "Rounded", description: "Curved sides, soft edge" },
];

/** One tooth, drawn around x=0 so it can be placed and mirrored freely. */
const TOOTH_PATHS: Record<ToothShape, string> = {
  Square: "M-15 3 Q0 0 15 3 L15 55 Q15 60 10 60 L-10 60 Q-15 60 -15 55 Z",
  Rounded: "M-14 3 Q0 -1 14 3 L16 32 Q16 60 0 60 Q-16 60 -16 32 Z",
  Triangular: "M-9 2 Q0 -1 9 2 L16 54 Q16 60 12 60 L-12 60 Q-16 60 -16 54 Z",
};

/** Two central incisors with their neighbours, so the tooth form reads at a glance. */
export function ToothForm({ shape }: { shape: ToothShape }) {
  const d = TOOTH_PATHS[shape];
  return (
    <svg className="tooth-form" viewBox="0 0 120 76" aria-hidden="true">
      <g className="tooth-form-side">
        <path d={d} transform="translate(16 13) scale(0.8 0.85)" />
        <path d={d} transform="translate(104 13) scale(0.8 0.85)" />
      </g>
      <g className="tooth-form-main">
        <path d={d} transform="translate(43 8)" />
        <path d={d} transform="translate(77 8)" />
      </g>
    </svg>
  );
}

export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="control-group">
      <div className="control-label">{label}</div>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            className={value === option ? "selected" : ""}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
