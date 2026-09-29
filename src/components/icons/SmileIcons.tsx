import type { ReactNode, SVGProps } from "react";

/**
 * SmileCompose's own symbols: drawn for the app on a 24pt grid, 1.6pt
 * rounded strokes, with a soft second tone (like SF Symbols' hierarchical
 * rendering) for the part that matters. Use them wherever the app talks about
 * its own features; generic UI glyphs (close, chevrons, share sheet) stay on
 * lucide.
 */
export type SmileIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number; strokeWidth?: number };
export type SmileIcon = (props: SmileIconProps) => ReactNode;

function Glyph({ size = 24, strokeWidth = 1.6, children, ...props }: SmileIconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

/** Second tone: the same colour, lighter. */
const tone = { fill: "currentColor", fillOpacity: 0.22, stroke: "none" } as const;

const TOOTH = "M7.5 3.5c1.6 0 2.8.9 4.5.9s2.9-.9 4.5-.9c2.3 0 3.5 2 3.5 4.6 0 2.6-.9 4.4-1.6 6.6-.6 2-.9 4.8-2.4 5.8-1.3.9-2-1.2-2.4-3-.3-1.3-.8-2.4-1.6-2.4s-1.3 1.1-1.6 2.4c-.4 1.8-1.1 3.9-2.4 3-1.5-1-1.8-3.8-2.4-5.8C4.9 12.5 4 10.7 4 8.1 4 5.5 5.2 3.5 7.5 3.5Z";
/** A four-point spark centred on (x, y). */
const SPARK = (x: number, y: number, r: number) => {
  const k = r * .22;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
};

/** A smile: lips with the upper teeth. */
export const SmileSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path {...tone} d="M4.2 10.3c2.1-1.2 4.6-1.8 7.8-1.8s5.7.6 7.8 1.8l-1.1 1c-2 .8-4.2 1.1-6.7 1.1s-4.7-.3-6.7-1.1Z" />
    <path d="M3 10.4c2.3-1.6 5-2.4 9-2.4s6.7.8 9 2.4c-1.2 4.7-4.6 7.6-9 7.6s-7.8-2.9-9-7.6Z" />
    <path d="M5.3 11.3c2 .8 4.2 1.2 6.7 1.2s4.7-.4 6.7-1.2M12 8.2v4.3M9.1 8.5v3.7M14.9 8.5v3.7" />
  </Glyph>
);

/** A single tooth. */
export const ToothSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path {...tone} d={TOOTH} />
    <path d={TOOTH} />
  </Glyph>
);

/** A tooth with a spark: creating a smile design. */
export const VisualiseSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <g transform="translate(-.6 2.2) scale(.84)" strokeWidth={(props.strokeWidth ?? 1.6) / .84}>
      <path {...tone} d={TOOTH} />
      <path d={TOOTH} />
    </g>
    <path d={SPARK(19, 5.2, 3)} fill="currentColor" stroke="none" />
  </Glyph>
);

/** A camera whose lens holds a smile: capturing the patient photo. */
export const CaptureSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path d="M3.5 9A2.5 2.5 0 0 1 6 6.5h1.9l1.4-1.9c.3-.4.8-.6 1.2-.6h3c.4 0 .9.2 1.2.6l1.4 1.9H18A2.5 2.5 0 0 1 20.5 9v8.5A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5Z" />
    <circle {...tone} cx="12" cy="13.2" r="3.9" />
    <circle cx="12" cy="13.2" r="3.9" />
    <path d="M10.2 13.1c.5.9 1.1 1.4 1.8 1.4s1.3-.5 1.8-1.4" />
  </Glyph>
);

/** Three tooth forms side by side: choosing shape, shade and treatment. */
export const ComposeSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path d="M2.8 7.2c0-1.1.8-1.7 1.9-1.7h2.2c1.1 0 1.9.6 1.9 1.7v6.9c0 2.4-1.2 4-3 4s-3-1.6-3-4Z" />
    <path {...tone} d="M9.2 7.4c0-1.6 1.2-2.9 2.8-2.9s2.8 1.3 2.8 2.9v6.7c0 2.9-1.2 5.4-2.8 5.4s-2.8-2.5-2.8-5.4Z" />
    <path d="M9.2 7.4c0-1.6 1.2-2.9 2.8-2.9s2.8 1.3 2.8 2.9v6.7c0 2.9-1.2 5.4-2.8 5.4s-2.8-2.5-2.8-5.4Z" />
    <path d="M15.4 6.6c0-.7.5-1.1 1.2-1.1h3.2c.7 0 1.2.4 1.2 1.1l-.6 8.2c-.2 2.1-1.2 3.3-2.2 3.3s-2-1.2-2.2-3.3Z" />
  </Glyph>
);

/** Before and after, split by the comparison slider. */
export const CompareSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path {...tone} d="M12 4h5.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H12Z" />
    <path d="M6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4Z" />
    <path d="M12 2.5v19" />
    <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
  </Glyph>
);

/** A screen showing a smile: the consultation view and reports. */
export const PresentSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path d="M5.5 4h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    <path {...tone} d="M7.8 9h8.4c-.6 2.4-2.2 3.8-4.2 3.8S8.4 11.4 7.8 9Z" />
    <path d="M7.8 9h8.4c-.6 2.4-2.2 3.8-4.2 3.8S8.4 11.4 7.8 9Z" />
    <path d="M12 17v3.5M8.8 20.5h6.4" />
  </Glyph>
);

/** Sending the design on. */
export const ShareSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path {...tone} d="M7 10.5h10a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 18v-5A2.5 2.5 0 0 1 7 10.5Z" />
    <path d="M8.2 10.5H7A2.5 2.5 0 0 0 4.5 13v5A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5v-5a2.5 2.5 0 0 0-2.5-2.5h-1.2" />
    <path d="M12 14.5v-11M8.6 6.8 12 3.5l3.4 3.3" />
  </Glyph>
);

/** A stack of saved designs: patient cases and their versions. */
export const CasesSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path d="M8 3.6h8M6.2 6.1h11.6" />
    <path d="M6 8.6h12a2 2 0 0 1 2 2v7.9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7.9a2 2 0 0 1 2-2Z" />
    <path {...tone} d="M8.4 12.8h7.2c-.5 2.1-1.8 3.3-3.6 3.3s-3.1-1.2-3.6-3.3Z" />
    <path d="M8.4 12.8h7.2c-.5 2.1-1.8 3.3-3.6 3.3s-3.1-1.2-3.6-3.3Z" />
  </Glyph>
);

/** A bound book with a tooth: your Case Library of finished work. */
export const LibrarySymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path {...tone} d="M6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15A1.5 1.5 0 0 1 6.5 3Z" />
    <path d="M5 19.5v-15A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5Zm0 0A1.5 1.5 0 0 0 6.5 21H19v-3" />
    <g transform="translate(7.4 5.3) scale(.45)" strokeWidth={(props.strokeWidth ?? 1.6) / .45}>
      <path d={TOOTH} />
    </g>
  </Glyph>
);

/** A drop of colour: tooth shade. */
export const ShadeSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path {...tone} d="M6.5 14.2h11c-.3 3.1-2.6 5.3-5.5 5.3s-5.2-2.2-5.5-5.3Z" />
    <path d="M12 3.5c3.1 3.7 5.5 6.9 5.5 10.2a5.5 5.5 0 0 1-11 0c0-3.3 2.4-6.5 5.5-10.2Z" />
  </Glyph>
);

/** A tooth with its restored facing: the treatment. */
export const TreatmentSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path {...tone} d="M7.5 3.5c1.6 0 2.8.9 4.5.9s2.9-.9 4.5-.9c2.3 0 3.5 2 3.5 4.6 0 1.2-.2 2.3-.5 3.3h-15C4.2 10.4 4 9.3 4 8.1 4 5.5 5.2 3.5 7.5 3.5Z" />
    <path d={TOOTH} />
    <path d="M4.6 11.4h14.8" />
  </Glyph>
);

/** Two photographs, the front one holding a smile: the photo library. */
export const PhotosSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path d="M7.5 4.5h9.8a2.2 2.2 0 0 1 2.2 2.2v8.8" />
    <path d="M6.2 7.5h9.6a2 2 0 0 1 2 2v8.3a2 2 0 0 1-2 2H6.2a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z" />
    <path {...tone} d="M7.4 12.6h7.2c-.5 2.1-1.8 3.3-3.6 3.3s-3.1-1.2-3.6-3.3Z" />
    <path d="M7.4 12.6h7.2c-.5 2.1-1.8 3.3-3.6 3.3s-3.1-1.2-3.6-3.3Z" />
  </Glyph>
);

/** A framed smile with facial reference lines: the smile analysis. */
export const AnalysisSymbol: SmileIcon = props => (
  <Glyph {...props}>
    <path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16" />
    <path d="M7.5 9.5h9M12 6.5v11" strokeDasharray="1.4 2" />
    <path {...tone} d="M8 13h8c-.6 2.1-2.1 3.3-4 3.3S8.6 15.1 8 13Z" />
    <path d="M8 13h8c-.6 2.1-2.1 3.3-4 3.3S8.6 15.1 8 13Z" />
  </Glyph>
);

const TILE_GLYPH = { sm: 18, md: 26, lg: 40 } as const;

/** A symbol on a soft ivory disc (styled in studio.css). */
export function IconTile({ icon: Icon, size = "md", className = "" }: { icon: SmileIcon; size?: keyof typeof TILE_GLYPH; className?: string }) {
  return (
    <span className={`icon-tile icon-tile-${size} ${className}`.trim()} aria-hidden="true">
      <Icon size={TILE_GLYPH[size]} />
    </span>
  );
}
