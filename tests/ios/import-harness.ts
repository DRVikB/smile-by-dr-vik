import { preparePhoto, prepareGenerationPhoto } from "../../src/lib/photos";
import { detectFace } from "../../src/lib/face/landmarks";
const run = document.querySelector<HTMLButtonElement>("#run")!;
run.textContent = "Run local photo checks";
run.onclick = async () => {
  run.disabled = true;
  const rows: Record<string, unknown>[] = [];
  for (const name of ["IMG_3291.jpg", "IMG_3293.jpg", "IMG_3296.jpg", "IMG_3297.jpg", "IMG_3241.jpg", "IMG_3166 2.HEIC"]) {
    const row: Record<string, unknown> = { fixture: name, providerRequests: 0 };
    try {
      const bytes = await (await fetch("/test-input/" + encodeURIComponent(name))).blob();
      const photo = await preparePhoto(new File([bytes], name, { type: name.endsWith(".HEIC") ? "image/heic" : "image/jpeg" }));
      const canvas = await prepareGenerationPhoto(photo);
      row.width = photo.width; row.height = photo.height;
      row.preparedWidth = canvas.photo.width; row.preparedHeight = canvas.photo.height;
      row.sourceBounds = canvas.sourceBounds;
      row.landmarks = (await detectFace(photo.dataUrl))?.length ?? 0;
      row.decoded = true;
      row.requiresReviewedEditArea = row.landmarks === 0;
    } catch(e) { row.decoded = false; row.error = e instanceof Error ? e.message : "import_failed"; }
    rows.push(row);
  }
  await fetch("/import-receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows) });
  document.querySelector("pre")!.textContent = JSON.stringify(rows, null, 2);
  document.querySelector("[role=status]")!.textContent = rows.every(r => r.decoded) ? "PASS: six local photo checks completed" : "FAIL: photo import failed; evidence saved";
  run.disabled = false;
};
