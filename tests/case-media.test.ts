import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FACE_CAPTURES, SPEECH_LEAD_IN, SPEECH_STEPS, SPEECH_TAIL, readRecord, scanNotes, speechDuration, speechNotes, speechTimeline,
} from "../src/lib/caseMedia";
import { cubeEdges } from "../src/components/photoSet/mediaArt";

test("the speech script runs each sound once, back to back, with its frame inside the step", () => {
  assert.equal(new Set(SPEECH_STEPS.map(s => s.id)).size, SPEECH_STEPS.length);
  assert.deepEqual(SPEECH_STEPS.map(s => s.id), ["rest", "f", "s", "e", "smile"], "rest first, the laugh last");
  const timeline = speechTimeline();
  assert.equal(timeline[0].start, SPEECH_LEAD_IN, "a moment before the first prompt so it isn't cut off");
  timeline.forEach((t, i) => {
    if (i) assert.equal(t.start, timeline[i - 1].end, "no gap between steps");
    assert.ok(t.frameTime > t.start && t.frameTime < t.end, `${t.id}: its still frame is taken during the step`);
  });
  assert.equal(speechDuration(), timeline.at(-1)!.end + SPEECH_TAIL);
  assert.ok(speechDuration() < 25, "short enough for a patient to do in one go");
  for (const s of SPEECH_STEPS) assert.ok(s.checks.length > 20 && s.prompt.length > 5, `${s.id} tells the patient what to say and the lab what to check`);
});

test("the face scans turn far enough to see the face, and one shows the teeth for lining up with the intraoral scan", () => {
  assert.equal(new Set(FACE_CAPTURES.map(c => c.id)).size, FACE_CAPTURES.length);
  for (const c of FACE_CAPTURES) assert.ok(c.turn >= 30 && c.turn <= 70, `${c.id} turns ${c.turn}°`);
  assert.ok(FACE_CAPTURES.some(c => c.id === "retracted" && /retractor/i.test(c.hint)));
  assert.equal(FACE_CAPTURES[0].expression, "rest", "the relaxed face comes first");
});

test("records from the iOS app become file URLs under their folder; anything malformed is dropped", () => {
  const base = "capacitor://localhost/_capacitor_file_/var/mobile/Application%20Support/case-media/c1/speech-1";
  const speech = readRecord({
    kind: "speech", id: "speech-1", createdAt: "2026-10-24T10:00:00Z", duration: 21.4, audio: true, camera: "front", base,
    video: "speech.mov", poster: "frame-smile-19000.jpg",
    steps: [{ id: "f", title: "F and V", start: 4.6, end: 8.6, frameTime: 5.8, frame: "frame-f-5800.jpg" }, { id: "nope", start: 1, end: 2, frameTime: 1.5 }],
  });
  assert.ok(speech && speech.kind === "speech");
  assert.equal(speech.video, `${base}/speech.mov`);
  assert.equal(speech.steps.length, 1, "unknown steps are left out");
  assert.equal(speech.steps[0].frame, `${base}/frame-f-5800.jpg`);
  assert.equal(readRecord({ kind: "speech", id: "x", createdAt: "2026", base, video: "../secret.mov", steps: [] }), null, "a name can't reach outside its folder");
  assert.equal(readRecord({ kind: "speech", id: "x", createdAt: "2026", video: "speech.mov", steps: [] }), null, "no folder, no record");

  const scan = readRecord({
    kind: "scan", id: "scan-1", createdAt: "2026-10-24T10:00:00Z", base: base.replace("speech-1", "scan-1"), poster: "",
    captures: [{ id: "rest", title: "Relaxed", mesh: "rest.ply", preview: "rest.jpg", vertices: 91234, triangles: 180000, turned: [58.2, 61] }],
  });
  assert.ok(scan && scan.kind === "scan");
  assert.equal(scan.poster, scan.captures[0].preview, "the first scan's preview stands for the record");
  assert.deepEqual(scan.captures[0].turned, [58.2, 61]);
  assert.equal(readRecord({ kind: "scan", id: "s", createdAt: "2026", base, captures: [] }), null, "a scan with no meshes isn't shown");
});

test("the lab notes say what each frame checks, how the scan is oriented, and how far to trust it", () => {
  const notes = speechNotes({ createdAt: "2026-10-24T10:00:00Z", duration: 21.4, audio: false, camera: "back",
    steps: speechTimeline().map((t, i) => ({ ...t, title: SPEECH_STEPS[i].title, frame: "" })) }, "SC-104");
  for (const s of SPEECH_STEPS) assert.ok(notes.includes(s.checks), `${s.id} check is in the notes`);
  assert.match(notes, /Case: SC-104/);
  assert.match(notes, /not mirrored/);
  assert.match(notes, /no sound/);
  assert.doesNotMatch(speechNotes({ createdAt: "2026-10-24T10:00:00Z", duration: 20, audio: true, camera: "front", steps: [] }), /Case:/, "no reference, no line for it");

  const scan = scanNotes({ createdAt: "2026-10-24T10:00:00Z", captures: [{ id: "retracted", title: "Teeth showing", mesh: "", preview: "", vertices: 80000, triangles: 1, turned: [30, 31] }] });
  assert.match(scan, /millimetres/);
  assert.match(scan, /x towards the patient's left, y up, z out through the face/);
  assert.match(scan, /plane x = 0/);
  assert.match(scan, /0\.4–1 mm/);
  assert.match(scan, /intraoral scan/);
});

test("the turning cube shows three faces and comes to rest on the owner's drawing", () => {
  const edges = (d: string) => d.split("M").filter(Boolean);
  for (const yaw of [0.3, 1.1, 2.2, 3.9, 5.1]) assert.equal(edges(cubeEdges(yaw)).length, 9, `three faces (nine edges) show at ${yaw.toFixed(1)} rad`);
  const points = cubeEdges(Math.PI / 4).match(/-?\d+(\.\d+)?/g)!.map(Number);
  const near = (x: number, y: number, within: number) => points.some((v, i) => i % 2 === 0 && Math.abs(v - x) <= within && Math.abs(points[i + 1] - y) <= within);
  // The drawing's corners: the top diamond (254 146, 356 199, 254 259, 152 199) and the front bottom (254 374).
  for (const [x, y] of [[254, 146], [356, 199], [254, 259], [152, 199]]) assert.ok(near(x, y, 4.5), `a corner at ${x} ${y}`);
  assert.ok(near(254, 374, 6), "the front bottom corner");
});

test("the iOS app records and scans in its own plugin, with a reason for the microphone", () => {
  const swift = readFileSync(new URL("../ios/App/App/SmileComposeBridgeViewController.swift", import.meta.url), "utf8");
  assert.match(swift, /registerPluginInstance\(CaseMediaPlugin\(\)\)/);
  const project = readFileSync(new URL("../ios/App/SmileCompose.xcodeproj/project.pbxproj", import.meta.url), "utf8");
  assert.match(project, /CaseMediaPlugin\.swift in Sources/);
  const plist = readFileSync(new URL("../ios/App/App/Info.plist", import.meta.url), "utf8");
  assert.match(plist, /NSMicrophoneUsageDescription<\/key>\s*<string>[^<]*speech video/);
  const plugin = readFileSync(new URL("../ios/App/App/CaseMediaPlugin.swift", import.meta.url), "utf8");
  assert.match(plugin, /applicationSupportDirectory/, "files stay in the app's private storage");
  assert.match(plugin, /isVideoMirrored = false/, "the recording is not mirrored");
});
