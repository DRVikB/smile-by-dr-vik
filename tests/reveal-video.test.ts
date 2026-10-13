import test from "node:test";
import assert from "node:assert/strict";
import { introFrame, pickVideoType, REVEAL, REVEAL_INTRO, REVEAL_INTRO_TOTAL, REVEAL_TOTAL, REVEAL_VIDEO_TOTAL, REVEAL_ZOOM, revealFrame, videoSize } from "../src/lib/revealVideo";

test("the reveal holds their smile, fades the illustration in, then holds it", () => {
  assert.equal(revealFrame(0).mix, 0);
  assert.equal(revealFrame(REVEAL.hold).mix, 0);
  const mid = revealFrame(REVEAL.hold + REVEAL.fade / 2).mix;
  assert.ok(mid > 0.4 && mid < 0.6);
  assert.equal(revealFrame(REVEAL.hold + REVEAL.fade).mix, 1);
  assert.equal(revealFrame(REVEAL_TOTAL).mix, 1);
});

test("the frame eases in towards the mouth and never zooms out", () => {
  let last = 0;
  for (let ms = 0; ms <= REVEAL_TOTAL; ms += 100) {
    const { zoom } = revealFrame(ms);
    assert.ok(zoom >= last);
    last = zoom;
  }
  assert.equal(revealFrame(0).zoom, 1);
  assert.ok(Math.abs(revealFrame(REVEAL_TOTAL).zoom - REVEAL_ZOOM) < 1e-9);
});

test("MP4 is preferred where the browser records it, WebM otherwise", () => {
  assert.equal(pickVideoType((t) => t.startsWith("video/mp4")), "video/mp4;codecs=avc1");
  assert.equal(pickVideoType((t) => t === "video/webm"), "video/webm");
  assert.equal(pickVideoType(() => false), null);
});

test("the video keeps the photo's shape at an even-numbered size", () => {
  assert.deepEqual(videoSize(1122, 1402), { width: 864, height: 1080 });
  const { width, height } = videoSize(2048, 1365);
  assert.equal(width, 1080);
  assert.equal(height % 2, 0);
});

test("the opening draws the guide lines, then the smile, and only then lets the photograph in", () => {
  assert.deepEqual(introFrame(0), { guides: 0, smile: 0, photo: 0 });
  // Guides are complete before the smile is.
  const early = introFrame(REVEAL_INTRO.guides);
  assert.equal(early.guides, 1);
  assert.ok(early.smile > 0 && early.smile < 0.5);
  // The whole mark is drawn, and held, before the photograph starts to show.
  const drawn = introFrame(REVEAL_INTRO.guides + REVEAL_INTRO.smile + REVEAL_INTRO.hold);
  assert.deepEqual(drawn, { guides: 1, smile: 1, photo: 0 });
  assert.equal(introFrame(REVEAL_INTRO_TOTAL).photo, 1);
  // Nothing runs backwards.
  let last = { guides: 0, smile: 0, photo: 0 };
  for (let ms = 0; ms <= REVEAL_INTRO_TOTAL; ms += 50) {
    const f = introFrame(ms);
    assert.ok(f.guides >= last.guides && f.smile >= last.smile && f.photo >= last.photo);
    last = f;
  }
  // The opening adds two seconds; the reveal itself is unchanged.
  assert.equal(REVEAL_INTRO_TOTAL, 2000);
  assert.equal(REVEAL_VIDEO_TOTAL, REVEAL_INTRO_TOTAL + REVEAL_TOTAL);
});
