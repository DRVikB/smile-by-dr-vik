"use client";
import { useEffect, useRef } from "react";
import { INTRO_END, INTRO_IMAGES, INTRO_SEEN_KEY, mountIntro } from "./introSequence";

/** Plays once on a fresh install, never with Reduce Motion on. Settings › Admin › Replay onboarding plays it again. */
export function shouldPlayIntro(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  try { return window.localStorage.getItem(INTRO_SEEN_KEY) !== "1"; } catch { return false; }
}

export function markIntroSeen() {
  try { window.localStorage.setItem(INTRO_SEEN_KEY, "1"); } catch { /* private storage: it may play again, which is harmless */ }
}

/**
 * The first-launch intro over onboarding's Welcome step (see introSequence.ts for the sequence).
 * It ends by lifting away to reveal Welcome underneath; Skip does the same at once.
 */
export function FirstLaunchIntro({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const intro = mountIntro(root);
    let raf = 0, stopped = false;
    const finish = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); done.current(); };
    intro.render(0);
    // Hold on the launch frame until the photographs are decoded (never longer than a moment).
    const preload = Promise.race([
      Promise.all(INTRO_IMAGES.map(src => { const im = new Image(); im.src = src; return im.decode().catch(() => undefined); })),
      new Promise(resolve => window.setTimeout(resolve, 2500)),
    ]);
    void preload.then(() => {
      if (stopped) return;
      const start = performance.now();
      const tick = (now: number) => {
        const t = (now - start) / 1000;
        intro.render(Math.min(t, INTRO_END));
        if (t >= INTRO_END) finish(); else raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    const onResize = () => intro.layout();
    window.addEventListener("resize", onResize);
    return () => { stopped = true; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);

  return (
    <div className="fli" role="img" aria-label="SmileCompose, designed by Dr Vik">
      <div ref={ref} className="fli-root" />
      <button type="button" className="fli-skip" onClick={() => done.current()}>Skip</button>
    </div>
  );
}
