/**
 * Cross-origin access for the packaged iOS app only. Capacitor serves the app
 * from capacitor://localhost, so its API calls are cross-origin. Browsers on
 * any other site remain blocked by the handler's origin check.
 *
 * An Origin header is not authentication: non-browser clients can send any
 * value. Paid generation is protected by Supabase authentication, a server-side
 * Pro check and the generation allowance (src/lib/generation/handler.ts).
 */
export const NATIVE_APP_ORIGINS: readonly string[] = ["capacitor://localhost"];

const ALLOWED_HEADERS = "Authorization, Content-Type, X-Smile-Request-Id, X-Smile-AI-Consent";

export function isNativeAppOrigin(origin: string | null | undefined): boolean {
  return Boolean(origin && NATIVE_APP_ORIGINS.includes(origin));
}

/** Add CORS headers for the native app's origin; other responses are unchanged. */
export function withCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  if (!isNativeAppOrigin(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin!);
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Answer a CORS preflight. Only the native app's origin is approved. */
export function preflight(request: Request, methods: string): Response {
  const origin = request.headers.get("origin");
  if (!isNativeAppOrigin(origin)) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin!,
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}
