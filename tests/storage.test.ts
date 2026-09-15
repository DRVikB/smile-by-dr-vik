import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { persistCase, readCase } from '../src/lib/storage';
import { defaultSettings, type SmileCase } from '../src/lib/types';
const photo = { name: 'test.png', width: 200, height: 200, dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' };
test('current case, reference and demo state survive a new database connection; New Smile wins queued writes', async () => {
  const saved: SmileCase = { photo, reference: photo, settings: defaultSettings, result: null, screen: 'design', testMode: true, testPreview: photo.dataUrl };
  await persistCase(saved);
  assert.deepEqual(await readCase(), saved);
  const writes = [persistCase(saved), persistCase({ ...saved, settings: { ...defaultSettings, targetShade: 'Bleach' } }), persistCase(null)];
  await Promise.all(writes);
  assert.equal(await readCase(), null);
});
