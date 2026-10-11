import { test } from "node:test";
import assert from "node:assert/strict";
import type { AccountStore, AuthenticatedUser } from "../src/server/accountStore";
import type { AccountServices } from "../src/server/access";
import { handleAdmin, handleAdminMe, MAX_ADJUSTMENT, type AdminLead, type AdminServices, type AdminStore } from "../src/server/adminHandlers";

const owner: AuthenticatedUser = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "owner@example.test", providers: ["email"] };
const dentist: AuthenticatedUser = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "dentist@example.test", providers: ["email"] };
const LEAD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function world() {
  const calls: string[] = [];
  const leads: AdminLead[] = [{ id: LEAD, created_at: new Date().toISOString(), name: "Dr A", email: "a@practice.example", practice: null, role: "dentist", interest: "demo", message: null, status: "new", admin_note: null, contacted_at: null }];
  const admin: AdminStore = {
    isAdmin: async id => id === owner.id,
    overview: async days => ({ accounts: 2, accounts_new: 1, subscribers: 0, complimentary: 1, generations: 5, generations_today: 1, failed: 0, by_day: Array.from({ length: days }, () => ({ day: "2026-10-08", count: 0 })), cases: 3, leads_new: 1, leads: 1, lab_links: 0, lab_links_opened: 0, lab_replies: 0 }),
    events: async () => [],
    accounts: async q => { calls.push(`accounts:${q}`); return []; },
    adjust: async (id, n, note) => { calls.push(`adjust:${id}:${n}:${note}`); },
    setUnlimited: async (id, on) => { calls.push(`unlimited:${id}:${on}`); },
    leads: async () => leads,
    updateLead: async (id, status, note) => { calls.push(`lead:${id}:${status}:${note}`); },
  };
  const store = { verifyAccessToken: async (token: string) => (token === "owner" ? owner : token === "dentist" ? dentist : null) } as unknown as AccountStore;
  const services: AdminServices = { accounts: { store } as unknown as AccountServices, admin };
  return { services, calls };
}
const req = (token: string | null, method = "GET", body?: unknown) => new Request("https://smile.test/api/admin/x", {
  method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
});

test("only administrators reach the admin API; everyone else is refused", async () => {
  const { services } = world();
  assert.equal((await handleAdmin(req(null), services, "overview", new URLSearchParams())).status, 401);
  assert.equal((await handleAdmin(req("dentist"), services, "overview", new URLSearchParams())).status, 403);
  const ok = await handleAdmin(req("owner"), services, "overview", new URLSearchParams("days=7"));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).overview.by_day.length, 7);
  assert.deepEqual(await (await handleAdminMe(req("dentist"), services)).json(), { admin: false });
  assert.deepEqual(await (await handleAdminMe(req("owner"), services)).json(), { admin: true });
  assert.equal((await handleAdmin(req("owner"), null, "overview", new URLSearchParams())).status, 503);
});

test("generation adjustments are bounded and unlimited access can be switched", async () => {
  const { services, calls } = world();
  const change = (body: unknown) => handleAdmin(req("owner", "POST", body), services, "accounts/allowance", new URLSearchParams());
  assert.equal((await change({ userId: dentist.id, action: "add", amount: 10, note: "Launch offer" })).status, 200);
  assert.equal((await change({ userId: dentist.id, action: "remove", amount: 3 })).status, 200);
  assert.equal((await change({ userId: dentist.id, action: "add", amount: MAX_ADJUSTMENT + 1 })).status, 400);
  assert.equal((await change({ userId: dentist.id, action: "add", amount: 1.5 })).status, 400);
  assert.equal((await change({ userId: "not-a-user", action: "add", amount: 1 })).status, 400);
  assert.equal((await change({ userId: dentist.id, action: "delete" })).status, 400);
  assert.equal((await change({ userId: dentist.id, action: "unlimited" })).status, 200);
  assert.equal((await change({ userId: dentist.id, action: "limited" })).status, 200);
  assert.deepEqual(calls, [`adjust:${dentist.id}:10:Launch offer`, `adjust:${dentist.id}:-3:Admin dashboard`, `unlimited:${dentist.id}:true`, `unlimited:${dentist.id}:false`]);
});

test("enquiries can be listed and followed up", async () => {
  const { services, calls } = world();
  const list = await handleAdmin(req("owner"), services, "leads", new URLSearchParams());
  assert.equal((await list.json()).leads.length, 1);
  assert.equal((await handleAdmin(req("owner", "POST", { id: LEAD, status: "contacted", note: "Called, demo Tuesday" }), services, "leads/update", new URLSearchParams())).status, 200);
  assert.equal((await handleAdmin(req("owner", "POST", { id: LEAD, status: "spam" }), services, "leads/update", new URLSearchParams())).status, 400);
  assert.deepEqual(calls, [`lead:${LEAD}:contacted:Called, demo Tuesday`]);
});
