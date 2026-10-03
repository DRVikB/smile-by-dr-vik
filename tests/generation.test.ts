import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultSettings, upperTeeth } from "../src/lib/types";
import { generationSchema, settingsSchema } from "../src/lib/generation/schema";
import { buildSmileInstruction } from "../src/lib/generation/prompt";
import {
  generateSmile,
  MockSmileProvider,
} from "../src/lib/generation/provider";
import { POST } from "../src/app/api/generate-smile/route";
process.env.SMILE_PROVIDER = "mock";
const image = `data:image/jpeg;base64,${readFileSync("public/sample-smile.jpg").toString("base64")}`;
const input = { originalImage: image, settings: defaultSettings };
test("mock preserves the exact patient image and generates a new variation identity", async () => {
  const provider = new MockSmileProvider();
  const first = await generateSmile(input, undefined, provider);
  const second = await generateSmile(input, undefined, provider);
  assert.equal(first.image, image);
  assert.equal(first.mode, "mock");
  assert.notEqual(first.variationId, second.variationId);
});
test("all four tooth choices have valid symmetric FDI selections", () => {
  for (const teeth of [4, 6, 8, 10] as const)
    assert.equal(
      generationSchema.safeParse({
        ...input,
        settings: {
          ...defaultSettings,
          teeth,
          selectedTeeth: upperTeeth[teeth],
        },
      }).success,
      true,
    );
});
test("rejects mismatched tooth sets, out-of-range intensity, unsupported shade and non-image payloads", () => {
  for (const settings of [
    { ...defaultSettings, selectedTeeth: [11, 12, 13, 14] },
    { ...defaultSettings, intensity: 101 },
    { ...defaultSettings, targetShade: "A4" },
    { ...defaultSettings, texture: "Glossy" },
    { ...defaultSettings, shotType: "Macro" },
  ])
    assert.equal(
      generationSchema.safeParse({ ...input, settings }).success,
      false,
    );
  assert.equal(
    generationSchema.safeParse({
      ...input,
      originalImage: "https://example.com/photo.jpg",
    }).success,
    false,
  );
  assert.equal(
    generationSchema.safeParse({
      ...input,
      originalImage: "data:image/jpeg;base64,aGVsbG8=",
    }).success,
    false,
  );
});
test("instruction includes the selected anatomy and preservation boundaries", () => {
  const prompt = buildSmileInstruction(defaultSettings);
  for (const phrase of [
    "14, 13, 12, 11, 21, 22, 23, 24",
    "untreated teeth",
    "facial identity",
    "Do not edit the gingiva",
    "35/100",
    defaultSettings.treatment,
    "Gently whiten",
  ])
    assert.ok(prompt.includes(phrase));
});

test("original tooth exposure wins over material, alignment and full-arch choices", () => {
  for (const settings of [
    defaultSettings,
    { ...defaultSettings, treatment: "Porcelain" as const },
    { ...defaultSettings, alignment: { arches: "Both" as const } },
    { ...defaultSettings, treatmentMode: "full_arch" as const, fullArch: { arch: "both" as const, restorationType: "zirconia" as const, prostheticGingiva: "auto" as const } },
  ]) {
    const prompt = buildSmileInstruction(settings);
    assert.match(prompt, /If only upper teeth are visible, keep the lower teeth hidden/);
    assert.match(prompt, /do not reveal more of them/);
    assert.match(prompt, /never authorises revealing concealed teeth/);
  }
});
test("API supports mock generation and does not cache patient photos", async () => {
  const response = await POST(
    new Request("http://localhost/api/generate-smile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify(input),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).image, image);
});
test("API rejects cross-origin submissions and invalid requests", async () => {
  for (const [headers, body, status] of [
    [
      { "Content-Type": "application/json", Origin: "https://other.test" },
      JSON.stringify(input),
      403,
    ],
    [{ "Content-Type": "application/json" }, "{broken", 400],
    [{ "Content-Type": "text/plain" }, "hello", 415],
    [
      { "Content-Type": "application/json" },
      JSON.stringify({
        ...input,
        settings: { ...defaultSettings, intensity: -10 },
      }),
      400,
    ],
  ] as const) {
    const response = await POST(
      new Request("http://localhost/api/generate-smile", {
        method: "POST",
        headers,
        body,
      }),
    );
    assert.equal(response.status, status);
  }
});

test("API accepts the browser Host when Next uses an internal bind address", async () => {
  const response = await POST(
    new Request("http://0.0.0.0:3006/api/generate-smile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3006",
        Host: "localhost:3006",
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify(input),
    }),
  );
  assert.equal(response.status, 200);
});

test("instruction adapts to whitening, texture and close-up choices", () => {
  const bleached = buildSmileInstruction({
    ...defaultSettings,
    targetShade: "BL1",
  });
  assert.ok(bleached.includes("BL1"));
  const textured = buildSmileInstruction({ ...defaultSettings, texture: "Textured" });
  assert.ok(textured.includes("secondary anatomy"));
  assert.ok(textured.includes("incisal"));
  const closeup = buildSmileInstruction({ ...defaultSettings, shotType: "Close-up" });
  assert.ok(closeup.includes("close-up"));
  assert.ok(closeup.includes("facial identity"), "close-up still preserves any visible identity");
});

test("instruction includes clinician notes and reference guidance", () => {
  const noted = buildSmileInstruction({
    ...defaultSettings,
    notes: "close the black triangles",
  });
  assert.ok(noted.includes("close the black triangles"));
  assert.ok(noted.includes("Clinician design notes"));
  const ref = buildSmileInstruction(defaultSettings, true);
  assert.ok(ref.includes("smile the patient likes"));
  assert.ok(ref.includes("do not copy the reference person's identity"));
  const plainRef = buildSmileInstruction(defaultSettings);
  assert.ok(!plainRef.includes("smile the patient likes"));
  assert.ok(!plainRef.includes("reference person"));
});

test("simple shade choices give distinct generation instructions", () => {
  const same = buildSmileInstruction({ ...defaultSettings, targetShade: "The same", intensity: 100 });
  assert.match(same, /No intentional shade change from the source appearance/);
  assert.match(same, /Do not whiten or brighten/);
  assert.match(buildSmileInstruction({ ...defaultSettings, targetShade: "Whiten" }), /Gently whiten/);
  assert.match(buildSmileInstruction({ ...defaultSettings, targetShade: "Bleach" }), /brighter bleached-white/);
  for (const targetShade of ["The same", "Whiten", "Bleach"]) {
    assert.equal(settingsSchema.safeParse({ ...defaultSettings, targetShade }).success, true);
  }
});

test("the instruction always demands a like-for-like frame, and names the guide region when one was captured", () => {
  const plain = buildSmileInstruction(defaultSettings);
  assert.ok(plain.includes("original aspect ratio, framing, scale, rotation and crop"));
  assert.ok(plain.includes("Do not zoom"));
  assert.ok(!plain.includes("on-screen guide"));
  const framed = buildSmileInstruction(defaultSettings, false, {
    x: 0.3,
    y: 0.56,
    width: 0.4,
    height: 0.16,
  });
  assert.ok(framed.includes("on-screen guide"));
  for (const edge of ["30%", "70%", "56%", "72%"]) assert.ok(framed.includes(edge));
});

test("a capture region locates the teeth but is never a target size", () => {
  const framed = buildSmileInstruction(defaultSettings, false, {
    x: 0.3,
    y: 0.56,
    width: 0.4,
    height: 0.16,
  });
  assert.match(framed, /not a target size/);
  assert.match(framed, /never stretch, enlarge or shrink/);
});

test("the instruction asks for a seamless blend, consistent shadows, natural asymmetry and no colour-cast shift", () => {
  const prompt = buildSmileInstruction(defaultSettings);
  for (const rule of [
    "no visible seam",
    "shadow the upper lip casts",
    "naturally asymmetric",
    "white balance",
  ])
    assert.ok(prompt.includes(rule), `missing: ${rule}`);
});

test("a capture framing region must be fractions of the frame", () => {
  assert.equal(
    generationSchema.safeParse({
      ...input,
      framing: { x: 0.3, y: 0.56, width: 0.4, height: 0.16 },
    }).success,
    true,
  );
  for (const framing of [
    { x: -0.1, y: 0.5, width: 0.4, height: 0.2 },
    { x: 0.3, y: 0.5, width: 1.4, height: 0.2 },
    { x: 0.3, y: 0.5, width: 0.4 },
    { x: 0.8, y: 0.5, width: 0.4, height: 0.2 },
    { x: 0.3, y: 0.9, width: 0.4, height: 0.2 },
    { x: 0, y: 0, width: 0, height: 1 },
    { x: 0, y: 0, width: 1, height: 0 },
  ])
    assert.equal(
      generationSchema.safeParse({ ...input, framing }).success,
      false,
    );
});

test("source bounds must describe a nonempty region inside the supplied canvas", () => {
  assert.equal(generationSchema.safeParse({ ...input, sourceBounds: { x: 0.1, y: 0, width: 0.9, height: 1 } }).success, true);
  for (const sourceBounds of [{ x: 0.1, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 0 }])
    assert.equal(generationSchema.safeParse({ ...input, sourceBounds }).success, false);
});

test("the clinician's own cases are described as a style source, not as the patient", () => {
  const none = buildSmileInstruction(defaultSettings, false, undefined, 0);
  assert.ok(!none.includes("finished case"));
  assert.ok(!none.includes("Image order"));

  const three = buildSmileInstruction(defaultSettings, false, undefined, 3);
  assert.match(three, /the first image is the SOURCE PATIENT to edit/);
  assert.match(three, /next 3 images are finished cases/);
  assert.match(three, /Edit only the first image/);
  // Style only: contour, texture, layering — never the other patients' arrangement.
  for (const rule of [
    "proportions",
    "texture",
    "shape character",
    "explicit shade",
    "never copy identity, gums or tooth arrangements",
    "selected region",
  ])
    assert.ok(three.includes(rule), `missing: ${rule}`);
  assert.match(three, /never copy identity, gums or tooth arrangements/);

  // Singular reads as singular.
  const one = buildSmileInstruction(defaultSettings, false, undefined, 1);
  assert.match(one, /next image is a finished case/);
  assert.ok(!one.includes("images are finished cases"));

  // Out-of-range counts are clamped, never rendered literally.
  assert.match(buildSmileInstruction(defaultSettings, false, undefined, 99), /following 5 images|next 5 images/);
  assert.ok(!buildSmileInstruction(defaultSettings, false, undefined, -2).includes("Image order"));
});

test("a patient's reference smile and the clinician's cases are told apart", () => {
  const both = buildSmileInstruction(defaultSettings, true, undefined, 2);
  assert.match(both, /next image is a smile the patient likes/);
  assert.match(both, /following 2 images are finished cases/);
  assert.match(both, /do not copy the reference person's identity/);
  // Order must place the patient reference before the clinician's cases.
  assert.ok(both.indexOf("smile the patient likes") < both.indexOf("finished cases"));
});

test("generation accepts at most three style references, and caps their size", () => {
  const base = {
    originalImage: image,
    settings: defaultSettings,
  };
  assert.equal(generationSchema.safeParse({ ...base, styleReferences: [image] }).success, true);
  assert.equal(generationSchema.safeParse({ ...base, styleReferences: Array(3).fill(image) }).success, true);
  assert.equal(generationSchema.safeParse({ ...base, styleReferences: Array(4).fill(image) }).success, false);
  assert.equal(generationSchema.safeParse({ ...base, styleReferences: ["not-an-image"] }).success, false);
  const huge = `data:image/png;base64,${"iVBORw0KGgo"}${"A".repeat(2_300_000)}`;
  assert.equal(generationSchema.safeParse({ ...base, styleReferences: [huge] }).success, false);
});
