/**
 * Hand a file to the patient without it leaving the device: the iPad share
 * sheet covers AirDrop, Messages and Save to Photos, all peer to peer or local.
 * Where the browser has no file sharing, the file downloads instead.
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
): Promise<ShareOutcome> {
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
