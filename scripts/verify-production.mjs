import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { configuredSecrets, clientSecretIssue, unsafePublicName } from './client-secrets.mjs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))).flat();
}
const manifest = JSON.parse(await readFile('dist/client/manifest.webmanifest', 'utf8'));
assert.equal(manifest.name, 'SmileCompose');
assert.equal(manifest.short_name, 'SmileCompose');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
for (const [name, size] of [['icon-192.png',192], ['icon-512.png',512], ['apple-touch-icon.png',180], ['favicon-32.png',32]]) {
  const info = await sharp(`dist/client/${name}`).metadata();
  assert.equal(info.width, size); assert.equal(info.height, size);
}
const html = await readFile('.next/server/app/index.html','utf8');
for (const expected of ['manifest.webmanifest', 'rel="apple-touch-icon"', 'apple-mobile-web-app-capable', 'viewport-fit=cover']) assert.ok(html.includes(expected), expected);
// Validate the actual versioned installation assets referenced by the page.
for (const tag of html.match(/<link\b[^>]*rel="(?:apple-touch-icon|icon)"[^>]*>/g) ?? []) {
  const href = /href="([^"]+)"/.exec(tag)?.[1];
  const size = /sizes="(\d+)x(\d+)"/.exec(tag);
  assert.ok(href?.startsWith('/') && size, `Invalid icon link: ${tag}`);
  const info = await sharp(`dist/client${href}`).metadata();
  assert.equal(info.width, Number(size[1]));
  assert.equal(info.height, Number(size[2]));
}
const sourceFiles = (await files('src')).filter(f => /\.(ts|tsx)$/.test(f));
for (const f of sourceFiles) {
  const content = await readFile(f, 'utf8');
  assert.ok(!/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(content), `Local URL in ${f}`);
  assert.ok(!unsafePublicName(content), `Public secret name in ${f}`);
}
const secrets = await configuredSecrets();
for (const file of (await files('dist/client')).filter(f => /\.(js|html|json|webmanifest|svg|txt|css|map)$/.test(f))) {
  const content = await readFile(file, 'utf8');
  const issue = clientSecretIssue(content, secrets);
  assert.ok(!issue, `${issue} found in browser artifact ${file}`);
  assert.ok(!content.includes('generativelanguage.googleapis.com'), `Server provider bundled for browser: ${file}`);
}

const tracked = execFileSync('git',['ls-files'],{encoding:'utf8'}).split('\n');
assert.ok(!tracked.some(f => /(^|\/)(\.env|\.dev.vars)/.test(f) && !f.endsWith('.env.example')), 'Tracked secret env file');
for (const file of ['.env','.env.local','.env.production','.env.production.local','.dev.vars','.dev.vars.production','private.key','service-account-private.json']) execFileSync('git',['check-ignore','--no-index',file]);
const sw = await readFile('dist/client/sw.js','utf8');
assert.ok(sw.includes('/offline-shell.html') && sw.includes('staticPath'), 'Public offline shell missing');
const offline = JSON.parse(await readFile('dist/client/offline-assets.json', 'utf8'));
assert.ok(offline.assets.length > 0 && offline.assets.every(path => /^\/_next\/static\/[^?]+\.(js|css|woff2?)$/.test(path) || /^\/brand\/[^?]+\.(png|svg|webp)$/.test(path) || /^\/(examples|demo-results)\/[^?]+\.webp$/.test(path) || /^\/(vision|ort)\/[^?]+\.(js|mjs|wasm)$/.test(path) || /^\/models\/(face|slimsam)\/[^?]+\.(task|onnx)$/.test(path) || ['/dr-vik-logo.png','/smile-hero-dr-vik-v2.webp','/demo-storyboard-before.webp'].includes(path)), 'Offline manifest must contain only public build assets and bundled illustrative images');
assert.equal(await readFile('dist/client/offline-shell.html', 'utf8'), html, 'Offline shell must be the public prerender, not an authenticated response');
console.log('Production checks passed: PWA metadata/icons, relative app URLs, Git ignores, browser secret isolation, public-only offline shell.');
