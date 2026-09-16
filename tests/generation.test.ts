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
    "Composite",
    "Gently whiten",
  ])
    assert.ok(prompt.includes(phrase));
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
  assert.ok(!closeup.includes("facial identity"));
});

test("instruction includes clinician notes and reference guidance", () => {
  const noted = buildSmileInstruction({
    ...defaultSettings,
    notes: "close the black triangles",
  });
  assert.ok(noted.includes("close the black triangles"));
  assert.ok(noted.includes("clinician instruction"));
  const ref = buildSmileInstruction(defaultSettings, true);
  assert.ok(ref.includes("reference image"));
  assert.ok(!buildSmileInstruction(defaultSettings).includes("reference image"));
});

test("simple shade choices give distinct generation instructions", () => {
  const same = buildSmileInstruction({ ...defaultSettings, targetShade: "The same", intensity: 100 });
  assert.match(same, /Preserve the original tooth colour and shade exactly/);
  assert.match(same, /Do not whiten or brighten/);
  assert.match(buildSmileInstruction({ ...defaultSettings, targetShade: "Whiten" }), /Gently whiten/);
  assert.match(buildSmileInstruction({ ...defaultSettings, targetShade: "Bleach" }), /noticeably brighter bleached-white/);
  for (const targetShade of ["The same", "Whiten", "Bleach"]) {
    assert.equal(settingsSchema.safeParse({ ...defaultSettings, targetShade }).success, true);
  }
});

test("the instruction always demands a like-for-like frame, and names the guide region when one was captured", () => {
  const plain = buildSmileInstruction(defaultSettings);
  assert.ok(plain.includes("same pixel dimensions"));
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
  ])
    assert.equal(
      generationSchema.safeParse({ ...input, framing }).success,
      false,
    );
});
