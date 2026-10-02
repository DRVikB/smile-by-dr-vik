import { apiUrl } from "@/services/api/client";
import type { GenerationEntitlement } from "@/lib/entitlement";

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
    /** In the free trial: limited generations until it converts. */
    trial?: boolean;
  } | null;
  overrideExpiresAt: string | null;
  generations: { included: number; used: number; remaining: number; purchased: number; periodEnd: string | null };
  /** The canonical generation entitlement (servers from 29 Sep 2026). Display only; the server decides access. */
  entitlement?: GenerationEntitlement;
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

export interface ConsentDocuments {
  terms: { version: string; html: string };
  privacy: { version: string; html: string };
}

export class ConsentError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "ConsentError"; }
}

export async function fetchConsentDocuments(fetcher: typeof fetch = (i, init) => globalThis.fetch(i, init)): Promise<ConsentDocuments> {
  const response = await fetcher(apiUrl("/api/account/consents"), { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new ConsentError("documents_unavailable", "The current documents couldn’t be loaded. Check your connection and retry.");
  const body = await response.json() as ConsentDocuments;
  for (const document of [body.terms, body.privacy]) {
    if (!document || typeof document.version !== "string" || !document.version || typeof document.html !== "string" || !document.html)
      throw new ConsentError("documents_unavailable", "The current documents couldn’t be loaded. Please retry.");
  }
  return body;
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
export async function recordConsents(token: string, records: ConsentRecordInput[], fetcher: typeof fetch = (i, init) => globalThis.fetch(i, init)): Promise<void> {
  const response = await fetcher(apiUrl("/api/account/consents"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    if (body.code === "documents_changed" || (response.status === 400 && body.code === "invalid_request" && records.every(record => record.type === "terms" || record.type === "privacy")))
      throw new ConsentError("documents_changed", "These documents have changed. Review the updated documents and agree again.");
    if (response.status === 401)
      throw new ConsentError(body.code ?? "auth_required", body.code === "mfa_required" ? "Complete two-factor sign-in before accepting the documents." : "Your sign-in has expired. Sign out and sign in again to continue.");
    if (response.status === 404)
      throw new ConsentError("backend_update_required", "This server needs an app update before it can save your agreement. Please contact support.");
    throw new ConsentError(body.code ?? "consent_unavailable", "Your confirmation couldn’t be saved. Check your connection and retry.");
  }
}

/** Save the versions actually offered for review, then verify persistence. */
export async function acceptConsentDocuments(token: string, documents: ConsentDocuments, fetcher: typeof fetch = (i, init) => globalThis.fetch(i, init)): Promise<void> {
  await recordConsents(token, [
    { type: "terms", version: documents.terms.version },
    { type: "privacy", version: documents.privacy.version },
  ], fetcher);
  const status = await fetchAccountStatus(token, fetcher);
  if (status.documents?.terms.current !== documents.terms.version || status.documents?.privacy.current !== documents.privacy.version)
    throw new ConsentError("documents_changed", "These documents have changed. Review the updated documents and agree again.");
  if (!status.documents.terms.accepted || !status.documents.privacy.accepted)
    throw new ConsentError("consent_unavailable", "Your confirmation hasn’t been saved yet. Please retry.");
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
