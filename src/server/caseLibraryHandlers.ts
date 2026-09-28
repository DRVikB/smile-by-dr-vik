import { caseFeatures } from "@/lib/types";
import { supportedTeeth } from "@/lib/teeth";
import { DOCUMENT_VERSIONS } from "@/config/legal";
import { findMatchingStyleReferences, type StyleMatch } from "@/lib/styleMatching";
import type { SmileSettings } from "@/lib/types";
import { safeLog } from "./redact";
import { authenticate, type AccountServices } from "./access";
import {
  AccountError, CASE_LIBRARY_BUCKET,
  type AuthenticatedUser, type ReferenceCaseInput, type ReferenceCaseRecord, type ReferenceImageRecord, type ReferenceMaterial,
} from "./accountStore";
import { decodeJpegDataUrl, toJpegDataUrl } from "./images";

/**
 * Case Library: the clinician's own finished aesthetic work, kept privately
 * and attached to relevant generations as style references. Distinct from
 * patient Cases, which stay on the device.
 */
const headers = { "Cache-Control": "no-store" };
const MATERIALS: ReferenceMaterial[] = ["Single-shade composite", "Layered composite", "Porcelain"];
export const MAX_REFERENCE_CASES = 200;
const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;
const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;
const SIGNED_URL_SECONDS = 600;

function refuse(status: number, code: string, error: string): Response {
  return Response.json({ error, code }, { status, headers });
}

function failure(error: unknown): Response {
  if (error instanceof AccountError && error.code === "auth_required") return refuse(401, "auth_required", "Sign in to use your Case Library.");
  if (error instanceof AccountError && error.code === "mfa_required") return refuse(401, "mfa_required", "Enter your two-factor code to continue.");
  safeLog("error", "case_library_failed", { code: error instanceof AccountError ? error.code : "unexpected" });
  return refuse(503, "account_service_unavailable", "Your Case Library couldn’t be reached. Please try again.");
}

async function signedIn(request: Request, services: AccountServices | null): Promise<AuthenticatedUser> {
  if (!services) throw new AccountError("account_service_unavailable");
  const user = await authenticate(request, services);
  if (!user) throw new AccountError("auth_required");
  return user;
}

function cleanLabel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  return value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Validate tags; undefined fields are left unchanged (patch) or defaulted (create). */
function parseTags(body: Record<string, unknown>): Partial<ReferenceCaseInput> | null {
  const patch: Partial<ReferenceCaseInput> = {};
  if ("material" in body) {
    if (!MATERIALS.includes(body.material as ReferenceMaterial)) return null;
    patch.material = body.material as ReferenceMaterial;
  }
  if ("label" in body) {
    const label = cleanLabel(body.label);
    if (label === undefined) return null;
    patch.label = label;
  }
  if ("teethTreated" in body) {
    const teeth = body.teethTreated;
    if (!Array.isArray(teeth) || teeth.length > 28 || !teeth.every(t => Number.isInteger(t) && supportedTeeth.includes(t as number))) return null;
    patch.teethTreated = [...new Set(teeth as number[])];
  }
  if ("startingConditions" in body) {
    const conditions = body.startingConditions;
    if (!Array.isArray(conditions) || conditions.length > 6 || !conditions.every(c => caseFeatures.includes(c as never))) return null;
    patch.startingConditions = [...new Set(conditions as string[])];
  }
  if ("styleTags" in body) {
    const tags = body.styleTags;
    if (!Array.isArray(tags) || tags.length > 8 || !tags.every(t => typeof t === "string" && t.length <= 30)) return null;
    patch.styleTags = (tags as string[]).map(t => cleanLabel(t) ?? "").filter(Boolean);
  }
  return patch;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

export async function authorityConfirmed(services: AccountServices, userId: string): Promise<boolean> {
  const accepted = await services.store.consentVersions(userId);
  return accepted.case_library_authority?.includes(DOCUMENT_VERSIONS.case_library_authority) ?? false;
}

function summary(record: ReferenceCaseRecord) {
  return {
    id: record.id, label: record.label, material: record.material, teethTreated: record.teethTreated,
    startingConditions: record.startingConditions, styleTags: record.styleTags, validationOnly: record.validationOnly,
    createdAt: record.createdAt, bytes: record.images.reduce((sum, image) => sum + image.bytes, 0),
  };
}

/** GET /api/case-library — the signed-in clinician's own references, with short-lived private image links. */
export async function handleCaseLibraryList(request: Request, services: AccountServices | null): Promise<Response> {
  try {
    const user = await signedIn(request, services);
    const cases = await services!.store.listReferenceCases(user.id);
    const withLinks = await Promise.all(cases.map(async record => {
      const reference = record.images.find(i => i.kind === "reference") ?? record.images.find(i => i.kind === "original");
      const original = record.images.find(i => i.kind === "original") ?? reference;
      return {
        ...summary(record),
        thumbnailUrl: reference ? await services!.media.signedUrl(CASE_LIBRARY_BUCKET, reference.path, SIGNED_URL_SECONDS) : null,
        imageUrl: original ? await services!.media.signedUrl(CASE_LIBRARY_BUCKET, original.path, SIGNED_URL_SECONDS) : null,
      };
    }));
    return Response.json({
      cases: withLinks,
      count: cases.length,
      bytes: withLinks.reduce((sum, c) => sum + c.bytes, 0),
      authorityConfirmed: await authorityConfirmed(services!, user.id),
      authorityVersion: DOCUMENT_VERSIONS.case_library_authority,
    }, { headers });
  } catch (error) {
    return failure(error);
  }
}

/**
 * POST /api/case-library — add one finished case: the downscaled original and
 * (optionally) the smile-region derivative that is sent to the AI provider.
 * Requires the one-time authority confirmation.
 */
export async function handleCaseLibraryCreate(request: Request, services: AccountServices | null): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    const user = await signedIn(request, services);
    const body = await readBody(request);
    if (!body) return refuse(400, "invalid_case", "Check the photo and details, then try again.");
    const tags = parseTags(body);
    if (!tags || !tags.material) return refuse(400, "invalid_case", "Choose the material for this case.");
    const original = decodeJpegDataUrl(body.original, MAX_ORIGINAL_BYTES);
    const reference = body.reference === undefined ? null : decodeJpegDataUrl(body.reference, MAX_REFERENCE_BYTES, 2048);
    if (!original || (body.reference !== undefined && !reference)) return refuse(400, "invalid_image", "That photo couldn’t be used. Please choose a JPG, PNG or HEIC photo.");
    if (!await authorityConfirmed(services!, user.id))
      return refuse(428, "authority_required", "Confirm that you’re authorised to use these images before adding your first case.");
    if ((await services!.store.listReferenceCases(user.id)).length >= MAX_REFERENCE_CASES)
      return refuse(409, "library_full", `Your Case Library holds up to ${MAX_REFERENCE_CASES} cases. Remove some before adding more.`);

    const id = crypto.randomUUID();
    const uploads: ReferenceImageRecord[] = [{ kind: "original", path: `${user.id}/${id}/original.jpg`, bytes: original.bytes.length, width: original.width, height: original.height }];
    if (reference) uploads.push({ kind: "reference", path: `${user.id}/${id}/reference.jpg`, bytes: reference.bytes.length, width: reference.width, height: reference.height });
    const stored: string[] = [];
    try {
      for (const [index, upload] of uploads.entries()) {
        await services!.media.put(CASE_LIBRARY_BUCKET, upload.path, (index === 0 ? original : reference!).bytes, "image/jpeg");
        stored.push(upload.path);
      }
      await services!.store.createReferenceCase(user.id, id, {
        label: tags.label ?? "", material: tags.material, teethTreated: tags.teethTreated ?? [], startingConditions: tags.startingConditions ?? [], styleTags: tags.styleTags ?? [],
      }, uploads);
    } catch (error) {
      // No orphaned files: remove anything already uploaded.
      await services!.media.remove(CASE_LIBRARY_BUCKET, stored).catch(() => {});
      throw error;
    }
    await services!.store.adjustStorage(user.id, uploads.reduce((sum, u) => sum + u.bytes, 0)).catch(() => {});
    return Response.json({ id }, { status: 201, headers });
  } catch (error) {
    return failure(error);
  }
}

/** POST /api/case-library/update — edit tags or label of the user's own case. */
export async function handleCaseLibraryUpdate(request: Request, services: AccountServices | null): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    const user = await signedIn(request, services);
    const body = await readBody(request);
    const tags = body ? parseTags(body) : null;
    if (!body || typeof body.id !== "string" || !tags || !Object.keys(tags).length) return refuse(400, "invalid_case", "Check the details, then try again.");
    const updated = await services!.store.updateReferenceCase(user.id, body.id, tags);
    return updated ? Response.json({ updated: true }, { headers }) : refuse(404, "not_found", "That case isn’t in your Case Library.");
  } catch (error) {
    return failure(error);
  }
}

/** POST /api/case-library/delete — remove the case, its images and derivatives. */
export async function handleCaseLibraryDelete(request: Request, services: AccountServices | null): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    const user = await signedIn(request, services);
    const body = await readBody(request);
    if (!body || typeof body.id !== "string") return refuse(400, "invalid_case", "Choose a case to remove.");
    const removed = await services!.store.deleteReferenceCase(user.id, body.id);
    if (!removed) return refuse(404, "not_found", "That case isn’t in your Case Library.");
    await services!.media.remove(CASE_LIBRARY_BUCKET, removed.paths).catch(() =>
      safeLog("error", "case_library_object_cleanup_failed", { count: removed.paths.length }));
    await services!.store.adjustStorage(user.id, -removed.bytes).catch(() => {});
    return Response.json({ deleted: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}

/** POST /api/case-library/feedback — "Does this reflect your style?" (technical metadata only). */
export async function handleStyleFeedback(request: Request, services: AccountServices | null): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    const user = await signedIn(request, services);
    const body = await readBody(request);
    const requestId = body?.requestId;
    const rating = body?.rating;
    const count = Number(body?.referenceCount ?? 0);
    if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId) || (rating !== "yes" && rating !== "not_quite") || !Number.isInteger(count) || count < 0 || count > 5)
      return refuse(400, "invalid_feedback", "That feedback couldn’t be saved.");
    await services!.store.recordStyleFeedback(user.id, requestId, rating, count);
    return Response.json({ saved: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}

/**
 * Server-side reference selection for one generation: the authenticated
 * user's own cases only, matched to the design, with the smile-region
 * derivative loaded from private storage. Returns [] when nothing is a close match.
 */
export async function selectStyleReferences(
  services: AccountServices,
  userId: string,
  settings: Pick<SmileSettings, "treatment" | "selectedTeeth" | "caseFeatures">,
): Promise<{ images: string[]; caseIds: string[]; matches: StyleMatch[] }> {
  const cases = await services.store.listReferenceCases(userId);
  const matches = findMatchingStyleReferences(cases.map(c => ({
    id: c.id, material: c.material, teethTreated: c.teethTreated, startingConditions: c.startingConditions,
    createdAt: Date.parse(c.createdAt) || 0, validationOnly: c.validationOnly,
  })), settings, services.styleReferenceLimit);
  const images: string[] = [];
  const caseIds: string[] = [];
  for (const match of matches) {
    const record = cases.find(c => c.id === match.id);
    const image = record?.images.find(i => i.kind === "reference") ?? record?.images.find(i => i.kind === "original");
    // Defence in depth: only objects inside the user's own folder.
    if (!image || !image.path.startsWith(`${userId}/`)) continue;
    const bytes = await services.media.download(CASE_LIBRARY_BUCKET, image.path).catch(() => null);
    if (!bytes) continue;
    images.push(toJpegDataUrl(bytes));
    caseIds.push(match.id);
  }
  return { images, caseIds, matches };
}
