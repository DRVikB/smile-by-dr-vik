import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
import sharp from 'sharp';
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))).flat();
}
const manifest = JSON.parse(await readFile('dist/client/manifest.webmanifest', 'utf8'));
assert.equal(manifest.name, 'SMILE by Dr Vik');
assert.equal(manifest.short_name, 'SMILE');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
for (const [name, size] of [['icon-192.png',192], ['icon-512.png',512], ['apple-touch-icon.png',180], ['favicon-32.png',32]]) {
  const info = await sharp(`dist/client/${name}`).metadata();
  assert.equal(info.width, size); assert.equal(info.height, size);
}
const html = await readFile('.next/server/app/index.html','utf8');
for (const expected of ['manifest.webmanifest', 'apple-touch-icon.png', 'apple-mobile-web-app-capable', 'viewport-fit=cover']) assert.ok(html.includes(expected), expected);
const sourceFiles = (await files('src')).filter(f => /\.(ts|tsx)$/.test(f));
for (const f of sourceFiles) {
  const content = await readFile(f, 'utf8');
  assert.ok(!/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(content), `Local URL in ${f}`);
  assert.ok(!/NEXT_PUBLIC_\w*(KEY|SECRET|TOKEN)/.test(content), `Public secret name in ${f}`);
}
let secrets = [];
for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  try { secrets.push(...Object.entries(parseEnv(await readFile(file,'utf8'))).filter(([k,v]) => /KEY|SECRET|TOKEN/.test(k) && v.length > 8).map(([,v]) => v)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (const file of (await files('dist/client')).filter(f => /\.(js|html|json|webmanifest|svg|txt)$/.test(f))) {
  const content = await readFile(file, 'utf8');
  assert.ok(!secrets.some(secret => content.includes(secret)), `Secret found in browser artifact ${file}`);
  assert.ok(!content.includes('generativelanguage.googleapis.com'), `Server provider bundled for browser: ${file}`);
}
const tracked = execFileSync('git',['ls-files'],{encoding:'utf8'}).split('\n');
assert.ok(!tracked.some(f => /(^|\/)\.env/.test(f) && !f.endsWith('.env.example')), 'Tracked secret env file');
for (const file of ['.env','.env.local','.env.production','.env.production.local','private.key','service-account-private.json']) execFileSync('git',['check-ignore','--no-index',file]);
const sw = await readFile('dist/client/sw.js','utf8');
assert.ok(!/caches\.(open|put|match)/.test(sw), 'Service worker must not cache patient data');
console.log('Production checks passed: PWA metadata/icons, relative app URLs, Git ignores, browser secret isolation, network-only service worker.');
