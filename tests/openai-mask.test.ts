import test from "node:test";
import assert from "node:assert/strict";

test("provider alpha conversion inverts existing edit permission without expanding it", async () => {
  const module = await import("../src/lib/generation/openaiEditInput").catch(() => null);
  assert.ok(module, "OpenAI mask compatibility conversion is required");
  const rgba = new Uint8ClampedArray([255,255,255,0, 0,0,0,255, 128,128,128,128]);
  assert.deepEqual([...module.openAIAlphaMask(rgba, "alpha")], [0,0,0,255, 0,0,0,0, 0,0,0,127]);
  assert.deepEqual([...module.openAIAlphaMask(rgba, "grayscale")], [0,0,0,0, 0,0,0,255, 0,0,0,127]);
  assert.deepEqual([...rgba], [255,255,255,0, 0,0,0,255, 128,128,128,128]);
  assert.throws(() => module.openAIAlphaMask(new Uint8ClampedArray(3), "alpha"), /dimensions/);
});
