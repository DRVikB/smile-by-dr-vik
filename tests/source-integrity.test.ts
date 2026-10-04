import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceLooksBlank } from "../src/lib/generation/sourceCheck";
import { alignByPixels, pixelMatchAccepted, samePhotograph } from "../src/lib/face/pixelAlign";
import { buildEditRegion } from "../src/lib/toothMap/masks";
import { handleGenerationRequest } from "../src/lib/generation/handler";
import { defaultSettings } from "../src/lib/types";

// A 1×1 PNG header claiming 1320×1760 with almost no data: a blank canvas.
function pngClaiming(width: number, height: number, bodyBytes: number): string {
  const header = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  header.writeUInt32BE(width, 16); header.writeUInt32BE(height, 20);
  return `data:image/png;base64,${Buffer.concat([header, Buffer.alloc(bodyBytes, 7)]).toString("base64")}`;
}

test("a blank source photo is recognised by its size; real photos are not", () => {
  assert.equal(sourceLooksBlank(pngClaiming(1320, 1760, 8_000)), true, "blank canvas PNG");
  assert.equal(sourceLooksBlank(pngClaiming(1320, 1760, 1_500_000)), false, "photo-sized PNG");
  const photo = `data:image/jpeg;base64,${readFileSync("public/sample-smile.jpg").toString("base64")}`;
  assert.equal(sourceLooksBlank(photo), false, "real JPEG photograph");
});

test("the server refuses a blank source before anything is reserved", async () => {
  const response = await handleGenerationRequest(new Request("http://localhost/api/generate-smile", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ originalImage: pngClaiming(1320, 1760, 8_000), settings: { ...defaultSettings, libraryStyle: false } }),
  }));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "source_image_blank");
});

// Synthetic "faces": a textured field; the mouth box is excluded from matching.
const W = 120, H = 120;
function field(seed: number, shift = 0): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xs = x - shift, ys = y - shift;
    const v = 128 + 60 * Math.sin(xs * 0.21 * seed) * Math.cos(ys * 0.17 + seed) + 30 * Math.sin((xs + ys) * 0.05 * seed);
    px.set([v, v * 0.9, v * 0.8, 255], (y * W + x) * 4);
  }
  return px;
}
const face = { x0: 10, y0: 10, x1: 110, y1: 110 }, mouth = { x0: 40, y0: 70, x1: 80, y1: 95 };

test("pixel matching finds a small shift of the same photograph and accepts it", () => {
  const match = alignByPixels(field(1), field(1, 3), W, H, face, mouth, 8);
  assert.ok(match);
  assert.deepEqual([match!.dx, match!.dy], [-3, -3]);
  assert.ok(pixelMatchAccepted(match) && samePhotograph(match));
});

test("a different picture fails both the pixel match and the identity check", () => {
  const match = alignByPixels(field(1), field(2.3), W, H, face, mouth, 8);
  assert.equal(pixelMatchAccepted(match), false);
  assert.equal(samePhotograph(match), false);
});

test("automatic tooth regions close small gaps between selected teeth along each row only", () => {
  const rule = { exactOnly: true, lateral: 0, incisal: 0, cervical: 0 };
  const tooth = (x0: number, x1: number): [number, number][] => [[x0, 10], [x1, 10], [x1, 20], [x0, 20]];
  const base = { width: 60, height: 30, selected: [{ outline: tooth(5, 15), rule }, { outline: tooth(20, 30), rule }], protectedTeeth: [], feather: 0 };
  const open = buildEditRegion(base), closed = buildEditRegion({ ...base, bridge: 4 });
  assert.equal(open.allowed[15 * 60 + 17], 0, "gap stays without bridging");
  assert.equal(closed.allowed[15 * 60 + 17], 1, "gap between selected teeth is closed");
  assert.equal(closed.allowed[25 * 60 + 17], 0, "never extends below the teeth");
  assert.equal(closed.allowed[15 * 60 + 40], 0, "never extends past the last selected tooth");
});

test("a photo saved as 0×0 gets its real pixel size back before generating", async () => {
  const { ensurePhotoDimensions } = await import("../src/lib/photos");
  const saved = globalThis.Image;
  class FakeImage { src = ""; naturalWidth = 1365; naturalHeight = 2048; async decode() {} }
  Object.assign(globalThis, { Image: FakeImage });
  try {
    const fixed = await ensurePhotoDimensions({ dataUrl: "data:image/jpeg;base64,/9j/", width: 0, height: 0 });
    assert.deepEqual([fixed.width, fixed.height], [1365, 2048]);
    const ok = { dataUrl: "x", width: 10, height: 20 };
    assert.equal(await ensurePhotoDimensions(ok), ok, "valid sizes are left alone");
  } finally { Object.assign(globalThis, { Image: saved }); }
});

test("photo import reads the canvas size before freeing the canvas", () => {
  const source = readFileSync("src/lib/photos.ts", "utf8");
  const body = source.slice(source.indexOf("export async function preparePhoto"), source.indexOf("export async function ensurePhotoDimensions"));
  assert.ok(body.indexOf("const { width, height } = canvas;") < body.indexOf("releaseCanvas(canvas, qCanvas)"));
  assert.doesNotMatch(body, /width: canvas\.width/);
});
