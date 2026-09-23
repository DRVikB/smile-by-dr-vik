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

test('the patient name for the case survives a refresh', async () => {
  const saved: SmileCase = { photo, settings: defaultSettings, result: null, screen: 'design', variants: [], patientName: 'Sarah Wells' };
  await persistCase(saved);
  assert.equal((await readCase())?.patientName, 'Sarah Wells');
  await persistCase(null);
});

test('all four harmonised options survive refresh', async () => {
  const variants = (['Harmonious', 'Softer', 'Defined', 'Youthful'] as const).map((label, i) => ({
    label, note: label, patch: {}, settings: { ...defaultSettings, character: i === 1 ? 'Soft' as const : 'Balanced' as const },
    result: { image: photo.dataUrl, mode: 'live' as const, variationId: `harmony-${i}` },
  }));
  await persistCase({ photo, settings: variants[0].settings, result: variants[0].result, screen: 'preview', variants });
  const restored = await readCase();
  assert.equal(restored?.variants?.length, 4);
  assert.deepEqual(restored?.variants?.map((v) => v.label), ['Harmonious', 'Softer', 'Defined', 'Youthful']);
  await persistCase(null);
});

test('a photo chosen on the photo step keeps the clinician on that step after a refresh', async () => {
  const onPhotoStep: SmileCase = { photo, settings: defaultSettings, result: null, screen: 'photo', variants: [] };
  await persistCase(onPhotoStep);
  assert.deepEqual(await readCase(), onPhotoStep);
  // An unknown screen is still rejected outright rather than guessed at.
  await persistCase({ ...onPhotoStep, screen: 'nonsense' as unknown as SmileCase['screen'] });
  assert.equal(await readCase(), null);
  await persistCase(null);
});

test('cost estimates and detail selection survive refresh; Reset clears them with the photo', async () => {
  const costs = { requested: 3, completed: 2, estimatedUsd: 0.14, imageOnly: 1, unpriced: 0 };
  await persistCase({ photo, settings: defaultSettings, result: null, screen: 'design', costs, resolution: '512' });
  const restored = await readCase();
  assert.deepEqual(restored?.costs, costs);
  assert.equal(restored?.resolution, '512');
  await persistCase(null);
  assert.equal(await readCase(), null);
});

test('painted edit area and treatment goal survive refresh without changing the original photo', async () => {
  const protectedPhoto = { ...photo, editMask: photo.dataUrl };
  await persistCase({ photo: protectedPhoto, settings: { ...defaultSettings, designIntent: 'Close gaps', treatment: 'Layered composite' }, result: null, screen: 'design' });
  const restored = await readCase();
  assert.deepEqual(restored?.photo, protectedPhoto);
  assert.equal(restored?.settings.designIntent, 'Close gaps');
  assert.equal(restored?.settings.treatment, 'Layered composite');
  await persistCase(null);
});
