import { useLayoutEffect, useState } from "react";
import { prefersReducedMotion } from "./motion";

/**
 * Milliseconds since `key` last changed, updated every frame for `total` ms and `Infinity` after
 * that (and whenever there is nothing to time, or the device asks for reduced motion). For short
 * drawn moments whose every frame is a function of elapsed time.
 */
export function useElapsed(key: unknown, total: number): number {
  const [ms, setMs] = useState(Infinity);
  useLayoutEffect(() => {
    if (key == null || prefersReducedMotion()) { setMs(Infinity); return; }
    let frame = 0;
    const since = performance.now();
    setMs(0);
    const tick = () => {
      const at = performance.now() - since;
      if (at >= total) { setMs(Infinity); return; }
      setMs(at);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key, total]);
  return ms;
}
