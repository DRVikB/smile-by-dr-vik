import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./platform";

/**
 * A small tap in the hand, in the iOS app only: `ready` when a new smile arrives, `tick` as the
 * comparison divider passes its resting place, `select` when a tooth is chosen, `press` as a main gold
 * button goes down, `success` when something is saved, archived or moved. The system's own
 * haptics setting decides whether anything is felt; in a browser nothing happens.
 */
export type Haptic = "ready" | "tick" | "select" | "press" | "success";

interface HapticsPlugin { play(options: { kind: Haptic }): Promise<void> }

/** Local plugin: HapticsPlugin in ios/App/App/SmileComposeBridgeViewController.swift. */
const SmileHaptics = registerPlugin<HapticsPlugin>("SmileHaptics");

export function haptic(kind: Haptic): void {
  if (!isNativeApp()) return;
  // Never worth an error: a build without the plugin simply stays still.
  void SmileHaptics.play({ kind }).catch(() => {});
}

/** True when a value moving from `from` to `to` passes (or lands on) `mark` from one side. */
export function crosses(from: number, to: number, mark: number): boolean {
  return from !== to && (from - mark) * (to - mark) <= 0 && from !== mark;
}
