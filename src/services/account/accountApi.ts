import { apiUrl } from "@/services/api/client";

export class AccountApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AccountApiError";
  }
}

/** What the server reports for the signed-in account (GET /api/account/status). */
export interface AccountStatus {
  userId: string;
  email: string | null;
  providers: string[];
  pro: boolean;
  source: "subscription" | "override" | null;
  verifiedWith: "revenuecat" | "cache";
  subscription: {
    active: boolean;
    productId: string | null;
    expiresAt: string | null;
    environment: "production" | "sandbox" | null;
    willRenew: boolean;
    billingIssue: boolean;
    managementUrl: string | null;
  } | null;
  overrideExpiresAt: string | null;
  generations: { included: number; used: number; remaining: number; purchased: number; periodEnd: string | null };
  mfaEnrolled?: boolean;
  profile?: AccountProfile | null;
  /** Server-calculated storage for account-held files (null if unavailable). V1 stores no patient media in the cloud. */
  storage?: { usedBytes: number; limitBytes: number | null } | null;
  /** Short-lived private link to the profile photo, or null (initials are shown). */
  avatarUrl?: string | null;
  caseLibrary?: { count: number; bytes: number } | null;
  documents?: { terms: { current: string; accepted: boolean }; privacy: { current: string; accepted: boolean } };
}

export interface AccountProfile {
  fullName: string | null;
  preferredName: string | null;
  onboardingCompletedAt: string | null;
  createdAt: string | null;
  hasGenerationHistory: boolean;
}

export interface ProfileUpdate {
  fullName?: string | null;
  preferredName?: string | null;
  onlyIfEmpty?: boolean;
  onboardingCompleted?: boolean;
}

export interface ConsentRecordInput {
  type: "terms" | "privacy" | "upload_authority" | "case_library_authority";
  version: string;
  caseId?: string;
}

export async function fetchAccountStatus(token: string, fetcher: typeof fetch = (i, init) => globalThis.fetch(i, init)): Promise<AccountStatus> {
  const response = await fetcher(apiUrl("/api/account/status"), {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    throw new AccountApiError(body.code ?? "account_service_unavailable");
  }
  return response.json() as Promise<AccountStatus>;
}

export async function requestAccountDeletion(token: string, appleAuthorizationCode?: string): Promise<void> {
  const response = await fetch(apiUrl("/api/account/delete"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(appleAuthorizationCode ? { appleAuthorizationCode } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("Your account couldn’t be deleted. Please try again or contact support.");
}

/** Record versioned acceptances / per-case upload-authority confirmations (no patient data). */
export async function recordConsents(token: string, records: ConsentRecordInput[]): Promise<void> {
  const response = await fetch(apiUrl("/api/account/consents"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Your confirmation couldn’t be saved. Please try again.");
}

/** Everything SmileCompose holds server-side for the signed-in account. */
export async function fetchAccountExport(token: string): Promise<unknown> {
  const response = await fetch(apiUrl("/api/account/export"), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Your account data couldn’t be exported. Please try again.");
  return response.json();
}

/** Update the account name / preferred name, or mark onboarding complete. */
export async function updateProfile(token: string, update: ProfileUpdate, fetcher: typeof fetch = (i, init) => globalThis.fetch(i, init)): Promise<AccountProfile> {
  const response = await fetcher(apiUrl("/api/account/profile"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(update),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    throw new AccountApiError(body.code ?? "account_service_unavailable");
  }
  return ((await response.json()) as { profile: AccountProfile }).profile;
}

/** Set or replace the profile photo (a ~512 px JPEG made on the device), or remove it. */
export async function saveAvatar(token: string, image: string | null): Promise<string | null> {
  const response = await fetch(apiUrl("/api/account/avatar"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(image ? { image } : { remove: true }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    throw new AccountApiError(body.code ?? "account_service_unavailable");
  }
  return ((await response.json()) as { avatarUrl: string | null }).avatarUrl;
}
