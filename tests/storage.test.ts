import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { persistCase, readCase } from '../src/lib/storage';
import { defaultSettings, type SmileCase } from '../src/lib/types';
const photo = { name: 'test.png', width: 200, height: 200, dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' };
test('current case, reference and demo state survive a new database connection; New Smile wins queued writes', async () => {
  const saved: SmileCase = { photo, reference: photo, settings: defaultSettings, result: null, screen: 'design', variants: [], testMode: true, testPreview: photo.dataUrl };
  await persistCase(saved);
  assert.deepEqual(await readCase(), saved);
  const writes = [persistCase(saved), persistCase({ ...saved, settings: { ...defaultSettings, targetShade: 'Bleach' } }), persistCase(null)];
  await Promise.all(writes);
  assert.equal(await readCase(), null);
});

test('photo selected on the splash screen restores before Continue is pressed', async () => {
  const selected: SmileCase = { photo, settings: defaultSettings, result: null, screen: 'start', variants: [] };
  await persistCase(selected);
  assert.deepEqual(await readCase(), selected);
  await persistCase(null);
  assert.equal(await readCase(), null);
});

test('all three generated options and their settings survive refresh', async () => {
  const variants = (['Square', 'Rounded', 'Triangular'] as const).map((shape, i) => ({
    label: shape, note: shape, patch: { shape }, settings: { ...defaultSettings, shape },
    result: { image: photo.dataUrl, mode: 'live' as const, variationId: `option-${i}` },
  }));
  await persistCase({ photo, settings: variants[1].settings, result: variants[1].result, screen: 'preview', variants });
  const restored = await readCase();
  assert.deepEqual(restored?.variants, variants);
  assert.equal(restored?.result?.variationId, 'option-1');
  await persistCase(null);
});

test('report preferences survive refresh separately from draft design changes', async () => {
  const result = { image: photo.dataUrl, mode: 'live' as const, variationId: 'report', preferences: {
    settings: { ...defaultSettings, targetShade: 'Bleach' as const, notes: 'Preserve natural edges.' }, referenceUsed: true, testMode: false,
  } };
  await persistCase({ photo, settings: defaultSettings, result, screen: 'preview', variants: [] });
  const restored = await readCase();
  assert.equal(restored?.settings.targetShade, 'Whiten');
  assert.deepEqual(restored?.result?.preferences, result.preferences);
  await persistCase(null);
});
