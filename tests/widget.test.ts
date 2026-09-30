import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHORTCUT_ACTIONS, isShortcutAction } from "../src/native/shortcuts";

const widget = readFileSync(new URL("../ios/App/SmileComposeWidget/SmileComposeWidget.swift", import.meta.url), "utf8");
const scene = readFileSync(new URL("../ios/App/App/SceneDelegate.swift", import.meta.url), "utf8");

test("every widget tap is an action the app and its native bridge both handle", () => {
  const widgetActions = widget.match(/case (new, [^\n]+)/)![1].split(",").map(a => a.trim());
  const nativeActions = [...scene.match(/actions: Set<String> = \[([^\]]+)\]/)![1].matchAll(/"(\w+)"/g)].map(m => m[1]);
  assert.deepEqual([...widgetActions].sort(), [...SHORTCUT_ACTIONS].sort());
  assert.deepEqual([...nativeActions].sort(), [...SHORTCUT_ACTIONS].sort());
  assert.equal(isShortcutAction("library"), true);
  assert.equal(isShortcutAction("delete"), false);
});

test("the widget reads only the clinician's own details from the app, never a patient's", () => {
  const keys = [...widget.matchAll(/forKey: "([\w.]+)"/g)].map(m => m[1]).sort();
  assert.deepEqual(keys, ["widget.allowance", "widget.displayName", "widget.recentCaseAt"]);
  const written = [...scene.matchAll(/forKey: "([\w.]+)"/g)].map(m => m[1]);
  assert.deepEqual([...new Set(written)].sort(), keys);
  assert.doesNotMatch(widget, /patientName|thumb|originalImage/);
});
