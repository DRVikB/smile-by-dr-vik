import { apiUrl } from "@/services/api/client";
import type { AdminAccount, AdminEvent, AdminLead, AdminOverview, LeadStatus } from "@/server/adminHandlers";
import type { AccessCode } from "@/server/accessCodes";

export type { AccessCode, AdminAccount, AdminEvent, AdminLead, AdminOverview, LeadStatus };
export class AdminError extends Error { constructor(message: string, readonly status: number) { super(message); this.name = "AdminError"; } }

async function call<T>(token: string, path: `/api/admin/${string}`, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(apiUrl(path), { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }); }
  catch { throw new AdminError("We couldn’t reach SmileCompose. Check your connection and try again.", 0); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new AdminError(typeof body.error === "string" ? body.error : "Something went wrong. Please try again.", response.status);
  return body as T;
}
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

export const adminMe = (token: string) => call<{ admin: boolean }>(token, "/api/admin/me").then(r => r.admin);
export const adminOverview = (token: string, days: number) => call<{ overview: AdminOverview; events: AdminEvent[] }>(token, `/api/admin/overview?days=${days}`);
export const adminAccounts = (token: string, q: string) => call<{ accounts: AdminAccount[] }>(token, `/api/admin/accounts?q=${encodeURIComponent(q)}`).then(r => r.accounts);
export type AllowanceChange = { action: "add" | "remove"; amount: number; note?: string } | { action: "unlimited" | "limited"; note?: string };
export const changeAllowance = (token: string, userId: string, change: AllowanceChange) => call<{ ok: true }>(token, "/api/admin/accounts/allowance", post({ userId, ...change }));
export const adminLeads = (token: string) => call<{ leads: AdminLead[] }>(token, "/api/admin/leads").then(r => r.leads);
export const updateLead = (token: string, id: string, status: LeadStatus, note?: string) => call<{ ok: true }>(token, "/api/admin/leads/update", post({ id, status, note }));
export const adminCodes = (token: string) => call<{ codes: AccessCode[] }>(token, "/api/admin/codes").then(r => r.codes);
/** The codes themselves come back only here, once. */
export const createCodes = (token: string, input: { count: number; monthlyGenerations: number; accessDays: number; validDays: number | null; label?: string }) =>
  call<{ codes: string[] }>(token, "/api/admin/codes/create", post(input)).then(r => r.codes);
export const revokeCode = (token: string, id: string) => call<{ ok: true }>(token, "/api/admin/codes/revoke", post({ id }));
