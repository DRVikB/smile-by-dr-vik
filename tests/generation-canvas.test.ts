import test from "node:test";
import assert from "node:assert/strict";
import { frameWithinCanvas, generationCanvas, nearestAspectRatio } from "../src/lib/generationCanvas";

test("arbitrary patient crops fit a supported request canvas without losing source content", () => {
  for (const [width, height] of [[1100, 1700], [1730, 1100], [900, 2000], [2048, 683], [683, 2048], [1199, 1198], [2000, 200], [200, 2000]]) {
    const layout = generationCanvas(width, height);
    const b = layout.sourceBounds;
    const [rw, rh] = nearestAspectRatio(width, height).split(":").map(Number);
    assert.ok(Math.abs(layout.width / layout.height / (rw / rh) - 1) < 0.002);
    assert.ok(Math.max(layout.width, layout.height) <= 2048);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 1 && b.y + b.height <= 1);
    assert.ok(Math.abs((b.width * layout.width) / (b.height * layout.height) / (width / height) - 1) < 0.002);
    const frame = { x: 0.25, y: 0.6, width: 0.5, height: 0.15 };
    const padded = frameWithinCanvas(frame, b);
    assert.ok(Math.abs((padded.x - b.x) / b.width - frame.x) < 1e-9);
    assert.ok(Math.abs((padded.y - b.y) / b.height - frame.y) < 1e-9);
    assert.ok(Math.abs(padded.width / b.width - frame.width) < 1e-9);
    assert.ok(Math.abs(padded.height / b.height - frame.height) < 1e-9);
  }
});

test("standard camera sizes need no borders; invalid dimensions fail before a paid request", () => {
  assert.deepEqual(generationCanvas(1200, 1600), { width: 1200, height: 1600, sourceBounds: { x: 0, y: 0, width: 1, height: 1 } });
  for (const [w, h] of [[0, 1000], [1000, -1], [Infinity, 1000], [NaN, 1000]])
    assert.throws(() => generationCanvas(w, h), /positive pixel dimensions/);
});
