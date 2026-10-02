import { renderToothDesign, type TemplateFamily, type TemplateTooth } from "@/lib/toothMap/template";
import type { ToothShape } from "@/lib/types";

/** Display geometry only: it never supplies a generation or protection mask. */
export function planningFrame(tooth: TemplateTooth): string {
  const rad = tooth.angle * Math.PI / 180;
  return [[-0.5, -1], [0.5, -1], [0.5, 0], [-0.5, 0]].map(([x, y]) => {
    const dx = x * tooth.width, dy = y * tooth.height;
    return `${tooth.cx + dx * Math.cos(rad) - dy * Math.sin(rad)},${tooth.incisalY + dx * Math.sin(rad) + dy * Math.cos(rad)}`;
  }).join(" ");
}

const FORMS: { shape: ToothShape; label: string; family: TemplateFamily; description: string }[] = [
  { shape: "Square", label: "Square", family: "square", description: "Defined corners" },
  { shape: "Rounded", label: "Round", family: "rounded", description: "Soft edges" },
  { shape: "Triangular", label: "Tapered", family: "tapered", description: "Narrower necks" },
];

/** Original, scalable worksheet illustrations inspired by the reference. */
function referenceTeeth(family: TemplateFamily) {
  const widths = [34, 27, 24, 19], heights = [44, 39, 42, 34];
  return [-1, 1].flatMap(side => {
    let edge = 0;
    return widths.map((width, i) => {
      const cx = 120 + side * (edge + width / 2);
      edge += width;
      return renderToothDesign({
        fdi: (side < 0 ? 10 : 20) + i + 1, kind: i === 0 ? "central" : i === 1 ? "lateral" : i === 2 ? "canine" : "premolar",
        family, cx, width, height: heights[i], incisalY: 66 - Math.pow((cx - 120) / 95, 2) * 13,
        angle: side * [0, 2, 5, 8][i], source: "ideal", mapped: false,
      }, 0);
    });
  });
}

export function ContourReference({ shape, onChange }: { shape: ToothShape; onChange: (shape: ToothShape) => void }) {
  return <details className="contour-library">
    <summary><span>Contour library<small>{FORMS.find(form => form.shape === shape)?.label} · visual planning reference</small></span></summary>
    <div className="contour-library-grid" role="group" aria-label="Planning tooth form">
      {FORMS.map(form => {
        const teeth = referenceTeeth(form.family);
        return <button type="button" key={form.shape} className="contour-reference" aria-pressed={shape === form.shape} onClick={() => onChange(form.shape)}>
          <svg viewBox="0 0 240 86" aria-hidden="true" focusable="false">
            <path className="contour-reference-arc" d="M 18 52 Q 120 86 222 52" />
            {teeth.map(tooth => <g key={tooth.fdi}>
              <line className="contour-reference-axis" x1={tooth.axis[0][0]} y1={tooth.axis[0][1]} x2={tooth.axis[1][0]} y2={tooth.axis[1][1]} />
              <polygon className="contour-reference-frame" points={planningFrame(tooth)} />
              <path className="contour-reference-tooth" d={tooth.path} />
            </g>)}
          </svg>
          <span><strong>{form.label}</strong><small>{form.description}</small></span>
        </button>;
      })}
    </div>
    <p>Illustrative contours, not measured anatomy or edit boundaries. Choosing a form updates the design’s Shape setting.</p>
  </details>;
}
