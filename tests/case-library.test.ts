import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_STYLE_REFERENCES,
  addLibraryCase,
  chooseLibraryCases,
  clearLibrary,
  deleteLibraryCase,
  exportLibrary,
  importLibrary,
  listLibrary,
  loadStyleReferences,
  matchesTreatment,
  readLibraryMedia,
} from '../src/lib/caseLibrary';
import type { CaseMaterial, LibraryCase } from '../src/lib/types';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const aCase = (id: string, material: CaseMaterial, addedAt: number): LibraryCase =>
  ({ id, material, label: `${material} ${id}`, addedAt });

async function seed(cases: LibraryCase[]) {
  await clearLibrary();
  for (const c of cases) await addLibraryCase(c, { id: c.id, image: png, thumb: png });
}

test('composite treatment draws on both composite finishes; porcelain draws on porcelain', () => {
  assert.equal(matchesTreatment('Single-shade composite', 'Composite'), true);
  assert.equal(matchesTreatment('Layered composite', 'Composite'), true);
  assert.equal(matchesTreatment('Porcelain', 'Composite'), false);
  assert.equal(matchesTreatment('Porcelain', 'Porcelain'), true);
  assert.equal(matchesTreatment('Layered composite', 'Porcelain'), false);
});

test('the automatic match takes the newest matching cases and never more than three', () => {
  const all = [
    aCase('p1', 'Porcelain', 500),
    aCase('c1', 'Layered composite', 400),
    aCase('c2', 'Single-shade composite', 300),
    aCase('c3', 'Layered composite', 200),
    aCase('c4', 'Layered composite', 100),
  ];
  const composite = chooseLibraryCases(all, 'Composite');
  assert.equal(composite.length, MAX_STYLE_REFERENCES);
  assert.deepEqual(composite.map((c) => c.id), ['c1', 'c2', 'c3']);
  assert.deepEqual(chooseLibraryCases(all, 'Porcelain').map((c) => c.id), ['p1']);
});

test('pinned cases take priority within the selected treatment without mixing techniques', () => {
  const all = [
    aCase('p1', 'Porcelain', 500),
    aCase('c1', 'Layered composite', 400),
    aCase('c2', 'Single-shade composite', 300),
  ];
  // Pinning cannot override the treatment technique.
  assert.deepEqual(chooseLibraryCases(all, 'Composite', ['p1']).map((c) => c.id), []);
  assert.deepEqual(chooseLibraryCases(all, 'Porcelain', ['c1', 'c2']).map((c) => c.id), []);
  // A pinned id that no longer exists just drops out rather than erroring.
  assert.deepEqual(chooseLibraryCases(all, 'Composite', ['gone']), []);
});

test('cases round-trip through the store, and images stay out of the listing', async () => {
  await seed([aCase('c1', 'Layered composite', 100), aCase('p1', 'Porcelain', 200)]);
  const listed = await listLibrary();
  assert.deepEqual(listed.map((c) => c.id), ['p1', 'c1']);
  assert.ok(!Object.keys(listed[0]).includes('image'));
  assert.equal((await readLibraryMedia('c1'))?.image, png);
  assert.deepEqual(await loadStyleReferences(['c1', 'p1']), [png, png]);
  // A missing case is skipped rather than sending an empty reference.
  assert.deepEqual(await loadStyleReferences(['c1', 'missing']), [png]);
  await deleteLibraryCase('c1');
  assert.deepEqual((await listLibrary()).map((c) => c.id), ['p1']);
  assert.equal(await readLibraryMedia('c1'), null);
  await clearLibrary();
});

test('a library exports and imports whole, and a bad entry is skipped rather than failing the file', async () => {
  await seed([aCase('c1', 'Layered composite', 100), aCase('p1', 'Porcelain', 200)]);
  const file = await exportLibrary();
  assert.equal(file.version, 1);
  assert.equal(file.cases.length, 2);
  assert.equal(file.cases[0].image, png);

  await clearLibrary();
  assert.deepEqual(await importLibrary(file), { added: 2, skipped: 0 });
  assert.equal((await listLibrary()).length, 2);

  await clearLibrary();
  const mixed = { ...file, cases: [file.cases[0], { id: 'x', material: 'Gold', image: png, thumb: png }, { id: 'y' }] };
  assert.deepEqual(await importLibrary(mixed), { added: 1, skipped: 2 });
  assert.equal((await listLibrary()).length, 1);

  await assert.rejects(() => importLibrary({ version: 9, cases: [] }));
  await assert.rejects(() => importLibrary(null));
  await clearLibrary();
});

test('single-shade and layered references never mix, including manual pins', () => {
  const all = [aCase('single', 'Single-shade composite', 1), aCase('layered', 'Layered composite', 2)];
  assert.deepEqual(chooseLibraryCases(all, 'Single-shade composite').map(c => c.id), ['single']);
  assert.deepEqual(chooseLibraryCases(all, 'Layered composite', ['single', 'layered']).map(c => c.id), ['layered']);
  assert.equal(matchesTreatment('Single-shade composite', 'Layered composite'), false);
});
