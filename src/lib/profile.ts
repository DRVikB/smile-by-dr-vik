/**
 * Account identity helpers shared by the app and the server.
 *
 * Two names are kept apart:
 *   fullName       the account holder ("Vikas Bajaj")
 *   preferredName  how SmileCompose addresses them ("Dr Vik")
 * Greetings use preferredName → first name of fullName → nothing. An email
 * address (possibly an Apple private relay) is never used as a name.
 */
export const NAME_LIMITS = { fullName: 80, preferredName: 40 } as const;

export interface ProfileNames {
  fullName?: string | null;
  preferredName?: string | null;
}

/**
 * Trim, collapse whitespace and remove control / invisible formatting
 * characters. Returns null for an empty result and undefined for a value that
 * is not a string or is too long (the caller rejects it).
 */
export function normaliseName(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const clean = value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return [...clean].length > max ? undefined : clean;
}

export function firstName(fullName: string | null | undefined): string | null {
  return fullName?.trim().split(/\s+/)[0] || null;
}

/** The name SmileCompose uses to address the user, or null for a generic greeting. */
export function displayName(names: ProfileNames | null | undefined): string | null {
  return names?.preferredName?.trim() || firstName(names?.fullName) || null;
}

/** "Dr Vik" → "DV", "Vikas Bajaj" → "VB", "Madonna" → "M". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const letters = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return letters.map(word => [...word][0]?.toLocaleUpperCase("en-GB") ?? "").join("");
}

export function isPrivateRelayEmail(email: string | null | undefined): boolean {
  return /@privaterelay\.appleid\.com$/i.test(email ?? "");
}

/** "vikas@example.co.uk" → "v••••@••••.co.uk". */
export function maskEmail(email: string | null | undefined): string {
  const [local, domain] = (email ?? "").split("@");
  if (!local || !domain) return "";
  const dot = domain.indexOf(".");
  const suffix = dot >= 0 ? domain.slice(dot) : "";
  return `${[...local][0]}••••@••••${suffix}`;
}

/** "Good morning, Dr Vik" by local time, or "Good morning" with no name. */
export function greeting(name: string | null | undefined, now: Date = new Date()): string {
  const hour = now.getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}

/** Human label for Supabase identity providers. */
export function providerLabel(provider: string): string {
  return provider === "apple" ? "Apple" : provider === "email" ? "Email & Password" : provider;
}
