import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./platform";
import { readRecord, speechTimeline, SPEECH_STEPS, SPEECH_TAIL, FACE_CAPTURES, type CaseMediaRecord, type FaceScanRecord, type SpeechRecord } from "@/lib/caseMedia";

interface RawResult { cancelled: boolean; record?: unknown }

interface SmileCaseMediaPlugin {
  recordSpeech(options: { caseId: string; steps: unknown[]; leadIn: number; tail: number; guide?: string }): Promise<RawResult>;
  scanFace(options: { caseId: string; captures: unknown[] }): Promise<RawResult>;
  faceScanAvailable(): Promise<{ available: boolean }>;
  list(options: { caseId: string }): Promise<{ records: unknown[] }>;
  setFrame(options: { caseId: string; id: string; step: string; time: number }): Promise<{ record: unknown }>;
  share(options: { caseId: string; id: string; notes: string }): Promise<{ shared: boolean }>;
  openScan(options: { caseId: string; id: string; compare?: boolean }): Promise<void>;
  remove(options: { caseId: string; id: string }): Promise<void>;
  removeCase(options: { caseId: string }): Promise<void>;
  removeAll(): Promise<void>;
}

/** Local plugin: ios/App/App/CaseMediaPlugin.swift. Files live in the app's private storage on this device. */
const CaseMedia = registerPlugin<SmileCaseMediaPlugin>("SmileCaseMedia");

const cameraError = (error: unknown, what: string) => {
  const code = (error as { code?: string })?.code;
  return new Error(code === "camera_denied" ? "Camera access is turned off. Turn it on in Settings › SmileCompose › Camera."
    : code === "unsupported" ? "The face scan needs an iPhone Pro or iPad Pro with the LiDAR scanner."
    : `The ${what} couldn’t be started. Please try again.`, { cause: error });
};

/** The guided speech video: the iPhone camera with the prompts on screen. Null when cancelled. */
export async function recordSpeechVideo(caseId: string, guide?: string): Promise<SpeechRecord | null> {
  if (!isNativeApp()) throw new Error("The speech video is recorded in the iOS app.");
  const timeline = speechTimeline();
  const steps = SPEECH_STEPS.map((s, i) => ({ ...s, ...timeline[i] }));
  let result: RawResult;
  try { result = await CaseMedia.recordSpeech({ caseId, steps, leadIn: timeline[0].start, tail: SPEECH_TAIL, guide }); }
  catch (error) { throw cameraError(error, "camera"); }
  const record = result.cancelled ? null : readRecord(result.record);
  return record?.kind === "speech" ? record : null;
}

/** The 3D face scan with the rear LiDAR scanner, the phone moved round a still patient. Null when cancelled. */
export async function scanFace(caseId: string): Promise<FaceScanRecord | null> {
  if (!isNativeApp()) throw new Error("The face scan runs in the iOS app.");
  let result: RawResult;
  try { result = await CaseMedia.scanFace({ caseId, captures: [...FACE_CAPTURES] }); }
  catch (error) { throw cameraError(error, "face scan"); }
  const record = result.cancelled ? null : readRecord(result.record);
  return record?.kind === "scan" ? record : null;
}

export async function faceScanAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try { return (await CaseMedia.faceScanAvailable()).available; } catch { return false; }
}

/** This case's speech videos and face scans on this device, newest first. */
export async function listCaseMedia(caseId: string): Promise<CaseMediaRecord[]> {
  if (!isNativeApp()) return [];
  const { records } = await CaseMedia.list({ caseId });
  return records.map(readRecord).filter((r): r is CaseMediaRecord => !!r);
}

/** Moves a step's still frame to `time` (seconds) in the video. */
export async function setSpeechFrame(caseId: string, id: string, step: string, time: number): Promise<SpeechRecord | null> {
  const { record } = await CaseMedia.setFrame({ caseId, id, step, time });
  const r = readRecord(record);
  return r?.kind === "speech" ? r : null;
}

/** The iOS share sheet with the record's files and the lab notes. */
export async function shareCaseMedia(caseId: string, id: string, notes: string): Promise<boolean> {
  return (await CaseMedia.share({ caseId, id, notes })).shared;
}

/** All the case's scans in 3D, starting at `id`; `compare` opens with one laid over another. */
export const openFaceScan = (caseId: string, id: string, compare = false) => CaseMedia.openScan({ caseId, id, compare });
export const removeCaseMedia = (caseId: string, id: string) => CaseMedia.remove({ caseId, id });

/** With the case's other data; nothing to do outside the app. */
export async function removeCaseMediaFor(caseId: string): Promise<void> {
  if (isNativeApp()) await CaseMedia.removeCase({ caseId }).catch(() => {});
}
export async function removeAllCaseMedia(): Promise<void> {
  if (isNativeApp()) await CaseMedia.removeAll();
}
