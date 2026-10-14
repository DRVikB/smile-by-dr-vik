import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./platform";

/**
 * The app's two iOS permissions as the system has recorded them, for Settings › Privacy & Data.
 * Reading them never shows a permission prompt. In a browser there is nothing to read (null).
 */
export type PermissionState = "allowed" | "denied" | "restricted" | "notAsked";
export interface AppPermissions { camera: PermissionState; photosAdd: PermissionState }

interface PermissionsPlugin {
  status(): Promise<AppPermissions>;
  openSettings(): Promise<void>;
}

/** Local plugin: PermissionsPlugin in ios/App/App/SmileComposeBridgeViewController.swift. */
const SmilePermissions = registerPlugin<PermissionsPlugin>("SmilePermissions");

export async function appPermissions(): Promise<AppPermissions | null> {
  if (!isNativeApp()) return null;
  try { return await SmilePermissions.status(); } catch { return null; }
}

/** Opens SmileCompose's page in iOS Settings, where either permission can be changed. */
export async function openAppSettings(): Promise<void> {
  if (isNativeApp()) await SmilePermissions.openSettings().catch(() => {});
}

export const PERMISSION_LABEL: Record<PermissionState, string> = {
  allowed: "Allowed",
  denied: "Off",
  restricted: "Restricted",
  notAsked: "Not asked yet",
};
