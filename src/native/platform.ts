import { Capacitor } from "@capacitor/core";

/**
 * True inside the packaged iOS app. On the website this is always false, so
 * every native code path falls back to the existing browser behaviour.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): "ios" | "android" | "web" {
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}
