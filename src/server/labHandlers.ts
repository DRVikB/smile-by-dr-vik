import { safeLog } from "./redact";
import { authenticate, type AccountServices } from "./access";
import { AccountError, type AuthenticatedUser } from "./accountStore";
import { LAB_SHARES_BUCKET, type LabInput, type LabShareContents, type LabShareFile, type LabShareRecord, type LabStore } from "./labStore";

/**
 * Labs: the dental labs a clinician works with, and private, expiring links to a copy of a case's
 * lab pack. The token is shown once; only its SHA-256 hash is stored. Labs open the pack at
 * /portal/<token> without an account. Revoking or expiry removes access and the files.
 */
export interface LabServices { accounts: AccountServices; labs: LabStore }

const headers = { "Cache-Control": "no-store" };
export const LAB_LINK_DAYS = [7, 14, 30] as const;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

const refuse = (status: number, code: string, error: string) => Response.json({ error, code }, { status, headers });

function failure(error: unknown): Response {
  if (error instanceof AccountError && error.code === "auth_required") return refuse(401, "auth_required", "Sign in to use Labs.");
  if (error instanceof AccountError && error.code === "mfa_required") return refuse(401, "mfa_required", "Enter your two-factor code to continue.");
  safeLog("error", "labs_failed", { code: error instanceof AccountError ? error.code : "unexpected" });
  return refuse(503, "account_service_unavailable", "Labs couldn’t be reached. Please try again.");
}

async function signedIn(request: Request, services: LabServices | null): Promise<{ user: AuthenticatedUser; s: LabServices }> {
  if (!services) throw new AccountError("account_service_unavailable");
  const user = await authenticate(request, services.accounts);
  if (!user) throw new AccountError("auth_required");
  return { user, s: services };
}

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const clean = value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
};
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function parseLab(body: Record<string, unknown>): LabInput | null {
  const name = text(body.name, 120);
  const email = text(body.email, 254)?.toLowerCase() ?? null;
  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return { name, email, contact: text(body.contact, 120), notes: text(body.notes, 1000) };
}

async function json(request: Request): Promise<Record<string, unknown> | null> {
  try { const value = await request.json(); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const tokenValid = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

/** What the clinician sees about a share: never the token or file paths. */
export function shareSummary(record: LabShareRecord, now = Date.now()) {
  const state = record.revokedAt ? "revoked" : Date.parse(record.expiresAt) <= now ? "expired" : record.viewCount ? "viewed" : "sent";
  return { id: record.id, labId: record.labId, labName: record.labName, caseId: record.caseId, caseLabel: record.caseLabel,
    createdAt: record.createdAt, expiresAt: record.expiresAt, revokedAt: record.revokedAt, viewCount: record.viewCount,
    lastViewedAt: record.lastViewedAt, files: record.contents.files.map(f => f.label), state,
    replies: (record.replies ?? []).map(r => ({ id: r.id, createdAt: r.createdAt, message: r.message,
      files: r.files.map((f, i) => ({ index: i + 1, label: f.label, mime: f.mime, name: f.name })) })) };
}

async function purge(s: LabServices, record: LabShareRecord) {
  if (record.contents.purged || !record.contents.files.length) return;
  try {
    await s.accounts.media.remove(LAB_SHARES_BUCKET, record.contents.files.map(f => f.path));
    await s.labs.markPurged(record.id, record.contents);
  } catch { /* retried on the next list or visit */ }
}

/** Daily cleanup: delete the files of every expired or withdrawn link, whoever owns it. */
export async function purgeExpiredLabShares(services: LabServices | null, limit = 200): Promise<number> {
  if (!services) return 0;
  const due = await services.labs.unpurged(limit);
  for (const record of due) await purge(services, record);
  return due.length;
}

/** GET /api/labs: labs and shared links. Expired links' files are removed here as a sweep. */
export async function handleLabsList(request: Request, services: LabServices | null): Promise<Response> {
  try {
    const { user, s } = await signedIn(request, services);
    const [labs, shares] = await Promise.all([s.labs.listLabs(user.id), s.labs.listShares(user.id)]);
    const now = Date.now();
    await Promise.all(shares.filter(r => (r.revokedAt || Date.parse(r.expiresAt) <= now) && !r.contents.purged).map(r => purge(s, r)));
    return Response.json({ labs, shares: shares.map(r => shareSummary(r, now)) }, { headers });
  } catch (error) { return failure(error); }
}

/** POST /api/labs (create), /api/labs/update, /api/labs/delete */
export async function handleLabWrite(request: Request, services: LabServices | null, action: "create" | "update" | "delete"): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    const { user, s } = await signedIn(request, services);
    const body = await json(request);
    if (!body) return refuse(400, "invalid_request", "That request wasn’t valid.");
    if (action === "delete") {
      if (!uuid(body.id) || !(await s.labs.archiveLab(user.id, body.id))) return refuse(404, "not_found", "That lab wasn’t found.");
      return Response.json({ ok: true }, { headers });
    }
    const input = parseLab(body);
    if (!input) return refuse(400, "invalid_lab", "Add the lab’s name and a valid email address.");
    if (action === "create") {
      if ((await s.labs.listLabs(user.id)).length >= 50) return refuse(409, "too_many_labs", "You can save up to 50 labs.");
      return Response.json({ lab: await s.labs.createLab(user.id, input) }, { status: 201, headers });
    }
    if (!uuid(body.id)) return refuse(404, "not_found", "That lab wasn’t found.");
    const lab = await s.labs.updateLab(user.id, body.id, input);
    return lab ? Response.json({ lab }, { headers }) : refuse(404, "not_found", "That lab wasn’t found.");
  } catch (error) { return failure(error); }
}

/**
 * POST /api/lab-shares (multipart): "meta" JSON plus up to ten files. Copies the pack into the
 * private lab-shares bucket and returns the link once.
 */
export async function handleLabShareCreate(request: Request, services: LabServices | null, origin: string): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  let uploaded: string[] = [];
  let created: { owner: string; id: string } | null = null;
  try {
    const { user, s } = await signedIn(request, services);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_TOTAL_BYTES + 1024 * 1024) return refuse(413, "too_large", "That lab pack is too large. Remove a photo and try again.");
    let form: FormData;
    try { form = await request.formData(); } catch { return refuse(400, "invalid_request", "That request wasn’t valid."); }
    let meta: Record<string, unknown>;
    try { meta = JSON.parse(String(form.get("meta") ?? "")); } catch { return refuse(400, "invalid_request", "That request wasn’t valid."); }
    if (meta.consent !== true) return refuse(400, "consent_required", "Confirm the patient has agreed to sharing with this lab.");
    const days = Number(meta.days);
    if (!LAB_LINK_DAYS.includes(days as 7 | 14 | 30)) return refuse(400, "invalid_expiry", "Choose 7, 14 or 30 days.");
    if (!uuid(meta.labId) || !uuid(meta.caseId)) return refuse(400, "invalid_request", "That request wasn’t valid.");
    const lab = await s.labs.labOf(user.id, meta.labId);
    if (!lab) return refuse(404, "not_found", "That lab wasn’t found.");
    const caseLabel = text(meta.caseLabel, 80);
    if (!caseLabel) return refuse(400, "invalid_request", "Add a case reference before sharing.");
    const spec = Array.isArray(meta.spec) ? meta.spec.slice(0, 20).flatMap(row => {
      const label = text((row as Record<string, unknown>)?.label, 40), value = text((row as Record<string, unknown>)?.value, 160);
      return label && value ? [{ label, value }] : [];
    }) : [];
    const labels = Array.isArray(meta.files) ? meta.files : [];
    const parts = form.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
    if (!parts.length) return refuse(400, "empty_pack", "Choose at least one photo or document to share.");
    if (parts.length > MAX_FILES || parts.length !== labels.length) return refuse(400, "invalid_request", "That request wasn’t valid.");
    let total = 0;
    for (const part of parts) {
      if (!MIME_EXT[part.type]) return refuse(415, "unsupported_file", "Lab packs take JPEG, PNG, WebP or PDF files.");
      if (part.size > MAX_FILE_BYTES) return refuse(413, "too_large", "Each file must be 15 MB or smaller.");
      total += part.size;
    }
    if (total > MAX_TOTAL_BYTES) return refuse(413, "too_large", "That lab pack is too large. Remove a photo and try again.");

    const id = crypto.randomUUID();
    const files: LabShareFile[] = parts.map((part, i) => {
      const label = text(labels[i], 60) ?? `File ${i + 1}`;
      const ext = MIME_EXT[part.type];
      const name = `${caseLabel}-${label}`.replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || `file-${i + 1}`;
      return { label, path: `${user.id}/${id}/${i + 1}.${ext}`, mime: part.type, size: part.size, name: `${name}.${ext}` };
    });
    for (let i = 0; i < parts.length; i++) {
      await s.accounts.media.put(LAB_SHARES_BUCKET, files[i].path, new Uint8Array(await parts[i].arrayBuffer()), files[i].mime);
      uploaded.push(files[i].path);
    }
    const token = newToken();
    const contents: LabShareContents = { spec, note: text(meta.note, 2000), files };
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    const record = await s.labs.createShare({ id, ownerUserId: user.id, labId: lab.id, caseId: meta.caseId, caseLabel, tokenHash: await sha256Hex(token), contents, expiresAt });
    created = { owner: user.id, id };
    uploaded = [];
    return Response.json({ share: shareSummary(record), url: `${origin}/portal/${token}`, lab: { name: lab.name, email: lab.email } }, { status: 201, headers });
  } catch (error) {
    if (uploaded.length && services) await services.accounts.media.remove(LAB_SHARES_BUCKET, uploaded).catch(() => {});
    if (created && services) await services.labs.deleteShare(created.owner, created.id).catch(() => {});
    return failure(error);
  }
}

/** POST /api/lab-shares/revoke {id}: the link stops working and its files are deleted. */
export async function handleLabShareRevoke(request: Request, services: LabServices | null): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    const { user, s } = await signedIn(request, services);
    const body = await json(request);
    if (!body || !uuid(body.id)) return refuse(404, "not_found", "That link wasn’t found.");
    const record = await s.labs.revokeShare(user.id, body.id);
    if (!record) return refuse(404, "not_found", "That link wasn’t found or was already revoked.");
    await purge(s, record);
    return Response.json({ share: shareSummary(record) }, { headers });
  } catch (error) { return failure(error); }
}

// ---------------------------------------------------------------------------------------------
// Public lab page API: /api/portal/<token>, /api/portal/<token>/file/<n>, /api/portal/<token>/download

const publicHeaders = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const gone = () => Response.json({ error: "This link has expired or was withdrawn. Ask the clinic to send a new one.", code: "link_unavailable" }, { status: 410, headers: publicHeaders });

async function liveShare(token: string, services: LabServices | null) {
  if (!services || !tokenValid(token)) return null;
  const record = await services.labs.shareByTokenHash(await sha256Hex(token));
  if (!record) return null;
  if (record.revokedAt || Date.parse(record.expiresAt) <= Date.now()) { await purge(services, record); return null; }
  return record;
}

export async function handlePortal(request: Request, services: LabServices | null, path: string): Promise<Response> {
  const [token, kind, index] = path.split("/");
  if (request.method === "POST" && kind === "reply") return handleLabReply(request, services, token ?? "");
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
  try {
    const record = await liveShare(token ?? "", services);
    if (!record) return gone();
    if (!kind) {
      await services!.labs.recordView(record.id).catch(() => {});
      return Response.json({
        labName: record.labName, clinicianName: record.clinicianName, caseLabel: record.caseLabel,
        createdAt: record.createdAt, expiresAt: record.expiresAt, spec: record.contents.spec, note: record.contents.note,
        files: record.contents.files.map((f, i) => ({ index: i + 1, label: f.label, mime: f.mime, size: f.size, name: f.name })),
      }, { headers: publicHeaders });
    }
    if (kind === "file") {
      const file = record.contents.files[Number(index) - 1];
      if (!file) return new Response("Not found", { status: 404, headers: publicHeaders });
      const bytes = await services!.accounts.media.download(LAB_SHARES_BUCKET, file.path);
      if (!bytes) return new Response("Not found", { status: 404, headers: publicHeaders });
      const download = new URL(request.url).searchParams.has("download");
      return new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { ...publicHeaders, "Content-Type": file.mime, "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.name}"`, "X-Content-Type-Options": "nosniff" } });
    }
    if (kind === "download") {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      for (const file of record.contents.files) {
        const bytes = await services!.accounts.media.download(LAB_SHARES_BUCKET, file.path);
        if (bytes) entries.push({ name: file.name, bytes });
      }
      const name = record.caseLabel.replace(/[^A-Za-z0-9-]+/g, "-") || "lab-pack";
      return new Response(zipStore(entries) as Uint8Array<ArrayBuffer>, { headers: { ...publicHeaders, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}-lab-pack.zip"` } });
    }
    return new Response("Not found", { status: 404, headers: publicHeaders });
  } catch (error) {
    safeLog("error", "lab_portal_failed", { code: error instanceof AccountError ? error.code : "unexpected" });
    return Response.json({ error: "This lab pack couldn’t be loaded. Please try again.", code: "unavailable" }, { status: 503, headers: publicHeaders });
  }
}

const MAX_REPLIES = 20, MAX_REPLY_FILES = 5, MAX_REPLY_BYTES = 40 * 1024 * 1024;

/** POST /api/portal/<token>/reply (multipart): the lab's message and up to five photos or PDFs. */
async function handleLabReply(request: Request, services: LabServices | null, token: string): Promise<Response> {
  const uploaded: string[] = [];
  try {
    const record = await liveShare(token, services);
    if (!record) return gone();
    if ((record.replies ?? []).length >= MAX_REPLIES) return Response.json({ error: "This link has reached its reply limit. Please contact the clinic directly." }, { status: 429, headers: publicHeaders });
    if (Number(request.headers.get("content-length") ?? 0) > MAX_REPLY_BYTES + 1024 * 1024) return Response.json({ error: "Those files are too large. Send up to 40 MB." }, { status: 413, headers: publicHeaders });
    let form: FormData;
    try { form = await request.formData(); } catch { return Response.json({ error: "That reply wasn’t valid." }, { status: 400, headers: publicHeaders }); }
    const message = text(form.get("message"), 2000);
    const parts = form.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && f.size > 0);
    if (!message && !parts.length) return Response.json({ error: "Write a message or add a photo." }, { status: 400, headers: publicHeaders });
    if (parts.length > MAX_REPLY_FILES) return Response.json({ error: "Send up to five files at a time." }, { status: 400, headers: publicHeaders });
    let total = 0;
    for (const part of parts) {
      if (!MIME_EXT[part.type]) return Response.json({ error: "Replies take JPEG, PNG, WebP or PDF files." }, { status: 415, headers: publicHeaders });
      total += part.size;
    }
    if (total > MAX_REPLY_BYTES) return Response.json({ error: "Those files are too large. Send up to 40 MB." }, { status: 413, headers: publicHeaders });
    const id = crypto.randomUUID();
    const files: LabShareFile[] = parts.map((part, i) => {
      const ext = MIME_EXT[part.type];
      const label = text(part.name.replace(/\.[^.]+$/, ""), 60) ?? `File ${i + 1}`;
      return { label, path: `${record.ownerUserId}/${record.id}/reply-${id}-${i + 1}.${ext}`, mime: part.type, size: part.size, name: `${record.caseLabel}-lab-${i + 1}.${ext}`.replace(/[^A-Za-z0-9.-]+/g, "-") };
    });
    for (let i = 0; i < parts.length; i++) {
      await services!.accounts.media.put(LAB_SHARES_BUCKET, files[i].path, new Uint8Array(await parts[i].arrayBuffer()), files[i].mime);
      uploaded.push(files[i].path);
    }
    await services!.labs.addReply(record, { id, message, files });
    return Response.json({ ok: true }, { status: 201, headers: publicHeaders });
  } catch (error) {
    if (uploaded.length && services) await services.accounts.media.remove(LAB_SHARES_BUCKET, uploaded).catch(() => {});
    safeLog("error", "lab_reply_failed", { code: error instanceof AccountError ? error.code : "unexpected" });
    return Response.json({ error: "Your reply couldn’t be sent. Please try again." }, { status: 503, headers: publicHeaders });
  }
}

/** GET /api/lab-shares/<share>/replies/<reply>/file/<n>: a reply's file, for its clinician only. */
export async function handleLabReplyFile(request: Request, services: LabServices | null, path: string): Promise<Response> {
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
  const [shareId, part, replyId, kind, index] = path.split("/");
  try {
    const { user, s } = await signedIn(request, services);
    if (part !== "replies" || kind !== "file" || !uuid(shareId) || !uuid(replyId)) return refuse(404, "not_found", "That file wasn’t found.");
    const reply = await s.labs.replyOf(user.id, shareId, replyId);
    const file = reply?.files[Number(index) - 1];
    if (!file) return refuse(404, "not_found", "That file wasn’t found.");
    const bytes = await s.accounts.media.download(LAB_SHARES_BUCKET, file.path);
    if (!bytes) return refuse(404, "not_found", "That file wasn’t found.");
    return new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { ...headers, "Content-Type": file.mime, "Content-Disposition": `inline; filename="${file.name}"`, "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return failure(error); }
}

// A minimal ZIP writer (stored, no compression): photos are already compressed.
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes: Uint8Array): number { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function zipStore(entries: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  let offset = 0;
  const used = new Set<string>();
  for (const entry of entries) {
    let name = entry.name, n = 2;
    while (used.has(name)) name = entry.name.replace(/(\.[^.]+)?$/, `-${n++}$1`);
    used.add(name);
    const nameBytes = enc.encode(name), crc = crc32(entry.bytes), size = entry.bytes.length;
    const local = new Uint8Array(30 + nameBytes.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true); lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const central = new Uint8Array(46 + nameBytes.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true); cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); central.set(nameBytes, 46);
    locals.push(local, entry.bytes); centrals.push(central);
    offset += local.length + size;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, at); at += part.length; }
  return out;
}
