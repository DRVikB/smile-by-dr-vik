import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillPolygon, otsu, segmentTeeth, toothScore, type Point } from "../src/lib/toothMap/segment";
import { buildEditRegion, compositeWithAlpha, influenceOutline, measureChange, toothEditRule, dilate, erode } from "../src/lib/toothMap/masks";
import { protectionPlan } from "../src/lib/toothMap/protect";
import { toothGeometry } from "../src/lib/toothMap/geometry";
import { smileGuides, smoothContour, toothShapes } from "../src/lib/toothMap/outline";
import { crownOutline, familyFor, fitSmileTemplate } from "../src/lib/toothMap/template";
import { cutAtWaist, maskContour, samPixels } from "../src/lib/toothMap/sam";
import { readToothMapPrefs, toothOverlayMode } from "../src/components/toothMap/useToothMap";
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

test("precision requires complete reviewed boundaries for presets and single teeth", () => {
  const map = mapFromOutlines();
  for (const n of [4, 6, 8] as const)
    assert.equal(protectionPlan(map, "data:image/jpeg;base64,photo", settings({ teeth: n, selectedTeeth: upperTeeth[n] })).ok,true);
  assert.deepEqual(protectionPlan(map, "data:image/jpeg;base64,photo", settings({teeth:10,selectedTeeth:upperTeeth[10]})),{ok:false,reason:"incomplete-map"});
  // Exactly one tooth: precision.
  const one = protectionPlan(map, "data:image/jpeg;base64,photo", updateToothPlan(settings({ selectedTeeth: [] }), { tooth: 11, intent: "Auto", condition: "Natural" }));
  assert.ok(one.ok);
  if (one.ok) assert.deepEqual(one.teeth, [11]);
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
  return { photoId: photoFingerprint("data:image/jpeg;base64,photo"), arch: "upper", teeth, confirmedByClinician: true, version: 1, method: "on-device-v1", mouthOpening: MOUTH.map(([x, y]) => [x / W, y / H] as [number, number]) };
}

test("presets never assume a tooth is there; selection comes from the design, not the map", () => {
  const map = mapFromOutlines();
  assert.deepEqual(presetAvailability(map, 10), { found: [14, 13, 12, 11, 21, 22, 23, 24], notFound: [15, 25] });
  assert.deepEqual(presetAvailability(map, 6).notFound, []);
  const selected = withSelection(map, settings({ selectedTeeth: [11, 21] })).teeth.filter(t => t.selected).map(t => t.fdi);
  assert.deepEqual(selected, [11, 21]);
  assert.deepEqual(fdiOrder([21, 11, 13, 22, 12, 23]), [13, 12, 11, 21, 22, 23]);
  assert.deepEqual(teethToReview({ ...map, confirmedByClinician: false }).map(t => t.fdi), [24]);
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
  assert.deepEqual(protectionPlan(undefined, photo, settings({ selectedTeeth: [11] })), { ok: false, reason: "no-map" });
  assert.deepEqual(protectionPlan(map, "data:image/jpeg;base64,other", settings({ selectedTeeth: [11] })), { ok: false, reason: "stale-map" });
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
  assert.match(prompt, /FDI 11: Natural; clinician requests slightly longer/);
  assert.doesNotMatch(prompt, /FDI [0-9, ]*\b11\b[0-9, ]*: Natural; keep edge positions/, "11's default policy is replaced");
  assert.match(buildSmileInstruction(s, false, undefined, 0, undefined, true), /EDIT MASK: the final image is an aligned black-and-white guidance mask/);
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

// ---------- Display: smart, not always visible ----------

test("the tooth map shows itself only when it's needed", () => {
  const base = { hasMap: true, editing: false, adding: false, display: "auto" as const, picking: false, guides: { design: false, proportions: false, proportion: "natural" as const }, selectedMapped: 6 };
  assert.equal(toothOverlayMode(base), "hidden", "4 / 6 / 8 / 10 presets keep the smile clean");
  assert.equal(toothOverlayMode({ ...base, selectedMapped: 1 }), "single", "one tooth: its outline and number appear");
  assert.equal(toothOverlayMode({ ...base, picking: true }), "select", "Custom picking shows every tooth");
  assert.equal(toothOverlayMode({ ...base, picking: true, selectedMapped: 1 }), "select", "still picking with one tooth chosen");
  assert.equal(toothOverlayMode({ ...base, editing: true }), "select", "reviewing the map shows every tooth");
  assert.equal(toothOverlayMode({ ...base, display: "show" }), "select");
  assert.equal(toothOverlayMode({ ...base, display: "hide", selectedMapped: 1 }), "hidden", "Hide wins over the single-tooth reveal");
  assert.equal(toothOverlayMode({ ...base, guides: { design: true, proportions: false, proportion: "natural" as const } }), "design");
  assert.equal(toothOverlayMode({ ...base, hasMap: false, display: "show" }), "hidden");
});

test("display outlines are smoothed curves; the generation outline is never altered", () => {
  const map = mapFromOutlines();
  // A jagged edge on tooth 11: the display contour smooths it, the stored outline keeps it.
  const t11 = map.teeth.find(t => t.fdi === 11)!;
  const jagged = [...t11.outline, [t11.outline[2][0] - 0.01, t11.outline[2][1] - 0.02] as [number, number]];
  const jaggedMap = { ...map, teeth: map.teeth.map(t => (t.fdi === 11 ? { ...t, outline: jagged } : t)) };
  const before = JSON.stringify(jaggedMap);
  const shapes = toothShapes(jaggedMap, W, H, [11]);
  assert.equal(JSON.stringify(jaggedMap), before, "the map used for masks is untouched");
  const s11 = shapes.find(s => s.fdi === 11)!;
  assert.match(s11.path, /^M[\d.]+ [\d.]+( C[\d. ]+)+ Z$/, "a closed Bézier path, not a polygon");
  assert.ok(s11.selected && !shapes.find(s => s.fdi === 12)!.selected);
  // A notch in a mask is noise: the envelope is convex and evenly sampled.
  const notched = smoothContour([[0, 0], [10, 0], [10, 10], [5, 4], [0, 10]]);
  assert.equal(notched.length, 28);
  assert.ok(notched.every(([, y]) => y <= 10.01));
  const s12 = shapes.find(s => s.fdi === 12)!, s21 = shapes.find(s => s.fdi === 21)!;
  assert.equal(s12.mesial, s11.id, "12's neighbour towards the midline is 11");
  assert.equal(s11.mesial, s21.id, "11 meets 21 at the midline");
});

test("smile guides: arc through the incisal edges, midline between the centrals, contact guides", () => {
  const map = mapFromOutlines();
  const shapes = toothShapes(map, W, H, []);
  const guides = smileGuides(shapes);
  assert.ok(guides.arc && guides.arc.startsWith("M"));
  assert.ok(guides.midline);
  assert.ok(Math.abs(guides.midline!.x - (199 + 202) / 2) < 3, `midline at ${guides.midline!.x}`);
  assert.equal(guides.verticals.length, shapes.length - 2, "a guide at every contact except the midline");
  // Without both centrals there is no dental midline to draw.
  const noCentral = { ...map, teeth: map.teeth.filter(t => t.fdi !== 21) };
  assert.equal(smileGuides(toothShapes(noCentral, W, H, [])).midline, null);
});

test("the design template is fitted tooth by tooth: centrals at the midline, detected sizes, no overlaps, one arc", () => {
  const map = mapFromOutlines();
  const t = fitSmileTemplate(map, W, H, { settings: settings({ shape: "Square" }) })!;
  assert.ok(t);
  assert.ok(Math.abs(t.midline.x - (199 + 202) / 2) < 3);
  const get = (fdi: number) => t.teeth.find(x => x.fdi === fdi)!;
  const c11 = get(11), c21 = get(21), l12 = get(12);
  assert.ok(c11.cx < t.midline.x && c21.cx > t.midline.x, "11 on the image left, 21 on the right");
  assert.ok(Math.abs(c11.width - 34) < 4, `central width ${c11.width} follows the detected centrals`);
  assert.equal(c11.width, c21.width, "matched centrals");
  assert.equal(c11.incisalY, c21.incisalY, "level centrals");
  assert.equal(l12.source, "fitted");
  assert.ok(l12.width < c11.width && l12.cx < c11.cx);
  // Contacts in order from the midline: each tooth starts at or beyond its neighbour's distal edge.
  for (const q of [10, 20]) for (let i = 2; i <= 5; i++) {
    const inner = get(q + i - 1), outer = get(q + i);
    const gap = q === 10 ? (inner.cx - inner.width / 2) - (outer.cx + outer.width / 2) : (outer.cx - outer.width / 2) - (inner.cx + inner.width / 2);
    assert.ok(gap > -0.01, `no overlap between ${q + i - 1} and ${q + i} (${gap.toFixed(2)})`);
  }
  assert.ok(l12.axis[0][0] < l12.axis[1][0], "12's gum end sits further from the midline than its edge");
  assert.equal(get(15).mapped, false, "teeth the map didn't find can't be picked");
  assert.equal(get(15).source, "ideal");
  assert.equal(t.teeth.length, 10);
  const golden = fitSmileTemplate(map, W, H, { settings: settings(), proportion: "golden" })!;
  assert.ok(golden.teeth.find(x => x.fdi === 13)!.width < get(13).width, "golden canines are narrower");
});

test("template families follow the Shape step and each tooth's own shape; the technical outline is untouched", () => {
  const square = crownOutline("central", "square"), rounded = crownOutline("central", "rounded");
  const corner = (pts: [number, number][]) => Math.max(...pts.filter(([, y]) => y > 0.97).map(([x]) => Math.abs(x)));
  assert.ok(corner(square) > corner(rounded), "a square incisal edge is wider than a rounded one");
  const canine = crownOutline("canine", "natural");
  const tip = canine.reduce((a, p) => (p[1] > a[1] ? p : a));
  assert.ok(tip[1] > 0.99 && Math.abs(tip[0]) < 0.15, "a canine has a cusp tip");
  assert.equal(familyFor(settings({ shape: "Triangular" }), 11), "tapered");
  const plans = updateToothPlan(settings(), { tooth: 12, intent: "Auto", condition: "Natural", shape: "Soft square" });
  assert.equal(familyFor(plans, 12), "soft-square");
  assert.equal(familyFor(plans, 11), familyFor(settings(), 11));
  const map = mapFromOutlines();
  const before = JSON.stringify(map);
  fitSmileTemplate(map, W, H, { settings: settings() });
  assert.equal(JSON.stringify(map), before, "fitting never changes the map used for masks");
});

test("SlimSAM helpers: an upper crown joined to the lower tooth is cut at the waist; masks become smooth contours", () => {
  // A 20-wide crown (rows 0–29), a 6-wide neck (30–32), then a lower tooth (33–59).
  const w = 40, h = 60, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const half = y < 30 ? 10 : y < 33 ? 3 : 9;
    for (let x = 20 - half; x < 20 + half; x++) mask[y * w + x] = 1;
  }
  cutAtWaist(mask, w, h, 20, 40);
  const lowest = Math.max(...[...mask.keys()].filter(i => mask[i]).map(i => Math.floor(i / w)));
  assert.ok(lowest >= 29 && lowest <= 32, `cut at the neck, lowest row ${lowest}`);
  // A crown with no lower tooth beneath is left alone.
  const clean = new Uint8Array(w * h);
  for (let y = 0; y < 30; y++) for (let x = 10; x < 30; x++) clean[y * w + x] = 1;
  cutAtWaist(clean, w, h, 20, 40);
  assert.equal(clean.reduce((a, b) => a + b, 0), 600);
  const contour = maskContour(clean, w, h);
  assert.equal(contour.length, 256);
  assert.ok(contour.every(([x, y]) => x >= 10 && x <= 30 && y >= 0 && y <= 30));
});

test("SlimSAM precision contours preserve an incisal notch instead of allowing its convex envelope", () => {
  const width = 32, height = 32;
  const mask = new Uint8Array(width * height);
  for (let y = 4; y < 26; y++) for (let x = 4; x < 26; x++)
    if (!(x >= 12 && x < 18 && y >= 18)) mask[y * width + x] = 1;
  const contour = maskContour(mask, width, height);
  const reconstructed = fillPolygon(contour, width, height);
  assert.equal(reconstructed[22 * width + 15], 0, "the notch remains protected");
  assert.equal(reconstructed[10 * width + 15], 1, "the crown remains available to edit");
  assert.ok(contour.length <= 256, "saved outlines stay within the map schema limit");
});

test("the SlimSAM model input is the photo resized to 1024 on its longest side, normalised and padded", () => {
  const rgba = new Uint8ClampedArray(200 * 100 * 4).fill(255);
  const { pixels, scale } = samPixels(rgba, 200, 100);
  assert.equal(scale, 1024 / 200);
  assert.equal(pixels.length, 3 * 1024 * 1024);
  assert.ok(Math.abs(pixels[0] - (1 - 0.485) / 0.229) < 1e-5, "white, normalised");
  assert.equal(pixels[1023 * 1024], 0, "padding below the photo");
});


test("missing or stale segmentation blocks selected-tooth edits but retains separate alignment/full-arch paths", () => {
  const photo = "data:image/jpeg;base64,photo";
  const stale = { ...mapFromOutlines(), photoId: "old-photo" };
  for (const map of [undefined, stale]) {
    for (const n of [4, 6, 8, 10] as const)
      assert.deepEqual(protectionPlan(map, photo, settings({ teeth: n, selectedTeeth: upperTeeth[n] })), { ok: false, reason: map?"stale-map":"no-map" });
    assert.deepEqual(protectionPlan(map, photo, settings({ selectedTeeth: [11], alignment: { arches: "Upper", only: true } })), { ok: false, reason: "alignment" });
    assert.deepEqual(protectionPlan(map, photo, settings({ treatmentMode: "full_arch", fullArch: { arch: "both", restorationType: "zirconia", prostheticGingiva: "auto" } })), { ok: false, reason: "full-arch" });
  }
});

test("single-tooth protection needs clinician review; a sparse map cannot reduce a preset to one tooth", () => {
  const photo = "data:image/jpeg;base64,photo";
  const map = { ...mapFromOutlines(), teeth: mapFromOutlines().teeth.filter(t => t.fdi === 11) };
  assert.deepEqual(protectionPlan(map, photo, settings()), { ok: false, reason: "incomplete-map" });
  assert.deepEqual(protectionPlan({ ...map, confirmedByClinician: false }, photo, settings({ selectedTeeth: [11] })), { ok: false, reason: "unconfirmed" });
  assert.deepEqual(protectionPlan(map, photo, settings({ selectedTeeth: [11] })), { ok: true, teeth: [11], notFound: [] });
});

test("Hide suppresses optional guides as well as the automatic tooth overlay", () => {
  assert.equal(toothOverlayMode({ hasMap: true, editing: false, adding: false, display: "hide", picking: false, guides: { design: true, proportions: true, proportion: "natural" }, selectedMapped: 1 }), "hidden");
});

test("smile design guides and worksheet guides are on by default; an explicit choice is remembered", () => {
  const store = (value: unknown) => ({ getItem: () => (value === undefined ? null : JSON.stringify(value)) });
  assert.deepEqual(readToothMapPrefs(store(undefined)).guides, { design: true, proportions: true, proportion: "natural" });
  assert.deepEqual(readToothMapPrefs(store({ guides: { design: false } })).guides, { design: false, proportions: true, proportion: "natural" });
  assert.equal(readToothMapPrefs(store({ guides: { proportions: false, proportion: "golden" } })).guides.proportions, false);
  assert.equal(readToothMapPrefs({ getItem: () => "not json" }).guides.design, true, "unreadable storage falls back to on");
});
