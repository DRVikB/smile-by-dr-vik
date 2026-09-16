// Run in Netlify's build environment, where the deployed provider secret is available.
// No photographs, generation requests, credentials or provider messages are logged.
export async function verifyNetlifyProvider(env, fetcher = globalThis.fetch) {
  if (env.CONTEXT !== 'production') return { skipped: true };
  if (env.SMILE_PROVIDER !== 'gemini') throw new Error('SMILE production must explicitly configure SMILE_PROVIDER=gemini.');
  const key = env.SMILE_GEMINI_API_KEY?.trim();
  if (!key) throw new Error('SMILE_GEMINI_API_KEY is missing from the Netlify production build environment.');
  const model = env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, {
    headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const reason = body?.error?.details?.find((detail) => typeof detail?.reason === 'string')?.reason;
    const safeReason = ['API_KEY_INVALID', 'API_KEY_EXPIRED', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED'].includes(reason) ? reason : 'provider_rejected';
    throw new Error(`Netlify Gemini credential check failed: HTTP ${response.status} (${safeReason}). Update the production server key in Netlify; no photo was sent.`);
  }
  return { skipped: false };
}
async function main() {
  try {
    const result = await verifyNetlifyProvider(process.env);
    console.log(result.skipped ? 'Gemini credential check skipped outside production.' : 'Netlify Gemini credential check passed.');
  } catch (error) {
    // Network exception objects can contain request details, so only known safe errors are printed.
    console.error(error instanceof Error && /^(Netlify Gemini|SMILE_GEMINI_API_KEY|SMILE production)/.test(error.message)
      ? error.message : 'Netlify Gemini credential check could not connect to Google. No photo was sent.');
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('verify-netlify-provider.mjs')) void main();
