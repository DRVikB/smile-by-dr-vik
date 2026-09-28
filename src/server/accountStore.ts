import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** A failure that the API reports with a stable code. */
export type AccountErrorCode = "auth_required" | "mfa_required" | "subscription_required" | "allowance_exhausted" | "no_active_allowance"
  | "duplicate_request" | "account_not_found" | "rate_limited" | "account_service_unavailable";

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode, message: string = code) {
    super(message);
    this.name = "AccountError";
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  providers: string[];
  /** Authenticator assurance level of this session ("aal1" password/Apple, "aal2" with a second factor). */
  aal?: "aal1" | "aal2";
  /** The account has a verified second factor, so sessions must reach aal2. */
  mfaEnrolled?: boolean;
  /** Name held in Supabase user metadata (e.g. Apple web sign-in), used only to fill an empty account name. */
  metadataName?: string | null;
}

export interface AccountProfile {
  fullName: string | null;
  preferredName: string | null;
  onboardingCompletedAt: string | null;
  createdAt: string | null;
  /** The account has used generations before (an existing, not new, user). */
  hasGenerationHistory: boolean;
  /** Private object path of the profile photo (never sent to clients; they get a short-lived link). */
  avatarPath?: string | null;
}

export interface ProfilePatch {
  fullName?: string | null;
  preferredName?: string | null;
  /** Only fill names that are currently empty (e.g. the name Apple supplies at first sign-in). */
  onlyIfEmpty?: boolean;
  onboardingCompleted?: boolean;
}

/** Server-calculated storage for account-held files. V1 holds none (patient media stays on the device). */
export interface StorageUsage {
  usedBytes: number;
  limitBytes: number | null;
}

export type ConsentType = "terms" | "privacy" | "upload_authority" | "ai_processing" | "customer_dpa" | "case_library_authority";

export type ReferenceMaterial = "Single-shade composite" | "Layered composite" | "Porcelain";
export interface ReferenceImageRecord { kind: "original" | "reference"; path: string; bytes: number; width: number | null; height: number | null }
/** One of the clinician's own finished cases (Case Library). Never a patient case. */
export interface ReferenceCaseRecord {
  id: string;
  label: string;
  material: ReferenceMaterial;
  teethTreated: number[];
  startingConditions: string[];
  styleTags: string[];
  validationOnly: boolean;
  createdAt: string;
  images: ReferenceImageRecord[];
}
export interface ReferenceCaseInput {
  label: string;
  material: ReferenceMaterial;
  teethTreated: number[];
  startingConditions: string[];
  styleTags: string[];
}

export interface CachedSubscription {
  status: "none" | "active" | "cancelled" | "billing_issue" | "expired";
  productId: string | null;
  expiresAt: string | null;
  environment: "production" | "sandbox" | null;
}

export interface GenerationBalance {
  included: number;
  used: number;
  remaining: number;
  purchased: number;
  periodEnd: string | null;
}

export interface PeriodInput {
  userId: string;
  source: "subscription" | "override";
  environment: "production" | "sandbox";
  productId: string | null;
  start: string;
  end: string;
  allowance: number;
}

export interface RevenueCatEventInput {
  eventId: string;
  type: string;
  userId: string | null;
  environment: "production" | "sandbox";
  productId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  allowance: number;
}

/** Everything the API needs from the database and Supabase Auth. */
export interface AccountStore {
  verifyAccessToken(token: string): Promise<AuthenticatedUser | null>;
  activeOverride(userId: string): Promise<{ monthlyAllowance: number; expiresAt: string | null } | null>;
  cachedSubscription(userId: string): Promise<CachedSubscription | null>;
  ensurePeriod(input: PeriodInput): Promise<void>;
  reserve(userId: string, reservationId: string, caseId: string | null): Promise<{ remaining: number }>;
  commit(reservationId: string, meta: { provider?: string; model?: string; providerRequestId?: string; promptVersion?: string; treatmentType?: string; referenceCaseIds?: string[] }): Promise<void>;
  release(reservationId: string, reason: string): Promise<void>;
  balance(userId: string): Promise<GenerationBalance>;
  applyRevenueCatEvent(event: RevenueCatEventInput): Promise<string>;
  recordAccountDeletion(userHash: string): Promise<void>;
  recordConsent(userId: string, type: ConsentType, version: string, caseId?: string | null): Promise<void>;
  consentVersions(userId: string): Promise<Partial<Record<ConsentType, string[]>>>;
  recordSecurityEvent(userId: string | null, actor: "user" | "system", event: string, metadata?: Record<string, string | number | boolean | null>): Promise<void>;
  exportAccountData(userId: string): Promise<unknown>;
  locateCaseRecords(userId: string, caseId: string): Promise<unknown>;
  profile(userId: string): Promise<AccountProfile>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<void>;
  storageUsage(userId: string): Promise<StorageUsage>;
  adjustStorage(userId: string, deltaBytes: number): Promise<void>;
  /** Set (or clear) the profile photo; returns the previous object path so it can be removed. */
  setAvatarPath(userId: string, path: string | null): Promise<string | null>;
  listReferenceCases(userId: string): Promise<ReferenceCaseRecord[]>;
  createReferenceCase(userId: string, id: string, input: ReferenceCaseInput, images: ReferenceImageRecord[]): Promise<void>;
  updateReferenceCase(userId: string, id: string, patch: Partial<ReferenceCaseInput>): Promise<boolean>;
  /** Deletes the case and its image rows; returns what storage objects to remove (null if not the user's). */
  deleteReferenceCase(userId: string, id: string): Promise<{ paths: string[]; bytes: number } | null>;
  recordStyleFeedback(userId: string, requestId: string, rating: "yes" | "not_quite", referenceCount: number): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export const AVATAR_BUCKET = "profile-avatars";
export const CASE_LIBRARY_BUCKET = "case-library";

/**
 * Private object storage (Supabase Storage, service role). Every path starts
 * with the owner's user id; handlers build paths from the authenticated user,
 * never from client input.
 */
export interface MediaStore {
  put(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(bucket: string, paths: string[]): Promise<void>;
  signedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string | null>;
  download(bucket: string, path: string): Promise<Uint8Array | null>;
  /** Remove every object the user owns in both buckets (account deletion). */
  removeAllFor(userId: string): Promise<void>;
}

const RPC_CODES = ["allowance_exhausted", "no_active_allowance", "duplicate_request", "account_not_found", "rate_limited"] as const;

/** Read the aal claim from a token Supabase has already verified (no trust without getUser). */
function tokenAal(token: string): "aal1" | "aal2" {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { aal?: string };
    return payload.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

function rpcError(error: { message?: string } | null): never {
  const code = RPC_CODES.find(c => error?.message?.includes(c));
  throw code ? new AccountError(code) : new AccountError("account_service_unavailable", "Account database request failed.");
}

export function createSupabaseAccountStore(url: string, serviceRoleKey: string): AccountStore {
  const admin: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    async verifyAccessToken(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        providers: (data.user.identities ?? []).map(identity => identity.provider),
        aal: tokenAal(token),
        mfaEnrolled: (data.user.factors ?? []).some(factor => factor.status === "verified"),
        metadataName: typeof data.user.user_metadata?.full_name === "string" ? data.user.user_metadata.full_name
          : typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name : null,
      };
    },
    async activeOverride(userId) {
      const { data, error } = await admin.from("access_overrides")
        .select("monthly_generation_allowance, expires_at")
        .eq("user_id", userId).is("revoked_at", null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("monthly_generation_allowance", { ascending: false })
        .limit(1);
      if (error) rpcError(error);
      const row = data?.[0];
      return row ? { monthlyAllowance: row.monthly_generation_allowance, expiresAt: row.expires_at } : null;
    },
    async cachedSubscription(userId) {
      const { data, error } = await admin.from("profiles")
        .select("subscription_status, subscription_product_id, subscription_expires_at, subscription_environment")
        .eq("id", userId).maybeSingle();
      if (error) rpcError(error);
      return data ? { status: data.subscription_status, productId: data.subscription_product_id, expiresAt: data.subscription_expires_at, environment: data.subscription_environment } : null;
    },
    async ensurePeriod(input) {
      const { error } = await admin.rpc("ensure_allowance_period", {
        p_user: input.userId, p_source: input.source, p_environment: input.environment, p_product: input.productId,
        p_start: input.start, p_end: input.end, p_allowance: input.allowance,
      });
      if (error) rpcError(error);
    },
    async reserve(userId, reservationId, caseId) {
      const { data, error } = await admin.rpc("reserve_generation", { p_user: userId, p_reservation: reservationId, p_case: caseId });
      if (error) rpcError(error);
      return { remaining: Number(data?.[0]?.remaining ?? 0) };
    },
    async commit(reservationId, meta) {
      const { error } = await admin.rpc("commit_generation", {
        p_reservation: reservationId, p_provider: meta.provider ?? null, p_model: meta.model ?? null, p_provider_request_id: meta.providerRequestId ?? null,
        p_prompt_version: meta.promptVersion ?? null, p_treatment_type: meta.treatmentType ?? null,
        p_reference_case_ids: meta.referenceCaseIds?.length ? meta.referenceCaseIds : null,
      });
      if (error) rpcError(error);
    },
    async release(reservationId, reason) {
      const { error } = await admin.rpc("release_generation", { p_reservation: reservationId, p_reason: reason });
      if (error) rpcError(error);
    },
    async balance(userId) {
      const { data, error } = await admin.rpc("generation_balance", { p_user: userId });
      if (error) rpcError(error);
      const row = data?.[0] ?? {};
      return { included: row.included ?? 0, used: row.used ?? 0, remaining: row.remaining ?? 0, purchased: row.purchased ?? 0, periodEnd: row.period_end ?? null };
    },
    async applyRevenueCatEvent(event) {
      const { data, error } = await admin.rpc("apply_revenuecat_event", {
        p_event_id: event.eventId, p_type: event.type, p_user: event.userId, p_environment: event.environment,
        p_product: event.productId, p_period_start: event.periodStart, p_period_end: event.periodEnd, p_allowance: event.allowance,
      });
      if (error) rpcError(error);
      return String(data);
    },
    async recordAccountDeletion(userHash) {
      const { error } = await admin.from("account_deletions").insert({ user_hash: userHash });
      if (error) rpcError(error);
    },
    async recordConsent(userId, type, version, caseId) {
      const { error } = await admin.rpc("record_consent", { p_user: userId, p_type: type, p_version: version, p_case: caseId ?? null });
      if (error) rpcError(error);
    },
    async consentVersions(userId) {
      const { data, error } = await admin.from("consent_records").select("record_type, document_version").eq("user_id", userId).is("case_id", null);
      if (error) rpcError(error);
      const versions: Partial<Record<ConsentType, string[]>> = {};
      for (const row of data ?? []) (versions[row.record_type as ConsentType] ??= []).push(row.document_version);
      return versions;
    },
    async recordSecurityEvent(userId, actor, event, metadata = {}) {
      const { error } = await admin.rpc("record_security_event", { p_user: userId, p_actor: actor, p_event: event, p_metadata: metadata });
      if (error) rpcError(error);
    },
    async exportAccountData(userId) {
      const { data, error } = await admin.rpc("export_account_data", { p_user: userId });
      if (error) rpcError(error);
      return data;
    },
    async locateCaseRecords(userId, caseId) {
      const { data, error } = await admin.rpc("locate_case_records", { p_user: userId, p_case: caseId });
      if (error) rpcError(error);
      return data;
    },
    async profile(userId) {
      const { data, error } = await admin.from("profiles")
        .select("full_name, preferred_name, onboarding_completed_at, created_at, avatar_path").eq("id", userId).maybeSingle();
      if (error) rpcError(error);
      const { data: history, error: historyError } = await admin.from("generation_ledger")
        .select("id").eq("user_id", userId).in("event_type", ["generation", "monthly_generation"]).limit(1);
      if (historyError) rpcError(historyError);
      return {
        fullName: data?.full_name ?? null,
        preferredName: data?.preferred_name ?? null,
        onboardingCompletedAt: data?.onboarding_completed_at ?? null,
        createdAt: data?.created_at ?? null,
        hasGenerationHistory: Boolean(history?.length),
        avatarPath: data?.avatar_path ?? null,
      };
    },
    async updateProfile(userId, patch) {
      const names: [keyof ProfilePatch, string][] = [["fullName", "full_name"], ["preferredName", "preferred_name"]];
      for (const [key, column] of names) {
        if (patch[key] === undefined) continue;
        let query = admin.from("profiles").update({ [column]: patch[key] }).eq("id", userId);
        if (patch.onlyIfEmpty) query = query.is(column, null);
        const { error } = await query;
        if (error) rpcError(error);
      }
      if (patch.onboardingCompleted) {
        const { error } = await admin.from("profiles").update({ onboarding_completed_at: new Date().toISOString() })
          .eq("id", userId).is("onboarding_completed_at", null);
        if (error) rpcError(error);
      }
    },
    async storageUsage(userId) {
      const { data, error } = await admin.from("storage_accounts").select("used_bytes, limit_bytes").eq("user_id", userId).maybeSingle();
      if (error) rpcError(error);
      return { usedBytes: Number(data?.used_bytes ?? 0), limitBytes: data?.limit_bytes == null ? null : Number(data.limit_bytes) };
    },
    async adjustStorage(userId, deltaBytes) {
      if (!deltaBytes) return;
      const { error } = await admin.rpc("adjust_storage_usage", { p_user: userId, p_delta: Math.round(deltaBytes) });
      if (error) rpcError(error);
    },
    async setAvatarPath(userId, path) {
      const { data: current, error: readError } = await admin.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
      if (readError) rpcError(readError);
      const { error } = await admin.from("profiles").update({ avatar_path: path }).eq("id", userId);
      if (error) rpcError(error);
      return current?.avatar_path ?? null;
    },
    async listReferenceCases(userId) {
      const { data, error } = await admin.from("reference_cases")
        .select("id, label, material, teeth_treated, starting_conditions, style_tags, validation_only, created_at, reference_case_images (kind, storage_path, bytes, width, height)")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
      if (error) rpcError(error);
      return (data ?? []).map(row => ({
        id: row.id, label: row.label, material: row.material, teethTreated: row.teeth_treated ?? [], startingConditions: row.starting_conditions ?? [],
        styleTags: row.style_tags ?? [], validationOnly: row.validation_only, createdAt: row.created_at,
        images: ((row.reference_case_images ?? []) as { kind: "original" | "reference"; storage_path: string; bytes: number; width: number | null; height: number | null }[])
          .map(image => ({ kind: image.kind, path: image.storage_path, bytes: Number(image.bytes), width: image.width, height: image.height })),
      }));
    },
    async createReferenceCase(userId, id, input, images) {
      const { error } = await admin.from("reference_cases").insert({
        id, user_id: userId, label: input.label, material: input.material, teeth_treated: input.teethTreated,
        starting_conditions: input.startingConditions, style_tags: input.styleTags,
      });
      if (error) rpcError(error);
      const { error: imageError } = await admin.from("reference_case_images").insert(images.map(image => ({
        reference_case_id: id, user_id: userId, kind: image.kind, storage_path: image.path, bytes: image.bytes, width: image.width, height: image.height,
      })));
      if (imageError) {
        await admin.from("reference_cases").delete().eq("id", id).eq("user_id", userId);
        rpcError(imageError);
      }
    },
    async updateReferenceCase(userId, id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.label !== undefined) row.label = patch.label;
      if (patch.material !== undefined) row.material = patch.material;
      if (patch.teethTreated !== undefined) row.teeth_treated = patch.teethTreated;
      if (patch.startingConditions !== undefined) row.starting_conditions = patch.startingConditions;
      if (patch.styleTags !== undefined) row.style_tags = patch.styleTags;
      const { data, error } = await admin.from("reference_cases").update(row).eq("id", id).eq("user_id", userId).select("id");
      if (error) rpcError(error);
      return Boolean(data?.length);
    },
    async deleteReferenceCase(userId, id) {
      const { data: images, error: readError } = await admin.from("reference_case_images").select("storage_path, bytes").eq("reference_case_id", id).eq("user_id", userId);
      if (readError) rpcError(readError);
      const { data, error } = await admin.from("reference_cases").delete().eq("id", id).eq("user_id", userId).select("id");
      if (error) rpcError(error);
      if (!data?.length) return null;
      return { paths: (images ?? []).map(i => i.storage_path), bytes: (images ?? []).reduce((sum, i) => sum + Number(i.bytes), 0) };
    },
    async recordStyleFeedback(userId, requestId, rating, referenceCount) {
      const { error } = await admin.from("style_feedback").upsert(
        { user_id: userId, request_id: requestId, rating, reference_count: referenceCount }, { onConflict: "user_id,request_id" });
      if (error) rpcError(error);
    },
    async deleteUser(userId) {
      // Cascades to profiles, allowances, reservations, ledger and overrides.
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new AccountError("account_service_unavailable", "The account could not be deleted.");
    },
  };
}

export function createSupabaseMediaStore(url: string, serviceRoleKey: string): MediaStore {
  const admin: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const fail = (): never => { throw new AccountError("account_service_unavailable", "Private storage request failed."); };
  return {
    async put(bucket, path, bytes, contentType) {
      const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType, upsert: false, cacheControl: "private, max-age=0" });
      if (error) fail();
    },
    async remove(bucket, paths) {
      if (!paths.length) return;
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) fail();
    },
    async signedUrl(bucket, path, expiresInSeconds) {
      const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
      return error || !data ? null : data.signedUrl;
    },
    async download(bucket, path) {
      const { data, error } = await admin.storage.from(bucket).download(path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    async removeAllFor(userId) {
      for (const bucket of [AVATAR_BUCKET, CASE_LIBRARY_BUCKET]) {
        // Objects are "<user id>/<file>" (avatars) or "<user id>/<case id>/<file>" (Case Library).
        const pending = [userId];
        while (pending.length) {
          const prefix = pending.pop()!;
          const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
          if (error) fail();
          const files = (data ?? []).filter(item => item.id).map(item => `${prefix}/${item.name}`);
          pending.push(...(data ?? []).filter(item => !item.id).map(item => `${prefix}/${item.name}`));
          if (files.length) {
            const { error: removeError } = await admin.storage.from(bucket).remove(files);
            if (removeError) fail();
          }
        }
      }
    },
  };
}
