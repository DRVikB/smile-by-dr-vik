/**
 * Security headers for the web app. connect-src is an allow-list: the app,
 * the Supabase project, and the on-device face model's files. That also stops
 * MediaPipe's default usage-metrics upload (odml.pa.googleapis.com).
 * Framing is same-origin only (the in-app privacy/terms viewer frames our own pages).
 */
export const BASE_SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export function contentSecurityPolicy(supabaseUrl?: string): string {
  let supabase: string;
  try { supabase = supabaseUrl ? new URL(supabaseUrl).origin : ""; } catch { supabase = ""; }
  const connect = ["'self'", "data:", "blob:", supabase, "https://cdn.jsdelivr.net", "https://storage.googleapis.com"].filter(Boolean).join(" ");
  return `connect-src ${connect}; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`;
}

export function pageSecurityHeaders(supabaseUrl?: string): Record<string, string> {
  return { ...BASE_SECURITY_HEADERS, "Content-Security-Policy": contentSecurityPolicy(supabaseUrl) };
}
