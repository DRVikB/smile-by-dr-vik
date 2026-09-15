import test from "node:test";
import assert from "node:assert/strict";
import { currentFullscreen, enterFullscreen, leaveFullscreen, type FullscreenDocument, type FullscreenElement } from "../src/lib/fullscreen";

test("native fullscreen enters and exits using the owning object", async () => {
  let entered = false;
  const element = { async requestFullscreen() { assert.equal(this, element); entered = true; } } as FullscreenElement;
  assert.equal(await enterFullscreen(element), true);
  assert.equal(entered, true);
  let exited = false;
  const doc = { fullscreenElement: element, async exitFullscreen() { assert.equal(this, doc); exited = true; } } as FullscreenDocument;
  assert.equal(currentFullscreen(doc), element);
  await leaveFullscreen(doc);
  assert.equal(exited, true);
});
test("older WebKit fullscreen is supported", async () => {
  let entered = false, exited = false;
  const element = { webkitRequestFullscreen() { entered = true; } } as FullscreenElement;
  const doc = { webkitFullscreenElement: element, webkitExitFullscreen() { exited = true; } } as FullscreenDocument;
  assert.equal(await enterFullscreen(element), true);
  assert.equal(currentFullscreen(doc), element);
  await leaveFullscreen(doc);
  assert.equal(entered && exited, true);
});
test("unsupported and denied fullscreen both allow the expanded-view fallback", async () => {
  assert.equal(await enterFullscreen({} as FullscreenElement), false);
  assert.equal(await enterFullscreen({ requestFullscreen: async () => { throw new Error("Denied by browser"); } } as FullscreenElement), false);
  assert.equal(currentFullscreen({} as FullscreenDocument), null);
});
