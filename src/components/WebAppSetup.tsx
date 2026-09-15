"use client";
import { useEffect } from "react";

export function WebAppSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      // No patient data or authenticated pages are cached by this worker.
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => { /* The online app remains usable if installation is blocked. */ });
    }
  }, []);
  return null;
}
