import { NATIVE_API_ORIGIN } from "@/config/app";
import { isNativeApp } from "@/native/platform";
import { captureWorkspace, onWorkspaceDetach } from "@/lib/workspace";
import { finishReasons } from "@/lib/generation/providerDiagnostics";

const STAGING = "https://smile-by-dr-vik-staging.drvik.workers.dev";
type CaptureStatus = "disabled" | "ineligible" | "saved" | "failed";
type WriteLocal = (path: string, base64: string) => Promise<void>;
type ReadLocal = (path: string) => Promise<string>;
type Provenance = "synthetic-fixture" | "approved-test-photo";
type RunKind = "live" | "offline-self-test";
type CaptureOptions = { runId?: string; provenance?: Provenance; kind?: RunKind; read?: ReadLocal };
type FileReceipt = { path: string; sha256: string; bytes: number; mime: string };
export type QaEvidenceReceipt = { ok: boolean; files: Record<string, FileReceipt>; manifestSha256?: string; reason?: string };
export type QaCapturedPart = { candidateIndex: number; partIndex: number; thought: boolean; mimeType: string; finishReason: string | null; width?: number; height?: number; selected: boolean; image?: string; omitted?: "unsupported_mime" | "invalid_encoding" | "size_limit" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const image = (value: string) => /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
const returnedImage = (value: string) => /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
async function sha256(data: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), b => b.toString(16).padStart(2,"0")).join("");
}
function fromBase64(value: string): ArrayBuffer {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0)).buffer;
}
function toBase64(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes); let text = "";
  for (let i = 0; i < data.length; i += 8192) text += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(text);
}
const sourceHash = (value: string) => sha256(new TextEncoder().encode(value).buffer);
export function syntheticQaCaptureAllowed(config: { flag?: string; native: boolean; origin: string; fingerprint: string; runId?: string; provenance?: string }): boolean {
  return config.flag === "1" && config.native && config.origin === STAGING && /^[0-9a-f]{64}$/.test(config.fingerprint) && uuid.test(config.runId ?? "")
    && (config.provenance === "synthetic-fixture" || config.provenance === "approved-test-photo");
}

/** QA-only local I/O boundary. Existing name is kept for its gated callers. */
export class SyntheticQaCapture {
  private registered?: { preparedHash: string; original: ArrayBuffer; mime: string };
  private captured?: { requestId: string; sourceHash: string; root: string; files: Record<string, FileReceipt>; parts?: Omit<QaCapturedPart, "image">[] };
  private spent = false;
  private revision = 0;
  private stages = new Set<string>();
  constructor(private enabled: boolean, private approvedSha256: string, private write: WriteLocal, private claim: () => Promise<boolean> = async () => true, private options: CaptureOptions = {}) {}
  clear() { this.revision++; this.registered = undefined; this.captured = undefined; }
  async register(file: Blob, prepared: string): Promise<boolean> {
    this.clear(); const revision = this.revision;
    if (!this.enabled || !image(prepared)) return false;
    const original = await file.arrayBuffer();
    if (await sha256(original) !== this.approvedSha256) return false;
    const hash = await sourceHash(prepared);
    if (revision !== this.revision) return false;
    this.registered = { preparedHash: hash, original, mime: ["image/jpeg", "image/png"].includes(file.type) ? file.type : "application/octet-stream" };
    return true;
  }
  private async writeVerified(path: string, data: string): Promise<{ sha256: string; bytes: number }> {
    const bytes = fromBase64(data), hash = await sha256(bytes);
    await this.write(path, data);
    if (this.options.read && await sha256(fromBase64(await this.options.read(path))) !== hash) throw new Error("QA evidence write verification failed");
    return { sha256: hash, bytes: bytes.byteLength };
  }
  private async manifest(): Promise<void> {
    const captured = this.captured;
    if (!captured) return;
    const receipt = { version: 1, runId: this.options.runId ?? captured.requestId, requestId: captured.requestId,
      kind: this.options.kind ?? "live", provenance: this.options.provenance ?? "synthetic-fixture",
      approvedSourceSha256: this.approvedSha256, files: captured.files, parts: captured.parts };
    await this.writeVerified(`${captured.root}/manifest.json`, toBase64(new TextEncoder().encode(JSON.stringify(receipt)).buffer));
  }
  private async saveBytes(stage: string, data: string, mime: string): Promise<void> {
    const captured = this.captured;
    if (!captured) throw new Error("No QA capture claim");
    const extension = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "bin";
    const path = `${captured.root}/${stage}.${extension}`;
    const verified = await this.writeVerified(path, data);
    captured.files[stage] = { path, ...verified, mime };
    await this.manifest();
  }
  private async begin(requestId: string, source: string): Promise<CaptureStatus> {
    if (!this.enabled) return "disabled";
    if (this.spent || !this.registered || !uuid.test(requestId)) return "ineligible";
    const registered = this.registered, revision = this.revision, hash = await sourceHash(source), imported = image(source);
    if (this.spent || revision !== this.revision || hash !== registered.preparedHash || !imported) return "ineligible";
    this.spent = true; // Even an uncertain/failed write never permits a second live claim.
    try {
      if (!await this.claim() || revision !== this.revision) return "ineligible";
      this.captured = { requestId, sourceHash: hash, root: `smile-qa-capture/${this.options.runId ?? requestId}/${requestId}`, files: {} };
      await this.saveBytes("original", toBase64(registered.original), registered.mime);
      await this.saveBytes("imported-source", imported[2], `image/${imported[1]}`);
      if (revision !== this.revision) return "ineligible";
      return "saved";
    } catch { this.captured = undefined; return "failed"; }
  }
  private async save(requestId: string, source: string, stage: string, output: string): Promise<CaptureStatus> {
    const captured = this.captured, revision = this.revision;
    if (!captured || captured.requestId !== requestId || this.stages.has(stage)) return "ineligible";
    const hash = await sourceHash(source), result = stage.startsWith("part-") ? returnedImage(output) : image(output);
    if (revision !== this.revision || hash !== captured.sourceHash || !result || this.stages.has(stage)) return "ineligible";
    this.stages.add(stage);
    try { await this.saveBytes(stage, result[2], `image/${result[1]}`); return "saved"; }
    catch { return "failed"; }
  }
  async capturePrepared(requestId: string, source: string, prepared: string, mask?: string): Promise<CaptureStatus> {
    if (!image(prepared) || (mask !== undefined && (!mask.startsWith("data:image/png;") || !image(mask)))) return "ineligible";
    const status = await this.begin(requestId,source);
    if (status !== "saved") return status;
    const inputStatus = await this.save(requestId,source,"provider-input",prepared);
    const maskStatus = mask === undefined ? "saved" : await this.save(requestId,source,"provider-mask",mask);
    return inputStatus === "saved" && maskStatus === "saved" ? "saved" : "failed";
  }
  async captureRaw(requestId: string, source: string, raw: string): Promise<CaptureStatus> {
    if (!this.enabled) return "disabled";
    if (!image(raw)) return "ineligible";
    if (!this.captured) {
      const status = await this.begin(requestId,source);
      if (status !== "saved") return status;
    }
    return this.save(requestId,source,"raw",raw);
  }
  async captureParts(requestId: string, source: string, parts: QaCapturedPart[]): Promise<CaptureStatus> {
    if (!this.enabled) return "disabled";
    if (!this.captured || this.captured.requestId !== requestId || parts.length > 16 || !parts.length
      || parts.reduce((sum, part) => sum + (part.image?.length ?? 0), 0) > 24 * 1024 * 1024) return "ineligible";
    if (parts.some(part => !Number.isInteger(part.candidateIndex) || part.candidateIndex < 0 || part.candidateIndex > 15
      || !Number.isInteger(part.partIndex) || part.partIndex < 0 || part.partIndex > 1023 || typeof part.thought !== "boolean"
      || typeof part.selected !== "boolean" || !/^image\/[a-z0-9.+-]{1,40}$/.test(part.mimeType)
      || (part.omitted !== undefined && !["unsupported_mime", "invalid_encoding", "size_limit"].includes(part.omitted))
      || (part.image === undefined && part.omitted === undefined)
      || (part.image !== undefined && (!returnedImage(part.image) || !part.image.startsWith(`data:${part.mimeType};`))))) return "ineligible";
    const captured = this.captured;
    if (await sourceHash(source) !== captured.sourceHash || this.captured !== captured) return "ineligible";
    captured.parts = parts.map(part => ({ candidateIndex: part.candidateIndex, partIndex: part.partIndex, thought: part.thought,
      mimeType: part.mimeType, finishReason: part.finishReason === null ? null : finishReasons.includes(part.finishReason) ? part.finishReason : "unknown",
      ...(Number.isSafeInteger(part.width) && part.width! > 0 ? { width: part.width } : {}),
      ...(Number.isSafeInteger(part.height) && part.height! > 0 ? { height: part.height } : {}), selected: part.selected,
      ...(part.omitted ? { omitted: part.omitted } : {}) }));
    try { await this.manifest(); } catch { return "failed"; }
    for (const part of parts) {
      if (!part.image) continue;
      const status = await this.save(requestId, source, `part-${part.candidateIndex}-${part.partIndex}`, part.image);
      if (status !== "saved") return status;
    }
    try { await this.manifest(); return "saved"; } catch { return "failed"; }
  }
  async captureNormalized(requestId: string, source: string, normalized: string): Promise<void> { await this.save(requestId,source,"normalized",normalized); }
  async captureFinal(requestId: string, source: string, final: string): Promise<void> { await this.save(requestId,source,"final",final); }
  async verifyEvidence(requestId: string): Promise<QaEvidenceReceipt> {
    if (!this.enabled || !this.options.read || !uuid.test(requestId)) return { ok: false, files: {}, reason: "ineligible" };
    const runId = this.options.runId ?? requestId, root = `smile-qa-capture/${runId}/${requestId}`;
    try {
      const manifestBytes = fromBase64(await this.options.read(`${root}/manifest.json`));
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      if (manifest.runId !== runId || manifest.requestId !== requestId || manifest.approvedSourceSha256 !== this.approvedSha256
        || manifest.provenance !== (this.options.provenance ?? "synthetic-fixture") || !manifest.files || typeof manifest.files !== "object"
        || manifest.files.original?.sha256 !== this.approvedSha256) return { ok: false, files: {}, reason: "receipt-mismatch" };
      const files: Record<string, FileReceipt> = {};
      for (const [stage, value] of Object.entries(manifest.files)) {
        const file = value as FileReceipt;
        if (!/^[a-z0-9-]+$/.test(stage) || !file || !file.path.startsWith(`${root}/${stage}.`) || file.path.includes("..")
          || !/^[0-9a-f]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) return { ok: false, files: {}, reason: "receipt-mismatch" };
        const bytes = fromBase64(await this.options.read(file.path));
        if (await sha256(bytes) !== file.sha256 || bytes.byteLength !== file.bytes) return { ok: false, files: {}, reason: "hash-mismatch" };
        files[stage] = { path: file.path, sha256: file.sha256, bytes: file.bytes, mime: file.mime };
      }
      return { ok: true, files, manifestSha256: await sha256(manifestBytes) };
    } catch { return { ok: false, files: {}, reason: "evidence-unavailable" }; }
  }
}

export function qaCaptureConfiguration() {
  const config = { flag: process.env.NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE, native: isNativeApp(), origin: NATIVE_API_ORIGIN,
    fingerprint: process.env.NEXT_PUBLIC_SMILE_QA_APPROVED_SOURCE_SHA256 ?? "", runId: process.env.NEXT_PUBLIC_SMILE_QA_CAPTURE_RUN_ID,
    provenance: process.env.NEXT_PUBLIC_SMILE_QA_SOURCE_PROVENANCE };
  return { ...config, enabled: syntheticQaCaptureAllowed(config) };
}

/** Both kinds use real private I/O. An offline UUID can never claim the configured live UUID. */
export function createNativeQaCaptureForRun(runId: string, kind: RunKind): SyntheticQaCapture {
  const config = qaCaptureConfiguration();
  const enabled = config.enabled && uuid.test(runId) && (kind === "live" ? runId === config.runId : runId !== config.runId);
  const options: CaptureOptions = { runId, kind, provenance: config.provenance as Provenance,
    read: async path => {
      const scope = captureWorkspace(); scope.assert();
      const { Filesystem, Directory } = await import("@capacitor/filesystem"); scope.assert();
      const result = await Filesystem.readFile({ directory: Directory.LibraryNoCloud, path }); scope.assert();
      if (typeof result.data !== "string") throw new Error("QA evidence could not be read");
      return result.data;
    } };
  return new SyntheticQaCapture(enabled, config.fingerprint, async (path, data) => {
    const scope = captureWorkspace(); scope.assert();
    const { Filesystem, Directory } = await import("@capacitor/filesystem"); scope.assert();
    await Filesystem.writeFile({ directory: Directory.LibraryNoCloud, path, data, recursive: true }); scope.assert();
  }, async () => {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const scope = captureWorkspace(); scope.assert();
    const parent = `smile-qa-capture-runs/${kind}`;
    try { await Filesystem.mkdir({ path: parent, directory: Directory.LibraryNoCloud, recursive: true }); }
    catch (error) { if ((error as { code?: string })?.code !== "OS-PLUG-FILE-0010") return false; }
    scope.assert();
    try { await Filesystem.mkdir({ path: `${parent}/${runId}`, directory: Directory.LibraryNoCloud, recursive: false }); scope.assert(); return true; }
    catch { return false; }
  }, options);
}

let capture: SyntheticQaCapture | undefined;
onWorkspaceDetach(() => { capture?.clear(); });
export function getLocalQaCapture() { return capture ??= createNativeQaCaptureForRun(process.env.NEXT_PUBLIC_SMILE_QA_CAPTURE_RUN_ID ?? "", "live"); }
const localCapture = getLocalQaCapture;
export async function registerSyntheticQaPhoto(file: Blob, prepared: string): Promise<void> { try { await localCapture().register(file, prepared); } catch { /* QA only. */ } }
export async function captureSyntheticQaRaw(requestId: string, original: string, raw: string): Promise<CaptureStatus> { try { return await localCapture().captureRaw(requestId, original, raw); } catch { return "failed"; } }
export async function captureSyntheticQaPrepared(requestId: string, original: string, prepared: string, mask?: string): Promise<CaptureStatus> { try { return await localCapture().capturePrepared(requestId, original, prepared, mask); } catch { return "failed"; } }
export async function captureApprovedQaParts(requestId: string, original: string, parts: QaCapturedPart[]): Promise<CaptureStatus> { try { return await localCapture().captureParts(requestId, original, parts); } catch { return "failed"; } }
export async function captureSyntheticQaNormalized(requestId: string, original: string, normalized: string): Promise<void> { try { await localCapture().captureNormalized(requestId, original, normalized); } catch { /* QA only. */ } }
export async function captureSyntheticQaFinal(requestId: string, original: string, final: string): Promise<void> { try { await localCapture().captureFinal(requestId, original, final); } catch { /* QA only. */ } }
