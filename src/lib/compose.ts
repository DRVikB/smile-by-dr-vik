/**
 * A browser download for an export. The patient exports themselves are drawn
 * in smilePreview.ts (the Smile Preview) and consultationReport.ts (the
 * Consultation Report).
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
