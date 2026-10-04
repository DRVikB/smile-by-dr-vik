import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleGenerationRequest } from "../src/lib/generation/handler";
import { AccountError, type AccountStore, type AuthenticatedUser, type MediaStore, type RevenueCatEventInput } from "../src/server/accountStore";
import { evaluateAccess, type AccountServices } from "../src/server/access";
import { readProEntitlement, type ProEntitlement } from "../src/server/revenuecat";
import { handleRevenueCatWebhook, resolveUserId, safeEqual } from "../src/server/revenuecatWebhook";
import { handleAccountDelete, handleAccountExport, handleAccountStatus, handleConsents, handleProfileUpdate } from "../src/server/accountHandlers";
import { DOCUMENT_VERSIONS } from "../src/config/legal";
import { redact } from "../src/server/redact";
import { pageSecurityHeaders } from "../src/server/securityHeaders";
import { parseServiceAccount, vertexTransport } from "../src/lib/generation/googleTransport";
import { revokeAppleAuthorization } from "../src/server/appleRevoke";
import { accountsMode } from "../src/server/env";
import { SUBSCRIPTION_PRODUCTS, TRIAL_GENERATIONS, generationsForProduct, planForProduct } from "../src/config/subscriptions";
import { defaultSettings } from "../src/lib/types";
import { qaSettingsSha256, qaSourceSha256 } from "../src/lib/generation/qaCapture";
import { generationSchema } from "../src/lib/generation/schema";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const user: AuthenticatedUser = { id: "11111111-1111-4111-8111-111111111111", email: "dr@example.test", providers: ["email"] };
const future = new Date(Date.now() + 20 * 86400000).toISOString();
const past = new Date(Date.now() - 10 * 86400000).toISOString();

function fakeStore(overrides: Partial<AccountStore> = {}) {
  const calls: string[] = [];
  const store: AccountStore = {
    verifyAccessToken: async token => (token === "good-token" ? user : null),
    activeOverride: async () => null,
    cachedSubscription: async () => null,
    ensurePeriod: async input => { calls.push(`period:${input.source}:${input.allowance}`); },
    expireSubscription: async (_u, at) => { calls.push(`expire:${at}`); },
    reserve: async (_u, id) => { calls.push(`reserve:${id}`); return { remaining: 4 }; },
    commit: async id => { calls.push(`commit:${id}`); },
    release: async (id, reason) => { calls.push(`release:${id}:${reason}`); },
    balance: async () => ({ included: 50, used: 1, remaining: 49, purchased: 0, periodEnd: future }),
    applyRevenueCatEvent: async (e: RevenueCatEventInput) => { calls.push(`event:${e.type}:${e.userId}:${e.allowance}`); return "applied"; },
    recordAccountDeletion: async () => { calls.push("record-deletion"); },
    deleteUser: async id => { calls.push(`delete:${id}`); },
    recordConsent: async (_u, type, version, caseId) => { calls.push(`consent:${type}:${version}:${caseId ?? ""}`); },
    consentVersions: async () => ({}),
    recordSecurityEvent: async (_u, _a, event) => { calls.push(`audit:${event}`); },
    exportAccountData: async userId => ({ user_id: userId, generation_ledger: [] }),
    locateCaseRecords: async (_u, caseId) => ({ case_id: caseId }),
    profile: async () => ({ fullName: null, preferredName: null, onboardingCompletedAt: null, createdAt: past, hasGenerationHistory: false }),
    updateProfile: async (_u, patch) => { calls.push(`profile:${JSON.stringify(patch)}`); },
    storageUsage: async () => ({ usedBytes: 0, limitBytes: null }),
    adjustStorage: async (_u, delta) => { calls.push(`storage:${delta}`); },
    setAvatarPath: async () => null,
    listReferenceCases: async () => [],
    createReferenceCase: async () => {},
    updateReferenceCase: async () => false,
    deleteReferenceCase: async () => null,
    recordStyleFeedback: async () => {},
    ...overrides,
  };
  return { store, calls };
}

const activePro: ProEntitlement = {
  active: true, productId: SUBSCRIPTION_PRODUCTS.monthly.productId, periodStart: past, expiresAt: future,
  environment: "production", willRenew: true, billingIssue: false, managementUrl: null, trial: false,
};
const fakeMedia = (objects = new Map<string, Uint8Array>()): MediaStore => ({
  put: async (bucket, path, bytes) => { objects.set(`${bucket}/${path}`, bytes); },
  remove: async (bucket, paths) => { for (const path of paths) objects.delete(`${bucket}/${path}`); },
  signedUrl: async (bucket, path) => `https://storage.test/${bucket}/${path}?token=signed`,
  download: async (bucket, path) => objects.get(`${bucket}/${path}`) ?? null,
  removeAllFor: async userId => { for (const key of [...objects.keys()]) if (key.split("/")[1] === userId) objects.delete(key); },
});
const services = (store: AccountStore, entitlement: ProEntitlement | Error = activePro, allowSandbox = true, media: MediaStore = fakeMedia()): AccountServices => ({
  store,
  media,
  allowSandbox,
  revenuecat: {
    proEntitlement: async () => { if (entitlement instanceof Error) throw entitlement; return entitlement; },
    deleteSubscriber: async () => {},
  },
});

// A live (non-mock) provider whose HTTP call is stubbed: no network, no spend.
const liveEnv = { SMILE_PROVIDER: "http", SMILE_PROVIDER_URL: "https://provider.test/edit", SMILE_PROVIDER_API_KEY: "k", SMILE_PROVIDER_DATA_TERMS: "confirmed" };
const realFetch = globalThis.fetch;
let providerCalls = 0;
function stubProvider(ok = true) {
  providerCalls = 0;
  globalThis.fetch = (async () => { providerCalls++; return ok ? Response.json({ image: png }) : new Response("fail", { status: 500 }); }) as typeof fetch;
}
afterEach(() => { globalThis.fetch = realFetch; });

const generationRequest = (token?: string, id = crypto.randomUUID()) => new Request("https://smile.test/api/generate-smile", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Smile-Request-Id": id, "X-Smile-AI-Consent": "smilecompose-ai-v2", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ originalImage: png, settings: defaultSettings, caseId: "case-7" }),
});

test("exact private staging capture retains parts before rejection without putting image content in audit records", async () => {
  const id = crypto.randomUUID(), runId = crypto.randomUUID();
  const input = generationSchema.parse({ originalImage: png, settings: { ...defaultSettings, libraryStyle: false } });
  const env = { SMILE_PROVIDER: "gemini", SMILE_GEMINI_API_KEY: "fixture-only", SMILE_GEMINI_DATA_TERMS: "paid",
    SUPABASE_URL: "https://wukcqlpuzkzwxmdkotfg.supabase.co", SMILE_MASK_GUIDANCE: "off",
    SMILE_QA_CAPTURE_ENABLED: "1", SMILE_QA_CAPTURE_USER_ID: user.id, SMILE_QA_CAPTURE_RUN_ID: runId, SMILE_QA_CAPTURE_REQUEST_ID: id,
    SMILE_QA_CAPTURE_SOURCE_SHA256: await qaSourceSha256(png), SMILE_QA_CAPTURE_SETTINGS_SHA256: await qaSettingsSha256(input.settings) };
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
    { thought: true, thoughtSignature: "private-signature", inlineData: { mimeType: "image/png", data: png.split(",")[1] } },
    { text: "private-provider-text" },
  ] } }] }); }) as typeof fetch;
  const auditRecords: unknown[] = [];
  const { store, calls: storeCalls } = fakeStore({ recordSecurityEvent: async (_user, _actor, _event, metadata) => { auditRecords.push(metadata); } });
  const request = () => new Request("https://smile-by-dr-vik-staging.drvik.workers.dev/api/generate-smile", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer good-token", "X-Smile-AI-Consent": "smilecompose-ai-v2", "X-Smile-Request-Id": id }, body: JSON.stringify(input) });
  const claims = new Set<string>();
  const claim = async (requestId: string) => { if (claims.has(requestId)) return false; claims.add(requestId); return true; };
  const response = await handleGenerationRequest(request(), env, claim, services(store));
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.qaCapture.runId, runId);
  assert.equal(body.qaCapture.requestId, id);
  assert.equal(body.qaCapture.parts[0].image, png);
  assert.equal(body.qaCapture.parts[0].thought, true);
  assert.deepEqual(body.qaCapture.validatedRequest.settings, input.settings);
  assert.equal(storeCalls.filter(call => call.startsWith("reserve:")).length, 1);
  assert.equal(storeCalls.includes(`release:${id}:provider_no_image`), true);
  assert.equal(calls, 2, "a reply with no finished image is retried once in the same reservation");
  for (const secret of ["data:image", "private-signature", "private-provider-text"]) assert.equal(JSON.stringify(auditRecords).includes(secret), false);
  const duplicate = await handleGenerationRequest(request(), env, claim, services(store));
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "duplicate_request");
  assert.equal(calls, 2);
  assert.equal(storeCalls.filter(call => call.startsWith("reserve:")).length, 1);
});

test("a pinned QA account cannot spend its diagnostic allowance on a different source or setting", async () => {
  const id = crypto.randomUUID();
  const input = generationSchema.parse({ originalImage: png, settings: { ...defaultSettings, libraryStyle: false } });
  const env = { SMILE_PROVIDER: "gemini", SMILE_GEMINI_API_KEY: "fixture-only", SMILE_GEMINI_DATA_TERMS: "paid",
    SUPABASE_URL: "https://wukcqlpuzkzwxmdkotfg.supabase.co", SMILE_MASK_GUIDANCE: "off", SMILE_QA_CAPTURE_ENABLED: "1",
    SMILE_QA_CAPTURE_USER_ID: user.id, SMILE_QA_CAPTURE_RUN_ID: crypto.randomUUID(), SMILE_QA_CAPTURE_REQUEST_ID: id,
    SMILE_QA_CAPTURE_SOURCE_SHA256: await qaSourceSha256(png), SMILE_QA_CAPTURE_SETTINGS_SHA256: await qaSettingsSha256(input.settings) };
  let calls = 0; globalThis.fetch = (async () => { calls++; throw Error("must not call provider"); }) as typeof fetch;
  const { store, calls: storeCalls } = fakeStore();
  const response = await handleGenerationRequest(new Request("https://smile-by-dr-vik-staging.drvik.workers.dev/api/generate-smile", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer good-token", "X-Smile-AI-Consent": "smilecompose-ai-v2", "X-Smile-Request-Id": id },
    body: JSON.stringify({ ...input, settings: { ...input.settings, intensity: 66 } }),
  }), env, async () => true, services(store));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "qa_capture_not_authorised");
  assert.equal(calls, 0);
  assert.deepEqual(storeCalls, []);
});

test("live generation requires a signed-in account", async () => {
  stubProvider();
  const { store } = fakeStore();
  for (const token of [undefined, "bad-token"]) {
    const response = await handleGenerationRequest(generationRequest(token), liveEnv, async () => true, services(store));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "auth_required");
  }
  assert.equal(providerCalls, 0);
});

test("live generation requires Pro; no generation is reserved without it", async () => {
  stubProvider();
  const { store, calls } = fakeStore();
  const response = await handleGenerationRequest(generationRequest("good-token"), liveEnv, async () => true, services(store, { ...activePro, active: false }));
  assert.equal(response.status, 402);
  assert.equal((await response.json()).code, "subscription_required");
  assert.equal(calls.some(c => c.startsWith("reserve")), false);
  assert.equal(providerCalls, 0);
});

test("a Pro user's generation is reserved, generated and committed", async () => {
  stubProvider();
  const { store, calls } = fakeStore();
  const id = crypto.randomUUID();
  const response = await handleGenerationRequest(generationRequest("good-token", id), liveEnv, async () => true, services(store));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.usage.remaining, 4);
  assert.deepEqual(calls, [`period:subscription:${SUBSCRIPTION_PRODUCTS.monthly.generationsPerPeriod}`, `reserve:${id}`, `consent:ai_processing:smilecompose-ai-v2:case-7`, "audit:generation_provider_started", "audit:generation_provider_finished", `commit:${id}`]);
  assert.equal(providerCalls, 1);
});

test("a failed provider call refunds the reservation", async () => {
  stubProvider(false);
  const { store, calls } = fakeStore();
  const id = crypto.randomUUID();
  const response = await handleGenerationRequest(generationRequest("good-token", id), liveEnv, async () => true, services(store));
  assert.equal(response.status, 502);
  assert.ok(calls.includes(`reserve:${id}`));
  assert.ok(calls.some(c => c.startsWith(`release:${id}`)));
  assert.equal(calls.some(c => c.startsWith("commit")), false);
});

test("provider evidence is retained for the authenticated owner and returned on failure without raw content", async () => {
  const events: { owner: string | null; event: string; metadata: unknown }[] = [];
  let callsToGoogle = 0;
  globalThis.fetch = async () => { callsToGoogle++; return Response.json({ candidates: [{ finishReason: "NO_IMAGE", content: { parts: [{ text: "PRIVATE_PROVIDER_EXPLANATION" }] } }] }); };
  const { store, calls } = fakeStore({ recordSecurityEvent: async (owner, _actor, event, metadata) => { events.push({ owner, event, metadata }); } });
  const id = crypto.randomUUID();
  const request = generationRequest("good-token", id);
  const response = await handleGenerationRequest(request, { SMILE_PROVIDER: "gemini", SMILE_GEMINI_API_KEY: "PRIVATE_API_KEY", SMILE_GEMINI_DATA_TERMS: "paid" }, async () => true, services(store));
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.code, "provider_no_image");
  assert.equal(body.providerDiagnostic.requestId, id);
  assert.equal(body.providerDiagnostic.httpStatus, 200, "backend 502 is different from Google's 200");
  assert.equal(body.providerDiagnostic.finishReasons, "NO_IMAGE");
  assert.equal(body.providerDiagnostic.category, "text_only");
  assert.deepEqual(events.map(e => [e.owner, e.event]), [[user.id, "generation_provider_started"], [user.id, "generation_provider_finished"],
    [user.id, "generation_provider_started"], [user.id, "generation_provider_finished"]]);
  assert.equal(calls.filter(c => c.startsWith(`release:${id}:`)).length, 1);
  assert.equal(calls.some(c => c.startsWith("commit:")), false);
  assert.equal(callsToGoogle, 2, "text-only is retried once");
  assert.equal(body.providerDiagnostic.retryCount, 1);
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_|data:image|base64|case-7/);
});

test("failed diagnostic persistence cannot prevent the existing provider-failure allowance release", async () => {
  stubProvider(false);
  const { store, calls } = fakeStore({ recordSecurityEvent: async () => { throw new Error("PRIVATE_DATABASE_ERROR"); } });
  const id = crypto.randomUUID();
  const response = await handleGenerationRequest(generationRequest("good-token", id), liveEnv, async () => true, services(store));
  assert.equal(response.status, 502);
  assert.equal(calls.filter(c => c.startsWith(`release:${id}:`)).length, 1);
  assert.equal(providerCalls, 1);
});

test("an exhausted allowance is refused before the provider is called", async () => {
  stubProvider();
  const { store } = fakeStore({ reserve: async () => { throw new AccountError("allowance_exhausted"); } });
  const response = await handleGenerationRequest(generationRequest("good-token"), liveEnv, async () => true, services(store));
  assert.equal(response.status, 402);
  const body = await response.json();
  assert.equal(body.code, "GENERATION_LIMIT_REACHED");
  assert.equal(body.balance, 0);
  assert.equal(body.error, "You’ve used your available SmileCompose generations.");
  assert.equal(providerCalls, 0);
});

test("a server-side override grants access without a subscription", async () => {
  stubProvider();
  const { store, calls } = fakeStore({ activeOverride: async () => ({ monthlyAllowance: 25, expiresAt: null }) });
  const response = await handleGenerationRequest(generationRequest("good-token"), liveEnv, async () => true, services(store, { ...activePro, active: false }));
  assert.equal(response.status, 200);
  assert.ok(calls.includes("period:override:25"));
});

test("live generation fails closed when accounts are not configured", async () => {
  stubProvider();
  assert.equal(accountsMode(liveEnv), "misconfigured");
  // There is no switch to run real AI generation without accounts.
  assert.equal(accountsMode({ ...liveEnv, SMILE_ACCOUNTS: "off" } as typeof liveEnv), "misconfigured");
  const response = await handleGenerationRequest(generationRequest("good-token"), liveEnv, async () => true);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "accounts_unavailable");
  assert.equal(providerCalls, 0);
});

test("every real AI generation is attached to the signed-in account", async () => {
  stubProvider();
  // No token: refused before any provider call.
  const { store, calls } = fakeStore();
  const anonymous = await handleGenerationRequest(generationRequest(), liveEnv, async () => true, services(store, activePro));
  assert.equal(anonymous.status, 401);
  assert.equal(providerCalls, 0);
  // Signed in: reserved against that user, consent recorded for that user, committed to that user's ledger.
  const response = await handleGenerationRequest(generationRequest("good-token"), liveEnv, async () => true, services(store, activePro));
  assert.equal(response.status, 200);
  assert.equal(providerCalls, 1);
  assert.ok(calls.some(c => c.startsWith("reserve:")), "reserved against the account");
  assert.ok(calls.some(c => c.startsWith("consent:ai_processing:")), "AI processing recorded for the account");
  assert.ok(calls.some(c => c.startsWith("commit:")), "committed to the account's ledger");
});

test("sandbox purchases count only when the deployment allows them", async () => {
  const { store } = fakeStore();
  const sandbox = { ...activePro, environment: "sandbox" as const };
  assert.equal((await evaluateAccess(user, services(store, sandbox, true))).pro, true);
  assert.equal((await evaluateAccess(user, services(store, sandbox, false))).pro, false);
});

test("if RevenueCat is unreachable, the webhook cache decides", async () => {
  const { store } = fakeStore({ cachedSubscription: async () => ({ status: "cancelled", productId: "p", expiresAt: future, environment: "production" }) });
  const decision = await evaluateAccess(user, services(store, new Error("down")));
  assert.equal(decision.pro, true);
  assert.equal(decision.verifiedWith, "cache");
  const { store: expired } = fakeStore({ cachedSubscription: async () => ({ status: "active", productId: "p", expiresAt: past, environment: "production" }) });
  assert.equal((await evaluateAccess(user, services(expired, new Error("down")))).pro, false);
});

test("RevenueCat subscriber payloads are read correctly", () => {
  const body = (expires: string | null, grace: string | null = null, sandbox = false) => ({ subscriber: {
    entitlements: { pro: { expires_date: expires, grace_period_expires_date: grace, product_identifier: "uk.co.drvik.smilecompose.pro.annual", purchase_date: past } },
    subscriptions: { "uk.co.drvik.smilecompose.pro.annual": { is_sandbox: sandbox, unsubscribe_detected_at: null, billing_issues_detected_at: grace ? past : null } },
  } });
  assert.equal(readProEntitlement(body(future)).active, true);
  assert.equal(readProEntitlement(body(past)).active, false);
  assert.equal(readProEntitlement(body(past, future)).active, true); // billing grace period
  assert.equal(readProEntitlement(body(past, future)).billingIssue, true);
  assert.equal(readProEntitlement(body(future, null, true)).environment, "sandbox");
  assert.equal(readProEntitlement({ subscriber: { entitlements: {} } }).active, false);
  assert.equal(readProEntitlement(body(future)).trial, false);
  const trialBody = body(future);
  (trialBody.subscriber.subscriptions["uk.co.drvik.smilecompose.pro.annual"] as { period_type?: string }).period_type = "trial";
  assert.equal(readProEntitlement(trialBody).trial, true);
  assert.equal(planForProduct("uk.co.drvik.smilecompose.pro.annual"), "annual");
  assert.equal(generationsForProduct("uk.co.drvik.smilecompose.pro.annual"), SUBSCRIPTION_PRODUCTS.annual.generationsPerPeriod);
});

const webhook = (auth: string, event: object) => new Request("https://smile.test/api/webhooks/revenuecat", {
  method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify({ event }),
});
const renewal = { id: "evt-9", type: "RENEWAL", app_user_id: user.id, product_id: SUBSCRIPTION_PRODUCTS.annual.productId, entitlement_ids: ["pro"], purchased_at_ms: Date.now(), expiration_at_ms: Date.now() + 1e9, environment: "PRODUCTION" };

test("the RevenueCat webhook rejects wrong credentials and applies valid events", async () => {
  const { store, calls } = fakeStore();
  const options = { store, authorization: "Bearer shared-secret", allowSandbox: true };
  assert.equal((await handleRevenueCatWebhook(webhook("Bearer wrong", renewal), options)).status, 401);
  assert.equal(calls.length, 0);
  const ok = await handleRevenueCatWebhook(webhook("Bearer shared-secret", renewal), options);
  assert.equal(ok.status, 200);
  assert.deepEqual(calls, [`event:RENEWAL:${user.id}:${SUBSCRIPTION_PRODUCTS.annual.generationsPerPeriod}`]);
  const sandbox = await handleRevenueCatWebhook(webhook("Bearer shared-secret", { ...renewal, id: "evt-10", environment: "SANDBOX" }), { ...options, allowSandbox: false });
  assert.equal((await sandbox.json()).outcome, "ignored_sandbox");
  const failing = fakeStore({ applyRevenueCatEvent: async () => { throw new Error("db down"); } });
  assert.equal((await handleRevenueCatWebhook(webhook("Bearer shared-secret", renewal), { ...options, store: failing.store })).status, 503);
  assert.equal((await handleRevenueCatWebhook(webhook("Bearer shared-secret", renewal), { ...options, authorization: undefined })).status, 503);
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(resolveUserId({ app_user_id: "$RCAnonymousID:123", aliases: [user.id] }), user.id);
  assert.equal(resolveUserId({ app_user_id: "$RCAnonymousID:123" }), null);
});

test("account status reports plan and generation balance", async () => {
  const { store } = fakeStore();
  const response = await handleAccountStatus(new Request("https://smile.test/api/account/status", { headers: { Authorization: "Bearer good-token" } }), services(store));
  const body = await response.json();
  assert.equal(body.pro, true);
  assert.equal(body.source, "subscription");
  assert.equal(body.generations.remaining, 49);
  assert.equal((await handleAccountStatus(new Request("https://smile.test/api/account/status"), services(store))).status, 401);
});

test("account deletion revokes Apple, deletes the RevenueCat customer and the Supabase user", async () => {
  const appleUser = { ...user, providers: ["apple"] };
  const { store, calls } = fakeStore({ verifyAccessToken: async () => appleUser });
  let subscriberDeleted = false;
  const svc = { ...services(store), revenuecat: { proEntitlement: async () => activePro, deleteSubscriber: async () => { subscriberDeleted = true; } } };
  const response = await handleAccountDelete(new Request("https://smile.test/api/account/delete", {
    method: "POST", headers: { Authorization: "Bearer good-token", "Content-Type": "application/json" }, body: JSON.stringify({}),
  }), svc, null);
  const body = await response.json();
  assert.equal(body.deleted, true);
  assert.equal(body.appleRevoked, false); // no fresh code / credentials supplied
  assert.equal(subscriberDeleted, true);
  assert.deepEqual(calls, ["audit:account_deletion_requested", "record-deletion", `delete:${user.id}`]);
});

test("Apple token revocation signs a valid ES256 client secret", async () => {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----`;
  const posted: URLSearchParams[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    posted.push(new URLSearchParams(String(init?.body)));
    return url.endsWith("/token") ? Response.json({ refresh_token: "rt" }) : new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const ok = await revokeAppleAuthorization("auth-code", { teamId: "TEAM", keyId: "KEY", privateKey: pem, clientId: "uk.co.drvik.smilecompose" }, fetcher);
  assert.equal(ok, true);
  assert.equal(posted[1].get("token"), "rt");
  const [header, payload, signature] = posted[0].get("client_secret")!.split(".");
  const decode = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  assert.equal(JSON.parse(decode(payload).toString()).sub, "uk.co.drvik.smilecompose");
  assert.equal(JSON.parse(decode(header).toString()).alg, "ES256");
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, keys.publicKey, decode(signature), new TextEncoder().encode(`${header}.${payload}`));
  assert.equal(valid, true);
});

test("accounts with two-factor authentication must present an aal2 session", async () => {
  stubProvider();
  const { store } = fakeStore({ verifyAccessToken: async () => ({ ...user, mfaEnrolled: true, aal: "aal1" as const }) });
  const response = await handleGenerationRequest(generationRequest("good-token"), liveEnv, async () => true, services(store));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "mfa_required");
  assert.equal(providerCalls, 0);
  const { store: verified } = fakeStore({ verifyAccessToken: async () => ({ ...user, mfaEnrolled: true, aal: "aal2" as const }) });
  assert.equal((await handleGenerationRequest(generationRequest("good-token"), liveEnv, async () => true, services(verified))).status, 200);
});

test("live Google processing is refused until paid / Vertex data terms are confirmed", async () => {
  const { store } = fakeStore();
  const googleEnv = { SMILE_PROVIDER: "gemini", GEMINI_API_KEY: "k" };
  const refused = await handleGenerationRequest(generationRequest("good-token"), googleEnv, async () => true, services(store));
  assert.equal(refused.status, 503);
  assert.equal((await refused.json()).code, "provider_terms_unconfirmed");
  const vertexWithPaidTerms = await handleGenerationRequest(generationRequest("good-token"),
    { SMILE_PROVIDER: "vertex", VERTEX_PROJECT_ID: "p", VERTEX_LOCATION: "europe-west2", GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "a@b", private_key: "x" }), SMILE_GEMINI_DATA_TERMS: "paid" },
    async () => true, services(store));
  assert.equal((await vertexWithPaidTerms.json()).code, "provider_terms_unconfirmed");
});

test("the AI provider never receives the case ID, account or billing details", async () => {
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init?: RequestInit) => { sent = JSON.parse(String(init?.body)); return Response.json({ image: png }); }) as typeof fetch;
  const { store } = fakeStore();
  await handleGenerationRequest(generationRequest("good-token"), liveEnv, async () => true, services(store));
  assert.equal("caseId" in sent, false);
  assert.equal(JSON.stringify(sent).includes(user.email!), false);
  assert.equal(JSON.stringify(sent).includes(user.id), false);
});

test("with accounts enforced, style images sent by the client are never forwarded", async () => {
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init?: RequestInit) => { sent = JSON.parse(String(init?.body)); return Response.json({ image: png }); }) as typeof fetch;
  const { store } = fakeStore();
  const request = new Request("https://smile.test/api/generate-smile", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Smile-Request-Id": crypto.randomUUID(), "X-Smile-AI-Consent": "smilecompose-ai-v2", Authorization: "Bearer good-token" },
    body: JSON.stringify({ originalImage: png, settings: { ...defaultSettings, libraryStyle: true }, styleReferences: [png] }),
  });
  await handleGenerationRequest(request, liveEnv, async () => true, services(store));
  assert.equal("styleReferences" in sent, false, "only server-selected references reach the provider");
});

test("generation rate limits are reported without calling the provider", async () => {
  stubProvider();
  const { store } = fakeStore({ reserve: async () => { throw new AccountError("rate_limited"); } });
  const response = await handleGenerationRequest(generationRequest("good-token"), liveEnv, async () => true, services(store));
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "rate_limited");
  assert.equal(providerCalls, 0);
});

test("consent records accept only current document versions and random case IDs", async () => {
  const { store, calls } = fakeStore();
  const post = (records: unknown) => handleConsents(new Request("https://smile.test/api/account/consents", {
    method: "POST", headers: { Authorization: "Bearer good-token", "Content-Type": "application/json" }, body: JSON.stringify({ records }),
  }), services(store));
  assert.equal((await post([{ type: "terms", version: DOCUMENT_VERSIONS.terms }, { type: "privacy", version: DOCUMENT_VERSIONS.privacy }])).status, 200);
  assert.equal((await post([{ type: "upload_authority", version: DOCUMENT_VERSIONS.upload_authority, caseId: "0f8e-case" }])).status, 200);
  assert.equal((await post([{ type: "terms", version: "old" }])).status, 409);
  assert.equal((await post([null])).status, 400);
  assert.equal((await post([{ type: "upload_authority", version: DOCUMENT_VERSIONS.upload_authority, caseId: "Jane Smith" }])).status, 400);
  assert.equal((await post([{ type: "ai_processing", version: DOCUMENT_VERSIONS.ai_processing }])).status, 400);
  assert.deepEqual(calls.filter(c => c.startsWith("consent")), [
    `consent:terms:${DOCUMENT_VERSIONS.terms}:`, `consent:privacy:${DOCUMENT_VERSIONS.privacy}:`, `consent:upload_authority:${DOCUMENT_VERSIONS.upload_authority}:0f8e-case`,
  ]);
});

test("legal document versions and text are supplied together without authentication or caching", async () => {
  const response = await handleConsents(new Request("https://smile.test/api/account/consents"), null);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const bundle = await response.json();
  for (const type of ["terms", "privacy"] as const) {
    assert.equal(bundle[type].version, DOCUMENT_VERSIONS[type]);
    assert.ok(bundle[type].html.includes(`Version ${DOCUMENT_VERSIONS[type]}`));
  }
});

test("an app with stale documents gets an actionable response and records no agreement", async () => {
  const { store, calls } = fakeStore();
  const response = await handleConsents(new Request("https://smile.test/api/account/consents", {
    method: "POST", headers: { Authorization: "Bearer good-token", "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ type: "terms", version: DOCUMENT_VERSIONS.terms }, { type: "privacy", version: "2026-09-27-draft" }] }),
  }), services(store));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "documents_changed");
  assert.deepEqual(calls.filter(c => c.startsWith("consent")), []);
});

test("account export returns only the signed-in user's server data and is audited", async () => {
  const { store, calls } = fakeStore();
  const response = await handleAccountExport(new Request("https://smile.test/api/account/export", { headers: { Authorization: "Bearer good-token" } }), services(store));
  const body = await response.json();
  assert.equal(body.server.user_id, user.id);
  assert.ok(calls.includes("audit:data_export"));
  assert.equal((await handleAccountExport(new Request("https://smile.test/api/account/export", { headers: { Authorization: "Bearer bad-token" } }), services(store))).status, 401);
});

test("server logs are redacted", () => {
  const line = redact(`upload data:image/jpeg;base64,${"A".repeat(600)} Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig dr.vik@example.com https://x.test/a?token=abc123`);
  for (const leaked of ["AAAA", "eyJhbGci", "dr.vik@example.com", "abc123"]) assert.equal(line.includes(leaked), false, leaked);
});

test("web pages carry security headers and a connect-src allow-list that blocks MediaPipe telemetry", () => {
  const headers = pageSecurityHeaders("https://abc.supabase.co");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.match(headers["Strict-Transport-Security"], /max-age=31536000/);
  assert.match(headers["Content-Security-Policy"], /connect-src 'self'.*https:\/\/abc\.supabase\.co/);
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'self'/);
  assert.equal(headers["Content-Security-Policy"].includes("odml.pa.googleapis.com"), false);
});

test("Vertex AI uses a signed service-account token and a regional endpoint", async () => {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");
  const account = { client_email: "smilecompose@project.iam.gserviceaccount.com", private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----` };
  const transport = vertexTransport({ projectId: "smilecompose-prod", location: "europe-west2", account });
  assert.equal(transport.url("gemini-3.1-flash-image"), "https://europe-west2-aiplatform.googleapis.com/v1/projects/smilecompose-prod/locations/europe-west2/publishers/google/models/gemini-3.1-flash-image:generateContent");
  let assertion = "";
  let tokenRequests = 0;
  const fetcher = (async (_url: string, init?: RequestInit) => {
    tokenRequests++;
    assertion = new URLSearchParams(String(init?.body)).get("assertion")!;
    return Response.json({ access_token: "ya29.test", expires_in: 3600 });
  }) as unknown as typeof fetch;
  assert.deepEqual(await transport.headers(fetcher), { Authorization: "Bearer ya29.test" });
  await transport.headers(fetcher);
  assert.equal(tokenRequests, 1); // cached until near expiry
  const [header, payload, signature] = assertion.split(".");
  const decode = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  assert.equal(JSON.parse(decode(payload).toString()).scope, "https://www.googleapis.com/auth/cloud-platform");
  assert.ok(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", keys.publicKey, decode(signature), new TextEncoder().encode(`${header}.${payload}`)));
  assert.equal(vertexTransport({ projectId: "", location: "global", account: null }).configured, false);
  assert.equal(parseServiceAccount("not json"), null);
});

const profileRequest = (body: unknown, token: string | null = "good-token") => new Request("https://smile.test/api/account/profile", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

test("account status reports the profile, onboarding state and server-side storage", async () => {
  const { store } = fakeStore({
    profile: async () => ({ fullName: "Vikas Bajaj", preferredName: "Dr Vik", onboardingCompletedAt: null, createdAt: past, hasGenerationHistory: true }),
    storageUsage: async () => ({ usedBytes: 1_800_000_000, limitBytes: 10_000_000_000 }),
  });
  const body = await (await handleAccountStatus(new Request("https://smile.test/api/account/status", { headers: { Authorization: "Bearer good-token" } }), services(store))).json();
  assert.deepEqual(body.profile, { fullName: "Vikas Bajaj", preferredName: "Dr Vik", onboardingCompletedAt: null, createdAt: past, hasGenerationHistory: true });
  assert.deepEqual(body.storage, { usedBytes: 1_800_000_000, limitBytes: 10_000_000_000 });
  // Storage failures never break the status request.
  const { store: failing } = fakeStore({ storageUsage: async () => { throw new Error("down"); }, profile: async () => { throw new Error("column does not exist"); } });
  const degradedResponse = await handleAccountStatus(new Request("https://smile.test/api/account/status", { headers: { Authorization: "Bearer good-token" } }), services(failing));
  assert.equal(degradedResponse.status, 200);
  const degraded = await degradedResponse.json();
  assert.equal(degraded.storage, null);
  assert.equal(degraded.profile, null);
  assert.equal(degraded.pro, true, "entitlement still reported");
});

test("an empty account name is filled once from the Apple name in user metadata", async () => {
  const appleUser: AuthenticatedUser = { ...user, providers: ["apple"], metadataName: "  Vikas   Bajaj " };
  const { store, calls } = fakeStore({ verifyAccessToken: async () => appleUser });
  const body = await (await handleAccountStatus(new Request("https://smile.test/api/account/status", { headers: { Authorization: "Bearer good-token" } }), services(store))).json();
  assert.equal(body.profile.fullName, "Vikas Bajaj");
  assert.ok(calls.includes(`profile:${JSON.stringify({ fullName: "Vikas Bajaj", onlyIfEmpty: true })}`));
  const { store: named, calls: namedCalls } = fakeStore({
    verifyAccessToken: async () => appleUser,
    profile: async () => ({ fullName: "Vik B", preferredName: null, onboardingCompletedAt: null, createdAt: past, hasGenerationHistory: false }),
  });
  const kept = await (await handleAccountStatus(new Request("https://smile.test/api/account/status", { headers: { Authorization: "Bearer good-token" } }), services(named))).json();
  assert.equal(kept.profile.fullName, "Vik B", "a user-set name is never overwritten");
  assert.equal(namedCalls.some(c => c.startsWith("profile:")), false);
});

test("profile updates are validated, normalised and scoped to the signed-in user", async () => {
  const { store, calls } = fakeStore();
  const ok = await handleProfileUpdate(profileRequest({ preferredName: "  Dr\u0007 Vik ", fullName: "Vikas Bajaj", onboardingCompleted: true }), services(store));
  assert.equal(ok.status, 200);
  assert.ok(calls.includes(`profile:${JSON.stringify({ fullName: "Vikas Bajaj", preferredName: "Dr Vik", onboardingCompleted: true })}`));
  const fill = await handleProfileUpdate(profileRequest({ fullName: "From Apple", onlyIfEmpty: true }), services(store));
  assert.equal(fill.status, 200);
  assert.ok(calls.includes(`profile:${JSON.stringify({ fullName: "From Apple", onlyIfEmpty: true })}`));
  assert.equal((await handleProfileUpdate(profileRequest({ preferredName: "x".repeat(41) }), services(store))).status, 400);
  assert.equal((await handleProfileUpdate(profileRequest({ preferredName: 7 }), services(store))).status, 400);
  assert.equal((await handleProfileUpdate(profileRequest({ subscription_tier: "pro" }), services(store))).status, 400);
  assert.equal((await handleProfileUpdate(profileRequest({ preferredName: "Dr Vik" }, null), services(store))).status, 401);
  assert.equal((await handleProfileUpdate(profileRequest({ preferredName: "Dr Vik" }, "bad-token"), services(store))).status, 401);
  assert.equal((await handleProfileUpdate(new Request("https://smile.test/api/account/profile"), services(store))).status, 405);
  assert.equal((await handleProfileUpdate(profileRequest({ preferredName: "Dr Vik" }), null)).status, 503);
  // A cleared preferred name is stored as null.
  await handleProfileUpdate(profileRequest({ preferredName: "   " }), services(store));
  assert.ok(calls.includes(`profile:${JSON.stringify({ preferredName: null })}`));
});

test("the free trial grants only the trial allowance; the first paid period grants the plan's", async () => {
  stubProvider();
  const trialling = fakeStore();
  await handleGenerationRequest(generationRequest("good-token"), liveEnv, async () => true, services(trialling.store, { ...activePro, trial: true }));
  assert.ok(trialling.calls.includes(`period:subscription:${TRIAL_GENERATIONS}`), "trial period allowance");
  const paid = fakeStore();
  await handleGenerationRequest(generationRequest("good-token"), liveEnv, async () => true, services(paid.store, activePro));
  assert.ok(paid.calls.includes(`period:subscription:${SUBSCRIPTION_PRODUCTS.monthly.generationsPerPeriod}`), "paid period allowance");

  const { store, calls } = fakeStore();
  const options = { store, authorization: "Bearer shared-secret", allowSandbox: true };
  await handleRevenueCatWebhook(webhook("Bearer shared-secret", { ...renewal, id: "evt-trial", type: "INITIAL_PURCHASE", period_type: "TRIAL" }), options);
  await handleRevenueCatWebhook(webhook("Bearer shared-secret", { ...renewal, id: "evt-convert", type: "RENEWAL", period_type: "NORMAL" }), options);
  assert.deepEqual(calls, [
    `event:INITIAL_PURCHASE:${user.id}:${TRIAL_GENERATIONS}`,
    `event:RENEWAL:${user.id}:${SUBSCRIPTION_PRODUCTS.annual.generationsPerPeriod}`,
  ]);
});

for (const kind of ["success", "empty", "text-only", "ambiguous"] as const) {
  test(`Gemini ${kind}: one reservation (no-image replies retried once), correct ledger outcome and duplicate rejection`, async () => {
    let attempts = 0;
    globalThis.fetch = async () => { attempts++; return Response.json({ candidates: [{ finishReason: kind === "empty" ? "NO_IMAGE" : "STOP", content: { parts: kind === "success" || kind === "ambiguous" ? Array.from({ length: kind === "ambiguous" ? 2 : 1 }, () => ({ inlineData: { mimeType: "image/png", data: png.split(",")[1] } })) : kind === "text-only" ? [{ text: "No preview available" }] : [] } }] }); };
    const { store, calls } = fakeStore(); const id = crypto.randomUUID(); let claimed = false;
    const claim = async () => { if (claimed) return false; claimed = true; return true; };
    const env = { SMILE_PROVIDER: "gemini", SMILE_GEMINI_API_KEY: "test", SMILE_GEMINI_DATA_TERMS: "paid" };
    const response = await handleGenerationRequest(generationRequest("good-token", id), env, claim, services(store));
    assert.equal(response.status, kind === "success" ? 200 : 502);
    // A reply with no image at all is retried once inside the same reservation.
    const noImage = kind === "empty" || kind === "text-only";
    assert.equal(attempts, noImage ? 2 : 1);
    const body = await response.json();
    assert.equal(body.providerDiagnostic.retryCount, noImage ? 1 : 0);
    if (kind !== "success") assert.equal(body.code, kind === "ambiguous" ? "invalid_provider_image" : "provider_no_image");
    if (kind === "ambiguous") {
      assert.equal(body.providerDiagnostic.category, "ambiguous_image");
      assert.equal(body.providerDiagnostic.finalImageCount, 2);
      assert.equal(body.image, undefined);
    }
    assert.equal(calls.filter(c => c === `reserve:${id}`).length, 1);
    assert.equal(calls.filter(c => c === `commit:${id}`).length, kind === "success" ? 1 : 0);
    assert.equal(calls.filter(c => c.startsWith(`release:${id}:`)).length, kind === "success" ? 0 : 1);
    assert.equal((await handleGenerationRequest(generationRequest("good-token", id), env, claim, services(store))).status, 409);
    assert.equal(attempts, noImage ? 2 : 1);
    assert.equal(calls.filter(c => c === `reserve:${id}`).length, 1);
  });
}
