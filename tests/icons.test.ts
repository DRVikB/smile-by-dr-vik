import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/** PNG header: width and height are two big-endian 32-bit ints at byte 16. */
function pngSize(path: string): { width: number; height: number } {
  const b = readFileSync(path);
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', `${path} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));

test('every icon the manifest promises exists at the size it claims', () => {
  assert.ok(manifest.icons.length >= 2);
  for (const icon of manifest.icons) {
    const path = `public${icon.src}`;
    assert.ok(existsSync(path), `manifest points at a missing file: ${icon.src}`);
    const [w, h] = icon.sizes.split('x').map(Number);
    assert.deepEqual(pngSize(path), { width: w, height: h }, `${icon.src} is not ${icon.sizes}`);
  }
  // Android needs a maskable icon or it draws its own white plate behind ours.
  assert.ok(
    manifest.icons.some((i: { purpose?: string }) => i.purpose?.split(' ').includes('maskable')),
    'no maskable icon declared',
  );
});

test('the icons the page links to exist, at the sizes iOS and browsers expect', () => {
  assert.deepEqual(pngSize('public/apple-touch-icon.png'), { width: 180, height: 180 });
  assert.deepEqual(pngSize('public/favicon-32.png'), { width: 32, height: 32 });
  // Every icon the page links to must exist; a 404 here is silent in the browser.
  const layout = readFileSync('src/app/layout.tsx', 'utf8');
  for (const url of [...layout.matchAll(/url:\s*"(\/[^"]+)"/g)].map((m) => m[1]))
    assert.ok(existsSync(`public${url}`), `layout.tsx links a missing icon: ${url}`);
});

test('the home screen name is short enough for iOS not to truncate it', () => {
  const layout = readFileSync('src/app/layout.tsx', 'utf8');
  const title = /appleWebApp:\s*\{[^}]*title:\s*"([^"]+)"/.exec(layout)?.[1];
  assert.equal(title, manifest.short_name, 'the iOS title and the manifest short_name disagree');
  assert.ok(title!.length <= 12, `"${title}" is ${title!.length} characters; iOS truncates around 12`);
});

test('the launch background matches the icon, so there is no white flash', () => {
  // Sampled from the icon's own tile, so the splash and the icon are one colour.
  assert.equal(manifest.background_color.toLowerCase(), '#d0beac');
});

test('the app icon is the real artwork, not a placeholder', () => {
  // The supplied artwork is warm; the old placeholder was neutral grey. A flat
  // or near-grey icon means a build has quietly reverted it.
  const b = readFileSync('public/icon-512.png');
  assert.ok(b.length > 40_000, 'icon-512.png is too small to be the artwork');
  assert.ok(existsSync('public/icon-1024.png'), 'the 1024 master is missing');
  assert.ok(
    existsSync('public/brand/dr-vik-app-icon-source.png'),
    'the untouched source artwork should stay in the repo',
  );
});
