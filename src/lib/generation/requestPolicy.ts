/** Client budget is a request allowance, not an invoice or account-wide cap. */
export function exceedsRequestLimit(requested: number, next: number, limit?: number): boolean {
  return Boolean(limit && requested + next > limit);
}
/** Local hash used to reuse an exact result; never sent to the provider. */
export const GENERATION_RULES_VERSION = "2026-10-02-photographic-edit-v4";
export async function previewFingerprint(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ rules: GENERATION_RULES_VERSION, input: value })));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,"0")).join("");
}
