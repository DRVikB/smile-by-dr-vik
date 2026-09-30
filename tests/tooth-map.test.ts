import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillPolygon, otsu, segmentTeeth, toothScore, type Point } from "../src/lib/toothMap/segment";
import { buildEditRegion, compositeWithAlpha, influenceOutline, measureChange, toothEditRule, dilate, erode } from "../src/lib/toothMap/masks";
import { protectionPlan } from "../src/lib/toothMap/protect";
import { toothGeometry } from "../src/lib/toothMap/geometry";
import { fdiOrder, isValidToothMap, photoFingerprint, presetAvailability, renumber, withSelection, teethToReview, type ToothMap, type ToothRegion } from "../src/lib/toothMap/types";
import { buildSmileInstruction, toothDesignInstruction } from "../src/lib/generation/prompt";
import { generationSchema, settingsSchema } from "../src/lib/generation/schema";
import { GeminiSmileProvider } from "../src/lib/generation/gemini";
import { updateToothPlan } from "../src/lib/teeth";
import { defaultSettings, upperTeeth, type SmileSettings } from "../src/lib/types";

// ---------- A synthetic smile: skin, a pink mouth opening, bright teeth with dark gaps ----------

const W = 400, H = 160;
const SKIN: [number, number, number] = [200, 150, 125];
const GUM: [number, number, number] = [190, 90, 100];
const TOOTH: [number, number, number] = [236, 228, 212];
const DARK: [number, number, number] = [45, 25, 25];
/** Image-left to image-right: patient's 14, 13, 12, 11 | 21, 22, 23, 24 (widths shrink outward). */
const TEETH_X: [number, number][] = [[62, 90], [93, 125], [128, 162], [165, 199], [202, 236], [239, 273], [276, 308], [311, 339]];
const MOUTH: Point[] = [[50, 40], [350, 40], [350, 120], [50, 120]];

function smile(options: { gapAt?: number; colour?: [number, number, number] } = {}): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  const set = (x: number, y: number, c: [number, number, number]) => { const i = (y * W + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, SKIN);
  for (let y = 40; y < 120; y++) for (let x = 50; x < 350; x++) set(x, y, y < 52 ? GUM : DARK);
  TEETH_X.forEach(([a, b], i) => {
    if (i === options.gapAt) return;
    for (let y = 52; y < 104; y++) for (let x = a; x <= b; x++) set(x, y, options.colour ?? TOOTH);
  });
  return px;
}

const settings = (patch: Partial<SmileSettings> = {}): SmileSettings => ({ ...defaultSettings, ...patch });

// ---------- Segmentation ----------

test("tooth pixels: bright and not red; gums, lips and the dark mouth are not teeth", () => {
  assert.ok(toothScore(...TOOTH) > 200);
  assert.ok(toothScore(...GUM) < 60);
  assert.ok(toothScore(...DARK) < 50);
  assert.ok(toothScore(120, 108, 98) > 80, "a shadowed tooth still reads as tooth");
  assert.equal(otsu([10, 10, 12, 200, 205, 210]) >= 12 && otsu([10, 10, 12, 200, 205, 210]) < 200, true);
});

test("each visible tooth gets its own region, numbered outward from the midline in FDI order", () => {
  const result = segmentTeeth({ rgba: smile(), width: W, height: H, mouth: MOUTH, midlineX: 200.5 });
  assert.deepEqual(result.teeth.map(t => t.fdi), [14, 13, 12, 11, 21, 22, 23, 24]);
  // Patient's right (quadrant 1) is on the image left.
  assert.ok(result.teeth[0].centroid[0] < result.teeth[7].centroid[0]);
  for (const [i, t] of result.teeth.entries()) {
    const [a, b] = TEETH_X[i];
    assert.ok(t.bbox.x >= a - 2 && t.bbox.x + t.bbox.w <= b + 2, `tooth ${t.fdi} stays within its own tooth`);
    // Premolars as wide as canines (no perspective in this drawing) read as less certain, not wrong.
    assert.ok(t.confidence > ((t.fdi ?? 0) % 10 >= 4 ? 0.5 : 0.7), `tooth ${t.fdi} confident on a clean photo`);
  }
  // Separate masks, not one global "teeth" mask.
  const masks = result.teeth.map(t => fillPolygon(t.outline, W, H));
  for (let i = 0; i < masks.length; i++) for (let j = i + 1; j < masks.length; j++)
    assert.ok(!masks[i].some((v, k) => v && masks[j][k]), `teeth ${i} and ${j} don't overlap`);
});

test("a missing lateral leaves a gap: detected teeth are numbered as found, and flagged for checking", () => {
  const result = segmentTeeth({ rgba: smile({ gapAt: 2 }), width: W, height: H, mouth: MOUTH, midlineX: 200.5 });
  const fdis = result.teeth.map(t => t.fdi);
  assert.ok(!fdis.includes(null));
  assert.equal(result.teeth.length, 7, "no tooth is invented in the gap");
  // The canine now sits where a lateral would: its number is a suggestion the clinician confirms.
  assert.ok(result.teeth.some(t => t.confidence < 0.9));
});

test("no mouth, no teeth: nothing is found rather than guessed", () => {
  const skinOnly = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) skinOnly.set([...SKIN, 255], i * 4);
  assert.equal(segmentTeeth({ rgba: skinOnly, width: W, height: H, mouth: MOUTH }).teeth.length, 0);
});

// ---------- Masks ----------

test("edit rules follow the treatment: whitening exact only, porcelain more room than composite, gums protected", () => {
  const whitening = toothEditRule(settings({ designIntent: "Shade only" }), undefined);
  assert.equal(whitening.exactOnly, true);
  const composite = toothEditRule(settings({ treatment: "Single-shade composite" }), undefined);
  const porcelain = toothEditRule(settings({ treatment: "Porcelain" }), undefined);
  assert.ok(porcelain.lateral > composite.lateral && porcelain.incisal > composite.incisal);
  assert.equal(composite.cervical, 0);
  assert.ok(toothEditRule(settings(), undefined, { protectGingiva: false }).cervical > 0, "only a future gum mode opens the gum line");
  const longer = toothEditRule(settings(), { tooth: 11, intent: "Auto", condition: "Natural", length: 1 });
  assert.ok(longer.incisal > composite.incisal);
});

test("the influence area grows at the incisal edge and sideways, not into the gum", () => {
  const tooth: Point[] = [[100, 50], [140, 50], [140, 110], [100, 110]];
  const grown = influenceOutline(tooth, { exactOnly: false, lateral: 0.1, incisal: 0.2, cervical: 0 });
  const ys = grown.map(p => p[1]), xs = grown.map(p => p[0]);
  assert.equal(Math.min(...ys), 50, "gum line unchanged");
  assert.ok(Math.max(...ys) > 110, "incisal edge has room");
  assert.ok(Math.min(...xs) < 100 && Math.max(...xs) > 140, "mesial and distal room");
});

test("morphology basics: erode then blur keeps the feather inside the region", () => {
  const m = new Uint8Array(20 * 20);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) m[y * 20 + x] = 1;
  assert.equal(erode(m, 20, 20, 2).reduce((a, b) => a + b, 0), 36);
  assert.equal(dilate(m, 20, 20, 1).reduce((a, b) => a + b, 0), 144);
});

// ---------- The rule: if it isn't selected, it doesn't change ----------

const toothOutlines = (): Point[][] => TEETH_X.map(([a, b]) => [[a, 52], [b, 52], [b, 104], [a, 104]] as Point[]);
const FDI = [14, 13, 12, 11, 21, 22, 23, 24];

function protect(selected: number[], rule = toothEditRule(settings(), undefined)) {
  const outlines = toothOutlines();
  const region = buildEditRegion({
    width: W, height: H,
    selected: outlines.filter((_, i) => selected.includes(FDI[i])).map(outline => ({ outline, rule })),
    protectedTeeth: outlines.filter((_, i) => !selected.includes(FDI[i])),
    mouthOpening: MOUTH,
    feather: 2,
  });
  const original = smile();
  // A generated image that changed EVERYTHING: face, lips, gums, every tooth.
  const generated = new Uint8ClampedArray(original.length);
  for (let i = 0; i < generated.length; i += 4) { generated[i] = 255 - original[i]; generated[i + 1] = 30; generated[i + 2] = 200; generated[i + 3] = 255; }
  const final = compositeWithAlpha(original, generated, region.alpha);
  return { region, original, generated, final, outlines };
}

const pixelEqual = (a: Uint8ClampedArray, b: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * W + x) * 4;
  return a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2];
};

for (const [label, selected] of [
  ["one upper central", [11]],
  ["four anterior teeth", upperTeeth[4]],
  ["six anterior teeth", upperTeeth[6]],
  ["eight upper teeth", upperTeeth[8]],
] as const) {
  test(`${label}: selected teeth change, unselected teeth, gums, lips and skin stay pixel-identical`, () => {
    const { region, original, final, outlines } = protect([...selected]);
    outlines.forEach((outline, i) => {
      const [a, b] = TEETH_X[i];
      const cx = Math.round((a + b) / 2), cy = 78;
      if (selected.includes(FDI[i] as never)) assert.ok(!pixelEqual(original, final, cx, cy), `${FDI[i]} changed`);
      else for (let x = a; x <= b; x++) for (let y = 52; y < 104; y++) assert.ok(pixelEqual(original, final, x, y), `${FDI[i]} untouched at ${x},${y}`);
    });
    // Skin and lips outside the mouth: identical everywhere.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (x < 50 || x >= 350 || y < 40 || y >= 120) assert.ok(pixelEqual(original, final, x, y), `skin at ${x},${y}`);
    // Gingiva above the teeth stays (no cervical room while gums are protected).
    for (let x = 60; x < 340; x++) for (let y = 40; y < 50; y++) assert.ok(pixelEqual(original, final, x, y), `gum at ${x},${y}`);
    // Nothing allowed outside the region; every protected pixel is exactly the original.
    assert.equal(measureChange(original, final, region.allowed, 0).outside, 0);
    assert.equal(final.length, original.length, "dimensions unchanged");
  });
}

test("ten teeth: teeth the photo doesn't show (15, 25) are left alone, not drawn", () => {
  const map = mapFromOutlines();
  const plan = protectionPlan(map, "data:image/jpeg;base64,photo", settings({ teeth: 10, selectedTeeth: upperTeeth[10] }));
  assert.ok(plan.ok);
  if (plan.ok) { assert.deepEqual(plan.notFound, [15, 25]); assert.equal(plan.teeth.length, 8); }
});

test("whitening changes only the tooth's own pixels; porcelain may reach a little past its outline", () => {
  const whitening = protect([11], toothEditRule(settings({ designIntent: "Shade only" }), undefined));
  const porcelain = protect([11], toothEditRule(settings({ treatment: "Porcelain" }), undefined));
  const count = (m: Uint8Array) => m.reduce((a, b) => a + b, 0);
  assert.ok(count(porcelain.region.allowed) > count(whitening.region.allowed));
  // Even porcelain never takes a neighbour's pixels.
  const [a, b] = TEETH_X[2];
  for (let x = a; x <= b; x++) assert.ok(pixelEqual(porcelain.original, porcelain.final, x, 78));
});

test("the feather is narrow and inside the edit: core fully generated, edge blended, outside original", () => {
  const { region } = protect([11]);
  const [a, b] = TEETH_X[3];
  assert.equal(region.alpha[78 * W + Math.round((a + b) / 2)], 255);
  let partial = 0;
  for (let i = 0; i < region.alpha.length; i++) {
    if (!region.allowed[i]) assert.equal(region.alpha[i], 0);
    else if (region.alpha[i] < 255) partial++;
  }
  assert.ok(partial > 0 && partial < region.allowed.reduce((s, v) => s + v, 0) * 0.5);
});

// ---------- Map, presets, plan ----------

function mapFromOutlines(): ToothMap {
  const teeth: ToothRegion[] = toothOutlines().map((o, i) => ({
    id: `t${i}`, fdi: FDI[i], detectedIndex: i, confidence: i === 7 ? 0.5 : 0.9,
    bbox: { x: o[0][0] / W, y: o[0][1] / H, width: (o[1][0] - o[0][0]) / W, height: (o[2][1] - o[0][1]) / H },
    centroid: { x: (o[0][0] + o[1][0]) / 2 / W, y: 78 / H },
    outline: o.map(([x, y]) => [x / W, y / H] as [number, number]),
    exactMaskRef: `outline:t${i}`, visible: true, selected: false, requiresReview: i === 7, source: "detected",
  }));
  return { photoId: photoFingerprint("data:image/jpeg;base64,photo"), arch: "upper", teeth, confirmedByClinician: false, version: 1, method: "on-device-v1", mouthOpening: MOUTH.map(([x, y]) => [x / W, y / H] as [number, number]) };
}

test("presets never assume a tooth is there; selection comes from the design, not the map", () => {
  const map = mapFromOutlines();
  assert.deepEqual(presetAvailability(map, 10), { found: [14, 13, 12, 11, 21, 22, 23, 24], notFound: [15, 25] });
  assert.deepEqual(presetAvailability(map, 6).notFound, []);
  const selected = withSelection(map, settings({ selectedTeeth: [11, 21] })).teeth.filter(t => t.selected).map(t => t.fdi);
  assert.deepEqual(selected, [11, 21]);
  assert.deepEqual(fdiOrder([21, 11, 13, 22, 12, 23]), [13, 12, 11, 21, 22, 23]);
  assert.deepEqual(teethToReview(map).map(t => t.fdi), [24]);
  assert.equal(teethToReview({ ...map, confirmedByClinician: true }).length, 0);
});

test("correcting a number swaps it with the tooth that held it; stored maps are validated", () => {
  const map = renumber(mapFromOutlines(), "t2", 13);
  assert.equal(map.teeth[2].fdi, 13);
  assert.equal(map.teeth[1].fdi, 12, "the old 13 takes 12");
  assert.equal(isValidToothMap(map), true);
  assert.equal(isValidToothMap({ ...map, teeth: [{ ...map.teeth[0], outline: [[0, 0]] }] }), false);
  assert.equal(isValidToothMap(null), false);
});

test("protection needs this photo's map, and nothing is sent when no selected tooth is in it", () => {
  const map = mapFromOutlines();
  const photo = "data:image/jpeg;base64,photo";
  assert.deepEqual(protectionPlan(undefined, photo, settings()), { ok: false, reason: "no-map" });
  assert.deepEqual(protectionPlan(map, "data:image/jpeg;base64,other", settings()), { ok: false, reason: "stale-map" });
  assert.deepEqual(protectionPlan(map, photo, settings({ alignment: { arches: "Upper" } })), { ok: false, reason: "alignment" });
  const missing = updateToothPlan(settings({ teeth: 4, selectedTeeth: [12, 11, 21, 22] }), { tooth: 11, intent: "Auto", condition: "Natural" });
  const onlyAbsent = { ...missing, toothPlans: [{ tooth: 25, intent: "Auto" as const, condition: "Natural" as const }], selectedTeeth: [25] };
  assert.deepEqual(protectionPlan(map, photo, onlyAbsent), { ok: false, reason: "no-teeth" });
});

test("tooth geometry is relative to the centrals, with symmetry pairs", () => {
  const { teeth, pairs } = toothGeometry(mapFromOutlines(), W, H);
  assert.equal(teeth.find(t => t.fdi === 11)?.width, 1);
  assert.ok((teeth.find(t => t.fdi === 13)?.width ?? 1) < 1);
  const centralPair = pairs.find(p => p.right === 11)!;
  assert.equal(centralPair.left, 21);
  assert.equal(centralPair.widthRatio, 1);
  assert.equal(centralPair.edgeOffset, 0);
});

// ---------- Prompt, schema, provider ----------

test("each tooth's own design reaches the prompt for that tooth only; length is an explicit permission", () => {
  assert.equal(toothDesignInstruction({ tooth: 11, intent: "Auto", condition: "Natural" }), "");
  assert.match(toothDesignInstruction({ tooth: 11, intent: "Auto", condition: "Natural", shape: "Soft square", edge: "Level", width: 1 }), /soft square.*slightly wider.*level/);
  const s = updateToothPlan(settings({ teeth: 6, selectedTeeth: upperTeeth[6] }), { tooth: 11, intent: "Auto", condition: "Natural", length: 1 });
  const prompt = buildSmileInstruction(s);
  assert.match(prompt, /EDGE PERMISSION FDI 11: The clinician explicitly requests this tooth slightly longer/);
  assert.doesNotMatch(prompt, /EDGE PERMISSION FDI [0-9, ]*\b11\b[0-9, ]*: Keep incisal edge/, "11's default policy is replaced");
  assert.match(buildSmileInstruction(s, false, undefined, 0, undefined, true), /EDIT MASK: The final image is a black-and-white mask/);
  assert.doesNotMatch(prompt, /EDIT MASK/);
});

test("the request accepts per-tooth design and a PNG edit mask, and rejects anything else", () => {
  const s = updateToothPlan(settings(), { tooth: 11, intent: "Auto", condition: "Natural", shape: "Rounded", length: -1, width: 1, edge: "Soft", targetShade: "B1" });
  assert.equal(settingsSchema.safeParse(s).success, true);
  assert.equal(settingsSchema.safeParse({ ...s, toothPlans: [{ ...s.toothPlans![0], length: 2 }] }).success, false);
  const image = `data:image/jpeg;base64,${readFileSync("public/sample-smile.jpg").toString("base64")}`;
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  assert.equal(generationSchema.safeParse({ originalImage: image, settings: s, editMask: PNG }).success, true);
  assert.equal(generationSchema.safeParse({ originalImage: image, settings: s, editMask: image }).success, false, "JPEG masks are refused");
});

test("the provider receives the mask only when guidance is switched on for the server", async () => {
  const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const input = { originalImage: `data:image/jpeg;base64,${readFileSync("public/sample-smile.jpg").toString("base64")}`, settings: defaultSettings, editMask: `data:image/png;base64,${PNG_1x1}` };
  const seen: number[] = [];
  const fetcher = async (_url: RequestInfo | URL, init?: RequestInit) => {
    const parts = JSON.parse(String(init?.body)).contents[0].parts;
    seen.push(parts.filter((p: { inlineData?: unknown }) => p.inlineData).length);
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_1x1 } }] } }] });
  };
  await new GeminiSmileProvider({ apiKey: "k", fetcher }).generate(input);
  await new GeminiSmileProvider({ apiKey: "k", fetcher, maskGuidance: true }).generate(input);
  assert.deepEqual(seen, [1, 2]);
});
