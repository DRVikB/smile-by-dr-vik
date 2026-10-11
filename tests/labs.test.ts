import { test } from "node:test";
import assert from "node:assert/strict";
import type { AccountStore, AuthenticatedUser, MediaStore } from "../src/server/accountStore";
import type { AccountServices } from "../src/server/access";
import {
  crc32, purgeExpiredLabShares, handleLabReplyFile, handleLabShareCreate, handleLabShareRevoke, handleLabWrite, handleLabsList, handlePortal, parseLab, sha256Hex, zipStore, type LabServices,
} from "../src/server/labHandlers";
import { LAB_SHARES_BUCKET, type LabRecord, type LabShareRecord, type LabStore, type NewLabShare } from "../src/server/labStore";

// Synthetic files only: no patient data in tests.
const alice: AuthenticatedUser = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "alice@example.test", providers: ["email"] };
const bob: AuthenticatedUser = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "bob@example.test", providers: ["email"] };
const CASE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORIGIN = "https://smile.test";

function world() {
  const labs = new Map<string, LabRecord & { owner: string; archived?: boolean }>();
  const shares = new Map<string, LabShareRecord & { tokenHash: string }>();
  const objects = new Map<string, Uint8Array>();
  const media = {
    put: async (bucket: string, path: string, bytes: Uint8Array) => { objects.set(`${bucket}/${path}`, bytes); },
    remove: async (bucket: string, paths: string[]) => { for (const p of paths) objects.delete(`${bucket}/${p}`); },
    signedUrl: async () => null,
    download: async (bucket: string, path: string) => objects.get(`${bucket}/${path}`) ?? null,
    removeAllFor: async () => {},
  } satisfies MediaStore;
  const store = { verifyAccessToken: async (token: string) => (token === "alice" ? alice : token === "bob" ? bob : null) } as unknown as AccountStore;
  const labStore: LabStore = {
    listLabs: async owner => [...labs.values()].filter(l => l.owner === owner && !l.archived),
    createLab: async (owner, input) => { const lab = { id: crypto.randomUUID(), owner, createdAt: new Date().toISOString(), ...input }; labs.set(lab.id, lab); return lab; },
    updateLab: async (owner, id, input) => { const l = labs.get(id); if (!l || l.owner !== owner) return null; Object.assign(l, input); return l; },
    archiveLab: async (owner, id) => { const l = labs.get(id); if (!l || l.owner !== owner) return false; l.archived = true; return true; },
    labOf: async (owner, id) => { const l = labs.get(id); return l && l.owner === owner && !l.archived ? l : null; },
    createShare: async (s: NewLabShare) => {
      const record = { ...s, labName: labs.get(s.labId)!.name, createdAt: new Date().toISOString(), revokedAt: null, firstViewedAt: null, lastViewedAt: null, viewCount: 0, replies: [] as LabShareRecord["replies"] };
      shares.set(s.id, record); return record;
    },
    deleteShare: async (_owner, id) => { shares.delete(id); },
    listShares: async owner => [...shares.values()].filter(s => s.ownerUserId === owner),
    revokeShare: async (owner, id) => { const s = shares.get(id); if (!s || s.ownerUserId !== owner || s.revokedAt) return null; s.revokedAt = new Date().toISOString(); return s; },
    markPurged: async (id, contents) => { const s = shares.get(id); if (s) s.contents = { ...contents, purged: true }; },
    shareByTokenHash: async hash => { const s = [...shares.values()].find(x => x.tokenHash === hash); return s ? { ...s, clinicianName: "Dr Vik" } : null; },
    unpurged: async limit => [...shares.values()].filter(s => (s.revokedAt || Date.parse(s.expiresAt) <= Date.now()) && !s.contents.purged).slice(0, limit),
    addReply: async (share, r) => { const reply = { ...r, createdAt: new Date().toISOString() }; shares.get(share.id)!.replies.push(reply); return reply; },
    replyOf: async (owner, shareId, replyId) => { const s = shares.get(shareId); return s && s.ownerUserId === owner ? s.replies.find(r => r.id === replyId) ?? null : null; },
    recordView: async id => { const s = shares.get(id)!; s.viewCount++; s.lastViewedAt = new Date().toISOString(); },
  };
  const services: LabServices = { accounts: { store, media } as unknown as AccountServices, labs: labStore };
  return { services, labs, shares, objects };
}

const auth = (user: string, init: RequestInit = {}) => ({ ...init, headers: { Authorization: `Bearer ${user}`, ...(init.headers ?? {}) } });
const post = (path: string, user: string, body: unknown) => new Request(`${ORIGIN}${path}`, auth(user, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

async function addLab(w: ReturnType<typeof world>, user = "alice") {
  const res = await handleLabWrite(post("/api/labs", user, { name: "Ceramic Studio", email: "Orders@Lab.example", contact: "Anna" }), w.services, "create");
  assert.equal(res.status, 201);
  return (await res.json()).lab as LabRecord;
}
function pack(labId: string, overrides: Record<string, unknown> = {}, files = [{ label: "Smile front", type: "image/png" }, { label: "Concept · Veneers", type: "image/png" }, { label: "Consultation Report", type: "application/pdf" }]) {
  const form = new FormData();
  form.set("meta", JSON.stringify({ labId, caseId: CASE, caseLabel: "SR-1024", days: 14, consent: true, note: "Natural, not too white",
    spec: [{ label: "Shape", value: "Oval" }, { label: "Shade", value: "Natural white" }], files: files.map(f => f.label), ...overrides }));
  for (const [i, f] of files.entries()) form.append("file", new File([new Uint8Array([i + 1, 2, 3])], `f${i}`, { type: f.type }));
  return form;
}
async function share(w: ReturnType<typeof world>, form: FormData, user = "alice") {
  return handleLabShareCreate(new Request(`${ORIGIN}/api/lab-shares`, auth(user, { method: "POST", body: form })), w.services, ORIGIN);
}

test("labs need a name and a valid email, and stay private to their clinician", async () => {
  assert.equal(parseLab({ name: "Lab", email: "nope" }), null);
  assert.deepEqual(parseLab({ name: "  Lab\u0000 One ", email: "A@B.co" }), { name: "Lab One", email: "a@b.co", contact: null, notes: null });
  const w = world();
  const lab = await addLab(w);
  assert.equal(lab.email, "orders@lab.example");
  const bobList = await (await handleLabsList(new Request(`${ORIGIN}/api/labs`, auth("bob")), w.services)).json();
  assert.equal(bobList.labs.length, 0);
  assert.equal((await handleLabWrite(post("/api/labs/update", "bob", { id: lab.id, name: "Mine", email: "x@y.co" }), w.services, "update")).status, 404);
  assert.equal((await handleLabsList(new Request(`${ORIGIN}/api/labs`), w.services)).status, 401);
});

test("a lab link: consent required, token shown once and stored hashed, files copied privately", async () => {
  const w = world();
  const lab = await addLab(w);
  assert.equal((await share(w, pack(lab.id, { consent: false }))).status, 400);
  assert.equal((await share(w, pack(lab.id, { days: 90 }))).status, 400);
  assert.equal((await share(w, pack(lab.id), "bob")).status, 404, "another clinician's lab");
  assert.equal((await share(w, pack(lab.id, {}, [{ label: "Script", type: "text/html" }]))).status, 415);
  const res = await share(w, pack(lab.id));
  assert.equal(res.status, 201);
  const body = await res.json();
  const token = body.url.split("/portal/")[1];
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const stored = [...w.shares.values()][0];
  assert.equal(stored.tokenHash, await sha256Hex(token));
  assert.ok(!JSON.stringify(stored).includes(token), "the token itself is never stored");
  assert.equal(w.objects.size, 3);
  assert.ok([...w.objects.keys()].every(k => k.startsWith(`${LAB_SHARES_BUCKET}/${alice.id}/${stored.id}/`)));
  const days = (Date.parse(stored.expiresAt) - Date.now()) / 86400000;
  assert.ok(days > 13.9 && days <= 14);
  const listed = await (await handleLabsList(new Request(`${ORIGIN}/api/labs`, auth("alice")), w.services)).json();
  assert.equal(listed.shares[0].state, "sent");
  assert.ok(!JSON.stringify(listed).includes(token) && !JSON.stringify(listed).includes("/1.png"), "no token or storage path in the list");
});

test("the lab opens the pack without an account; revoking or expiry closes it and deletes the files", async () => {
  const w = world();
  const lab = await addLab(w);
  const token = (await (await share(w, pack(lab.id))).json()).url.split("/portal/")[1];
  const get = (path = "") => handlePortal(new Request(`${ORIGIN}/api/portal/${token}${path}`), w.services, `${token}${path}`);
  const page = await get();
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow");
  const json = await page.json();
  assert.equal(json.caseLabel, "SR-1024");
  assert.equal(json.clinicianName, "Dr Vik");
  assert.deepEqual(json.files.map((f: { label: string }) => f.label), ["Smile front", "Concept · Veneers", "Consultation Report"]);
  assert.ok(!JSON.stringify(json).includes(alice.id), "no owner id or storage paths for the lab");
  const file = await get("/file/1");
  assert.equal(file.headers.get("Content-Type"), "image/png");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([1, 2, 3]));
  const zip = new Uint8Array(await (await get("/download")).arrayBuffer());
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.equal([...w.shares.values()][0].viewCount, 1);
  assert.equal((await handlePortal(new Request(`${ORIGIN}/api/portal/${"x".repeat(43)}`), w.services, "x".repeat(43))).status, 410);

  const id = [...w.shares.values()][0].id;
  assert.equal((await handleLabShareRevoke(post("/api/lab-shares/revoke", "bob", { id }), w.services)).status, 404);
  assert.equal((await handleLabShareRevoke(post("/api/lab-shares/revoke", "alice", { id }), w.services)).status, 200);
  assert.equal((await get()).status, 410);
  assert.equal(w.objects.size, 0, "revoked pack files are deleted");

  const token2 = (await (await share(w, pack(lab.id))).json()).url.split("/portal/")[1];
  const second = [...w.shares.values()].find(s => !s.revokedAt)!;
  second.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal((await handlePortal(new Request(`${ORIGIN}/api/portal/${token2}`), w.services, token2)).status, 410);
  assert.equal(w.objects.size, 0, "expired pack files are deleted on the next visit");
});

test("the lab-pack ZIP is a valid stored archive", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const zip = zipStore([{ name: "a.png", bytes: new Uint8Array([1]) }, { name: "a.png", bytes: new Uint8Array([2, 3]) }]);
  const view = new DataView(zip.buffer);
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  assert.ok(new TextDecoder().decode(zip).includes("a-2.png"), "duplicate names are made unique");
});

test("the daily cleanup removes files of expired links nobody has looked at", async () => {
  const w = world();
  const lab = await addLab(w);
  await share(w, pack(lab.id));
  await share(w, pack(lab.id));
  assert.equal(w.objects.size, 6);
  [...w.shares.values()][0].expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(await purgeExpiredLabShares(w.services), 1);
  assert.equal(w.objects.size, 3, "only the live link's files remain");
  assert.equal(await purgeExpiredLabShares(w.services), 0);
});

test("a lab can reply with a message and photos; only its clinician can open the files", async () => {
  const w = world();
  const lab = await addLab(w);
  const token = (await (await share(w, pack(lab.id))).json()).url.split("/portal/")[1];
  const reply = (form: FormData) => handlePortal(new Request(`${ORIGIN}/api/portal/${token}/reply`, { method: "POST", body: form }), w.services, `${token}/reply`);
  const empty = new FormData();
  assert.equal((await reply(empty)).status, 400);
  const bad = new FormData(); bad.append("file", new File([new Uint8Array([1])], "x.html", { type: "text/html" }));
  assert.equal((await reply(bad)).status, 415);
  const good = new FormData();
  good.set("message", "  Try-in ready Friday \u0000 ");
  good.append("file", new File([new Uint8Array([9, 9])], "Finished veneers.jpg", { type: "image/jpeg" }));
  assert.equal((await reply(good)).status, 201);
  const listed = await (await handleLabsList(new Request(`${ORIGIN}/api/labs`, auth("alice")), w.services)).json();
  const r = listed.shares[0].replies[0];
  assert.equal(r.message, "Try-in ready Friday");
  assert.deepEqual(r.files.map((f: { label: string }) => f.label), ["Finished veneers"]);
  assert.ok(!JSON.stringify(listed).includes("reply-"), "no storage paths in the list");
  const path = `${listed.shares[0].id}/replies/${r.id}/file/1`;
  const mine = await handleLabReplyFile(new Request(`${ORIGIN}/api/lab-shares/${path}`, auth("alice")), w.services, path);
  assert.equal(mine.status, 200);
  assert.deepEqual(new Uint8Array(await mine.arrayBuffer()), new Uint8Array([9, 9]));
  assert.equal((await handleLabReplyFile(new Request(`${ORIGIN}/api/lab-shares/${path}`, auth("bob")), w.services, path)).status, 404);
  assert.equal((await handleLabReplyFile(new Request(`${ORIGIN}/api/lab-shares/${path}`), w.services, path)).status, 401);
  // After the link is withdrawn the lab can't reply.
  await handleLabShareRevoke(post("/api/lab-shares/revoke", "alice", { id: listed.shares[0].id }), w.services);
  assert.equal((await reply(good)).status, 410);
});
