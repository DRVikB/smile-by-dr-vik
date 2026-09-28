import { isNativeApp } from "@/native/platform";

/**
 * Pick an image with the platform's own UI. Call from a tap handler.
 *   source "camera": the camera (iOS app and mobile browsers open it directly)
 *   source "library": the iOS system photo picker in the app (no Photo Library
 *                     permission needed); a file chooser on the web
 */
export async function pickImage(source: "camera" | "library", options: { multiple?: boolean; facing?: "user" | "environment" } = {}): Promise<File[]> {
  if (source === "library" && isNativeApp()) {
    const { pickNativePhoto } = await import("@/native/photos");
    const file = await pickNativePhoto();
    return file ? [file] : [];
  }
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = source === "camera" ? "image/*" : "image/jpeg,image/png,image/heic,image/heif";
    if (source === "camera") input.setAttribute("capture", options.facing ?? "environment");
    if (options.multiple && source === "library") input.multiple = true;
    input.style.display = "none";
    let settled = false;
    const finish = (files: File[]) => { if (settled) return; settled = true; input.remove(); resolve(files); };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}
