import { createClient } from "@supabase/supabase-js";
import { safeLog } from "./redact";
import { authenticate, type AccountServices } from "./access";
import { AccountError, type AuthenticatedUser } from "./accountStore";
import { handleAdminCodes, type AccessCodeStore } from "./accessCodes";

/**
 * The admin dashboard (web portal): figures, accounts, generation adjustments and website enquiries.
 * Only accounts listed in admin_users can call these; every change is audited in the database.
 */
export interface AdminOverview {
  accounts: number; accounts_new: number; subscribers: number; complimentary: number;
  generations: number; generations_today: number; failed: number; by_day: { day: string; count: number }[];
  cases: number; leads_new: number; leads: number; lab_links: number; lab_links_opened: number; lab_replies: number;
}
export interface AdminAccount {
  id: string; email: string | null; display_name: string | null; created_at: string; subscription_status: string; subscription_product_id: string | null;
  remaining: number; generations_30d: number; last_generation_at: string | null; unlimited: boolean; complimentary: boolean; is_admin: boolean;
}
export interface AdminEvent { kind: "lead" | "account" | "subscription"; at: string; title: string; detail: string; ref: string | null }
export interface AdminLead {
  id: string; created_at: string; name: string; email: string; practice: string | null; role: string; interest: string;
  message: string | null; status: LeadStatus; admin_note: string | null; contacted_at: string | null;
}
export const LEAD_STATUSES = ["new", "contacted", "closed"] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];

export interface AdminStore {
  isAdmin(userId: string): Promise<boolean>;
  overview(days: number): Promise<AdminOverview>;
  events(limit: number): Promise<AdminEvent[]>;
  accounts(query: string | null): Promise<AdminAccount[]>;
  adjust(userId: string, quantity: number, note: string): Promise<void>;
  setUnlimited(userId: string, on: boolean, note: string): Promise<void>;
  leads(): Promise<AdminLead[]>;
  updateLead(id: string, status: LeadStatus, note: string | null): Promise<void>;
}
export interface AdminServices { accounts: AccountServices; admin: AdminStore; codes?: AccessCodeStore }

const headers = { "Cache-Control": "no-store" };
export const MAX_ADJUSTMENT = 1000;
const refuse = (status: number, code: string, error: string) => Response.json({ error, code }, { status, headers });
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const clean = value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
};

function failure(error: unknown): Response {
  if (error instanceof AccountError && error.code === "auth_required") return refuse(401, "auth_required", "Sign in to continue.");
  if (error instanceof AccountError && error.code === "mfa_required") return refuse(401, "mfa_required", "Enter your two-factor code to continue.");
  if (error instanceof AccountError && error.code === "forbidden") return refuse(403, "forbidden", "This page is for SmileCompose administrators.");
  if (error instanceof AccountError && error.code === "account_not_found") return refuse(404, "account_not_found", "That account no longer exists.");
  safeLog("error", "admin_failed", { code: error instanceof AccountError ? error.code : "unexpected" });
  return refuse(503, "account_service_unavailable", "The admin service couldn’t be reached. Please try again.");
}

async function admin(request: Request, services: AdminServices | null): Promise<{ user: AuthenticatedUser; s: AdminServices }> {
  if (!services) throw new AccountError("account_service_unavailable");
  const user = await authenticate(request, services.accounts);
  if (!user) throw new AccountError("auth_required");
  if (!(await services.admin.isAdmin(user.id))) throw new AccountError("forbidden");
  return { user, s: services };
}

async function json(request: Request): Promise<Record<string, unknown> | null> {
  try { const value = await request.json(); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
}

/** Whether the signed-in account is an administrator (the portal shows Admin only then). */
export async function handleAdminMe(request: Request, services: AdminServices | null): Promise<Response> {
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
  try {
    if (!services) throw new AccountError("account_service_unavailable");
    const user = await authenticate(request, services.accounts);
    if (!user) throw new AccountError("auth_required");
    return Response.json({ admin: await services.admin.isAdmin(user.id) }, { headers });
  } catch (error) { return failure(error); }
}

export async function handleAdmin(request: Request, services: AdminServices | null, path: string, query: URLSearchParams): Promise<Response> {
  try {
    const { user, s } = await admin(request, services);
    if (path === "overview" && request.method === "GET") {
      const days = Math.min(365, Math.max(1, Number(query.get("days")) || 30));
      const [overview, events] = await Promise.all([s.admin.overview(days), s.admin.events(40)]);
      return Response.json({ overview, events }, { headers });
    }
    if (path === "accounts" && request.method === "GET")
      return Response.json({ accounts: await s.admin.accounts(text(query.get("q"), 80)) }, { headers });
    if (path === "accounts/allowance" && request.method === "POST") {
      const body = await json(request);
      if (!body || !uuid(body.userId)) return refuse(400, "invalid_request", "Choose an account.");
      const note = text(body.note, 200) ?? "Admin dashboard";
      if (body.action === "unlimited" || body.action === "limited") {
        await s.admin.setUnlimited(body.userId, body.action === "unlimited", note);
      } else if (body.action === "add" || body.action === "remove") {
        const amount = Number(body.amount);
        if (!Number.isInteger(amount) || amount < 1 || amount > MAX_ADJUSTMENT) return refuse(400, "invalid_amount", `Enter a whole number from 1 to ${MAX_ADJUSTMENT}.`);
        await s.admin.adjust(body.userId, body.action === "add" ? amount : -amount, note);
      } else return refuse(400, "invalid_request", "That change isn’t available.");
      safeLog("info", "admin_allowance_changed", { action: String(body.action), by: user.id.slice(0, 8) });
      return Response.json({ ok: true }, { headers });
    }
    if (path === "leads" && request.method === "GET") return Response.json({ leads: await s.admin.leads() }, { headers });
    if (path === "leads/update" && request.method === "POST") {
      const body = await json(request);
      if (!body || !uuid(body.id) || !LEAD_STATUSES.includes(body.status as LeadStatus)) return refuse(400, "invalid_request", "That enquiry update wasn’t valid.");
      await s.admin.updateLead(body.id, body.status as LeadStatus, body.note === undefined ? null : text(body.note, 1000));
      return Response.json({ ok: true }, { headers });
    }
    if (path.startsWith("codes") && s.codes) { const response = await handleAdminCodes(request, s.codes, user.id, path); if (response) return response; }
    return refuse(404, "not_found", "Not found.");
  } catch (error) { return failure(error); }
}

export function createSupabaseAdminStore(url: string, serviceRoleKey: string): AdminStore {
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const fail = (error: { message?: string } | null): never => {
    if (error?.message?.includes("account_not_found")) throw new AccountError("account_not_found");
    throw new AccountError("account_service_unavailable");
  };
  return {
    async isAdmin(userId) {
      const { data, error } = await db.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
      if (error) fail(error);
      return Boolean(data);
    },
    async overview(days) {
      const { data, error } = await db.rpc("admin_overview", { p_days: days });
      if (error) fail(error);
      return data as AdminOverview;
    },
    async events(limit) {
      const { data, error } = await db.rpc("admin_events", { p_limit: limit });
      if (error) fail(error);
      return (data ?? []) as AdminEvent[];
    },
    async accounts(query) {
      const { data, error } = await db.rpc("admin_accounts", { p_query: query, p_limit: 100 });
      if (error) fail(error);
      return (data ?? []) as AdminAccount[];
    },
    async adjust(userId, quantity, note) {
      const { error } = await db.rpc("admin_adjust_generations", { p_user: userId, p_quantity: quantity, p_note: note });
      if (error) fail(error);
    },
    async setUnlimited(userId, on, note) {
      const { error } = await db.rpc("admin_set_unlimited", { p_user: userId, p_on: on, p_note: note });
      if (error) fail(error);
    },
    async leads() {
      const { data, error } = await db.from("website_leads")
        .select("id, created_at, name, email, practice, role, interest, message, status, admin_note, contacted_at")
        .order("created_at", { ascending: false }).limit(200);
      if (error) fail(error);
      return (data ?? []) as AdminLead[];
    },
    async updateLead(id, status, note) {
      const patch: Record<string, unknown> = { status };
      if (status === "contacted") patch.contacted_at = new Date().toISOString();
      if (note !== null) patch.admin_note = note;
      const { error } = await db.from("website_leads").update(patch).eq("id", id);
      if (error) fail(error);
    },
  };
}
