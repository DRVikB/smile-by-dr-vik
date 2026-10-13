import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countUpText, guideDraw, GUIDE_DRAW, GUIDE_DRAW_TOTAL, readingArrival, RESULT_REVEAL, RESULT_REVEAL_TOTAL, revealPosition } from "../src/lib/motion";
import { crosses } from "../src/native/haptics";

// The photograph fills a phone: 20% to 80% of it is on screen, the divider rests in the middle.
const span = { from: 80, to: 20, rest: 50 };

test("a new smile starts fully covered, is uncovered completely, then the divider comes to rest", () => {
  assert.equal(revealPosition(0, span), 80, "the original is all that shows while the processing screen clears");
  assert.equal(revealPosition(RESULT_REVEAL.delay - 1, span), 80);
  const end = RESULT_REVEAL.delay + RESULT_REVEAL.sweep;
  assert.equal(revealPosition(end, span), 20, "the divider reaches the far edge of what is on screen");
  assert.equal(revealPosition(end + RESULT_REVEAL.hold - 1, span), 20, "and rests there so the smile can be taken in");
  const last = revealPosition(RESULT_REVEAL_TOTAL - 1, span)!;
  assert.ok(Math.abs(last - 50) < 0.5, "it finishes at its resting place, so nothing jumps when the reveal ends");
  assert.equal(revealPosition(RESULT_REVEAL_TOTAL, span), null);
});

test("the divider only ever travels one way in each half of the reveal", () => {
  let before = 80;
  for (let ms = 0; ms <= RESULT_REVEAL.delay + RESULT_REVEAL.sweep; ms += 16) {
    const at = revealPosition(ms, span)!;
    assert.ok(at <= before + 1e-9, `the sweep never turns back (${ms} ms)`);
    before = at;
  }
  for (let ms = RESULT_REVEAL.delay + RESULT_REVEAL.sweep + RESULT_REVEAL.hold; ms < RESULT_REVEAL_TOTAL; ms += 16) {
    const at = revealPosition(ms, span)!;
    assert.ok(at >= before - 1e-9 && at <= 50 + 1e-9, `the return never overshoots its resting place (${ms} ms)`);
    before = at;
  }
});

test("analysis lines draw one after another and are all finished within the total", () => {
  assert.equal(guideDraw(0, 0), 0);
  assert.equal(guideDraw(GUIDE_DRAW.stagger - 1, 1), 0, "a line has not begun before its turn");
  assert.ok(guideDraw(GUIDE_DRAW.stagger + 100, 1) > 0);
  for (let i = 0; i < GUIDE_DRAW.lines; i++) assert.equal(guideDraw(GUIDE_DRAW_TOTAL, i), 1);
  for (let i = 0; i < 4; i++) assert.equal(readingArrival(GUIDE_DRAW_TOTAL, i), 1, "every reading has arrived by then too");
  assert.equal(guideDraw(Infinity, 4), 1, "with nothing to time, the lines are simply there");
});

test("readings count up to their value and keep their own wording", () => {
  assert.equal(countUpText("3.4°", 0.5), "1.7°");
  assert.equal(countUpText("3.4°", 0), "0.0°");
  assert.equal(countUpText("3.4°", 1), "3.4°");
  assert.equal(countUpText("62% of smile", 0.5), "31% of smile");
  assert.equal(countUpText("2.9% left", 1), "2.9% left");
  assert.equal(countUpText("Centred", 0.3), "Centred", "words are never altered");
});

test("passing the divider's resting place is felt once, from either side", () => {
  assert.ok(crosses(48, 52, 50));
  assert.ok(crosses(52, 48, 50));
  assert.ok(crosses(48, 50, 50), "landing on it counts");
  assert.ok(!crosses(50, 53, 50), "moving away from it does not");
  assert.ok(!crosses(40, 45, 50));
  assert.ok(!crosses(50, 50, 50));
});

test("the app's three haptics are the ones the native bridge plays", () => {
  const swift = readFileSync("ios/App/App/SmileComposeBridgeViewController.swift", "utf8");
  assert.match(swift, /registerPluginInstance\(HapticsPlugin\(\)\)/);
  assert.match(swift, /jsName = "SmileHaptics"/);
  const source = readFileSync("src/native/haptics.ts", "utf8");
  const kinds = /export type Haptic = ([^;]+);/.exec(source)![1].match(/"(\w+)"/g)!.map(k => k.slice(1, -1));
  assert.deepEqual(kinds, ["ready", "tick", "select"]);
  for (const kind of kinds) assert.match(swift, new RegExp(`case "${kind}":`), `${kind} is handled natively`);
});
