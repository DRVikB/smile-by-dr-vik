import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./platform";
import type { Framing } from "@/lib/types";

interface PickedPhoto {
  cancelled: boolean;
  path?: string;
  webPath?: string;
  mimeType?: string;
}

interface SmilePhotoPickerPlugin {
  pickPhoto(): Promise<PickedPhoto>;
  takePhoto(options: { camera: "back" | "front"; guide: Framing }): Promise<PickedPhoto>;
  releasePhoto(options: { path: string }): Promise<void>;
}

/** Local plugin: ios/App/App/PhotoPickerPlugin.swift. */
const SmilePhotoPicker = registerPlugin<SmilePhotoPickerPlugin>("SmilePhotoPicker");

/**
 * "Choose from Photos" in the iOS app, via Apple's system photo picker. It
 * needs no Photo Library permission and never saves to the camera roll. The
 * picked file goes through the same preparePhoto() pipeline as a browser
 * upload, so orientation, size limits and metadata stripping stay identical.
 *
 * Returns null when the clinician cancels.
 */
export async function pickNativePhoto(): Promise<File | null> {
  if (!isNativeApp()) throw new Error("The system photo picker is only available in the app.");
  let picked: PickedPhoto;
  try {
    picked = await SmilePhotoPicker.pickPhoto();
  } catch (error) {
    throw new Error("The photo couldn’t be opened. Please try again or choose a different photo.", { cause: error });
  }
  return readPicked(picked);
}

/** Read the plugin's private copy into a File, then delete the copy. */
async function readPicked(picked: PickedPhoto): Promise<File | null> {
  if (picked.cancelled || !picked.webPath || !picked.path) return null;
  try {
    const blob = await (await fetch(picked.webPath)).blob();
    const type = picked.mimeType === "image/png" ? "image/png" : "image/jpeg";
    return new File([blob], `patient-photo.${type === "image/png" ? "png" : "jpg"}`, { type });
  } finally {
    // The private copy is no longer needed once it has been read.
    await SmilePhotoPicker.releasePhoto({ path: picked.path }).catch(() => {});
  }
}

/**
 * "Take Photo" in the iOS app: the iPhone camera itself (ios/App/App/PhotoPickerPlugin.swift,
 * SmileCameraViewController), so the photo has full resolution, Apple's processing and true
 * colour — unlike a frame grabbed from a live video stream. The smile guide is drawn at the
 * same fractions of the photo as the web capture guide. Returns null when cancelled.
 */
export async function takeNativePhoto(guide: Framing, camera: "back" | "front" = "back"): Promise<File | null> {
  if (!isNativeApp()) throw new Error("The camera is only available in the app.");
  let picked: PickedPhoto;
  try {
    picked = await SmilePhotoPicker.takePhoto({ camera, guide });
  } catch (error) {
    const denied = (error as { code?: string })?.code === "camera_denied";
    throw new Error(denied ? "Camera access is turned off. Turn it on in Settings › SmileCompose › Camera." : "The camera couldn’t be opened. Please try again.", { cause: error });
  }
  return readPicked(picked);
}
