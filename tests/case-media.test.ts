import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FACE_CAPTURES, SPEECH_LEAD_IN, SPEECH_STEPS, SPEECH_TAIL, readRecord, scanNotes, speechDuration, speechNotes, speechTimeline, trackingLabel,
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

test("one quick face scan: a wide smile showing the teeth, a short sweep each way", () => {
  assert.equal(FACE_CAPTURES.length, 1, "a single scan keeps it quick");
  const [smile] = FACE_CAPTURES;
  assert.equal(smile.id, "smile");
  assert.equal(smile.expression, "smile");
  assert.match(smile.hint, /wide smile, showing the teeth/i, "the teeth are what the lab lines up with the intraoral scan");
  assert.ok(smile.turn >= 30 && smile.turn <= 40 && smile.tilt >= 6 && smile.tilt <= 12, `a short sweep (±${smile.turn}°, ±${smile.tilt}°)`);
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
    captures: [{ id: "rest", title: "Relaxed", mesh: "rest.ply", preview: "rest.jpg", vertices: 91234, triangles: 180000, turned: [68.2, 71], tilted: [26, 24], coverage: 0.95, sensor: "lidar", tracking: { fitMm: 0.9, kept: 0.93, poor: false }, source: "photos" }],
  });
  assert.ok(scan && scan.kind === "scan");
  assert.equal(scan.poster, scan.captures[0].preview, "the first scan's preview stands for the record");
  assert.deepEqual(scan.captures[0].turned, [68.2, 71]);
  assert.deepEqual(scan.captures[0].tilted, [26, 24]);
  assert.equal(scan.captures[0].coverage, 0.95);
  assert.deepEqual(scan.captures[0].tracking, { fitMm: 0.9, kept: 0.93, poor: false });
  assert.equal(trackingLabel(scan.captures[0].tracking), "Steady");
  assert.equal(scan.captures[0].source, "photos");
  assert.equal(scan.captures[0].building, false, "not building unless the app says so");
  const pending = readRecord({ kind: "scan", id: "scan-2", createdAt: "2026", base, captures: [{ id: "rest", title: "Relaxed", mesh: "rest.ply", preview: "rest.jpg", source: "lidar", building: true }] });
  assert.ok(pending && pending.kind === "scan" && pending.captures[0].building, "a rear scan still building its detailed face says so");
  assert.equal(trackingLabel({ kept: 0.5, poor: true }), "Patient moved");
  assert.equal(readRecord({ kind: "scan", id: "s", createdAt: "2026", base, captures: [] }), null, "a scan with no meshes isn't shown");
  const lab = readRecord({ kind: "scan", id: "scan-3", createdAt: "2026", base, intraoral: { file: "upper.stl", fitMm: 0.5, pairs: 4 },
    captures: [{ id: "smile", title: "Smile", mesh: "smile.ply", midlineTilt: 1.5, eyeTilt: -0.6, registeredTo: "rest", sharedFitMm: 0.4, scaleCorrection: 0.97 }] });
  assert.ok(lab && lab.kind === "scan");
  assert.deepEqual(lab.intraoral, { file: "upper.stl", fitMm: 0.5, pairs: 4 });
  assert.equal(lab.captures[0].registeredTo, "rest");
  assert.equal(lab.captures[0].scaleCorrection, 0.97);
  assert.equal(scan.captures[0].scaleCorrection, 1, "no correction unless the device's check found one");
});

test("the lab notes say what each frame checks, how the scan is oriented, and how far to trust it", () => {
  const notes = speechNotes({ createdAt: "2026-10-24T10:00:00Z", duration: 21.4, audio: false, camera: "back",
    steps: speechTimeline().map((t, i) => ({ ...t, title: SPEECH_STEPS[i].title, frame: "" })) }, "SC-104");
  for (const s of SPEECH_STEPS) assert.ok(notes.includes(s.checks), `${s.id} check is in the notes`);
  assert.match(notes, /Case: SC-104/);
  assert.match(notes, /not mirrored/);
  assert.match(notes, /no sound/);
  assert.doesNotMatch(speechNotes({ createdAt: "2026-10-24T10:00:00Z", duration: 20, audio: true, camera: "front", steps: [] }), /Case:/, "no reference, no line for it");

  const scan = scanNotes({ createdAt: "2026-10-24T10:00:00Z", captures: [{ id: "retracted", title: "Teeth showing", mesh: "", preview: "", vertices: 80000, triangles: 1, turned: [50, 52], tilted: [15, 16], coverage: 0.94, source: "photos", building: false, scaleCorrection: 1.031, midlineTilt: -1.24, eyeTilt: 0.8, registeredTo: "rest", sharedFitMm: 0.31 }] });
  assert.match(scan, /millimetres/);
  assert.match(scan, /\+y true vertical \(natural head position/);
  assert.match(scan, /origin at subnasale/);
  assert.doesNotMatch(scan, /one frame/, "a single scan has no shared frame to explain");
  assert.match(scan, /front teeth visible in the smile/);
  const two = scanNotes({ createdAt: "2026", captures: [
    { id: "rest", title: "Relaxed", mesh: "", preview: "", vertices: 1, triangles: 1, turned: [45, 45], tilted: [20, 20], coverage: 0.9, source: "trueDepth", building: false, scaleCorrection: 1 },
    { id: "smile", title: "Smile", mesh: "", preview: "", vertices: 1, triangles: 1, turned: [25, 25], tilted: [8, 8], coverage: 0.9, source: "trueDepth", building: false, scaleCorrection: 1 },
  ] });
  assert.match(two, /one frame/, "older visits with several expressions still explain the shared frame");
  assert.match(scan, /x = 0 is the vertical plane along the facial midline/);
  assert.match(scan, /midline 1\.2° from true vertical/);
  assert.match(scan, /eye line 0\.8° from true horizontal/);
  assert.match(scan, /lined up on the Relaxed scan by the upper face \(0\.31 mm\)/);
  assert.match(scan, /scale corrected ×1\.0310/);
  assert.match(scan, /own symmetry/);
  assert.match(scan, /natural head position/);
  assert.match(scan, /LiDAR/);
  assert.match(scan, /built from photographs/);
  assert.match(scan, /textured OBJ/);
  assert.match(scan, /face mapped 94%/);
  assert.match(scan, /1\.5 mm/);
  assert.match(scan, /0\.4 mm/);
  assert.match(scan, /intraoral scan/);
  const aligned = scanNotes({ createdAt: "2026-10-24T10:00:00Z", captures: [], intraoral: { file: "upper.stl", fitMm: 0.42, pairs: 3 } });
  assert.match(aligned, /Already lined up with the intraoral scan "upper\.stl".*0\.42 mm/);
  assert.match(aligned, /intraoral-frame\.ply/);
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
  assert.match(plugin, /ARWorldTrackingConfiguration/, "face scans use the rear LiDAR scanner");
  assert.match(plugin, /final class HeadTracker/, "frames are lined up with the head, not the room");
  assert.match(plugin, /PhotogrammetrySession/, "the detailed face is built from photographs with Object Capture");
  assert.match(plugin, /VNGeneratePersonSegmentationRequest/, "the patient is cut out from the room");
  assert.match(plugin, /ARFaceTrackingConfiguration/, "the front Face ID sensor");
  assert.match(plugin, /final class BackgroundFaceBuilder/, "rear scans build their detailed face after the scanner closes");
  assert.match(plugin, /enum ViewTexture/, "Face ID scans get photographic skin from the front camera's own photos");
  assert.match(plugin, /enum FaceFinish/, "scans are cleaned and turned onto their own midline before saving");
  assert.match(plugin, /static func finishAll/, "every expression is finished together, in one shared frame");
  assert.match(plugin, /FaceAlign\.upperFace/, "the expressions are lined up by the upper face, not the lips");
  assert.match(plugin, /static func measureCard/, "a bank card checks this device's scale");
  assert.match(plugin, /configurableCaptureDeviceForPrimaryCamera/, "exposure and white balance are held during a scan");
  assert.match(plugin, /AVCaptureEventInteraction/, "the volume buttons start and stop a scan");
  assert.match(plugin, /final class IntraoralAlignViewController/, "the face can be lined up with the intraoral scan in the app");
  assert.match(plugin, /README\.txt/, "the lab gets the frame in plain words");
  assert.match(plugin, /let reachable: Set<Int>/, "coverage counts only the face each pose can reach, so the meter can finish");
});
