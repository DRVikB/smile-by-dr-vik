/**
 * The speech video and the 3D face scan: two extra records for a case's photo set, for the lab designing the
 * smile. Both are admin-only previews for now. Their files stay on this device (the iOS app's private storage);
 * they are not synced, and leave the device only when the clinician shares them.
 *
 * Why these steps: labs check a smile design against how the lips move in speech. Video shows tooth and gum
 * display that posed photos miss, and each sound below tests one part of the design. The phonetic checks are
 * long-standing clinical practice rather than trial evidence, so they guide the lab's review, not replace it.
 */

export type SpeechStepId = "rest" | "f" | "s" | "e" | "smile";

export interface SpeechStep {
  id: SpeechStepId;
  /** Shown on the step's frame and in the lab notes. */
  title: string;
  /** What the patient says or does, shown large on the camera. */
  prompt: string;
  seconds: number;
  /** Where in the step its still frame is taken (0–1); the clinician can move it afterwards. */
  frameAt: number;
  /** What the lab checks on this frame. */
  checks: string;
}

export const SPEECH_STEPS: readonly SpeechStep[] = [
  { id: "rest", title: "Lips at rest", prompt: "Say “Emma”, then let the lips rest", seconds: 4, frameAt: 0.85,
    checks: "How much of the upper front teeth shows with the lips relaxed" },
  { id: "f", title: "F and V", prompt: "Say “fifty-five, fifty-five”", seconds: 4, frameAt: 0.3,
    checks: "The upper edges should lightly touch the inner wet line of the lower lip: length and forward position of the front teeth" },
  { id: "s", title: "S", prompt: "Say “sixty-six, Mississippi”", seconds: 4.5, frameAt: 0.35,
    checks: "The closest gap between the teeth while speaking: bite height and the lower front teeth" },
  { id: "e", title: "E", prompt: "Say “eeee” and hold it", seconds: 3, frameAt: 0.6,
    checks: "How much of the space between the lips the teeth fill: length and smile width" },
  { id: "smile", title: "Smile and laugh", prompt: "A big natural smile, then laugh", seconds: 4.5, frameAt: 0.45,
    checks: "Natural gum display, smile arc, the corners of the mouth and which side lifts more" },
];

/** A moment before the first prompt and after the last, so neither is cut off. */
export const SPEECH_LEAD_IN = 0.6, SPEECH_TAIL = 0.6;

export const speechDuration = (steps: readonly SpeechStep[] = SPEECH_STEPS) =>
  SPEECH_LEAD_IN + steps.reduce((sum, s) => sum + s.seconds, 0) + SPEECH_TAIL;

/** Each step's window in the recording, in seconds from its start. */
export function speechTimeline(steps: readonly SpeechStep[] = SPEECH_STEPS): { id: SpeechStepId; start: number; end: number; frameTime: number }[] {
  let t = SPEECH_LEAD_IN;
  return steps.map(s => { const start = t; t += s.seconds; return { id: s.id, start, end: t, frameTime: start + s.seconds * s.frameAt }; });
}

export type FaceCaptureId = "rest" | "smile" | "retracted";

export interface FaceCapture {
  id: FaceCaptureId;
  title: string;
  /** What the patient does, shown before and during the scan. */
  hint: string;
  /** How far round each side, and how far above and below, the phone goes, in degrees. */
  turn: number;
  tilt: number;
  /** The expression held while the phone moves round. */
  expression: "rest" | "smile" | "any";
}

/**
 * Made with the rear LiDAR scanner: the patient keeps still and the clinician moves the phone round to the patient's
 * right and left, above and below, until the whole face is mapped. Relaxed and smiling scans give the lab the face
 * around the design; the scan with retractors shows the front teeth, which the lab matches to the intraoral scan.
 */
export const FACE_CAPTURES: readonly FaceCapture[] = [
  { id: "rest", title: "Relaxed", hint: "Lips together and relaxed", turn: 70, tilt: 25, expression: "rest" },
  { id: "smile", title: "Smile", hint: "A natural smile, held still", turn: 60, tilt: 20, expression: "smile" },
  { id: "retracted", title: "Teeth showing", hint: "Retractors in, teeth together", turn: 50, tilt: 15, expression: "any" },
];

/* ---------- records, as the iOS app lists them ---------- */

export interface SpeechRecord {
  kind: "speech";
  id: string;
  createdAt: string;
  /** Seconds. */
  duration: number;
  audio: boolean;
  camera: "front" | "back";
  video: string;
  poster: string;
  steps: { id: SpeechStepId; title: string; start: number; end: number; frameTime: number; frame: string }[];
}

export interface FaceScanRecord {
  kind: "scan";
  id: string;
  createdAt: string;
  poster: string;
  captures: {
    id: FaceCaptureId; title: string; mesh: string; preview: string; vertices: number; triangles: number;
    /** Degrees seen round the patient's right and left, and above and below; share of the face mapped (0–1). */
    turned: [number, number]; tilted: [number, number]; coverage: number;
  }[];
}

export type CaseMediaRecord = SpeechRecord | FaceScanRecord;

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** File names in the native record joined to its folder's URL; anything malformed is dropped. */
export function readRecord(raw: unknown): CaseMediaRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>, base = isText(r.base) ? r.base.replace(/\/+$/, "") : "";
  const url = (name: unknown) => (isText(name) && base && !name.includes("/") ? `${base}/${encodeURIComponent(name)}` : "");
  if (!isText(r.id) || !isText(r.createdAt) || !base) return null;
  if (r.kind === "speech") {
    const steps = (Array.isArray(r.steps) ? r.steps : []).flatMap(s => {
      const step = s as Record<string, unknown>;
      return SPEECH_STEPS.some(x => x.id === step.id) && isNum(step.start) && isNum(step.end) && isNum(step.frameTime)
        ? [{ id: step.id as SpeechStepId, title: isText(step.title) ? step.title : "", start: step.start, end: step.end, frameTime: step.frameTime, frame: url(step.frame) }] : [];
    });
    const video = url(r.video);
    if (!video) return null;
    return { kind: "speech", id: r.id, createdAt: r.createdAt, duration: isNum(r.duration) ? r.duration : 0, audio: r.audio === true,
      camera: r.camera === "back" ? "back" : "front", video, poster: url(r.poster) || steps.at(-1)?.frame || "", steps };
  }
  if (r.kind === "scan") {
    const captures = (Array.isArray(r.captures) ? r.captures : []).flatMap(c => {
      const cap = c as Record<string, unknown>, turned = Array.isArray(cap.turned) ? cap.turned : [], tilted = Array.isArray(cap.tilted) ? cap.tilted : [];
      return FACE_CAPTURES.some(x => x.id === cap.id) && url(cap.mesh)
        ? [{ id: cap.id as FaceCaptureId, title: isText(cap.title) ? cap.title : "", mesh: url(cap.mesh), preview: url(cap.preview),
          vertices: isNum(cap.vertices) ? cap.vertices : 0, triangles: isNum(cap.triangles) ? cap.triangles : 0,
          turned: [isNum(turned[0]) ? turned[0] : 0, isNum(turned[1]) ? turned[1] : 0] as [number, number],
          tilted: [isNum(tilted[0]) ? tilted[0] : 0, isNum(tilted[1]) ? tilted[1] : 0] as [number, number],
          coverage: isNum(cap.coverage) ? cap.coverage : 0 }] : [];
    });
    if (!captures.length) return null;
    return { kind: "scan", id: r.id, createdAt: r.createdAt, poster: url(r.poster) || captures[0].preview, captures };
  }
  return null;
}

/* ---------- notes for the lab, shared with the files ---------- */

const seconds = (t: number) => `${t.toFixed(1)} s`;
const day = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

export function speechNotes(record: Pick<SpeechRecord, "createdAt" | "duration" | "audio" | "camera" | "steps">, reference?: string): string {
  const lines = [
    "SmileCompose · speech video",
    reference ? `Case: ${reference}` : "",
    `Recorded: ${day(record.createdAt)} · ${seconds(record.duration)} · ${record.camera === "front" ? "front" : "back"} camera${record.audio ? ", with sound" : ", no sound"}`,
    "The video is not mirrored: the patient's right is on the left of the picture.",
    "",
    "Steps (time in the video) and what each frame checks:",
  ];
  record.steps.forEach((s, i) => {
    const step = SPEECH_STEPS.find(x => x.id === s.id);
    lines.push(`${i + 1}. ${s.title || step?.title} · ${seconds(s.start)}–${seconds(s.end)} · frame at ${seconds(s.frameTime)}`, `   ${step?.checks ?? ""}`);
  });
  lines.push("", "The phonetic checks are established clinical practice, not trial-tested measurements: use them with the photographs and the clinical examination.");
  return lines.filter((l, i) => l !== "" || i > 1).join("\n");
}

export function scanNotes(record: Pick<FaceScanRecord, "createdAt" | "captures">, reference?: string): string {
  const lines = [
    "SmileCompose · 3D face scan",
    reference ? `Case: ${reference}` : "",
    `Scanned: ${day(record.createdAt)} with the iPhone's rear LiDAR scanner, moving round the patient while they kept still.`,
    "",
    "Files: one coloured mesh per scan (PLY, millimetres), its preview, and landmarks.json.",
    "Axes: origin at the centre of the head; x towards the patient's left, y up (true vertical), z out through the face.",
    "The facial midline is the plane x = 0; landmarks.json has the centre of each eye where they were found.",
    "",
  ];
  record.captures.forEach(c => {
    const cap = FACE_CAPTURES.find(x => x.id === c.id);
    lines.push(`· ${c.title || cap?.title}: ${cap?.hint ?? ""} · face mapped ${Math.round(c.coverage * 100)}% · seen ${Math.round(c.turned[0])}° round the patient's right, ${Math.round(c.turned[1])}° round the left, ${Math.round(c.tilted[0])}° above, ${Math.round(c.tilted[1])}° below · ${c.vertices.toLocaleString("en-GB")} points`);
  });
  lines.push(
    "",
    "Line the face up with the intraoral scan on the front teeth in the \"Teeth showing\" scan.",
    "Accuracy: a study of iPhone LiDAR face scans found about 1.5 mm average difference from a clinical 3D camera system. Use it for facial proportions and planes, not for fine measurements around the lips.",
  );
  return lines.filter((l, i) => l !== "" || i > 1).join("\n");
}
