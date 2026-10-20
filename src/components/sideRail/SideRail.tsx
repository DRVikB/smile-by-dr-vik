"use client";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { createPortal, flushSync } from "react-dom";
import { watchSideBar, type Fold, type SideBar } from "@/native/sideBar";

interface RailState {
  bar: SideBar | null;
  host: HTMLElement | null;
  /** The surface whose controls show: the one opened most recently. */
  top: string | null;
  enter(id: string, opened: number): void;
  leave(id: string): void;
}
/** Pieces that move to a new place when iPhone Duo folds or unfolds (see the fold handling below). */
const FOLD_GLIDE = [".case-body > .case-hero", ".log-detail-frame .log-pair"];

/** Counts surfaces as they first render, so a sheet always outranks the screen it opened over. */
let opened = 0;
const RailContext = createContext<RailState>({ bar: null, host: null, top: null, enter: () => {}, leave: () => {} });
const LayerContext = createContext<string | null>(null);

/**
 * iPhone Duo's side bar. On the outer display, and the inner display in landscape, the system keeps
 * toolbar controls in a column beside the camera instead of across the top. This provider learns where
 * that column is and offers it to the app: a surface wraps itself in <SideRailLayer>, and puts its bar
 * buttons in <RailItems>. Everywhere else none of this renders and bars stay where they are.
 */
export function SideRailProvider({ children }: { children: React.ReactNode }) {
  const [bar, setBar] = useState<SideBar | null>(null);
  const [fold, setFold] = useState<Fold | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [layers, setLayers] = useState<{ id: string; opened: number }[]>([]);

  useEffect(() => {
    let stop = () => {}, live = true;
    let lastFold: string | null = null, settle = 0;
    void watchSideBar((next, folded) => {
      if (!live) return;
      const apply = () => { setBar(next); setFold(folded); };
      // Folding or unfolding: for a moment the layout's pieces ease to their new places (side-rail.css,
      // html.fold-moving). The class goes on a frame before the change so the transitions catch it.
      const key = folded ? `${folded.axis}:${folded.x}:${folded.y}` : null;
      const changed = key !== lastFold;
      lastFold = key;
      if (!changed || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); return; }
      const root = document.documentElement;
      root.classList.add("fold-moving");
      window.clearTimeout(settle);
      requestAnimationFrame(() => {
        // Pieces that change place inside a rearranged layout glide from where they were (FLIP), resizing
        // rather than stretching, so a photo re-crops smoothly instead of jumping.
        const before = FOLD_GLIDE.flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector))).map(el => ({ el, box: el.getBoundingClientRect() }));
        flushSync(apply);
        for (const { el, box } of before) {
          const now = el.getBoundingClientRect();
          if (!el.isConnected || !now.width || (Math.abs(now.left - box.left) < 1 && Math.abs(now.top - box.top) < 1 && Math.abs(now.width - box.width) < 1)) continue;
          el.animate([
            { transform: `translate(${box.left - now.left}px, ${box.top - now.top}px)`, width: `${box.width}px`, height: `${box.height}px` },
            { transform: "none", width: `${now.width}px`, height: `${now.height}px` },
          ], { duration: 460, easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
        }
        settle = window.setTimeout(() => root.classList.remove("fold-moving"), 600);
      });
    }).then(off => { if (live) stop = off; else off(); });
    return () => { live = false; stop(); };
  }, []);

  // CSS lays the rail out, and lets any screen adapt (html[data-side-bar]).
  useLayoutEffect(() => {
    const root = document.documentElement;
    const names = ["--rail-left", "--rail-top", "--rail-width", "--rail-height", "--side-bar-inset"];
    if (!bar) return;
    root.dataset.sideBar = bar.edge;
    // Closed and turned on its side the column is short (about 350pt): layouts that fill the rail tighten up.
    if (bar.rail.height < 420) root.dataset.railShort = "true"; else delete root.dataset.railShort;
    root.style.setProperty("--rail-left", `${bar.rail.x}px`);
    root.style.setProperty("--rail-top", `${bar.rail.y}px`);
    root.style.setProperty("--rail-width", `${bar.rail.width}px`);
    root.style.setProperty("--rail-height", `${bar.rail.height}px`);
    root.style.setProperty("--side-bar-inset", `${bar.inset}px`);
    return () => { delete root.dataset.sideBar; delete root.dataset.railShort; names.forEach(name => root.style.removeProperty(name)); };
  }, [bar]);

  // Partly folded, in any pose: the band content keeps clear of (html[data-fold] in side-rail.css).
  useLayoutEffect(() => {
    if (!fold) return;
    const root = document.documentElement;
    const values = { "--fold-left": fold.x, "--fold-width": fold.width, "--fold-top": fold.y, "--fold-height": fold.height };
    root.dataset.fold = fold.axis;
    Object.entries(values).forEach(([name, value]) => root.style.setProperty(name, `${value}px`));
    return () => { delete root.dataset.fold; Object.keys(values).forEach(name => root.style.removeProperty(name)); };
  }, [fold]);

  const enter = useCallback((id: string, at: number) => setLayers(current => [...current.filter(x => x.id !== id), { id, opened: at }]), []);
  const leave = useCallback((id: string) => setLayers(current => current.filter(x => x.id !== id)), []);
  const top = layers.reduce<{ id: string; opened: number } | null>((best, layer) => (!best || layer.opened > best.opened ? layer : best), null)?.id ?? null;
  const value = useMemo(() => ({ bar, host, top, enter, leave }), [bar, host, top, enter, leave]);

  return (
    <RailContext.Provider value={value}>
      {children}
      {bar && <div ref={setHost} className="side-rail" role="toolbar" aria-orientation="vertical" aria-label="Controls" />}
    </RailContext.Provider>
  );
}

/** Whether controls belong in the side bar right now. */
export function useSideRail(): boolean {
  return useContext(RailContext).bar !== null;
}

/**
 * A full-screen surface (the app itself, Settings, Cases, a sheet). The surface opened last owns the
 * rail, so a sheet's Close replaces the screen's Back while the sheet is up. `active` is for surfaces
 * that stay mounted while hidden.
 */
export function SideRailLayer({ active = true, children }: { active?: boolean; children?: React.ReactNode }) {
  const id = useId();
  const [at] = useState(() => ++opened);
  const { enter, leave } = useContext(RailContext);
  useLayoutEffect(() => {
    if (!active) return;
    enter(id, at);
    return () => leave(id);
  }, [active, id, at, enter, leave]);
  return <LayerContext.Provider value={id}>{children}</LayerContext.Provider>;
}

/**
 * Controls for the side rail. Order follows the system's: 0 navigation (Back, Close), 1 the
 * prominent action (Done), 2 tools, 3 the More menu, 4 a screen's tabs (kept at the foot of the rail,
 * where the system puts a tab bar). Renders nothing unless the side bar is in
 * use and this surface is the one in front.
 */
export function RailItems({ order = 2, children }: { order?: 0 | 1 | 2 | 3 | 4; children: React.ReactNode }) {
  const { bar, host, top } = useContext(RailContext);
  const layer = useContext(LayerContext);
  if (!bar || !host || layer === null || layer !== top) return null;
  return createPortal(<div className={`rail-group${order === 4 ? " rail-tabs" : ""}`} style={{ order }}>{children}</div>, host);
}

/** A round, symbol-only button for the rail. The label is read out and shown on a long press. */
export function RailButton({ label, onClick, disabled, pressed, prominent, buttonRef, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  prominent?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}) {
  return (
    <button ref={buttonRef} type="button" className={`rail-button${prominent ? " prominent" : ""}`} aria-label={label} title={label}
      aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * A sheet's round Close button. On iPhone Duo it is the first control in the side bar instead, and
 * the sheet owns the rail while it is open.
 */
export function SheetClose({ onClose, label = "Close", size = 16, className = "icon-button", buttonRef }: {
  onClose: () => void;
  label?: string;
  size?: number;
  className?: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const rail = useSideRail();
  if (rail) return (
    <SideRailLayer>
      <RailItems order={0}><RailButton label={label} onClick={onClose} buttonRef={buttonRef}><X size={21} strokeWidth={1.9} /></RailButton></RailItems>
    </SideRailLayer>
  );
  return <button ref={buttonRef} type="button" className={className} aria-label={label} onClick={onClose}><X size={size} /></button>;
}
