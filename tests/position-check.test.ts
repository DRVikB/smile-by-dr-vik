import { test } from "node:test";
import assert from "node:assert/strict";
import { assessToothPositions } from "../src/lib/positionCheck";

// A row of teeth across a dark mouth: bright blocks with a dark gap between each, on a skin background.
const W = 320, H = 120;
function mouth(offset: number, tone: number, widths = [30, 30, 38, 38, 30, 30]) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) px.set([190, 140, 125, 255], i * 4);
  let x = 60 + offset;
  for (const width of widths) {
    for (let y = 40; y < 80; y++) for (let k = 0; k < width - 3; k++) { const i = (y * W + x + k) * 4; px[i] = tone; px[i + 1] = tone - 8; px[i + 2] = tone - 24; }
    for (let y = 40; y < 80; y++) for (let k = width - 3; k < width; k++) { const i = (y * W + x + k) * 4; px[i] = 50; px[i + 1] = 30; px[i + 2] = 30; }
    x += width;
  }
  return px;
}

test("teeth restored in place pass; the same teeth slid sideways are flagged with the size of the shift", () => {
  const before = mouth(0, 200);
  const inPlace = assessToothPositions(before, mouth(0, 245), W, H);
  assert.equal(inPlace?.flag, "ok");
  const slid = assessToothPositions(before, mouth(9, 245), W, H);
  assert.equal(slid?.flag, "moved");
  assert.ok(slid!.shiftRatio > 0.03 && slid!.shiftRatio < 0.06, `shift ${slid!.shiftRatio}`);
  assert.equal(assessToothPositions(before, mouth(-9, 245), W, H)?.flag, "moved");
  assert.ok(assessToothPositions(before, mouth(-9, 245), W, H)!.shiftRatio < 0);
});

test("it stays silent when it cannot tell", () => {
  const before = mouth(0, 200);
  // Nothing changed.
  assert.equal(assessToothPositions(before, before, W, H), null);
  // A tiny nudge within tolerance.
  assert.equal(assessToothPositions(before, mouth(2, 245), W, H)?.flag, "ok");
  // Teeth with no visible gaps in the original (one flat band): no pattern to compare.
  const flat = mouth(0, 200, [196]);
  assert.notEqual(assessToothPositions(flat, mouth(9, 245), W, H)?.flag, "moved");
  // Different sizes.
  assert.equal(assessToothPositions(before, before.slice(0, 100), W, H), null);
});
