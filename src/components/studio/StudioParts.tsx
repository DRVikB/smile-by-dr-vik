"use client";
import type { ToothShape } from "@/lib/types";
import { DESIGN_SHAPES } from "@/lib/smileDesign/shapes";
import { SHAPE_STYLE, smoothPath } from "@/lib/smileDesign/frame";

export const SHAPES: { name: string; shape: ToothShape; description: string }[] = [
  { name: "Oval", shape: "Rounded", description: "Curved sides, soft edges" },
  { name: "Square", shape: "Square", description: "Straight sides, broad edge" },
  { name: "Rectangle", shape: "Rectangular", description: "Longer than wide, straight sides" },
  { name: "Triangle", shape: "Triangular", description: "Narrower towards the gum" },
];

/** The four front teeth in the owner's drawn style, so each tooth form reads at a glance. */
export function ToothForm({ shape }: { shape: ToothShape }) {
  const style = DESIGN_SHAPES[SHAPE_STYLE[shape]];
  // x0 is the tooth's left edge; on the image's left the mesial side (s = 0) faces right, towards the midline.
  const tooth = (kind: "central" | "lateral", x0: number, w: number, h: number, y0: number, left: boolean) =>
    smoothPath(style[kind].map(([s, t]) => [left ? x0 + w - s * w : x0 + s * w, y0 + t * h] as [number, number]), true);
  return (
    <svg className="tooth-form" viewBox="0 0 120 76" aria-hidden="true">
      <g className="tooth-form-side">
        <path d={tooth("lateral", 6, 22, 50, 10, true)} />
        <path d={tooth("lateral", 92, 22, 50, 10, false)} />
      </g>
      <g className="tooth-form-main">
        <path d={tooth("central", 30, 29, 60, 8, true)} />
        <path d={tooth("central", 61, 29, 60, 8, false)} />
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
