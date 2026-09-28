/**
 * Public, non-secret client configuration. Never put API keys here: anything
 * in this file ships inside the browser bundle and the iOS app.
 */

/** The hosted SmileCompose backend that runs generation and pricing. */
export const DEFAULT_API_ORIGIN = "https://smile-by-dr-vik.drvik.workers.dev";

/**
 * Where the packaged iOS app sends API requests. The website uses relative
 * `/api/...` URLs on its own origin; the native app has no server of its own
 * (it is served from capacitor://localhost), so it calls the hosted backend.
 * Override at build time with NEXT_PUBLIC_SMILE_API_ORIGIN (a URL, not a key).
 */
export const NATIVE_API_ORIGIN =
  process.env.NEXT_PUBLIC_SMILE_API_ORIGIN?.replace(/\/+$/, "") || DEFAULT_API_ORIGIN;
