"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Minimize2 } from "lucide-react";

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export const IDENTITY: ZoomState = { scale: 1, x: 0, y: 0 };

/** Keep the image from being dragged off the edge of its frame. */
export function clampPan(
  state: ZoomState,
  width: number,
  height: number,
): ZoomState {
  const scale = Math.max(1, state.scale);
  // At scale 1 there is no slack; beyond that, half the overflow on each side.
  const maxX = (width * (scale - 1)) / 2;
  const maxY = (height * (scale - 1)) / 2;
  // `|| 0` normalises the negative zero that clamping to a zero range produces.
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, state.x)) || 0,
    y: Math.min(maxY, Math.max(-maxY, state.y)) || 0,
  };
}

/** Scale about a point, so the pixel under the fingers stays under them. */
export function zoomAbout(
  state: ZoomState,
  nextScale: number,
  pointX: number,
  pointY: number,
  maxScale: number,
): ZoomState {
  const scale = Math.min(maxScale, Math.max(1, nextScale));
  const ratio = scale / state.scale;
  return {
    scale,
    x: pointX - (pointX - state.x) * ratio,
    y: pointY - (pointY - state.y) * ratio,
  };
}

/**
 * Pinch to zoom, drag to pan, double tap to reset.
 *
 * While the image is at its natural size this stays out of the way: single
 * pointers fall through untouched, so the comparison slider and the
 * tap-and-hold in consultation view keep working. It only takes over once a
 * second finger arrives or the image is already zoomed in.
 */
export function ZoomPan({
  children,
  className = "",
  maxScale = 5,
  label = "Pinch to zoom",
}: {
  children: React.ReactNode;
  className?: string;
  maxScale?: number;
  label?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ZoomState>(IDENTITY);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const lastTap = useRef(0);

  const reset = useCallback(() => setState(IDENTITY), []);

  // A new photo or preview should never inherit the previous one's zoom.
  useEffect(() => reset(), [children, reset]);

  const size = () => {
    const box = frame.current?.getBoundingClientRect();
    return { w: box?.width ?? 0, h: box?.height ?? 0 };
  };

  function onPointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: state.scale,
      };
    }
    if (state.scale > 1 || pointers.current.size === 2) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.stopPropagation();
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const previous = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.distance <= 0) return;
      const box = frame.current!.getBoundingClientRect();
      const midX = (a.x + b.x) / 2 - box.left - box.width / 2;
      const midY = (a.y + b.y) / 2 - box.top - box.height / 2;
      const next = (distance / pinch.current.distance) * pinch.current.scale;
      const { w, h } = size();
      setState((s) => clampPan(zoomAbout(s, next, midX, midY, maxScale), w, h));
      e.stopPropagation();
      return;
    }

    if (pointers.current.size === 1 && state.scale > 1) {
      const { w, h } = size();
      setState((s) =>
        clampPan(
          { ...s, x: s.x + (e.clientX - previous.x), y: s.y + (e.clientY - previous.y) },
          w,
          h,
        ),
      );
      e.stopPropagation();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;

    // Double tap toggles between fit and a close look.
    const now = Date.now();
    if (now - lastTap.current < 320) {
      const { w, h } = size();
      setState((s) =>
        s.scale > 1 ? IDENTITY : clampPan(zoomAbout(s, 2.5, 0, 0, maxScale), w, h),
      );
      lastTap.current = 0;
      e.stopPropagation();
    } else lastTap.current = now;
  }

  const zoomed = state.scale > 1.01;

  return (
    <div
      ref={frame}
      className={`zoompan${zoomed ? " zoomed" : ""} ${className}`.trim()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="zoompan-inner"
        style={{
          transform: `translate(${state.x}px, ${state.y}px) scale(${state.scale})`,
        }}
      >
        {children}
      </div>
      {zoomed ? (
        <button
          type="button"
          className="zoompan-reset"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={reset}
        >
          <Minimize2 size={14} strokeWidth={1.8} />
          {Math.round(state.scale * 10) / 10}× · Fit
        </button>
      ) : (
        <span className="zoompan-hint" aria-hidden="true">
          {label}
        </span>
      )}
    </div>
  );
}
