import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyNetlifyProvider } from '../scripts/verify-netlify-provider.mjs';
const env = { CONTEXT: 'production', SMILE_PROVIDER: 'gemini', SMILE_GEMINI_API_KEY: 'private-test-value', GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image' };
test('deployment check validates credentials without sending a generation request', async () => {
  const calls: string[] = [];
  await verifyNetlifyProvider(env, async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.method, undefined);
    assert.equal(init?.body, undefined);
    return Response.json({ name: 'models/gemini-3.1-flash-image' });
  });
  assert.deepEqual(calls, ['https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image']);
});
test('missing and rejected production keys fail deployment without disclosing secrets', async () => {
  await assert.rejects(verifyNetlifyProvider({ ...env, SMILE_GEMINI_API_KEY: '' }), /missing/);
  await assert.rejects(verifyNetlifyProvider(env, async () => Response.json({ error: { message: env.SMILE_GEMINI_API_KEY, details: [{ reason: 'API_KEY_INVALID' }] } }, { status: 400 })), (error: Error) => {
    assert.match(error.message, /API_KEY_INVALID/);
    assert.ok(!error.message.includes(env.SMILE_GEMINI_API_KEY)); return true;
  });
});

test('Netlify reads the dedicated runtime key on each request and ignores gateway keys', async () => {
  const { readProviderEnvironment } = await import('../src/lib/generation/provider');
  const runtime = globalThis as typeof globalThis & { Netlify?: { env: { get(key: string): string | undefined } } };
  const original = runtime.Netlify;
  const values: Record<string, string> = { SMILE_PROVIDER: 'gemini', SMILE_GEMINI_API_KEY: 'first-private-key', GEMINI_API_KEY: 'gateway-token' };
  try {
    runtime.Netlify = { env: { get: (key) => values[key] } };
    assert.equal(readProviderEnvironment().SMILE_GEMINI_API_KEY, 'first-private-key');
    assert.equal(readProviderEnvironment().GEMINI_API_KEY, undefined);
    values.SMILE_GEMINI_API_KEY = 'second-private-key';
    assert.equal(readProviderEnvironment().SMILE_GEMINI_API_KEY, 'second-private-key');
    delete values.SMILE_GEMINI_API_KEY;
    assert.equal(readProviderEnvironment().GEMINI_API_KEY, undefined);
  } finally { if (original) runtime.Netlify = original; else delete runtime.Netlify; }
});
