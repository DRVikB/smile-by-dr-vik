import { createClient } from "@supabase/supabase-js";
import { safeLog } from "./redact";
import { authenticate, type AccountServices } from "./access";
import { AccountError } from "./accountStore";

/**
 * Tester access codes: single-use codes the owner creates in the admin dashboard. A signed-in
 * person redeems one for complimentary access on their account. Only each code's SHA-256 is stored.
 */
export interface AccessCode {
  id: string; hint: string; label: string | null; monthlyGenerations: number; accessDays: number;
  createdAt: string; expiresAt: string | null; redeemedAt: string | null; redeemedBy: string | null; revokedAt: string | null;
  state: "unused" | "redeemed" | "revoked" | "expired";
}
export interface NewAccessCodes { count: number; label: string | null; monthlyGenerations: number; accessDays: number; validDays: number | null }
export interface AccessCodeStore {
  redeem(userId: string, codeHash: string): Promise<{ ok: boolean; expiresAt: string | null; monthlyGenerations: number | null }>;
  list(): Promise<AccessCode[]>;
  create(createdBy: string, rows: { codeHash: string; hint: string }[], options: NewAccessCodes): Promise<void>;
  revoke(id: string): Promise<boolean>;
}

const headers = { "Cache-Control": "no-store" };
const refuse = (status: number, code: string, error: string) => Response.json({ error, code }, { status, headers });
/** No 0/O, 1/I/L: codes are read aloud and typed by hand. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_PREFIX = "SC";
export const MAX_CODES_PER_REQUEST = 50;

/** What the tester may type ("sc-ab2cd 9fgh3", any case or spacing) reduced to the stored form. */
export function normaliseCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = clean.startsWith(CODE_PREFIX) ? clean.slice(CODE_PREFIX.length) : clean;
  return /^[A-Z0-9]{10}$/.test(body) ? body : null;
}
export const formatCode = (body: string) => `${CODE_PREFIX}-${body.slice(0, 5)}-${body.slice(5)}`;
export function newCodeBody(): string {
  const out: string[] = [];
  // Rejection sampling keeps every character equally likely.
  while (out.length < 10) { const [b] = crypto.getRandomValues(new Uint8Array(1)); if (b < ALPHABET.length * 8) out.push(ALPHABET[b % ALPHABET.length]); }
  return out.join("");
}
export async function hashCode(body: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`smilecompose-access-code:${body}`)));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function json(request: Request): Promise<Record<string, unknown> | null> {
  try { const value = await request.json(); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
}

/** POST /api/account/redeem-code { code } */
export async function handleRedeemCode(request: Request, services: (AccountServices & { codes?: AccessCodeStore }) | null): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    if (!services?.codes) throw new AccountError("account_service_unavailable");
    const user = await authenticate(request, services);
    if (!user) return refuse(401, "auth_required", "Sign in to use an access code.");
    const body = normaliseCode((await json(request))?.code);
    // A malformed code is answered like a wrong one, without touching the database.
    if (!body) return refuse(400, "code_invalid", "That code isn’t valid. Check it and try again.");
    const result = await services.codes.redeem(user.id, await hashCode(body));
    if (!result.ok) return refuse(400, "code_invalid", "That code isn’t valid, or it has already been used.");
    safeLog("info", "access_code_redeemed", { user: user.id.slice(0, 8) });
    return Response.json({ ok: true, expiresAt: result.expiresAt, monthlyGenerations: result.monthlyGenerations }, { headers });
  } catch (error) {
    if (error instanceof AccountError && error.code === "mfa_required") return refuse(401, "mfa_required", "Enter your two-factor code to continue.");
    if (error instanceof AccountError && error.code === "rate_limited") return refuse(429, "rate_limited", "Too many tries. Please wait an hour and try again.");
    safeLog("error", "access_code_failed", { code: error instanceof AccountError ? error.code : "unexpected" });
    return refuse(503, "account_service_unavailable", "Codes can’t be checked right now. Please try again.");
  }
}

const whole = (value: unknown, min: number, max: number): number | null => { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : null; };

/** Admin: the list, new codes (the only time the codes themselves are returned) and revoking an unused one. */
export async function handleAdminCodes(request: Request, store: AccessCodeStore, adminId: string, path: string): Promise<Response | null> {
  if (path === "codes" && request.method === "GET") return Response.json({ codes: await store.list() }, { headers });
  if (path === "codes/create" && request.method === "POST") {
    const body = await json(request);
    const count = whole(body?.count, 1, MAX_CODES_PER_REQUEST), monthlyGenerations = whole(body?.monthlyGenerations, 1, 1000), accessDays = whole(body?.accessDays, 1, 366);
    const validDays = body?.validDays === null || body?.validDays === undefined ? null : whole(body.validDays, 1, 366);
    if (!count || !monthlyGenerations || !accessDays || (body?.validDays != null && !validDays)) return refuse(400, "invalid_request", "Check the numbers and try again.");
    const label = typeof body?.label === "string" ? body.label.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80) || null : null;
    const bodies = Array.from({ length: count }, newCodeBody);
    await store.create(adminId, await Promise.all(bodies.map(async b => ({ codeHash: await hashCode(b), hint: b.slice(-4) }))), { count, label, monthlyGenerations, accessDays, validDays });
    safeLog("info", "access_codes_created", { count, by: adminId.slice(0, 8) });
    return Response.json({ codes: bodies.map(formatCode) }, { status: 201, headers });
  }
  if (path === "codes/revoke" && request.method === "POST") {
    const id = (await json(request))?.id;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return refuse(400, "invalid_request", "Choose a code.");
    return (await store.revoke(id)) ? Response.json({ ok: true }, { headers }) : refuse(409, "not_revocable", "That code has already been used or withdrawn.");
  }
  return null;
}

export function createSupabaseAccessCodeStore(url: string, serviceRoleKey: string): AccessCodeStore {
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const fail = (error: { message?: string } | null): never => {
    if (error?.message?.includes("rate_limited")) throw new AccountError("rate_limited");
    throw new AccountError("account_service_unavailable");
  };
  return {
    async redeem(userId, codeHash) {
      const { data, error } = await db.rpc("redeem_access_code", { p_user: userId, p_code_hash: codeHash });
      if (error) fail(error);
      const row = data?.[0];
      return { ok: Boolean(row?.ok), expiresAt: row?.access_expires_at ?? null, monthlyGenerations: row?.monthly_generations ?? null };
    },
    async list() {
      const { data, error } = await db.from("access_codes")
        .select("id, hint, label, monthly_generations, access_days, created_at, expires_at, redeemed_at, redeemed_by, revoked_at")
        .order("created_at", { ascending: false }).limit(300);
      if (error) fail(error);
      const rows = data ?? [];
      const ids = [...new Set(rows.map(r => r.redeemed_by).filter((v): v is string => Boolean(v)))];
      const emails = new Map<string, string>();
      if (ids.length) {
        const profiles = await db.from("profiles").select("id, email").in("id", ids);
        if (profiles.error) fail(profiles.error);
        for (const p of profiles.data ?? []) if (p.email) emails.set(p.id, p.email);
      }
      const now = Date.now();
      return rows.map(r => ({
        id: r.id, hint: r.hint, label: r.label, monthlyGenerations: r.monthly_generations, accessDays: r.access_days,
        createdAt: r.created_at, expiresAt: r.expires_at, redeemedAt: r.redeemed_at, redeemedBy: r.redeemed_by ? emails.get(r.redeemed_by) ?? "An account" : null, revokedAt: r.revoked_at,
        state: r.redeemed_at ? "redeemed" : r.revoked_at ? "revoked" : r.expires_at && Date.parse(r.expires_at) <= now ? "expired" : "unused",
      }) satisfies AccessCode);
    },
    async create(createdBy, rows, options) {
      const expires = options.validDays ? new Date(Date.now() + options.validDays * 86_400_000).toISOString() : null;
      const { error } = await db.from("access_codes").insert(rows.map(r => ({
        code_hash: r.codeHash, hint: r.hint, label: options.label, monthly_generations: options.monthlyGenerations, access_days: options.accessDays, expires_at: expires, created_by: createdBy,
      })));
      if (error) fail(error);
    },
    async revoke(id) {
      const { data, error } = await db.from("access_codes").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("redeemed_at", null).is("revoked_at", null).select("id");
      if (error) fail(error);
      return Boolean(data?.length);
    },
  };
}
