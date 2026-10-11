import { test } from "node:test";
import assert from "node:assert/strict";
import type { AccountStore, AuthenticatedUser } from "../src/server/accountStore";
import { AccountError } from "../src/server/accountStore";
import type { AccountServices } from "../src/server/access";
import { formatCode, handleAdminCodes, handleRedeemCode, hashCode, newCodeBody, normaliseCode, type AccessCodeStore } from "../src/server/accessCodes";

const tester: AuthenticatedUser = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "tester@example.test", providers: ["email"] };
const ADMIN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function world() {
  const codes = new Map<string, { used: boolean; revoked: boolean; days: number; monthly: number }>();
  let limited = false;
  const store: AccessCodeStore = {
    redeem: async (_user, hash) => { if (limited) throw new AccountError("rate_limited"); const c = codes.get(hash); if (!c || c.used || c.revoked) return { ok: false, expiresAt: null, monthlyGenerations: null }; c.used = true; return { ok: true, expiresAt: new Date(Date.now() + c.days * 86400000).toISOString(), monthlyGenerations: c.monthly }; },
    list: async () => [],
    create: async (_by, rows, o) => { for (const r of rows) codes.set(r.codeHash, { used: false, revoked: false, days: o.accessDays, monthly: o.monthlyGenerations }); },
    revoke: async () => true,
  };
  const accounts = { store: { verifyAccessToken: async (t: string) => (t === "tester" ? tester : null) } as unknown as AccountStore } as unknown as AccountServices;
  return { store, services: { ...accounts, codes: store }, codes, limit: () => { limited = true; } };
}
const post = (path: string, body: unknown, token?: string) => new Request(`https://smile.test${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

test("codes are easy to read aloud, and typed codes are forgiven their spacing and case", async () => {
  const body = newCodeBody();
  assert.match(body, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/, "no 0, O, 1, I or L");
  assert.match(formatCode(body), /^SC-.{5}-.{5}$/);
  assert.equal(normaliseCode(formatCode(body)), body);
  assert.equal(normaliseCode(` sc ${body.slice(0, 5).toLowerCase()} ${body.slice(5)} `), body);
  assert.equal(normaliseCode("SC-123"), null);
  assert.equal(normaliseCode(42), null);
  assert.notEqual(await hashCode(body), await hashCode(newCodeBody()));
});

test("an admin creates codes once; a tester redeems one once", async () => {
  const w = world();
  const created = await handleAdminCodes(post("/api/admin/codes/create", { count: 3, monthlyGenerations: 25, accessDays: 14, label: "Beta group" }), w.store, ADMIN, "codes/create");
  assert.equal(created?.status, 201);
  const { codes } = await created!.json() as { codes: string[] };
  assert.equal(codes.length, 3);
  assert.equal(new Set(codes).size, 3);

  assert.equal((await handleRedeemCode(post("/api/account/redeem-code", { code: codes[0] }), w.services)).status, 401, "signed out");
  const ok = await handleRedeemCode(post("/api/account/redeem-code", { code: codes[0].toLowerCase() }, "tester"), w.services);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).monthlyGenerations, 25);
  assert.equal((await handleRedeemCode(post("/api/account/redeem-code", { code: codes[0] }, "tester"), w.services)).status, 400, "already used");
  assert.equal((await handleRedeemCode(post("/api/account/redeem-code", { code: "SC-AAAAA-AAAAA" }, "tester"), w.services)).status, 400, "unknown");
  assert.equal((await handleRedeemCode(post("/api/account/redeem-code", { code: "nope" }, "tester"), w.services)).status, 400, "malformed");
  w.limit();
  assert.equal((await handleRedeemCode(post("/api/account/redeem-code", { code: codes[1] }, "tester"), w.services)).status, 429);
  assert.equal((await handleRedeemCode(post("/api/account/redeem-code", { code: codes[1] }, "tester"), null)).status, 503);
});

test("code requests are bounded", async () => {
  const w = world();
  for (const body of [{ count: 0, monthlyGenerations: 25, accessDays: 14 }, { count: 51, monthlyGenerations: 25, accessDays: 14 }, { count: 1, monthlyGenerations: 0, accessDays: 14 }, { count: 1, monthlyGenerations: 25, accessDays: 400 }, { count: 1, monthlyGenerations: 25, accessDays: 14, validDays: 0 }])
    assert.equal((await handleAdminCodes(post("/api/admin/codes/create", body), w.store, ADMIN, "codes/create"))?.status, 400);
  assert.equal(w.codes.size, 0);
  assert.equal((await handleAdminCodes(post("/api/admin/codes/revoke", { id: "not-an-id" }), w.store, ADMIN, "codes/revoke"))?.status, 400);
});
