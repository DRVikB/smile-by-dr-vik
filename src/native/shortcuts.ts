import { registerPlugin } from "@capacitor/core";

/** Home Screen quick actions (ios/App/App/Info.plist UIApplicationShortcutItems) and widget taps. */
export type ShortcutAction = "new" | "cases" | "sample";

interface SmileShortcutsPlugin {
  addListener(event: "shortcut", listener: (event: { type: string }) => void): Promise<{ remove: () => Promise<void> }>;
  setWidgetName(options: { name: string | null }): Promise<void>;
}

/** Local plugin: ShortcutsPlugin in ios/App/App/SceneDelegate.swift. */
const SmileShortcuts = registerPlugin<SmileShortcutsPlugin>("SmileShortcuts");

/**
 * Calls `handler` for each quick action, including the one that launched the app
 * (the native side retains it until this listener is added).
 */
export async function onShortcut(handler: (action: ShortcutAction) => void): Promise<() => void> {
  const subscription = await SmileShortcuts.addListener("shortcut", ({ type }) => {
    if (type === "new" || type === "cases" || type === "sample") handler(type);
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
