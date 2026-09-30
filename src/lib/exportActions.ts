import { isNativeApp } from "@/native/platform";
import { toPng } from "./exportCanvas";
import { canShareFiles, saveFile, shareFile, type ShareOutcome } from "./share";

/**
 * What the clinician can do with a finished export. On iPhone and iPad the
 * system share sheet does the work (Messages, WhatsApp, Mail, Save Image,
 * Save to Files, AirDrop); a browser downloads instead where it can't share.
 */

export const shareExport = (blob: Blob, filename: string, title: string): Promise<ShareOutcome> => shareFile(blob, filename, title);

export const saveExport = (blob: Blob, filename: string, title: string): Promise<ShareOutcome> => saveFile(blob, filename, title);

/**
 * Copy the image to the clipboard (as PNG, the one image type clipboards
 * take). The PNG is passed as a promise so the copy still counts as part of
 * the tap. False where the clipboard can't hold images.
 */
export async function copyExportImage(jpeg: Blob): Promise<boolean> {
  const Item = (globalThis as { ClipboardItem?: new (items: Record<string, Blob | Promise<Blob>>) => ClipboardItem }).ClipboardItem;
  if (!Item || typeof navigator === "undefined" || !navigator.clipboard?.write) return false;
  await navigator.clipboard.write([new Item({ "image/png": toPng(jpeg) })]);
  return true;
}

/**
 * Email: the share sheet, where Mail is one tap away with the file attached.
 * Without file sharing, the file downloads and a blank email opens to attach
 * it to — no patient details go into the email link.
 */
export async function emailExport(blob: Blob, filename: string, subject: string): Promise<ShareOutcome> {
  if (isNativeApp()) return shareFile(blob, filename, subject);
  const file = new File([blob], filename, { type: blob.type });
  if (canShareFiles(file)) return shareFile(blob, filename, subject);
  const outcome = await saveFile(blob, filename, subject);
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}`;
  return outcome;
}
