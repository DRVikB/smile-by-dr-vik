import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleGenerationRequest } from "../src/lib/generation/handler";
import {
  AVATAR_BUCKET, CASE_LIBRARY_BUCKET,
  type AccountStore, type AuthenticatedUser, type ConsentType, type MediaStore, type ReferenceCaseRecord,
} from "../src/server/accountStore";
import type { AccountServices } from "../src/server/access";
import {
  handleCaseLibraryCreate, handleCaseLibraryDelete, handleCaseLibraryList, handleCaseLibraryUpdate, handleStyleFeedback, selectStyleReferences,
} from "../src/server/caseLibraryHandlers";
import { handleAccountDelete, handleAccountStatus, handleAvatar } from "../src/server/accountHandlers";
import { findMatchingStyleReferences, styleReferenceLimit } from "../src/lib/styleMatching";
import { DOCUMENT_VERSIONS } from "../src/config/legal";
import { defaultSettings } from "../src/lib/types";
import { JPEG_80 } from "./fixtures/synthetic-jpeg";

// Synthetic images only: no patient data in tests.
const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const future = new Date(Date.now() + 20 * 86400000).toISOString();
const past = new Date(Date.now() - 10 * 86400000).toISOString();
const alice: AuthenticatedUser = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "alice@example.test", providers: ["email"] };
const bob: AuthenticatedUser = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "bob@example.test", providers: ["apple"] };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** In-memory account database + private object storage, keyed by user like the real schema. */
function world() {
  const cases = new Map<string, ReferenceCaseRecord & { userId: string }>();
  const consents = new Map<string, Partial<Record<ConsentType, string[]>>>();
  const avatars = new Map<string, string | null>();
  const storage = new Map<string, number>();
  const objects = new Map<string, Uint8Array>();
  const commits: { id: string; referenceCaseIds?: string[] }[] = [];
  const store: AccountStore = {
    verifyAccessToken: async token => (token === "alice-token" ? alice : token === "bob-token" ? bob : null),
    activeOverride: async () => ({ monthlyAllowance: 50, expiresAt: null }),
    cachedSubscription: async () => null,
    ensurePeriod: async () => {},
    expireSubscription: async () => {},
    reserve: async () => ({ remaining: 10 }),
    commit: async (id, meta) => { commits.push({ id, referenceCaseIds: meta.referenceCaseIds }); },
    release: async () => {},
    balance: async () => ({ included: 50, used: 1, remaining: 49, purchased: 0, periodEnd: future }),
    applyRevenueCatEvent: async () => "applied",
    recordAccountDeletion: async () => {},
    recordConsent: async (userId, type, version) => { const c = consents.get(userId) ?? {}; (c[type] ??= []).push(version); consents.set(userId, c); },
    consentVersions: async userId => consents.get(userId) ?? {},
    recordSecurityEvent: async () => {},
    exportAccountData: async userId => ({ user_id: userId }),
    locateCaseRecords: async () => ({}),
    profile: async userId => ({ fullName: null, preferredName: null, onboardingCompletedAt: null, createdAt: past, hasGenerationHistory: false, avatarPath: avatars.get(userId) ?? null }),
    updateProfile: async () => {},
    storageUsage: async userId => ({ usedBytes: storage.get(userId) ?? 0, limitBytes: null }),
    adjustStorage: async (userId, delta) => { storage.set(userId, Math.max(0, (storage.get(userId) ?? 0) + delta)); },
    setAvatarPath: async (userId, path) => { const previous = avatars.get(userId) ?? null; avatars.set(userId, path); return previous; },
    listReferenceCases: async userId => [...cases.values()].filter(c => c.userId === userId).map(({ userId: _u, ...c }) => { void _u; return c; }),
    createReferenceCase: async (userId, id, input, images) => { cases.set(id, { id, userId, ...input, validationOnly: false, createdAt: new Date().toISOString(), images }); },
    updateReferenceCase: async (userId, id, patch) => { const c = cases.get(id); if (!c || c.userId !== userId) return false; cases.set(id, { ...c, ...patch }); return true; },
    deleteReferenceCase: async (userId, id) => {
      const c = cases.get(id);
      if (!c || c.userId !== userId) return null;
      cases.delete(id);
      return { paths: c.images.map(i => i.path), bytes: c.images.reduce((s, i) => s + i.bytes, 0) };
    },
    recordStyleFeedback: async () => {},
    deleteUser: async () => {},
  };
  const media: MediaStore = {
    put: async (bucket, path, bytes) => { objects.set(`${bucket}/${path}`, bytes); },
    remove: async (bucket, paths) => { for (const path of paths) objects.delete(`${bucket}/${path}`); },
    signedUrl: async (bucket, path) => `https://storage.test/${bucket}/${path}?token=signed-secret`,
    download: async (bucket, path) => objects.get(`${bucket}/${path}`) ?? null,
    removeAllFor: async userId => { for (const key of [...objects.keys()]) if (key.split("/")[1] === userId) objects.delete(key); },
  };
  const services: AccountServices = {
    store, media, allowSandbox: true, styleReferenceLimit: 3,
    revenuecat: { proEntitlement: async () => { throw new Error("offline"); }, deleteSubscriber: async () => {} },
  };
  return { store, media, services, cases, objects, storage, avatars, commits, consents };
}

const post = (path: string, token: string | null, body: unknown) => new Request(`https://smile.test${path}`, {
  method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
const get = (path: string, token: string | null) => new Request(`https://smile.test${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function addCase(w: ReturnType<typeof world>, token: string, body: Record<string, unknown>) {
  const response = await handleCaseLibraryCreate(post("/api/case-library", token, { original: JPEG_80, reference: JPEG_80, ...body }), w.services);
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()).id as string;
}
const confirm = (w: ReturnType<typeof world>, user: AuthenticatedUser) => w.store.recordConsent(user.id, "case_library_authority", DOCUMENT_VERSIONS.case_library_authority);

test("the first Case Library upload requires the authority confirmation, then stores privately under the owner's folder", async () => {
  const w = world();
  assert.equal((await handleCaseLibraryCreate(post("/api/case-library", null, { material: "Porcelain", original: JPEG_80 }), w.services)).status, 401);
  const blocked = await handleCaseLibraryCreate(post("/api/case-library", "alice-token", { material: "Porcelain", original: JPEG_80 }), w.services);
  assert.equal(blocked.status, 428);
  assert.equal((await blocked.json()).code, "authority_required");
  assert.equal(w.objects.size, 0, "nothing is stored before confirmation");

  await confirm(w, alice);
  const id = await addCase(w, "alice-token", { material: "Porcelain", label: "Upper 8 · 2026", teethTreated: [13, 12, 11, 21, 22, 23], startingConditions: ["Dark shade"] });
  assert.deepEqual([...w.objects.keys()].sort(), [`${CASE_LIBRARY_BUCKET}/${alice.id}/${id}/original.jpg`, `${CASE_LIBRARY_BUCKET}/${alice.id}/${id}/reference.jpg`]);
  assert.ok((w.storage.get(alice.id) ?? 0) > 0, "counts toward account storage");
});

test("uploads are validated: material, teeth, conditions and real JPEG data", async () => {
  const w = world();
  await confirm(w, alice);
  for (const body of [
    { material: "Gold foil", original: JPEG_80 },
    { material: "Porcelain", original: JPEG_80, teethTreated: [99] },
    { material: "Porcelain", original: JPEG_80, startingConditions: ["Anything"] },
    { material: "Porcelain", original: "data:image/png;base64," + PNG_1x1 },
    { material: "Porcelain", original: "data:image/jpeg;base64,bm90LWFuLWltYWdl" },
  ]) {
    const response = await handleCaseLibraryCreate(post("/api/case-library", "alice-token", body), w.services);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal(w.objects.size, 0);
});

test("cross-user isolation: another clinician can't list, edit or delete someone's Case Library", async () => {
  const w = world();
  await confirm(w, alice);
  const aliceCase = await addCase(w, "alice-token", { material: "Layered composite" });
  const bobList = await (await handleCaseLibraryList(get("/api/case-library", "bob-token"), w.services)).json();
  assert.equal(bobList.count, 0);
  assert.equal((await handleCaseLibraryUpdate(post("/api/case-library/update", "bob-token", { id: aliceCase, label: "mine now" }), w.services)).status, 404);
  assert.equal((await handleCaseLibraryDelete(post("/api/case-library/delete", "bob-token", { id: aliceCase }), w.services)).status, 404);
  assert.equal(w.cases.get(aliceCase)?.label, "", "unchanged");
  assert.equal([...w.objects.keys()].filter(k => k.includes(alice.id)).length, 2, "Alice's images untouched");

  const aliceList = await (await handleCaseLibraryList(get("/api/case-library", "alice-token"), w.services)).json();
  assert.equal(aliceList.count, 1);
  assert.equal(aliceList.authorityConfirmed, true);
  assert.match(aliceList.cases[0].thumbnailUrl, new RegExp(`${alice.id}/${aliceCase}/reference\\.jpg`), "short-lived private link to the owner's derivative");
});

test("editing tags and deleting a case removes its images and derivatives", async () => {
  const w = world();
  await confirm(w, alice);
  const id = await addCase(w, "alice-token", { material: "Layered composite" });
  assert.equal((await handleCaseLibraryUpdate(post("/api/case-library/update", "alice-token", { id, material: "Porcelain", label: "Upper 6" }), w.services)).status, 200);
  assert.equal(w.cases.get(id)?.material, "Porcelain");
  assert.equal((await handleCaseLibraryDelete(post("/api/case-library/delete", "alice-token", { id }), w.services)).status, 200);
  assert.equal(w.cases.size, 0);
  assert.equal(w.objects.size, 0, "original and smile-region derivative removed");
  assert.equal(w.storage.get(alice.id), 0);
});

test("matching: material is required, the treated region must overlap, then detail and recency rank", () => {
  const now = Date.now();
  const candidates = [
    { id: "porcelain-8", material: "Porcelain" as const, teethTreated: [14, 13, 12, 11, 21, 22, 23, 24], startingConditions: ["Dark shade"], createdAt: now - 5000 },
    { id: "porcelain-2", material: "Porcelain" as const, teethTreated: [11, 21], createdAt: now },
    { id: "porcelain-lower", material: "Porcelain" as const, teethTreated: [31, 32, 41, 42], createdAt: now },
    { id: "layered", material: "Layered composite" as const, createdAt: now },
    { id: "held-out", material: "Porcelain" as const, createdAt: now, validationOnly: true },
  ];
  const settings = { ...defaultSettings, treatment: "Porcelain" as const, caseFeatures: ["Dark shade" as const] };
  const matches = findMatchingStyleReferences(candidates, settings, 3);
  assert.deepEqual(matches.map(m => m.id), ["porcelain-8", "porcelain-2"]);
  assert.deepEqual(findMatchingStyleReferences(candidates, { ...defaultSettings, treatment: "Single-shade composite" }), [], "no close match: nothing is sent");
  assert.deepEqual(findMatchingStyleReferences(candidates, { ...defaultSettings, treatment: "Composite" }).map(m => m.id), ["layered"]);
  assert.equal(styleReferenceLimit("9"), 5);
  assert.equal(styleReferenceLimit(undefined), 3);
});

function geminiWorld() {
  const w = world();
  const googleRequests: { parts: { inlineData?: { data: string }; text?: string }[] }[] = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    googleRequests.push(JSON.parse(String(init?.body)).contents[0]);
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_1x1 } }] } }] });
  }) as typeof fetch;
  const env = { SMILE_PROVIDER: "gemini", GEMINI_API_KEY: "test-key", SMILE_GEMINI_DATA_TERMS: "paid" };
  const generate = (token: string, settings: Record<string, unknown>) => handleGenerationRequest(new Request("https://smile.test/api/generate-smile", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Smile-Request-Id": crypto.randomUUID(), "X-Smile-AI-Consent": "smilecompose-ai-v2", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ originalImage: JPEG_80, settings: { ...defaultSettings, ...settings } }),
  }), env, async () => true, w.services);
  return { ...w, googleRequests, generate };
}

test("CRITICAL: relevant Case Library references are actually included in the outbound Gemini request", async () => {
  const w = geminiWorld();
  await confirm(w, alice);
  await confirm(w, bob);
  const porcelain = await addCase(w, "alice-token", { material: "Porcelain", teethTreated: [13, 12, 11, 21, 22, 23] });
  await addCase(w, "alice-token", { material: "Layered composite" });
  await addCase(w, "bob-token", { material: "Porcelain" }); // another clinician's case must never be used

  const response = await w.generate("alice-token", { treatment: "Porcelain", libraryStyle: true });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.deepEqual(body.styleReferencesUsed, { count: 1, caseIds: [porcelain] });

  const parts = w.googleRequests.at(-1)!.parts;
  const images = parts.filter(p => p.inlineData);
  assert.equal(images.length, 2, "patient + one matching reference (Bob's and the layered case excluded)");
  assert.equal(images[0].inlineData!.data, JPEG_80.split(",")[1], "the first image is the patient photo");
  const storedReference = w.objects.get(`${CASE_LIBRARY_BUCKET}/${alice.id}/${porcelain}/reference.jpg`)!;
  assert.equal(images[1].inlineData!.data, Buffer.from(storedReference).toString("base64"), "the smile-region derivative from private storage");
  const prompt = String(parts.at(-1)!.text);
  assert.match(prompt, /the first image is the SOURCE PATIENT to edit/);
  assert.match(prompt, /STYLE REFERENCES, not patients to edit/);
  assert.match(prompt, /Preserve facial identity, facial expression, head position, lip position, mouth width, mouth opening/);
  assert.match(prompt, /never copy identity, gums or tooth arrangements/);
  assert.deepEqual(w.commits.at(-1)!.referenceCaseIds, [porcelain], "reference IDs recorded with the generation");
});

test("turning off 'Use my Case Library' sends no references; no close match falls back to normal generation", async () => {
  const w = geminiWorld();
  await confirm(w, alice);
  await addCase(w, "alice-token", { material: "Porcelain" });

  const off = await (await w.generate("alice-token", { treatment: "Porcelain", libraryStyle: false })).json();
  assert.deepEqual(off.styleReferencesUsed, { count: 0, caseIds: [] });
  assert.equal(w.googleRequests.at(-1)!.parts.filter(p => p.inlineData).length, 1);
  assert.ok(!String(w.googleRequests.at(-1)!.parts.at(-1)!.text).includes("STYLE REFERENCES"));

  const noMatch = await (await w.generate("alice-token", { treatment: "Single-shade composite", libraryStyle: true })).json();
  assert.equal(noMatch.styleReferencesUsed.count, 0);
  assert.equal(w.googleRequests.at(-1)!.parts.filter(p => p.inlineData).length, 1);
});

test("only the authenticated user's references can ever be selected", async () => {
  const w = world();
  await confirm(w, bob);
  await addCase(w, "bob-token", { material: "Porcelain" });
  const selected = await selectStyleReferences(w.services, alice.id, { ...defaultSettings, treatment: "Porcelain" });
  assert.deepEqual(selected, { images: [], caseIds: [], matches: [] });
});

test("profile photo: stored privately, replaced without orphans, removed, and scoped to its owner", async () => {
  const w = world();
  const set = await handleAvatar(post("/api/account/avatar", "alice-token", { image: JPEG_80 }), w.services);
  assert.equal(set.status, 200);
  const first = w.avatars.get(alice.id)!;
  assert.match(first, new RegExp(`^${alice.id}/[0-9a-f-]+\\.jpg$`));
  assert.ok(w.objects.has(`${AVATAR_BUCKET}/${first}`));

  await handleAvatar(post("/api/account/avatar", "alice-token", { image: JPEG_80 }), w.services);
  const second = w.avatars.get(alice.id)!;
  assert.notEqual(second, first);
  assert.ok(!w.objects.has(`${AVATAR_BUCKET}/${first}`), "previous photo removed after replacement");

  await handleAvatar(post("/api/account/avatar", "bob-token", { remove: true }), w.services);
  assert.ok(w.objects.has(`${AVATAR_BUCKET}/${second}`), "another user's removal never touches Alice's photo");
  assert.equal(w.avatars.get(alice.id), second);

  assert.equal((await handleAvatar(post("/api/account/avatar", "alice-token", { image: "data:image/png;base64," + PNG_1x1 }), w.services)).status, 400);
  const status = await (await handleAccountStatus(get("/api/account/status", "alice-token"), w.services)).json();
  assert.match(status.avatarUrl, new RegExp(`${AVATAR_BUCKET}/${alice.id}/`));
  assert.equal(status.profile.avatarPath, undefined, "the private path is never sent to the client");

  await handleAvatar(post("/api/account/avatar", "alice-token", { remove: true }), w.services);
  assert.equal(w.avatars.get(alice.id), null);
  assert.equal([...w.objects.keys()].filter(k => k.startsWith(AVATAR_BUCKET)).length, 0);
});

test("account deletion removes the profile photo and the whole Case Library, and only that user's", async () => {
  const w = world();
  await confirm(w, alice);
  await confirm(w, bob);
  await handleAvatar(post("/api/account/avatar", "alice-token", { image: JPEG_80 }), w.services);
  await addCase(w, "alice-token", { material: "Porcelain" });
  await addCase(w, "bob-token", { material: "Porcelain" });
  const response = await handleAccountDelete(post("/api/account/delete", "alice-token", {}), w.services, null);
  assert.equal(response.status, 200);
  assert.equal([...w.objects.keys()].filter(k => k.includes(alice.id)).length, 0);
  assert.equal([...w.objects.keys()].filter(k => k.includes(bob.id)).length, 2);

  // If private storage can't be emptied, the account is not deleted (no orphaned media).
  const failing = world();
  failing.services.media = { ...failing.media, removeAllFor: async () => { throw new Error("storage down"); } };
  let deleted = false;
  failing.services.store = { ...failing.store, deleteUser: async () => { deleted = true; } };
  assert.equal((await handleAccountDelete(post("/api/account/delete", "alice-token", {}), failing.services, null)).status, 503);
  assert.equal(deleted, false);
});

test("private image links and image data never appear in server logs", async () => {
  const w = geminiWorld();
  const lines: string[] = [];
  const originals = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const level of ["log", "error", "warn", "info"] as const) console[level] = (...args: unknown[]) => { lines.push(args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")); };
  try {
    await confirm(w, alice);
    await addCase(w, "alice-token", { material: "Porcelain" });
    await handleCaseLibraryList(get("/api/case-library", "alice-token"), w.services);
    w.services.media = { ...w.media, download: async () => { throw new Error("https://storage.test/case-library/secret?token=signed-secret"); } };
    await w.generate("alice-token", { treatment: "Porcelain", libraryStyle: true });
    await handleStyleFeedback(post("/api/case-library/feedback", "alice-token", { requestId: crypto.randomUUID(), rating: "yes", referenceCount: 1 }), w.services);
  } finally {
    Object.assign(console, originals);
  }
  const joined = lines.join("\n");
  assert.ok(!joined.includes("storage.test") && !joined.includes("signed-secret") && !joined.includes("base64,"), joined.slice(0, 300));
});
