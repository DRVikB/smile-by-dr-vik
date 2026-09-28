import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { AppearancePreference } from "@/lib/appearance";
import { isNativeApp } from "./platform";

export interface AccessibilityAppearance {
  reduceTransparency: boolean;
  increaseContrast: boolean;
  reduceMotion: boolean;
}

interface AppearancePlugin {
  set(options: { style: AppearancePreference }): Promise<void>;
  accessibility(): Promise<AccessibilityAppearance>;
  addListener(event: "accessibilityChange", listener: (state: AccessibilityAppearance) => void): Promise<PluginListenerHandle>;
}

/** Local plugin: ios/App/App/AppearancePlugin.swift. */
const SmileAppearance = registerPlugin<AppearancePlugin>("SmileAppearance");

/** Match native UI (status bar, sheets, pickers, Sign in with Apple) to the app's appearance. */
export async function applyNativeAppearance(style: AppearancePreference): Promise<void> {
  if (!isNativeApp()) return;
  await SmileAppearance.set({ style }).catch(() => {});
}

/** Reduce Transparency / Increase Contrast from iOS, with live updates. */
export async function watchNativeAccessibility(onChange: (state: AccessibilityAppearance) => void): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  const initial = await SmileAppearance.accessibility().catch(() => null);
  if (initial) onChange(initial);
  const handle = await SmileAppearance.addListener("accessibilityChange", onChange).catch(() => null);
  return () => { void handle?.remove(); };
}
