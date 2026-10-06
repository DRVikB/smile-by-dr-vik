"use client";
import type { ToothShape } from "@/lib/types";
import { DESIGN_SHAPES, type DesignShape } from "@/lib/smileDesign/shapes";
import { SHAPE_STYLE, smoothPath } from "@/lib/smileDesign/frame";

export const SHAPES: { name: string; shape: ToothShape; description: string }[] = [
  { name: "Oval", shape: "Rounded", description: "Curved sides, soft edges" },
  { name: "Square", shape: "Square", description: "Straight sides, broad edge" },
  { name: "Rectangle", shape: "Rectangular", description: "Longer than wide, straight sides" },
  { name: "Triangle", shape: "Triangular", description: "Narrower towards the gum" },
];

/**
 * Each tooth's size in the owner's drawings (smile shapes/*.png, in their pixels):
 * width, height and top of the central and lateral. The icon keeps these
 * proportions, so the teeth are as broad as drawn rather than stretched to fit.
 */
const DRAWN: Record<DesignShape, { central: [number, number, number]; lateral: [number, number, number] }> = {
  oval: { central: [150, 196, 48], lateral: [92, 144, 51] },
  square: { central: [152, 185, 15], lateral: [108, 166, 27] },
  rectangle: { central: [153, 211, 35], lateral: [100, 180, 36] },
  triangle: { central: [152, 209, 42], lateral: [100, 180, 46] },
};
const VIEW_W = 120, VIEW_H = 76;

/** The four front teeth in the owner's drawn style, so each tooth form reads at a glance. */
export function ToothForm({ shape }: { shape: ToothShape }) {
  const style = SHAPE_STYLE[shape], outline = DESIGN_SHAPES[style], { central, lateral } = DRAWN[style];
  // Laterals tuck slightly behind the centrals, as drawn.
  const tuck = lateral[0] * 0.06;
  const width = 2 * central[0] + 2 * (lateral[0] - tuck);
  const top = Math.min(central[2], lateral[2]), height = Math.max(central[2] + central[1], lateral[2] + lateral[1]) - top;
  const k = Math.min((VIEW_W - 6) / width, (VIEW_H - 8) / height);
  const ox = (VIEW_W - width * k) / 2, oy = (VIEW_H - height * k) / 2;
  // x0 is the tooth's left edge; on the image's left the mesial side (s = 0) faces right, towards the midline.
  const tooth = (kind: "central" | "lateral", x0: number, [w, h, y0]: [number, number, number], left: boolean) =>
    smoothPath(outline[kind].map(([s, t]) => [ox + (left ? x0 + w - s * w : x0 + s * w) * k, oy + (y0 - top + t * h) * k] as [number, number]), true);
  const lateralW = lateral[0] - tuck;
  return (
    <svg className="tooth-form" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
      <g className="tooth-form-side">
        <path d={tooth("lateral", 0, lateral, true)} />
        <path d={tooth("lateral", lateralW + 2 * central[0] - tuck, lateral, false)} />
      </g>
      <g className="tooth-form-main">
        <path d={tooth("central", lateralW, central, true)} />
        <path d={tooth("central", lateralW + central[0], central, false)} />
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
