import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativeApp } from "./platform";

/**
 * iPhone Duo keeps toolbars on the side: beside the camera on the outer display, and on the same side
 * of the inner display in landscape. `rail` is the column a system bar occupies there (below the clock
 * and camera, above the Home indicator); `inset` is the full width of that strip. `fold` is set only
 * while the device is partly folded, and is the band across the screen that content should keep clear of.
 */
export interface SideBar {
  edge: "left" | "right";
  inset: number;
  rail: { x: number; y: number; width: number; height: number };
  view: { width: number; height: number };
  fold: { x: number; y: number; width: number; height: number } | null;
}

interface NativeState {
  edge: "none" | "left" | "right";
  inset?: number; x?: number; y?: number; width?: number; height?: number;
  viewWidth?: number; viewHeight?: number;
  fold?: { x: number; y: number; width: number; height: number };
}
interface SideBarPlugin {
  get(): Promise<NativeState>;
  addListener(event: "change", listener: (state: NativeState) => void): Promise<PluginListenerHandle>;
}

/** Local plugin: SideBarPlugin in ios/App/App/SmileComposeBridgeViewController.swift. */
const SmileSideBar = registerPlugin<SideBarPlugin>("SmileSideBar");

/** Where the fold divides the screen while iPhone Duo is partly folded, in any pose (with or without a side bar). */
export interface Fold { x: number; y: number; width: number; height: number; axis: "vertical" | "horizontal" }

export function foldFrom(state: NativeState | null | undefined): Fold | null {
  const f = state?.fold;
  if (!f || ![f.x, f.y, f.width, f.height].every(n => typeof n === "number" && Number.isFinite(n)) || f.width <= 0 || f.height <= 0) return null;
  return { x: f.x, y: f.y, width: f.width, height: f.height, axis: f.height >= f.width ? "vertical" : "horizontal" };
}

export function sideBarFrom(state: NativeState | null | undefined): SideBar | null {
  if (!state || (state.edge !== "left" && state.edge !== "right")) return null;
  const { x, y, width, height, inset, viewWidth, viewHeight } = state;
  if (![x, y, width, height, inset, viewWidth, viewHeight].every(n => typeof n === "number" && Number.isFinite(n))) return null;
  if (width! < 30 || height! < 120 || inset! < width!) return null;
  return { edge: state.edge, inset: inset!, rail: { x: x!, y: y!, width: width!, height: height! }, view: { width: viewWidth!, height: viewHeight! }, fold: state.fold ?? null };
}

/**
 * Reports the side bar and the fold now and whenever the device opens, closes, turns or folds. A `null`
 * bar means there is none (every other device, and iPhone Duo's inner display in portrait); a `null`
 * fold means the screen isn't divided. In a browser there are neither, except a simulated device set up
 * by the layout checks.
 */
export async function watchSideBar(onChange: (bar: SideBar | null, fold: Fold | null) => void): Promise<() => void> {
  if (!isNativeApp()) {
    const read = () => {
      const simulated = (window as { __SMILE_SIDE_BAR__?: NativeState }).__SMILE_SIDE_BAR__;
      if (simulated) onChange(sideBarFrom(simulated), foldFrom(simulated));
    };
    read();
    // The layout checks change the simulated device (open, fold) and say so with this event.
    window.addEventListener("smile:side-bar", read);
    return () => window.removeEventListener("smile:side-bar", read);
  }
  try {
    const handle = await SmileSideBar.addListener("change", state => onChange(sideBarFrom(state), foldFrom(state)));
    const now = await SmileSideBar.get();
    onChange(sideBarFrom(now), foldFrom(now));
    return () => { void handle.remove(); };
  } catch {
    return () => {}; // an older app shell without the plugin
  }
}
