import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativeApp } from "./platform";

/**
 * iPhone Duo keeps toolbars on the side: beside the camera on the outer display, and on the same side
 * of the inner display in landscape. `rail` is the column a system bar occupies there (below the clock
 * and camera, above the Home indicator); `inset` is the full width of that strip. The system also reports
 * where the screen folds; the app lays out a partly folded Duo as if it were flat, so that is not read.
 */
export interface SideBar {
  edge: "left" | "right";
  inset: number;
  rail: { x: number; y: number; width: number; height: number };
  view: { width: number; height: number };
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

export function sideBarFrom(state: NativeState | null | undefined): SideBar | null {
  if (!state || (state.edge !== "left" && state.edge !== "right")) return null;
  const { x, y, width, height, inset, viewWidth, viewHeight } = state;
  if (![x, y, width, height, inset, viewWidth, viewHeight].every(n => typeof n === "number" && Number.isFinite(n))) return null;
  if (width! < 30 || height! < 120 || inset! < width!) return null;
  return { edge: state.edge, inset: inset!, rail: { x: x!, y: y!, width: width!, height: height! }, view: { width: viewWidth!, height: viewHeight! } };
}

/**
 * Reports the side bar now and whenever the device opens, closes or turns. `null` means there is none
 * (every other device, and iPhone Duo's inner display in portrait). In a browser there is none, except a
 * simulated device set up by the layout checks.
 */
export async function watchSideBar(onChange: (bar: SideBar | null) => void): Promise<() => void> {
  if (!isNativeApp()) {
    const read = () => {
      const simulated = (window as { __SMILE_SIDE_BAR__?: NativeState }).__SMILE_SIDE_BAR__;
      if (simulated) onChange(sideBarFrom(simulated));
    };
    read();
    // The layout checks change the simulated device (open, closed) and say so with this event.
    window.addEventListener("smile:side-bar", read);
    return () => window.removeEventListener("smile:side-bar", read);
  }
  try {
    const handle = await SmileSideBar.addListener("change", state => onChange(sideBarFrom(state)));
    const now = await SmileSideBar.get();
    onChange(sideBarFrom(now));
    return () => { void handle.remove(); };
  } catch {
    return () => {}; // an older app shell without the plugin
  }
}
