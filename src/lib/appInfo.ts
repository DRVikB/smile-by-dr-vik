import { isNativeApp, nativePlatform } from "@/native/platform";

/** Safe technical details for support. Never includes account, patient or case data. */
export interface AppInfo {
  version: string;
  build: string | null;
  platform: "iOS" | "Android" | "Web";
  osVersion: string | null;
}

export function osVersionFromUserAgent(userAgent: string): string | null {
  const ios = /\bOS (\d+)[_.](\d+)(?:[_.](\d+))? like Mac OS X/.exec(userAgent);
  if (ios) return `iOS ${[ios[1], ios[2], ios[3]].filter(Boolean).join(".")}`;
  const mac = /Mac OS X (\d+)[_.](\d+)/.exec(userAgent);
  if (mac) return `macOS ${mac[1]}.${mac[2]}`;
  const android = /Android (\d+(?:\.\d+)*)/.exec(userAgent);
  if (android) return `Android ${android[1]}`;
  const windows = /Windows NT (\d+\.\d+)/.exec(userAgent);
  return windows ? `Windows NT ${windows[1]}` : null;
}

export async function appInfo(): Promise<AppInfo> {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const webVersion = process.env.NEXT_PUBLIC_APP_VERSION || "";
  if (isNativeApp()) {
    const info = await import("@capacitor/app").then(({ App }) => App.getInfo()).catch(() => null);
    return {
      version: info?.version || webVersion,
      build: info?.build || null,
      platform: nativePlatform() === "android" ? "Android" : "iOS",
      osVersion: osVersionFromUserAgent(userAgent),
    };
  }
  return { version: webVersion, build: null, platform: "Web", osVersion: osVersionFromUserAgent(userAgent) };
}

export function versionLabel(info: AppInfo | null): string {
  if (!info?.version) return "—";
  return info.build ? `${info.version} (${info.build})` : info.version;
}

/** mailto: link for "Report a Problem" with technical details only. */
export function problemReportUrl(email: string, info: AppInfo): string {
  const body = [
    "What happened, and what were you doing when it happened?",
    "",
    "",
    "— Technical details (added automatically) —",
    `App version: ${versionLabel(info)}`,
    `Platform: ${info.platform}`,
    `OS version: ${info.osVersion ?? "unknown"}`,
    "",
    "Please don’t include patient photographs, names or clinical details.",
  ].join("\n");
  return `mailto:${email}?subject=${encodeURIComponent("SmileCompose problem report")}&body=${encodeURIComponent(body)}`;
}
