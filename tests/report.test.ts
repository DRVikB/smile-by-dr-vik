import test from 'node:test';
import assert from 'node:assert/strict';
import { getReportPreferences, preferenceRows, wrapText } from '../src/lib/report';
import { defaultSettings, type GenerationResult, type SmileVariant } from '../src/lib/types';

test('exports the generated selection rather than a different variant or edited draft', () => {
  const preferences = { settings: { ...defaultSettings, targetShade: 'Bleach' as const, shape: 'Square' as const, notes: 'Keep the central teeth longer.' }, referenceUsed: true, testMode: false };
  const result: GenerationResult = { image: 'test', mode: 'live', variationId: 'square', preferences };
  const other: SmileVariant = { label: 'Round', note: '', patch: {}, settings: defaultSettings, result: { ...result, variationId: 'round', preferences: undefined } };
  assert.deepEqual(getReportPreferences(result, [other]), preferences);
  assert.deepEqual(preferenceRows(preferences.settings).slice(0, 3), [['Shade', 'Bleach'], ['Tooth shape', 'Square'], ['Treatment', defaultSettings.treatment]]);
  assert.equal(getReportPreferences({ ...result, preferences: undefined }, [other]), undefined);
  assert.deepEqual(getReportPreferences(other.result, [other])?.settings, defaultSettings);
});

test('custom tooth count and numbering reflect the actual selected teeth', () => {
  const rows = preferenceRows({ ...defaultSettings, teeth: 8, selectedTeeth: [11, 21] });
  assert.equal(rows.find(([label]) => label === 'Selected teeth')?.[1], '2 teeth · 11, 21');
});

test('long report notes wrap without dropping text, including unbroken words and newlines', () => {
  const ctx = { measureText: (s: string) => ({ width: s.length * 10 }) as TextMetrics };
  const text = 'Please preserve natural shape.\n' + 'x'.repeat(400);
  const lines = wrapText(ctx, text, 120);
  assert.ok(lines.every((line) => line.length <= 12));
  assert.equal(lines.join('').replaceAll(' ', ''), text.replace(/\s/g, ''));
});

test('shade-only reports do not claim the ignored shape or texture was applied', () => {
  const rows = Object.fromEntries(preferenceRows({ ...defaultSettings, designIntent: 'Shade only', shape: 'Square', texture: 'Textured', intensity: 100 }));
  assert.equal(rows['Tooth shape'], 'Unchanged (shade only)');
  assert.equal(rows.Texture, 'Unchanged');
  assert.equal(rows['Result intensity'], 'No shape change');
  assert.equal(rows['Design goal'], 'Shade only');
  assert.equal(rows.Treatment, undefined);
});
