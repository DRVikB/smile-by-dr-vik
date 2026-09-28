import { isNativeApp } from "@/native/platform";

/**
 * Hand a file to the patient without it leaving the device: the iPad share
 * sheet covers AirDrop, Messages and Save to Photos, all peer to peer or local.
 * In the iOS app this always uses the native share sheet. In a browser without
 * file sharing, the file downloads instead.
 */
export type ShareOutcome = "shared" | "cancelled" | "downloaded";

interface ShareNavigator {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

/** True when this browser can put an actual file into the share sheet. */
export function canShareFiles(
  file: File,
  nav: ShareNavigator = navigator as ShareNavigator,
): boolean {
  return (
    typeof nav.share === "function" &&
    typeof nav.canShare === "function" &&
    nav.canShare({ files: [file] })
  );
}

export async function shareFile(
  blob: Blob,
  filename: string,
  title: string,
  nav: ShareNavigator = navigator as ShareNavigator,
  native = isNativeApp(),
): Promise<ShareOutcome> {
  if (native) {
    const { shareBlobNatively } = await import("@/native/share");
    return shareBlobNatively(blob, filename, title);
  }
  const file = new File([blob], filename, { type: blob.type });
  if (canShareFiles(file, nav)) {
    try {
      await nav.share!({ files: [file], title });
      return "shared";
    } catch (error) {
      // The patient or the clinician closed the sheet: not a failure.
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
      // Anything else falls through to a download rather than dead-ending.
    }
  }
  const { downloadBlob } = await import("./compose");
  downloadBlob(blob, filename);
  return "downloaded";
}

/**
 * "Save" an export. The website keeps its normal browser download; the iOS
 * app, where downloads don't exist, opens the share sheet (Save Image, Save
 * to Files, AirDrop, Mail, Messages).
 */
export async function saveFile(
  blob: Blob,
  filename: string,
  title = filename,
  native = isNativeApp(),
): Promise<ShareOutcome> {
  if (native) {
    const { shareBlobNatively } = await import("@/native/share");
    return shareBlobNatively(blob, filename, title);
  }
  const { downloadBlob } = await import("./compose");
  downloadBlob(blob, filename);
  return "downloaded";
}
