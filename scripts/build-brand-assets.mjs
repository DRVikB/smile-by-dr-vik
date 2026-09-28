import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Keep the in-app mark and social artwork distinct from the full-bleed app tile.
const mark = await readFile('public/brand/smilecompose-symbol.svg', 'utf8');
const inner = `<g fill="none">${mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</g>`;
const tile = await readFile('public/brand/smilecompose-app-icon.svg', 'utf8');
await writeFile('public/brand/smilecompose-icon.svg', tile);
for (const [name, size] of [['icon-1024.png',1024],['icon-512.png',512],['icon-512-maskable.png',512],['icon-192.png',192],['apple-touch-icon.png',180],['favicon-32.png',32]]) {
  await sharp(Buffer.from(tile)).resize(size,size).flatten({ background: '#FAF9F6' }).png().toFile(`public/${name}`);
  // New filenames bypass previously cached installation artwork.
  await sharp(Buffer.from(tile)).resize(size,size).flatten({ background: '#FAF9F6' }).png().toFile(`public/brand/${name.replace('.png', '-glass-v2.png')}`);
}
for (const size of [152, 167]) {
  await sharp(Buffer.from(tile)).resize(size,size).flatten({ background: '#FAF9F6' }).png().toFile(`public/brand/apple-touch-icon-${size}-glass-v2.png`);
}
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#FAF9F6"/><g transform="translate(520 92) scale(1.6)">${inner}</g><g text-anchor="middle" fill="#3C3C3C" font-family="Helvetica Neue,Arial,sans-serif"><text x="600" y="330" font-size="49" font-weight="300" letter-spacing="9">SMILECOMPOSE</text><text x="600" y="396" font-size="32" font-family="Georgia,serif">Smile design, visualised.</text><text x="600" y="470" font-size="18" letter-spacing="3">DIGITAL SMILE DESIGN</text><text x="600" y="553" font-size="16" fill="#706356">Designed by Dr Vik</text></g></svg>`;
await sharp(Buffer.from(social)).png().toFile('public/brand/smilecompose-social.png');
console.log('SmileCompose icons and social image generated from the original vector mark.');
