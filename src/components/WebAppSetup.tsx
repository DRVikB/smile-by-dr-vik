"use client";
import { useEffect } from "react";
import { isNativeApp } from "@/native/platform";
import { installExitAnimations } from "@/lib/motionExits";

export function WebAppSetup() {
  useEffect(() => {
    // Sheets, panels and notices play out instead of vanishing; thumbnails fade in.
    installExitAnimations();
    // The iOS app bundles its files, so it needs no service worker.
    if (!isNativeApp() && "serviceWorker" in navigator && window.isSecureContext) {
      // No patient data or authenticated pages are cached by this worker.
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => { /* The online app remains usable if installation is blocked. */ });
    }
  }, []);
  return null;
}
