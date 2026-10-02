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

export function contentSecurityPolicy(supabaseUrl?: string,hashes:string[]=[]): string {
  let supabase: string;
  try { supabase = supabaseUrl ? new URL(supabaseUrl).origin : ""; } catch { supabase = ""; }
  const connect = ["'self'", "data:", "blob:", supabase].filter(Boolean).join(" ");
  const script = `script-src 'self' 'wasm-unsafe-eval' ${hashes.filter(h=>/^sha256-[A-Za-z0-9+/]+={0,2}$/.test(h)).map(h=>`'${h}'`).join(" ")}`;
  return `default-src 'self'; ${script}; script-src-attr 'none'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${supabase}; media-src 'self' data: blob:; font-src 'self'; connect-src ${connect}; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`;
}

export function pageSecurityHeaders(supabaseUrl?: string,hashes:string[]=[]): Record<string, string> {
  return { ...BASE_SECURITY_HEADERS, "Content-Security-Policy": contentSecurityPolicy(supabaseUrl,hashes) };
}
/** Build shell only: the Worker uses Web Crypto, never a runtime Node dependency. */
export async function inlineScriptHashes(html:string):Promise<string[]>{
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!(/\bsrc\s*=/.test(m[1]))&&m[2]);
  return [...new Set(await Promise.all(scripts.map(async m=>{
    const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(m[2])));
    return "sha256-"+btoa(String.fromCharCode(...bytes));
  })))];
}
