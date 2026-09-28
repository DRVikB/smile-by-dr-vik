"use client";
import { useEffect } from "react";
import {
  APPEARANCE_EVENT, applyTheme, isAppearancePreference, readAppearance, resolveTheme, systemPrefersDark,
  type AppearancePreference,
} from "@/lib/appearance";
import { applyNativeAppearance, watchNativeAccessibility } from "@/native/appearance";

/**
 * Keeps the document theme in step with the Appearance setting and the
 * system: changes apply immediately, without a restart. Renders nothing.
 */
export function AppearanceController() {
  useEffect(() => {
    let preference: AppearancePreference = readAppearance();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyTheme(resolveTheme(preference, systemPrefersDark()));
    const onSystem = () => { if (preference === "system") apply(); };
    const onChoice = (event: Event) => {
      const next = (event as CustomEvent).detail;
      preference = isAppearancePreference(next) ? next : "system";
      void applyNativeAppearance(preference);
      apply();
    };
    apply();
    void applyNativeAppearance(preference);
    media.addEventListener("change", onSystem);
    window.addEventListener(APPEARANCE_EVENT, onChoice);

    const root = document.documentElement;
    let stopAccessibility: (() => void) | undefined;
    void watchNativeAccessibility(state => {
      root.toggleAttribute("data-reduce-transparency", state.reduceTransparency);
      root.toggleAttribute("data-increase-contrast", state.increaseContrast);
    }).then(stop => { stopAccessibility = stop; });

    return () => {
      media.removeEventListener("change", onSystem);
      window.removeEventListener(APPEARANCE_EVENT, onChoice);
      stopAccessibility?.();
    };
  }, []);
  return null;
}
