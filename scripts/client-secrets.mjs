import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

// Provider-designated PUBLIC client configuration, never service/secret keys.
export const PUBLIC_KEYS = new Set(['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_REVENUECAT_IOS_API_KEY']);
export const secretName = name => !PUBLIC_KEYS.has(name) && /(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|WEBHOOK_AUTH)/i.test(name);
/** @param {Record<string, string | undefined>} env */
export async function configuredSecrets(env = process.env, paths = ['.env', '.env.local', '.env.production', '.env.production.local', '.dev.vars', '.dev.vars.production']) {
  const entries = Object.entries(env);
  for (const path of paths) {
    try { entries.push(...Object.entries(parseEnv(await readFile(path, 'utf8')))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return [...new Set(entries.filter(([name, value]) => secretName(name) && value?.length > 8).map(([, value]) => value))];
}
export function clientSecretIssue(text, secrets = []) {
  // Return only categories, NEVER matching secret values.
  if (secrets.some(value => text.includes(value))) return 'configured private secret';
  const patterns = [
    [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
    [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret key'],
    [/\bsk_(?:live|test)_[A-Za-z0-9]{16,}/, 'private API key'],
    [/\bsk-[A-Za-z0-9_-]{32,}/, 'OpenAI API key'],
    [/\bwhsec_[A-Za-z0-9]{10,}/, 'webhook secret'],
    [/-----BEGIN (?:EC |RSA |ENCRYPTED )?PRIVATE KEY-----/, 'private key'],
    [/\b(?:SUPABASE_SERVICE_ROLE_KEY|REVENUECAT_SECRET_API_KEY|SMILE_GEMINI_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY|APPLE_PRIVATE_KEY|REVENUECAT_WEBHOOK_AUTH)\b/, 'server credential reference'],
  ];
  for (const [pattern, category] of patterns) if (pattern.test(text)) return category;
  // JWT role must be decoded, not guessed from a fragile base64 substring.
  for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')).role === 'service_role') return 'Supabase service-role JWT'; } catch { /* Not a JWT. */ }
  }
  return null;
}
export function unsafePublicName(text) {
  return /NEXT_PUBLIC_\w*(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/.test(text.replace(/NEXT_PUBLIC_(?:SUPABASE_ANON_KEY|REVENUECAT_IOS_API_KEY)\b/g, ''));
}
