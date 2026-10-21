"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { haptic } from "@/native/haptics";

/* ============================================================
   App gestures: the touches an iOS app answers that a web page doesn't. A long press opens a menu over
   the item, a row swipes left to reveal its actions, and a swipe in from the left edge goes back.
   ============================================================ */

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ---------- long press → menu ---------- */

export interface MenuItem { label: string; icon?: ReactNode; destructive?: boolean; disabled?: boolean; onSelect: () => void }
export interface MenuPreview { image?: string; title: string; subtitle?: string }
interface OpenMenu { rect: DOMRect; items: MenuItem[]; preview: MenuPreview }

let showMenu: (menu: OpenMenu | null) => void = () => {};

/** Opens the menu over `el`, the item that was pressed. */
export function openContextMenu(el: HTMLElement, items: MenuItem[], preview: MenuPreview) {
  haptic("select");
  showMenu({ rect: el.getBoundingClientRect(), items, preview });
}

/**
 * Press and hold (or a secondary click with a trackpad or mouse) to call `onLong` with the pressed element.
 * Moving the finger, scrolling or lifting early cancels; the tap that ends a long press doesn't also click.
 */
export function useLongPress(onLong: (el: HTMLElement) => void, delay = 450) {
  const timer = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const latest = useRef(onLong);
  latest.current = onLong;
  const clear = () => { window.clearTimeout(timer.current); start.current = null; };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      const el = e.currentTarget;
      timer.current = window.setTimeout(() => { fired.current = true; start.current = null; latest.current(el); }, delay);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      if (fired.current) return;
      clear();
      fired.current = true;
      latest.current(e.currentTarget);
    },
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
      if (!fired.current) return;
      e.preventDefault();
      e.stopPropagation();
      fired.current = false;
    },
  };
}

/** Renders the open menu: the pressed item lifts, the rest of the screen dims, the actions appear beside it. */
export function ContextMenuHost() {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    showMenu = (next) => { setLeaving(false); setMenu(next); };
    return () => { showMenu = () => {}; };
  }, []);
  const close = () => {
    if (!menu || leaving) return;
    if (reducedMotion()) { setMenu(null); return; }
    setLeaving(true);
    window.setTimeout(() => { setMenu(null); setLeaving(false); }, 180);
  };
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  if (!menu) return null;

  const { rect, items, preview } = menu;
  const vw = window.innerWidth, vh = window.innerHeight;
  const width = Math.min(rect.width, vw - 24);
  const left = Math.min(Math.max(12, rect.left), vw - width - 12);
  const menuWidth = Math.min(260, vw - 24);
  const menuHeight = items.length * 48 + 8;
  const previewHeight = 76;
  const below = rect.top + previewHeight + 10 + menuHeight < vh - 16;
  const previewTop = below ? Math.max(16, rect.top) : Math.max(16, Math.min(rect.top, vh - 16 - menuHeight - 10 - previewHeight));
  const menuTop = previewTop + previewHeight + 10;
  const menuLeft = Math.min(Math.max(12, left), vw - menuWidth - 12);

  return createPortal(
    <div className={`cm-layer${leaving ? " is-leaving" : ""}`} onClick={close} onContextMenu={(e) => e.preventDefault()}>
      <div className="cm-preview" style={{ left, top: previewTop, width }} aria-hidden="true">
        {preview.image ? <img src={preview.image} alt="" draggable={false} /> : null}
        <span><strong>{preview.title}</strong>{preview.subtitle && <small>{preview.subtitle}</small>}</span>
      </div>
      <div className="cm-menu" role="menu" aria-label={preview.title} style={{ left: menuLeft, top: menuTop, width: menuWidth }} onClick={(e) => e.stopPropagation()}>
        {items.map((item) => (
          <button key={item.label} type="button" role="menuitem" disabled={item.disabled} className={item.destructive ? "is-destructive" : undefined}
            onClick={() => { close(); window.setTimeout(item.onSelect, reducedMotion() ? 0 : 120); }}>
            <span>{item.label}</span>{item.icon}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- swipe a row left → its actions ---------- */

export interface RowAction { label: string; icon?: ReactNode; tone?: "neutral" | "destructive"; onSelect: () => void }

/** A list row that slides left under the finger to show its actions, like Mail and Notes. */
export function SwipeRow({ actions, children }: { actions: RowAction[]; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; base: number; dx: number; horizontal: boolean | null } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const reveal = actions.length * 84;
  const swallowClick = useRef(false);
  return (
    <div className="swipe-row" onPointerDown={(e) => {
      if (e.pointerType === "mouse") return;
      drag.current = { x: e.clientX, y: e.clientY, base: offset, dx: 0, horizontal: null };
    }} onPointerMove={(e) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (d.horizontal === null && Math.hypot(dx, dy) > 8) d.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (!d.horizontal) return;
      d.dx = dx;
      setDragging(true);
      setOffset(Math.min(0, Math.max(-reveal - 24, d.base + dx)));
    }} onPointerUp={() => {
      const d = drag.current;
      drag.current = null;
      if (!d?.horizontal) return;
      swallowClick.current = true;
      setDragging(false);
      const open = d.base + d.dx < -reveal / 2;
      if (open && offset !== -reveal) haptic("tick");
      setOffset(open ? -reveal : 0);
    }} onPointerCancel={() => { drag.current = null; setDragging(false); setOffset(o => (o < -reveal / 2 ? -reveal : 0)); }}>
      <div className="swipe-actions" style={{ width: reveal }} aria-hidden={offset === 0}>
        {actions.map((a) => (
          <button key={a.label} type="button" tabIndex={offset === 0 ? -1 : 0} className={a.tone === "destructive" ? "is-destructive" : undefined}
            onClick={() => { setOffset(0); a.onSelect(); }}>
            {a.icon}<span>{a.label}</span>
          </button>
        ))}
      </div>
      <div ref={content} className={`swipe-content${dragging ? " is-dragging" : ""}`} style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onClickCapture={(e) => {
          if (swallowClick.current) { swallowClick.current = false; if (Math.abs(offset) > 2 || drag.current) { e.preventDefault(); e.stopPropagation(); } }
          if (offset !== 0) { e.preventDefault(); e.stopPropagation(); setOffset(0); }
        }}>
        {children}
      </div>
    </div>
  );
}

/* ---------- swipe in from the left edge → back (and ⌘[) ---------- */

interface BackEntry { active: () => boolean; back: () => (() => void) | undefined; target: () => HTMLElement | null; underSheets: boolean }
/** Sheets and dialogs that cover a screen: a screen-level swipe never acts beneath one. */
const COVERING = ".sheet-backdrop, .settings-backdrop, .cl-backdrop, .action-sheet-backdrop, .log-detail-backdrop, .cm-layer, [role='dialog'][aria-modal='true']";
const backStack: BackEntry[] = [];

/**
 * Registers a surface for the edge swipe. The most recently registered active surface owns the gesture;
 * when it has nowhere to go back to (`back` undefined) the swipe does nothing, so a sheet never sends the
 * screen beneath it back.
 */
export function useSwipeBack(active: boolean, back: (() => void) | undefined, target: () => HTMLElement | null, { screen = false }: { screen?: boolean } = {}) {
  const latest = useRef({ active, back, target });
  latest.current = { active, back, target };
  useEffect(() => {
    const entry: BackEntry = { active: () => latest.current.active, back: () => latest.current.back, target: () => latest.current.target(), underSheets: screen };
    backStack.push(entry);
    return () => { backStack.splice(backStack.indexOf(entry), 1); };
  }, []);
}

function topBack() {
  for (let i = backStack.length - 1; i >= 0; i--) {
    const entry = backStack[i];
    if (!entry.active()) continue;
    // A whole screen only goes back when nothing covers it.
    if (entry.underSheets && document.querySelector(COVERING)) return null;
    return entry;
  }
  return null;
}

/** Goes back on the top surface, as the edge swipe would (⌘[ on an iPad keyboard). */
export function goBack(): boolean {
  const back = topBack()?.back();
  if (!back) return false;
  back();
  return true;
}

const EDGE = 24;

/** Installs the edge swipe once for the app. Returns the uninstaller. */
export function installSwipeBack(): () => void {
  let s: { x: number; y: number; t: number; dx: number; back: () => void; el: HTMLElement | null; engaged: boolean | null } | null = null;
  const reset = (el: HTMLElement | null) => { if (el) { el.style.transition = ""; el.style.transform = ""; el.style.boxShadow = ""; } };
  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1 || e.touches[0].clientX > EDGE) return;
    const entry = topBack(), back = entry?.back();
    if (!entry || !back) return;
    s = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), dx: 0, back, el: entry.target(), engaged: null };
  };
  const onMove = (e: TouchEvent) => {
    if (!s) return;
    const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
    if (s.engaged === null && Math.hypot(dx, dy) > 10) s.engaged = dx > 0 && dx > Math.abs(dy) * 1.2;
    if (s.engaged === false) { s = null; return; }
    if (!s.engaged) return;
    e.preventDefault();
    s.dx = Math.max(0, dx);
    if (s.el) {
      s.el.style.transition = "none";
      s.el.style.transform = `translateX(${s.dx}px)`;
      s.el.style.boxShadow = "-14px 0 32px rgba(0, 0, 0, 0.14)";
    }
  };
  const onEnd = () => {
    const g = s;
    s = null;
    if (!g?.engaged) return;
    const el = g.el, width = el?.getBoundingClientRect().width ?? window.innerWidth;
    const speed = g.dx / Math.max(1, performance.now() - g.t);
    if (g.dx > width * 0.33 || (g.dx > 40 && speed > 0.5)) {
      haptic("tick");
      if (el && !reducedMotion()) { el.style.transition = "transform 220ms cubic-bezier(0.25, 0.8, 0.35, 1)"; el.style.transform = `translateX(${width}px)`; }
      window.setTimeout(() => { g.back(); requestAnimationFrame(() => reset(el)); }, reducedMotion() ? 0 : 200);
    } else if (el) {
      el.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
      el.style.transform = "";
      window.setTimeout(() => reset(el), 340);
    }
  };
  const opts = { capture: true } as const;
  document.addEventListener("touchstart", onStart, { capture: true, passive: true });
  document.addEventListener("touchmove", onMove, { capture: true, passive: false });
  document.addEventListener("touchend", onEnd, opts);
  document.addEventListener("touchcancel", onEnd, opts);
  return () => {
    document.removeEventListener("touchstart", onStart, opts);
    document.removeEventListener("touchmove", onMove, opts);
    document.removeEventListener("touchend", onEnd, opts);
    document.removeEventListener("touchcancel", onEnd, opts);
  };
}

/* ---------- iPad keyboard: native shortcuts arrive as the key presses they stand for ---------- */

/** Called by the iOS shell for each keyboard shortcut (SmileComposeBridgeViewController.keyCommands). */
export function installAppKeys(): () => void {
  const w = window as Window & { smileKey?: (key: string, meta: boolean, shift: boolean) => void };
  w.smileKey = (key, meta, shift) => {
    const active = document.activeElement as HTMLElement | null;
    const typing = !!active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
    // Undo and Redo inside a text field act on the text, as they would without the shortcut list.
    if (meta && key === "z" && typing) { document.execCommand(shift ? "redo" : "undo"); return; }
    if (meta && key === "[") { goBack(); return; }
    (active ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, metaKey: meta, shiftKey: shift, bubbles: true, cancelable: true }));
  };
  return () => { delete w.smileKey; };
}

/** Gives an element the long-press menu without a hook per item (for rows rendered in a list). */
export function Pressable({ onLong, children }: { onLong: (el: HTMLElement) => void; children: (props: ReturnType<typeof useLongPress>) => ReactNode }) {
  const props = useLongPress(onLong);
  return <>{children(props)}</>;
}
