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
export function syntheticQaCaptureAllowed(config: { flag?: string; native: boolean; origin: string; fingerprint: string }): boolean {
  return config.flag === "1" && config.native && config.origin === STAGING && /^[0-9a-f]{64}$/.test(config.fingerprint);
}

/** QA-only local I/O boundary. No cloud, telemetry or normal repository writes. */
export class SyntheticQaCapture {
  private preparedHash?: string;
  private captured?: { requestId: string; sourceHash: string };
  private spent = false;
  private revision = 0;
  constructor(private enabled: boolean, private approvedSha256: string, private write: WriteLocal) {}
  clear() { this.revision++; this.preparedHash = undefined; this.captured = undefined; }
  async register(file: Blob, prepared: string): Promise<boolean> {
    this.clear(); const revision = this.revision;
    if (!this.enabled || await sha256(await file.arrayBuffer()) !== this.approvedSha256) return false;
    const hash = await sourceHash(prepared);
    if (revision !== this.revision) return false;
    this.preparedHash = hash; return true;
  }
  async captureRaw(requestId: string, source: string, raw: string): Promise<CaptureStatus> {
    if (!this.enabled) return "disabled";
    if (this.spent || !this.preparedHash || !uuid.test(requestId)) return "ineligible";
    const revision = this.revision, hash = await sourceHash(source), original = image(source), result = image(raw);
    if (this.spent || revision !== this.revision || hash !== this.preparedHash || !original || !result) return "ineligible";
    this.spent = true; // Never overwrite evidence or capture another request automatically.
    try {
      await this.write(`smile-qa-synthetic/${requestId}/original.${original[1] === "jpeg" ? "jpg" : "png"}`, original[2]);
      if (revision !== this.revision) return "ineligible";
      await this.write(`smile-qa-synthetic/${requestId}/raw.${result[1] === "jpeg" ? "jpg" : "png"}`, result[2]);
      if (revision !== this.revision) return "ineligible";
      this.captured = { requestId, sourceHash: hash }; return "saved";
    } catch { return "failed"; }
  }
  async captureFinal(requestId: string, source: string, final: string): Promise<void> {
    const captured = this.captured, revision = this.revision;
    if (!captured || captured.requestId !== requestId) return;
    const hash = await sourceHash(source), result = image(final);
    if (revision !== this.revision || hash !== captured.sourceHash || !result) return;
    try { await this.write(`smile-qa-synthetic/${requestId}/final.${result[1] === "jpeg" ? "jpg" : "png"}`,result[2]); }
    catch { /* Optional local evidence cannot fail delivery. */ }
  }
}

let capture: SyntheticQaCapture | undefined;
onWorkspaceDetach(() => { capture?.clear(); });
function localCapture() {
  return capture ??= new SyntheticQaCapture(syntheticQaCaptureAllowed({
    flag: process.env.NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE, native: isNativeApp(), origin: NATIVE_API_ORIGIN, fingerprint: APPROVED_SYNTHETIC_SHA256,
  }), APPROVED_SYNTHETIC_SHA256, async (path, data) => {
    const scope = captureWorkspace(); scope.assert();
    const { Filesystem, Directory } = await import("@capacitor/filesystem"); scope.assert();
    await Filesystem.writeFile({ directory: Directory.Cache, path, data, recursive: true }); scope.assert();
  });
}
export async function registerSyntheticQaPhoto(file: Blob, prepared: string): Promise<void> {
  try { await localCapture().register(file, prepared); } catch { /* QA only. */ }
}
export async function captureSyntheticQaRaw(requestId: string, original: string, raw: string): Promise<CaptureStatus> {
  try { return await localCapture().captureRaw(requestId, original, raw); } catch { return "failed"; }
}
export async function captureSyntheticQaFinal(requestId: string, original: string, final: string): Promise<void> {
  try { await localCapture().captureFinal(requestId, original, final); } catch { /* QA only. */ }
}
