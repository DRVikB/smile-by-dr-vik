export const AI_CONSENT_VERSION = "smilecompose-ai-v2";

/** A local record that the clinician confirmed permission for this photo. */
export interface AiProcessingConsent {
  version: typeof AI_CONSENT_VERSION;
  photoFingerprint: string;
  confirmedAt: number;
}

export async function fingerprintPhotoForConsent(dataUrl: string, referenceDataUrl?: string | null): Promise<string> {
  const inputs = [dataUrl, referenceDataUrl ?? ""];
  const hashes = await Promise.all(inputs.map(async (input) => {
    if (!input) return "";
    const bytes = await fetch(input).then((response) => response.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ version: AI_CONSENT_VERSION, hashes })));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
