import test from 'node:test';
import assert from 'node:assert/strict';
import { A4_LONG, A4_SHORT, fitContain, jpegToPdf } from '../src/lib/pdf';
import { canShareFiles, shareFile } from '../src/lib/share';
import { presentationDate } from '../src/lib/presentation';
import { REVEAL_TIMING, nextPhase, type RevealPhase } from '../src/components/ConsultView';

// Smallest valid-ish JPEG header; the writer only carries the bytes through.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

test('fitContain never crops, and centres what is left over', () => {
  // Wider than the page: constrained by width, bars top and bottom.
  const wide = fitContain(2000, 1000, 800, 800);
  assert.equal(wide.width, 800);
  assert.equal(wide.height, 400);
  assert.equal(wide.x, 0);
  assert.equal(wide.y, 200);
  // Taller than the page: constrained by height.
  const tall = fitContain(1000, 2000, 800, 800);
  assert.equal(tall.height, 800);
  assert.equal(tall.x, 200);
  // An exact match fills the page with no offset.
  assert.deepEqual(fitContain(100, 50, 200, 100), { width: 200, height: 100, x: 0, y: 0 });
  for (const bad of [[0, 10, 10, 10], [10, 0, 10, 10], [10, 10, -1, 10]] as const)
    assert.throws(() => fitContain(...(bad as [number, number, number, number])));
});

test('the PDF is well formed, carries the JPEG unchanged, and picks its orientation', () => {
  const pdf = jpegToPdf(JPEG, 2480, 1754, { background: [0, 0, 0], title: 'Smile preview' });
  const s = text(pdf);
  assert.ok(s.startsWith('%PDF-1.4'), 'missing header');
  assert.ok(s.trimEnd().endsWith('%%EOF'), 'missing trailer');
  assert.ok(s.includes('/Filter /DCTDecode'), 'image is not carried as JPEG');
  assert.ok(s.includes('/Width 2480'));
  assert.ok(s.includes('/Height 1754'));
  // Landscape image gets a landscape page.
  assert.ok(s.includes(`/MediaBox [0 0 ${A4_LONG.toFixed(3)} ${A4_SHORT.toFixed(3)}]`));
  // The JPEG bytes survive byte for byte.
  assert.ok(text(JPEG).length > 0 && s.includes(text(JPEG)), 'JPEG bytes were altered');

  // A portrait image flips the page.
  const portrait = text(jpegToPdf(JPEG, 1000, 1400));
  assert.ok(portrait.includes(`/MediaBox [0 0 ${A4_SHORT.toFixed(3)} ${A4_LONG.toFixed(3)}]`));

  // Every object in the xref table points at a real "N 0 obj".
  const count = Number(/\/Size (\d+)/.exec(s)![1]);
  const offsets = [...s.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offsets.length, count - 1);
  offsets.forEach((at, i) => assert.ok(s.startsWith(`${i + 1} 0 obj`, at), `object ${i + 1} offset is wrong`));
  // startxref must point at the xref table itself, or readers reject the file.
  const startxref = Number(/startxref\n(\d+)/.exec(s)![1]);
  assert.equal(startxref, s.indexOf('xref\n0 '), 'startxref does not point at the xref table');
});

test('the PDF writer refuses input it cannot honour', () => {
  assert.throws(() => jpegToPdf(new Uint8Array(), 100, 100), /no image/i);
  assert.throws(() => jpegToPdf(JPEG, 0, 100), /dimensions/i);
  // A title with PDF-breaking characters is stripped rather than escaping the string.
  assert.ok(!text(jpegToPdf(JPEG, 10, 10, { title: 'a)b(c\\d' })).includes('a)b(c'));
});

test('file sharing is only claimed when the browser really offers it', () => {
  const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
  assert.equal(canShareFiles(file, { canShare: () => true, share: async () => {} }), true);
  // share without canShare, or canShare without share, is not enough.
  assert.equal(canShareFiles(file, { share: async () => {} }), false);
  assert.equal(canShareFiles(file, { canShare: () => true }), false);
  // A browser that has both but refuses this file type.
  assert.equal(canShareFiles(file, { canShare: () => false, share: async () => {} }), false);
  assert.equal(canShareFiles(file, {}), false);
});

test('sharing falls back to a download, and a cancelled sheet is not a failure', async () => {
  const blob = new Blob(['x'], { type: 'image/jpeg' });

  const shared: string[] = [];
  assert.equal(
    await shareFile(blob, 'a.jpg', 'T', {
      canShare: () => true,
      share: async (d) => { shared.push(d.files![0].name); },
    }),
    'shared',
  );
  assert.deepEqual(shared, ['a.jpg']);

  const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
  assert.equal(
    await shareFile(blob, 'a.jpg', 'T', { canShare: () => true, share: async () => { throw abort; } }),
    'cancelled',
  );

  // No share support at all: the caller still gets the file.
  let downloaded = false;
  globalThis.URL.createObjectURL = () => { downloaded = true; return 'blob:x'; };
  globalThis.URL.revokeObjectURL = () => {};
  const el = { href: '', download: '', click() {}, remove() {} };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => el,
    body: { appendChild() {} },
  };
  assert.equal(await shareFile(blob, 'a.jpg', 'T', {}), 'downloaded');
  assert.equal(downloaded, true);
  assert.equal(el.download, 'a.jpg');

  // canShare saying no is respected even when share exists.
  assert.equal(
    await shareFile(blob, 'a.jpg', 'T', { canShare: () => false, share: async () => {} }),
    'downloaded',
  );
});

test('the reveal runs once, in order, and ends', () => {
  const seen: RevealPhase[] = ['before'];
  let phase: RevealPhase = 'before';
  for (let i = 0; i < 10 && phase !== 'done'; i++) {
    phase = nextPhase(phase);
    seen.push(phase);
  }
  assert.deepEqual(seen, ['before', 'outline', 'after', 'done']);
  assert.equal(nextPhase('done'), 'done', 'the reveal must not loop');
  // Long enough for a patient to take it in, short enough not to stall a consult.
  const total = REVEAL_TIMING.before + REVEAL_TIMING.outline + REVEAL_TIMING.after;
  assert.ok(total >= 4000 && total <= 7000, `reveal is ${total}ms`);
});

test('the presentation dates in the clinician’s own format', () => {
  assert.equal(presentationDate(new Date('2026-09-18T10:00:00Z')), '18 September 2026');
});
