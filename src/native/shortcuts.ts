import { registerPlugin } from "@capacitor/core";
import type { WidgetAllowance } from "@/lib/allowance";

/** Home Screen quick actions (ios/App/App/Info.plist UIApplicationShortcutItems) and widget taps. */
export const SHORTCUT_ACTIONS = ["new", "cases", "sample", "library", "plan", "recent"] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

export function isShortcutAction(type: string): type is ShortcutAction {
  return (SHORTCUT_ACTIONS as readonly string[]).includes(type);
}

interface SmileShortcutsPlugin {
  addListener(event: "shortcut", listener: (event: { type: string }) => void): Promise<{ remove: () => Promise<void> }>;
  setWidgetName(options: { name: string | null }): Promise<void>;
  setWidgetAllowance(options: { json: string | null }): Promise<void>;
  setWidgetRecentCase(options: { editedAt: number | null }): Promise<void>;
}

/** Local plugin: ShortcutsPlugin in ios/App/App/SceneDelegate.swift. */
const SmileShortcuts = registerPlugin<SmileShortcutsPlugin>("SmileShortcuts");

/**
 * Calls `handler` for each quick action, including the one that launched the app
 * (the native side retains it until this listener is added).
 */
export async function onShortcut(handler: (action: ShortcutAction) => void): Promise<() => void> {
  const subscription = await SmileShortcuts.addListener("shortcut", ({ type }) => {
    if (isShortcutAction(type)) handler(type);
  });
  return () => void subscription.remove();
}

/**
 * The clinician's own preferred name for the Home Screen widget ("Welcome, Dr Vik."), or null to
 * clear it. Never patient information. Shared through the App Group; a no-op until that is enabled.
 */
export async function setWidgetName(name: string | null): Promise<void> {
  await SmileShortcuts.setWidgetName({ name }).catch(() => { /* older build or no widget support */ });
}

/**
 * The clinician's generation allowance for the widget, as the app words it, or null to clear it.
 * Display only; a no-op until the App Group is enabled.
 */
export async function setWidgetAllowance(allowance: WidgetAllowance | null): Promise<void> {
  await SmileShortcuts.setWidgetAllowance({ json: allowance ? JSON.stringify(allowance) : null }).catch(() => { /* older build */ });
}

/** When the latest case was edited, for "Recent case · Edited today"; null when there are none. Only the time. */
export async function setWidgetRecentCase(editedAt: number | null): Promise<void> {
  await SmileShortcuts.setWidgetRecentCase({ editedAt }).catch(() => { /* older build */ });
}
