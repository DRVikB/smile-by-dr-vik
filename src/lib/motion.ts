/**
 * Timings for the app's drawn and revealed moments, kept as plain functions of elapsed time so each
 * one can be checked without a screen: the new smile's reveal, the analysis lines drawing in, and
 * readings counting up.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t: number) => { const u = clamp01(t); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A new smile arriving: the processing screen clears (`delay`), the divider crosses the photograph
 * uncovering the new smile (`sweep`), rests so it can be taken in (`hold`), then comes back to its
 * resting place with the original on its left (`settle`).
 */
export const RESULT_REVEAL = { delay: 450, sweep: 1150, hold: 380, settle: 850 } as const;
export const RESULT_REVEAL_TOTAL = RESULT_REVEAL.delay + RESULT_REVEAL.sweep + RESULT_REVEAL.hold + RESULT_REVEAL.settle;

/** The part of the photograph on screen (`from` its right edge, `to` its left) and where the divider rests, in percent of the photograph. */
export interface RevealSpan { from: number; to: number; rest: number }

/** Where the divider is `ms` after the smile arrived, or `null` once the reveal is over. */
export function revealPosition(ms: number, span: RevealSpan): number | null {
  const { delay, sweep, hold, settle } = RESULT_REVEAL;
  if (ms < delay) return span.from;
  if (ms < delay + sweep) return span.from + (span.to - span.from) * easeInOut((ms - delay) / sweep);
  if (ms < delay + sweep + hold) return span.to;
  if (ms < RESULT_REVEAL_TOTAL) return span.to + (span.rest - span.to) * easeOut((ms - delay - sweep - hold) / settle);
  return null;
}

/** Smile analysis: each reference line takes `each` to draw and starts `stagger` after the one before. */
export const GUIDE_DRAW = { each: 560, stagger: 300, lines: 5 } as const;
export const GUIDE_DRAW_TOTAL = GUIDE_DRAW.each + GUIDE_DRAW.stagger * (GUIDE_DRAW.lines - 1) + 500;

/** How much of line `index` is drawn (0 to 1) after `ms`. */
export function guideDraw(ms: number, index: number): number {
  return easeOut((ms - index * GUIDE_DRAW.stagger) / GUIDE_DRAW.each);
}

/** How far reading `index` has arrived (0 to 1): each follows its line. */
export function readingArrival(ms: number, index: number): number {
  return easeOut((ms - 260 - index * GUIDE_DRAW.stagger) / 720);
}

/**
 * A reading part-way to its value: "3.4°" at 0.5 is "1.7°". Only a leading number counts, with the
 * decimals it was written with; anything else ("Centred") is returned as it is.
 */
export function countUpText(value: string, t: number): string {
  const match = /^(\d+)(?:\.(\d+))?(.*)$/s.exec(value);
  if (!match || t >= 1) return value;
  const decimals = match[2]?.length ?? 0;
  const target = Number(match[2] ? `${match[1]}.${match[2]}` : match[1]);
  return `${(target * clamp01(t)).toFixed(decimals)}${match[3]}`;
}
