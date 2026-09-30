/**
 * Appearance: System (default), Light or Dark.
 *
 * The resolved theme is written to <html data-theme="light|dark"> before
 * first paint by APPEARANCE_BOOT_SCRIPT (inlined in the root layout), so there
 * is no flash of the wrong theme. "System" follows prefers-color-scheme and
 * updates live. In the iOS app the choice is also applied natively
 * (overrideUserInterfaceStyle) so the status bar, share sheet, photo picker
 * and Sign in with Apple match the app.
 */
export type AppearancePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const APPEARANCE_KEY = "smile.appearance";
export const APPEARANCE_EVENT = "smile-appearance";
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#FFFFFF", dark: "#0D0E0F" };

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveTheme(preference: AppearancePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export function readAppearance(storage: Pick<Storage, "getItem"> | null = safeStorage()): AppearancePreference {
  try {
    const value = storage?.getItem(APPEARANCE_KEY);
    return isAppearancePreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

/** Save the preference and apply it now (no restart). */
export function setAppearance(preference: AppearancePreference): void {
  try {
    const storage = safeStorage();
    if (preference === "system") storage?.removeItem(APPEARANCE_KEY);
    else storage?.setItem(APPEARANCE_KEY, preference);
  } catch { /* the choice still applies for this session */ }
  window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, { detail: preference }));
}

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

/** Apply a resolved theme to the document (tokens, form controls, browser chrome colour). */
export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  if (root.dataset.theme === theme) return;
  root.classList.add("theme-transition");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute("content", THEME_COLORS[theme]));
  window.setTimeout(() => root.classList.remove("theme-transition"), 260);
}

/**
 * Runs in <head> before the page renders. Keep it tiny and dependency-free:
 * it is a string, not bundled code.
 */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${APPEARANCE_KEY}");var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var t=d?"dark":"light";var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;}catch(e){}})();`;

function safeStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
