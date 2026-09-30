import { AccountError, AVATAR_BUCKET, type AccountStore, type AuthenticatedUser, type ConsentType, type ProfilePatch } from "./accountStore";
import { decodeJpegDataUrl } from "./images";
import { safeLog } from "./redact";
import { DOCUMENT_VERSIONS } from "@/config/legal";
import { NAME_LIMITS, normaliseName } from "@/lib/profile";
import { authenticate, evaluateAccess, type AccountServices } from "./access";
import { buildEntitlement } from "./entitlement";
import { revokeAppleAuthorization, type AppleCredentials } from "./appleRevoke";

const headers = { "Cache-Control": "no-store" };

function failure(error: unknown): Response {
  if (error instanceof AccountError && error.code === "auth_required")
    return Response.json({ error: "Sign in to continue.", code: "auth_required" }, { status: 401, headers });
  if (error instanceof AccountError && error.code === "mfa_required")
    return Response.json({ error: "Enter your two-factor code to continue.", code: "mfa_required" }, { status: 401, headers });
  return Response.json({ error: "Your account couldn’t be reached. Please try again.", code: "account_service_unavailable" }, { status: 503, headers });
}

/** GET /api/account/status — plan, access source and generation balance for the signed-in user. */
export async function handleAccountStatus(request: Request, services: AccountServices | null): Promise<Response> {
  if (!services) return Response.json({ error: "Accounts are not configured.", code: "accounts_unavailable" }, { status: 503, headers });
  try {
    const user = await authenticate(request, services);
    if (!user) throw new AccountError("auth_required");
    const access = await evaluateAccess(user, services);
    const generations = await services.store.balance(user.id);
    const accepted = await services.store.consentVersions(user.id);
    // Profile and storage are optional detail (e.g. before the profile migration is applied):
    // never fail the status request over them.
    const profile = await currentProfile(user, services.store).catch(() => null);
    const storage = await services.store.storageUsage(user.id).catch(() => null);
    const avatarPath = profile?.avatarPath ?? null;
    const avatarUrl = avatarPath?.startsWith(`${user.id}/`) ? await services.media.signedUrl(AVATAR_BUCKET, avatarPath, 3600).catch(() => null) : null;
    const library = await services.store.listReferenceCases(user.id).catch(() => null);
    return Response.json({
      userId: user.id,
      email: user.email,
      providers: user.providers,
      pro: access.pro,
      source: access.source,
      verifiedWith: access.verifiedWith,
      subscription: access.subscription,
      overrideExpiresAt: access.overrideExpiresAt,
      generations,
      // The canonical entitlement every screen reads. Billing detail for debugging only outside production.
      entitlement: buildEntitlement(access, generations, { debug: process.env.NODE_ENV !== "production" }),
      mfaEnrolled: Boolean(user.mfaEnrolled),
      profile: profile ? { ...profile, avatarPath: undefined } : null,
      avatarUrl,
      storage,
      caseLibrary: library ? { count: library.length, bytes: library.reduce((sum, c) => sum + c.images.reduce((n, i) => n + i.bytes, 0), 0) } : null,
      documents: {
        terms: { current: DOCUMENT_VERSIONS.terms, accepted: accepted.terms?.includes(DOCUMENT_VERSIONS.terms) ?? false },
        privacy: { current: DOCUMENT_VERSIONS.privacy, accepted: accepted.privacy?.includes(DOCUMENT_VERSIONS.privacy) ?? false },
      },
    }, { headers });
  } catch (error) {
    return failure(error);
  }
}

/**
 * The profile, filling an empty account name from Supabase user metadata once
 * (Apple web sign-in supplies the name only on first authorisation).
 */
async function currentProfile(user: AuthenticatedUser, store: AccountStore) {
  const profile = await store.profile(user.id);
  const metadataName = normaliseName(user.metadataName ?? null, NAME_LIMITS.fullName);
  if (!profile.fullName && metadataName) {
    await store.updateProfile(user.id, { fullName: metadataName, onlyIfEmpty: true }).catch(() => {});
    return { ...profile, fullName: metadataName };
  }
  return profile;
}

/**
 * POST /api/account/profile — update the signed-in user's account name,
 * preferred name, or mark onboarding complete. Names are normalised and length
 * limited; `onlyIfEmpty` never overwrites a name the user has already set.
 */
export async function handleProfileUpdate(request: Request, services: AccountServices | null): Promise<Response> {
  if (!services) return Response.json({ error: "Accounts are not configured.", code: "accounts_unavailable" }, { status: 503, headers });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    const user = await authenticate(request, services);
    if (!user) throw new AccountError("auth_required");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return invalidProfile();
    const patch: ProfilePatch = {};
    for (const key of ["fullName", "preferredName"] as const) {
      if (!(key in body)) continue;
      const value = normaliseName(body[key], NAME_LIMITS[key]);
      if (value === undefined) return invalidProfile();
      patch[key] = value;
    }
    if (body.onlyIfEmpty === true) patch.onlyIfEmpty = true;
    if (body.onboardingCompleted === true) patch.onboardingCompleted = true;
    if (patch.fullName === undefined && patch.preferredName === undefined && !patch.onboardingCompleted) return invalidProfile();
    await services.store.updateProfile(user.id, patch);
    const { avatarPath: _avatarPath, ...updated } = await services.store.profile(user.id);
    void _avatarPath;
    return Response.json({ profile: updated }, { headers });
  } catch (error) {
    return failure(error);
  }
}

function invalidProfile(): Response {
  return Response.json({ error: `Names can be up to ${NAME_LIMITS.preferredName} characters (preferred name) or ${NAME_LIMITS.fullName} characters (account name).`, code: "invalid_profile" }, { status: 400, headers });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * POST /api/account/delete — permanently deletes the signed-in account.
 * Order: revoke Sign in with Apple tokens (when a fresh code is supplied),
 * delete the RevenueCat customer, record a pseudonymous deletion marker, then
 * delete the Supabase user, which cascades to every row they own.
 * App Store subscriptions are billed by Apple and must be cancelled by the
 * user in Settings; the app tells them so before deletion.
 */
export async function handleAccountDelete(request: Request, services: AccountServices | null, apple: AppleCredentials | null): Promise<Response> {
  if (!services) return Response.json({ error: "Accounts are not configured.", code: "accounts_unavailable" }, { status: 503, headers });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    const user = await authenticate(request, services);
    if (!user) throw new AccountError("auth_required");
    const body = await request.json().catch(() => ({})) as { appleAuthorizationCode?: unknown };
    const code = typeof body.appleAuthorizationCode === "string" && body.appleAuthorizationCode.length < 2000 ? body.appleAuthorizationCode : null;

    let appleRevoked: boolean | null = null;
    if (user.providers.includes("apple")) {
      appleRevoked = false;
      if (code && apple) appleRevoked = await revokeAppleAuthorization(code, apple).catch(() => false);
    }
    // Survives the deletion with the user link removed (pseudonymous audit trail).
    await services.store.recordSecurityEvent(user.id, "user", "account_deletion_requested", { apple_linked: user.providers.includes("apple") }).catch(() => {});
    const revenuecatDeleted = await services.revenuecat.deleteSubscriber(user.id).then(() => true, () => false);
    // Account media (profile photo, Case Library images and derivatives) first:
    // if private storage can't be emptied, stop so nothing is left orphaned.
    try {
      await services.media.removeAllFor(user.id);
    } catch {
      safeLog("error", "account_media_deletion_failed", {});
      return Response.json({ error: "Your account couldn’t be deleted right now. Please try again.", code: "account_service_unavailable" }, { status: 503, headers });
    }
    await services.store.recordAccountDeletion(await sha256(user.id));
    await services.store.deleteUser(user.id);
    return Response.json({ deleted: true, appleRevoked, revenuecatDeleted }, { headers });
  } catch (error) {
    return failure(error);
  }
}

export function appleCredentialsFromEnv(env: { APPLE_TEAM_ID?: string; APPLE_KEY_ID?: string; APPLE_PRIVATE_KEY?: string; APPLE_CLIENT_ID?: string }): AppleCredentials | null {
  return env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY && env.APPLE_CLIENT_ID
    ? { teamId: env.APPLE_TEAM_ID, keyId: env.APPLE_KEY_ID, privateKey: env.APPLE_PRIVATE_KEY, clientId: env.APPLE_CLIENT_ID }
    : null;
}

const CLIENT_CONSENTS: ConsentType[] = ["terms", "privacy", "upload_authority", "case_library_authority"];
const CASE_ID = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * POST /api/account/consents — record acceptance of the CURRENT Terms/Privacy
 * versions, or a per-case clinician upload-authority confirmation.
 * AI-processing confirmations are recorded by the generation endpoint itself.
 */
export async function handleConsents(request: Request, services: AccountServices | null): Promise<Response> {
  if (!services) return Response.json({ error: "Accounts are not configured.", code: "accounts_unavailable" }, { status: 503, headers });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    const user = await authenticate(request, services);
    if (!user) throw new AccountError("auth_required");
    const body = await request.json().catch(() => ({})) as { records?: unknown };
    const records = Array.isArray(body.records) ? body.records.slice(0, 5) : [];
    const valid = records.filter((r): r is { type: ConsentType; version: string; caseId?: string } => {
      const record = r as { type?: unknown; version?: unknown; caseId?: unknown };
      return CLIENT_CONSENTS.includes(record.type as ConsentType)
        && record.version === DOCUMENT_VERSIONS[record.type as keyof typeof DOCUMENT_VERSIONS]
        && (record.type !== "upload_authority" || (typeof record.caseId === "string" && CASE_ID.test(record.caseId)))
        && (record.type === "upload_authority" || record.caseId === undefined);
    });
    if (!valid.length || valid.length !== records.length)
      return Response.json({ error: "Invalid consent record.", code: "invalid_request" }, { status: 400, headers });
    for (const record of valid) await services.store.recordConsent(user.id, record.type, record.version, record.caseId ?? null);
    return Response.json({ recorded: valid.length }, { headers });
  } catch (error) {
    return failure(error);
  }
}

/** GET /api/account/export — everything SmileCompose holds server-side for this account. */
export async function handleAccountExport(request: Request, services: AccountServices | null): Promise<Response> {
  if (!services) return Response.json({ error: "Accounts are not configured.", code: "accounts_unavailable" }, { status: 503, headers });
  try {
    const user = await authenticate(request, services);
    if (!user) throw new AccountError("auth_required");
    const data = await services.store.exportAccountData(user.id);
    await services.store.recordSecurityEvent(user.id, "user", "data_export", { scope: "account" }).catch(() => {});
    return Response.json({ account: { id: user.id, email: user.email, signInMethods: user.providers }, server: data }, {
      headers: { ...headers, "Content-Disposition": "attachment; filename=smilecompose-account-data.json" },
    });
  } catch (error) {
    return failure(error);
  }
}

/**
 * POST /api/account/avatar — { image: "data:image/jpeg;base64,…" } sets or
 * replaces the profile photo (a ~512 px JPEG made on the device);
 * { remove: true } removes it. Stored privately as "<user id>/<random>.jpg";
 * the previous photo is deleted after the profile points at the new one.
 */
export async function handleAvatar(request: Request, services: AccountServices | null): Promise<Response> {
  if (!services) return Response.json({ error: "Accounts are not configured.", code: "accounts_unavailable" }, { status: 503, headers });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    const user = await authenticate(request, services);
    if (!user) throw new AccountError("auth_required");
    const body = await request.json().catch(() => null) as { image?: unknown; remove?: unknown } | null;
    if (body?.remove === true) {
      const previous = await services.store.setAvatarPath(user.id, null);
      if (previous?.startsWith(`${user.id}/`)) await services.media.remove(AVATAR_BUCKET, [previous]).catch(() => safeLog("error", "avatar_cleanup_failed", {}));
      return Response.json({ avatarUrl: null }, { headers });
    }
    const image = decodeJpegDataUrl(body?.image, 1024 * 1024, 1024);
    if (!image || image.width < 64 || image.height < 64)
      return Response.json({ error: "That photo couldn’t be used. Please choose another.", code: "invalid_image" }, { status: 400, headers });
    const path = `${user.id}/${crypto.randomUUID()}.jpg`;
    await services.media.put(AVATAR_BUCKET, path, image.bytes, "image/jpeg");
    let previous: string | null;
    try {
      previous = await services.store.setAvatarPath(user.id, path);
    } catch (error) {
      await services.media.remove(AVATAR_BUCKET, [path]).catch(() => {});
      throw error;
    }
    if (previous && previous !== path && previous.startsWith(`${user.id}/`))
      await services.media.remove(AVATAR_BUCKET, [previous]).catch(() => safeLog("error", "avatar_cleanup_failed", {}));
    return Response.json({ avatarUrl: await services.media.signedUrl(AVATAR_BUCKET, path, 3600) }, { headers });
  } catch (error) {
    return failure(error);
  }
}
