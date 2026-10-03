import { preparePhoto, prepareGenerationPhoto, alignPreview } from "../../src/lib/photos";
import { lockFaceOutsideLips } from "../../src/lib/face/mouthLock";
import { detectFace } from "../../src/lib/face/landmarks";
import { activateWorkspace } from "../../src/lib/workspace";
import { createCaseRepository } from "../../src/services/cases/caseRepository";
import { createPatientApi } from "../../src/services/cases/sync/patientApi";
import { type SmileSettings, type SmileCase, type GenerationResult } from "../../src/lib/types";

const status = document.querySelector<HTMLElement>("[role=status]")!;
const run = document.querySelector<HTMLButtonElement>("#run")!;
const verify = document.querySelector<HTMLButtonElement>("#verify")!;
const rows: Record<string, unknown>[] = [];
async function fingerprint(image: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(image)); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join(""); }
async function post(path: string, body: unknown) { return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
async function config() { return (await fetch("/config")).json() as Promise<{ owner: string; count: number; settings: SmileSettings[] }>; }
async function repository() {
  const cfg = await config(), scope = activateWorkspace({ kind: "account", userId: cfg.owner }), repo = createCaseRepository(scope);
  repo.connect(createPatientApi(scope, async () => "non-secret-loopback-proxy")); return repo;
}
run.onclick = async () => {
  run.disabled = true; const cfg = await config(), repo = await repository();
  try {
    const bytes = await (await fetch("/source.jpg")).blob();
    const photo = await preparePhoto(new File([bytes], "Authorised QA.jpg", { type: "image/jpeg" }));
    const canvas = await prepareGenerationPhoto(photo), sourcePoints = await detectFace(photo.dataUrl);
    if (!sourcePoints) throw new Error("Source face unavailable; no live request sent");
    for (let i = 0; i < cfg.count; i++) {
      const settings = cfg.settings[i];
      status.textContent = `Live staging request ${i + 1} of ${cfg.count}…`;
      const requestId = crypto.randomUUID(), caseId = crypto.randomUUID(), begin = performance.now();
      const response = await post("/generate", { requestId, caseId, originalImage: canvas.photo.dataUrl, sourceBounds: canvas.sourceBounds, settings, resolution: "1K" });
      const body = await response.json(), row: Record<string, unknown> = { requestId, treatment: settings.treatmentMode === "full_arch" ? "full_arch" : settings.alignment?.only ? "alignment" : settings.treatment, httpStatus: response.status, sourceWidth: photo.width, sourceHeight: photo.height, preparedWidth: canvas.photo.width, preparedHeight: canvas.photo.height, provider: body.providerDiagnostic ?? null, sourceLandmarks: sourcePoints.length, stage: "provider", delivered: false };
      if (response.ok && body.image) {
        try {
          row.stage = "align";
          const aligned = await alignPreview(body.image, photo, canvas, raw => { row.rawOutput = raw; }, geometry => { row.geometry = geometry; });
          row.generatedLandmarks = (await detectFace(aligned))?.length ?? 0;
          row.stage = "mouth_composite";
          const locked = await lockFaceOutsideLips(photo.dataUrl, aligned, d => { row.alignment = d; });
          row.semanticValidity = locked.locked && !locked.invalidAlignment;
          if (!locked.locked || locked.invalidAlignment) throw new Error(locked.failureReason ?? "protection_failed");
          const result: GenerationResult = { ...body, image: locked.image };
          await post("/final", { requestId, image: result.image });
          row.stage = "persist_case";
          const draft: SmileCase = { caseId, patientName: "Generation QA", photo, settings, result, variants: [], screen: "preview" };
          await repo.persistCase(draft);
          row.stage = "record_visualisation";
          await repo.recordVisualisation({ id: result.variationId ?? requestId, caseId, patientName: draft.patientName ?? "", createdAt: Date.now(), mode: "live", summary: `Generation QA: ${row.treatment}`, thumb: photo.dataUrl }, { id: result.variationId ?? requestId, image: result.image, originalImage: photo.dataUrl, preferences: { settings } });
          row.stage = "read_media";
          const reopened = await repo.readPresentationMedia(result.variationId ?? requestId);
          row.localReopen = reopened?.image === result.image;
          row.stage = "sync";
          await repo.resume(); await repo.refreshSync();
          row.sync = (await repo.mediaStatus(result.variationId ?? requestId)).state;
          row.stage = "complete";
          const list = JSON.parse(localStorage.getItem("qa.saved-results") ?? "[]"); list.push({ id: result.variationId ?? requestId, caseId, hash: await fingerprint(result.image) }); localStorage.setItem("qa.saved-results", JSON.stringify(list));
          const image = new Image(); image.src = result.image; image.alt = `Final concept ${i + 1}`; image.style.width = "200px"; document.querySelector("#results")!.append(image); row.delivered = row.localReopen === true;
        } catch (e) { row.error = e instanceof Error ? e.message : "processing_failed"; row.errorName = e instanceof Error ? e.name : "unknown"; row.errorStack = e instanceof Error ? e.stack?.slice(0, 2000) : undefined; }
      } else row.error = body.code ?? "provider_failure";
      row.durationMs = Math.round(performance.now() - begin); rows.push(row);
      await post("/receipt", row);
    }
    status.textContent = rows.every(row => row.delivered) ? "PASS: all live results delivered, saved and reopened" : "FAIL: one or more live results rejected; evidence saved";
  } catch (e) { status.textContent = "FAIL: " + (e instanceof Error ? e.message : "QA failed"); }
  finally { repo.disconnect(); run.disabled = false; document.querySelector("pre")!.textContent = JSON.stringify(rows, null, 2); }
};
verify.onclick = async () => {
  const repo = await repository();
  try {
    const saved = JSON.parse(localStorage.getItem("qa.saved-results") ?? "[]") as { id: string; image?: string; hash?: string }[];
    if (!saved.length) throw new Error("No delivered results available");
    for (const result of saved) { const reopened = await repo.readPresentationMedia(result.id); if (!reopened?.image || (result.hash ? await fingerprint(reopened.image) !== result.hash : reopened.image !== result.image)) throw new Error("Saved result differs"); }
    status.textContent = `PASS: ${saved.length} exact saved results reopened after relaunch`;
    await post("/relaunch-receipt", { count: saved.length, passed: true });
  } catch (e) { status.textContent = "FAIL: " + (e instanceof Error ? e.message : "Reopen failed"); }
  finally { repo.disconnect(); }
};
