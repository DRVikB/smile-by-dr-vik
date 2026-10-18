"use client";
import { useRef } from "react";

/**
 * Drag a bottom sheet down to dismiss it: the sheet follows the finger once the drag is clearly downward
 * (and the sheet is scrolled to its top), springs back when let go early, and leaves from where it was
 * when pulled far or flicked. Returns touch handlers for the sheet element.
 */
export function useDragToDismiss(sheet: React.RefObject<HTMLElement | null>, dismiss: () => void) {
  const drag = useRef<{ x: number; y: number; t: number; dy: number; down: boolean | null } | null>(null);
  const settle = (el: HTMLElement) => {
    el.style.transition = "transform 420ms var(--ease-sheet)";
    el.style.transform = "";
    window.setTimeout(() => { el.style.transition = ""; }, 440);
  };
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const el = sheet.current;
      drag.current = el && el.scrollTop <= 0 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), dy: 0, down: null } : null;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const d = drag.current, el = sheet.current;
      if (!d || !el) return;
      const dx = e.touches[0].clientX - d.x, dy = e.touches[0].clientY - d.y;
      if (d.down === null && Math.hypot(dx, dy) > 8) d.down = dy > 0 && dy > Math.abs(dx) * 1.2;
      if (!d.down) return;
      d.dy = Math.max(0, dy);
      el.style.transition = "none";
      el.style.transform = `translateY(${d.dy}px)`;
    },
    onTouchEnd: () => {
      const d = drag.current, el = sheet.current;
      drag.current = null;
      if (!d?.down || !el) return;
      const speed = d.dy / Math.max(1, performance.now() - d.t);
      if (d.dy > 110 || (d.dy > 30 && speed > 0.5)) {
        // Leave from where the finger let go (the exit in motion.css starts at --drag-from).
        el.style.setProperty("--drag-from", `${d.dy}px`);
        el.style.transition = "";
        el.style.transform = `translateY(${d.dy}px)`;
        dismiss();
      } else settle(el);
    },
    onTouchCancel: () => {
      const el = sheet.current;
      if (drag.current?.down && el) settle(el);
      drag.current = null;
    },
  };
}
