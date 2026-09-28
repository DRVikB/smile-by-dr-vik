import { NATIVE_API_ORIGIN } from "@/config/app";
import { isNativeApp } from "@/native/platform";

/**
 * Resolve a SmileCompose API path. The website calls its own origin; the iOS
 * app calls the hosted backend. Only public URLs are involved — provider keys
 * live on the server and never reach the client.
 */
export function apiUrl(path: `/api/${string}`, native = isNativeApp()): string {
  return native ? `${NATIVE_API_ORIGIN}${path}` : path;
}
