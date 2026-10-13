"use client";
import { useId } from "react";

const ARC = "M215 431.5C336.5 769 687.5 769 809 431.5";

/**
 * The SmileCompose mark, moving: the guide lines draw, then the smile is drawn across them, and a
 * soft light travels along it. It marks the moments when the app is making something.
 *
 * `motion`
 *   "compose"  drawn once, then the light keeps travelling; a brighter light crosses it each time
 *              `step` rises (the wait while a design is made, or a workspace loads).
 *   "draw"     drawn once and left still (an empty screen opening).
 *   "sheen"    already whole, only the light travels (short waits, small sizes).
 * `tone`
 *   "gold"     champagne on dark surfaces and photographs.
 *   "auto"     follows the app's appearance: charcoal in Light, champagne in Dark.
 * With Reduce Motion the finished mark is simply shown.
 */
export function ComposingMark({ step = 0, motion = "compose", tone = "gold", quick = false, className = "" }: {
  step?: number;
  motion?: "compose" | "draw" | "sheen";
  tone?: "gold" | "auto";
  /** A brisker draw, for waits that are usually short. */
  quick?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`composing-mark is-${motion} tone-${tone}${quick ? " is-quick" : ""} ${className}`.trim()} viewBox="150 176 724 724" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-fill`} x1="215" y1="380" x2="810" y2="700" gradientUnits="userSpaceOnUse">
          <stop className="composing-stop-a" /><stop className="composing-stop-b" offset="1" />
        </linearGradient>
        <mask id={`${id}-smile`} maskUnits="userSpaceOnUse" x="150" y="330" width="724" height="480">
          <path d={ARC} stroke="#fff" strokeWidth="82" strokeLinecap="round" />
        </mask>
      </defs>
      <path className="composing-guide" pathLength={100} d="M512 251.5V856.5" />
      <path className="composing-guide is-second" pathLength={100} d="M270 481.5H755" />
      <path className="composing-arc" pathLength={100} d={ARC} stroke={`url(#${id}-fill)`} />
      <path className="composing-rim" pathLength={100} d={ARC} transform="translate(0 -36)" />
      {motion !== "draw" && (
        <g mask={`url(#${id}-smile)`}>
          <path className="composing-sheen" pathLength={100} d={ARC} />
          {/* Remounted for each stage so its one sweep plays again. */}
          {step > 0 && <path key={step} className="composing-sweep" pathLength={100} d={ARC} />}
        </g>
      )}
    </svg>
  );
}
