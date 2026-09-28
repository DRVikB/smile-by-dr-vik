/**
 * iOS share sheet for exported images, videos and files. Browser downloads do
 * not work inside the app's WebView, so exports are written to the app's
 * private cache, handed to the system sheet (Save Image, Save to Files,
 * AirDrop, Mail, Messages…) and deleted again once the sheet closes.
 */
export type NativeShareOutcome = "shared" | "cancelled";

export async function shareBlobNatively(blob: Blob, filename: string, title: string): Promise<NativeShareOutcome> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  // A unique folder keeps the patient-facing filename clean.
  const folder = `exports/${Date.now()}`;
  const path = `${folder}/${safeFilename(filename)}`;
  const { uri } = await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  try {
    await Share.share({ title, dialogTitle: title, files: [uri] });
    return "shared";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (/cancel/i.test(message)) return "cancelled";
    throw error;
  } finally {
    // Patient images must not linger in the cache after the handoff.
    await Filesystem.rmdir({ path: folder, directory: Directory.Cache, recursive: true }).catch(() => {});
  }
}

export function safeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "-").slice(0, 120);
  return cleaned || "smilecompose-export";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("The file couldn’t be prepared."));
    reader.readAsDataURL(blob);
  });
}
