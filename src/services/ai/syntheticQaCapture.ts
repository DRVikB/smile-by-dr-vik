import { NATIVE_API_ORIGIN } from "@/config/app";
import { isNativeApp } from "@/native/platform";
import { captureWorkspace, onWorkspaceDetach } from "@/lib/workspace";

const STAGING = "https://smile-by-dr-vik-staging.drvik.workers.dev";
// Approved synthetic output/stage3-evidence/generation-source.jpg. Never a patient filename/flag.
const APPROVED_SYNTHETIC_SHA256 = "1f54f12c302287ce3dcef8701614ebd42130e9a078ec22e062214d09a23b1ee6";
type CaptureStatus = "disabled" | "ineligible" | "saved" | "failed";
type WriteLocal = (path: string, base64: string) => Promise<void>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const image = (value: string) => /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
async function sha256(data: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), b => b.toString(16).padStart(2,"0")).join("");
}
const sourceHash = (value: string) => sha256(new TextEncoder().encode(value).buffer);
export function syntheticQaCaptureAllowed(config: { flag?: string; native: boolean; origin: string; fingerprint: string; runId?: string }): boolean {
  return config.flag === "1" && config.native && config.origin === STAGING && /^[0-9a-f]{64}$/.test(config.fingerprint) && uuid.test(config.runId ?? "");
}

/** QA-only local I/O boundary. No cloud, telemetry or normal repository writes. */
export class SyntheticQaCapture {
  private preparedHash?: string;
  private captured?: { requestId: string; sourceHash: string };
  private spent = false;
  private revision = 0;
  private stages = new Set<string>();
  constructor(private enabled: boolean, private approvedSha256: string, private write: WriteLocal, private claim: () => Promise<boolean> = async () => true) {}
  clear() { this.revision++; this.preparedHash = undefined; this.captured = undefined; }
  async register(file: Blob, prepared: string): Promise<boolean> {
    this.clear(); const revision = this.revision;
    if (!this.enabled || await sha256(await file.arrayBuffer()) !== this.approvedSha256) return false;
    const hash = await sourceHash(prepared);
    if (revision !== this.revision) return false;
    this.preparedHash = hash; return true;
  }
  private async begin(requestId: string, source: string): Promise<CaptureStatus> {
    if (!this.enabled) return "disabled";
    if (this.spent || !this.preparedHash || !uuid.test(requestId)) return "ineligible";
    const revision = this.revision, hash = await sourceHash(source), original = image(source);
    if (this.spent || revision !== this.revision || hash !== this.preparedHash || !original) return "ineligible";
    this.spent = true; // Never overwrite evidence or capture another request automatically.
    try {
      if (!await this.claim() || revision !== this.revision) return "ineligible";
      this.captured = { requestId, sourceHash: hash };
      await this.write(`smile-qa-synthetic/${requestId}/original.${original[1] === "jpeg" ? "jpg" : "png"}`, original[2]);
      if (revision !== this.revision) return "ineligible";
      return "saved";
    } catch { this.captured = undefined; return "failed"; }
  }
  private async save(requestId: string, source: string, stage: string, output: string): Promise<CaptureStatus> {
    const captured = this.captured, revision = this.revision;
    if (!captured || captured.requestId !== requestId || this.stages.has(stage)) return "ineligible";
    const hash = await sourceHash(source), result = image(output);
    if (revision !== this.revision || hash !== captured.sourceHash || !result || this.stages.has(stage)) return "ineligible";
    this.stages.add(stage);
    try { await this.write(`smile-qa-synthetic/${requestId}/${stage}.${result[1] === "jpeg" ? "jpg" : "png"}`,result[2]); return "saved"; }
    catch { return "failed"; }
  }
  async capturePrepared(requestId: string, source: string, prepared: string, mask: string): Promise<CaptureStatus> {
    if (!image(prepared) || !mask.startsWith("data:image/png;") || !image(mask)) return "ineligible";
    const status = await this.begin(requestId,source);
    if (status !== "saved") return status;
    const inputStatus = await this.save(requestId,source,"provider-input",prepared);
    const maskStatus = await this.save(requestId,source,"provider-mask",mask);
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
  async captureNormalized(requestId: string, source: string, normalized: string): Promise<void> {
    await this.save(requestId,source,"normalized",normalized);
  }
  async captureFinal(requestId: string, source: string, final: string): Promise<void> {
    await this.save(requestId,source,"final",final);
  }
}

let capture: SyntheticQaCapture | undefined;
onWorkspaceDetach(() => { capture?.clear(); });
function localCapture() {
  return capture ??= new SyntheticQaCapture(syntheticQaCaptureAllowed({
    flag: process.env.NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE, native: isNativeApp(), origin: NATIVE_API_ORIGIN, fingerprint: APPROVED_SYNTHETIC_SHA256, runId: process.env.NEXT_PUBLIC_SMILE_QA_CAPTURE_RUN_ID,
  }), APPROVED_SYNTHETIC_SHA256, async (path, data) => {
    const scope = captureWorkspace(); scope.assert();
    const { Filesystem, Directory } = await import("@capacitor/filesystem"); scope.assert();
    await Filesystem.writeFile({ directory: Directory.Cache, path, data, recursive: true }); scope.assert();
  }, async () => {
    // Atomic local directory claim survives app restart; only metadata is durable.
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const scope = captureWorkspace(); scope.assert();
    const parent = "smile-qa-synthetic-runs", runId = process.env.NEXT_PUBLIC_SMILE_QA_CAPTURE_RUN_ID;
    if (!uuid.test(runId ?? "")) return false;
    try { await Filesystem.mkdir({ path: parent, directory: Directory.Data, recursive: true }); }
    catch (error) { if ((error as { code?: string })?.code !== "OS-PLUG-FILE-0010") return false; }
    scope.assert();
    try { await Filesystem.mkdir({ path: `${parent}/${runId}`, directory: Directory.Data, recursive: false }); scope.assert(); return true; }
    catch { return false; } // Already claimed, or inaccessible: fail closed.
  });
}
export async function registerSyntheticQaPhoto(file: Blob, prepared: string): Promise<void> {
  try { await localCapture().register(file, prepared); } catch { /* QA only. */ }
}
export async function captureSyntheticQaRaw(requestId: string, original: string, raw: string): Promise<CaptureStatus> {
  try { return await localCapture().captureRaw(requestId, original, raw); } catch { return "failed"; }
}
export async function captureSyntheticQaPrepared(requestId: string, original: string, prepared: string, mask: string): Promise<CaptureStatus> {
  try { return await localCapture().capturePrepared(requestId, original, prepared, mask); } catch { return "failed"; }
}
export async function captureSyntheticQaNormalized(requestId: string, original: string, normalized: string): Promise<void> {
  try { await localCapture().captureNormalized(requestId, original, normalized); } catch { /* QA only. */ }
}
export async function captureSyntheticQaFinal(requestId: string, original: string, final: string): Promise<void> {
  try { await localCapture().captureFinal(requestId, original, final); } catch { /* QA only. */ }
}
