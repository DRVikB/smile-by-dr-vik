import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error The deployment check runs directly as a Node ESM script.
import { verifyNetlifyProvider } from '../scripts/verify-netlify-provider.mjs';
const env = { CONTEXT: 'production', SMILE_PROVIDER: 'gemini', GEMINI_API_KEY: 'private-test-value', GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image' };
test('deployment check validates credentials without sending a generation request', async () => {
  const calls: string[] = [];
  await verifyNetlifyProvider(env, async (url: string, init: RequestInit) => {
    calls.push(url);
    assert.equal(init.method, undefined);
    assert.equal(init.body, undefined);
    return Response.json({ name: 'models/gemini-3.1-flash-image' });
  });
  assert.deepEqual(calls, ['https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image']);
});
test('missing and rejected production keys fail deployment without disclosing secrets', async () => {
  await assert.rejects(verifyNetlifyProvider({ ...env, GEMINI_API_KEY: '' }), /missing/);
  await assert.rejects(verifyNetlifyProvider(env, async () => Response.json({ error: { message: env.GEMINI_API_KEY, details: [{ reason: 'API_KEY_INVALID' }] } }, { status: 400 })), (error: Error) => {
    assert.match(error.message, /API_KEY_INVALID/);
    assert.ok(!error.message.includes(env.GEMINI_API_KEY)); return true;
  });
});
