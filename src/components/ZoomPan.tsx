"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

/** Scale 1 is the whole photograph, contained in the frame. */
export const IDENTITY: ZoomState = { scale: 1, x: 0, y: 0 };

/**
 * Keep the image from being dragged off the edge of its frame. The content is
 * the photograph as contained at scale 1 (by default, the whole frame).
 */
export function clampPan(
  state: ZoomState,
  width: number,
  height: number,
  contentWidth = width,
  contentHeight = height,
): ZoomState {
  const scale = Math.max(1, state.scale);
  // Half the overflow on each side; none while the image is smaller than the frame.
  const maxX = Math.max(0, (contentWidth * scale - width) / 2);
  const maxY = Math.max(0, (contentHeight * scale - height) / 2);
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

/** The scale at which a contained photograph covers the whole frame. */
export function fillScale(imageWidth: number, imageHeight: number, frameWidth: number, frameHeight: number): number {
  if (!imageWidth || !imageHeight || !frameWidth || !frameHeight) return 1;
  const image = imageWidth / imageHeight;
  const frame = frameWidth / frameHeight;
  return Math.max(image / frame, frame / image);
}

/**
 * Photographs open filling the frame. Pinch to zoom in, or out as far as the
 * whole photograph; drag to pan once zoomed in; double tap to toggle between
 * fill and a closer look.
 *
 * At fill (or zoomed out) this stays out of the way: single pointers fall
 * through untouched, so the comparison slider and the tap-and-hold in
 * consultation view keep working. It only takes over once a second finger
 * arrives or the image is zoomed in beyond fill.
 */
export function ZoomPan({
  children,
  className = "",
  maxScale = 5,
  label = "Pinch to zoom",
  overlay,
  resetKey,
}: {
  children: React.ReactNode | ((state: ZoomState) => React.ReactNode);
  className?: string;
  maxScale?: number;
  label?: string;
  overlay?: React.ReactNode;
  resetKey?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ZoomState>(IDENTITY);
  // The scale at which the photograph fills the frame: the resting view.
  const [fill, setFill] = useState(1);
  const fillRef = useRef(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const lastTap = useRef(0);
  const tap = useRef<{ id: number; x: number; y: number; time: number } | null>(null);

  const reset = useCallback(() => setState({ scale: fillRef.current, x: 0, y: 0 }), []);

  // A new photo or preview should never inherit the previous one's zoom.
  useEffect(() => reset(), [resetKey, reset]);

  const photo = () => frame.current?.querySelector<HTMLImageElement>(".zoompan-inner img") ?? null;

  // Measure the fill scale from the photograph's shape and the frame's; follow it on load and resize.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const img = photo();
      const next = fillScale(img?.naturalWidth ?? 0, img?.naturalHeight ?? 0, box.width, box.height);
      setFill(prev => (Math.abs(prev - next) < 0.001 ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("load", measure, true); // image loads don't bubble; capture them
    return () => { observer.disconnect(); el.removeEventListener("load", measure, true); };
  }, [resetKey]);

  // When the fill level changes, a view resting at fill follows it; a view the clinician zoomed stays put.
  useEffect(() => {
    const previous = fillRef.current;
    fillRef.current = fill;
    setState(s => (Math.abs(s.scale - previous) < 0.01 ? { scale: fill, x: 0, y: 0 } : s));
  }, [fill]);

  const size = () => {
    const box = frame.current?.getBoundingClientRect();
    const w = box?.width ?? 0;
    const h = box?.height ?? 0;
    // The photograph as contained at scale 1.
    const img = photo();
    const ratio = img?.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
    const cw = !ratio || !h ? w : ratio > w / h ? w : h * ratio;
    const ch = !ratio || !w ? h : ratio > w / h ? w / ratio : h;
    return { w, h, cw, ch };
  };
  const max = () => fillRef.current * maxScale;
  const beyondFill = (scale: number) => scale > fillRef.current * 1.01;

  function onPointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tap.current = pointers.current.size === 1
      ? { id: e.pointerId, x: e.clientX, y: e.clientY, time: Date.now() }
      : null;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: state.scale,
      };
    }
    if (beyondFill(state.scale) || pointers.current.size === 2) {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.stopPropagation();
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    if (tap.current && Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > 8) {
      tap.current = null;
      lastTap.current = 0;
    }
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
      const { w, h, cw, ch } = size();
      setState((s) => clampPan(zoomAbout(s, next, midX, midY, max()), w, h, cw, ch));
      e.stopPropagation();
      return;
    }

    if (pointers.current.size === 1 && beyondFill(state.scale)) {
      const { w, h, cw, ch } = size();
      setState((s) =>
        clampPan(
          { ...s, x: s.x + (e.clientX - previous.x), y: s.y + (e.clientY - previous.y) },
          w,
          h,
          cw,
          ch,
        ),
      );
      e.stopPropagation();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;

    const isTap = e.type !== "pointercancel" && tap.current?.id === e.pointerId && Date.now() - tap.current.time < 320;
    tap.current = null;
    if (!isTap) { lastTap.current = 0; return; }

    // Double tap toggles between fill and a close look.
    const now = Date.now();
    if (now - lastTap.current < 320) {
      const { w, h, cw, ch } = size();
      const atFill = (scale: number) => Math.abs(scale - fillRef.current) < fillRef.current * 0.01;
      setState((s) =>
        atFill(s.scale) ? clampPan(zoomAbout(s, fillRef.current * 2.5, 0, 0, max()), w, h, cw, ch) : { scale: fillRef.current, x: 0, y: 0 },
      );
      lastTap.current = 0;
      e.stopPropagation();
    } else lastTap.current = now;
  }

  const zoomed = state.scale > fill * 1.01;
  const offFill = Math.abs(state.scale - fill) > fill * 0.01;

  return (
    <div
      ref={frame}
      className={`zoompan${zoomed ? " zoomed" : ""} photo-fit ${className}`.trim()}
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
        {typeof children === "function" ? children(state) : children}
      </div>
      {overlay}
      {offFill && <button type="button" className="photo-framing-toggle"
        aria-label="Fill the screen"
        onPointerDown={e => e.stopPropagation()}
        onClick={reset}>
        <Maximize2 size={14} /> <span className="photo-framing-text">Fill screen</span>
      </button>}
      {!offFill && <span className="zoompan-hint" aria-hidden="true">{label}</span>}
    </div>
  );
}
