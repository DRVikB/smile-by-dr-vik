import {createHash} from "node:crypto";
/** Only hash original inline scripts in the public build-time prerender. */
export function inlineScriptHashes(html){
  return [...new Set([...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!(/\bsrc\s*=/.test(m[1]))&&m[2]).map(m=>`sha256-${createHash("sha256").update(m[2]).digest("base64")}`))];
}
export function scriptPolicy(hashes){return `script-src 'self' 'wasm-unsafe-eval' ${hashes.map(h=>`'${h}'`).join(" ")}; script-src-attr 'none'; worker-src 'self'`;}

export function fullPolicy(hashes, {supabaseOrigin = "", apiOrigin = "", native = false} = {}) {
  const origins = [supabaseOrigin, apiOrigin].filter(Boolean).map(value => new URL(value).origin).join(" ");
  return `default-src 'self'; ${scriptPolicy(hashes)}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${supabaseOrigin}; media-src 'self' data: blob:; font-src 'self'; connect-src 'self' data: blob: ${origins}; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'${native ? '' : '; upgrade-insecure-requests'}`;
}
