"use client";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { watchSideBar, type SideBar } from "@/native/sideBar";

interface RailState {
  bar: SideBar | null;
  host: HTMLElement | null;
  /** The surface whose controls show: the one opened most recently. */
  top: string | null;
  enter(id: string, opened: number): void;
  leave(id: string): void;
}
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
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [layers, setLayers] = useState<{ id: string; opened: number }[]>([]);

  useEffect(() => {
    let stop = () => {}, live = true;
    void watchSideBar(next => { if (live) setBar(next); }).then(off => { if (live) stop = off; else off(); });
    return () => { live = false; stop(); };
  }, []);

  // CSS lays the rail out, and lets any screen adapt (html[data-side-bar]).
  useLayoutEffect(() => {
    const root = document.documentElement;
    const names = ["--rail-left", "--rail-top", "--rail-width", "--rail-height", "--side-bar-inset", "--fold-left", "--fold-width"];
    if (!bar) return;
    root.dataset.sideBar = bar.edge;
    // Closed and turned on its side the column is short (about 350pt): layouts that fill the rail tighten up.
    if (bar.rail.height < 420) root.dataset.railShort = "true"; else delete root.dataset.railShort;
    root.style.setProperty("--rail-left", `${bar.rail.x}px`);
    root.style.setProperty("--rail-top", `${bar.rail.y}px`);
    root.style.setProperty("--rail-width", `${bar.rail.width}px`);
    root.style.setProperty("--rail-height", `${bar.rail.height}px`);
    root.style.setProperty("--side-bar-inset", `${bar.inset}px`);
    if (bar.fold) { root.dataset.fold = "true"; root.style.setProperty("--fold-left", `${bar.fold.x}px`); root.style.setProperty("--fold-width", `${bar.fold.width}px`); }
    return () => { delete root.dataset.sideBar; delete root.dataset.railShort; delete root.dataset.fold; names.forEach(name => root.style.removeProperty(name)); };
  }, [bar]);

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
