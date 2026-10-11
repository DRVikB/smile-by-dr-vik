import { apiUrl } from "@/services/api/client";

/** The clinician's labs and secure lab links (web portal). */
export interface Lab { id: string; name: string; email: string; contact: string | null; notes: string | null; createdAt: string }
export interface LabReplyFile { index: number; label: string; mime: string; name: string }
export interface LabReply { id: string; createdAt: string; message: string | null; files: LabReplyFile[] }
export interface LabShare {
  id: string; labId: string; labName: string; caseId: string; caseLabel: string; createdAt: string; expiresAt: string;
  revokedAt: string | null; viewCount: number; lastViewedAt: string | null; files: string[];
  state: "sent" | "viewed" | "expired" | "revoked";
  replies: LabReply[];
}
export interface LabInput { name: string; email: string; contact?: string; notes?: string }
export interface LabPackFile { label: string; blob: Blob }
export interface NewLabShare {
  labId: string; caseId: string; caseLabel: string; days: 7 | 14 | 30; note?: string;
  spec: { label: string; value: string }[]; files: LabPackFile[]; consent: true;
}

export class LabsError extends Error { constructor(message: string, readonly status: number) { super(message); this.name = "LabsError"; } }

async function call<T>(token: string, path: `/api/${string}`, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  } catch {
    throw new LabsError("We couldn’t reach SmileCompose. Check your connection and try again.", 0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new LabsError(typeof body.error === "string" ? body.error : "Something went wrong. Please try again.", response.status);
  return body as T;
}
const jsonPost = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

export const listLabs = (token: string) => call<{ labs: Lab[]; shares: LabShare[] }>(token, "/api/labs");
export const createLab = (token: string, input: LabInput) => call<{ lab: Lab }>(token, "/api/labs", jsonPost(input)).then(r => r.lab);
export const updateLab = (token: string, id: string, input: LabInput) => call<{ lab: Lab }>(token, "/api/labs/update", jsonPost({ id, ...input })).then(r => r.lab);
export const removeLab = (token: string, id: string) => call<{ ok: true }>(token, "/api/labs/delete", jsonPost({ id }));
/** A reply's file, fetched with the clinician's sign-in (never a public URL). */
export async function replyFile(token: string, shareId: string, replyId: string, index: number): Promise<Blob> {
  const response = await fetch(apiUrl(`/api/lab-shares/${shareId}/replies/${replyId}/file/${index}`), { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new LabsError("That file couldn’t be opened. Please try again.", response.status);
  return response.blob();
}
export const revokeShare = (token: string, id: string) => call<{ share: LabShare }>(token, "/api/lab-shares/revoke", jsonPost({ id })).then(r => r.share);

/** Uploads a copy of the lab pack and returns the link (shown once). */
export async function createShare(token: string, input: NewLabShare): Promise<{ share: LabShare; url: string; lab: { name: string; email: string } }> {
  const form = new FormData();
  form.set("meta", JSON.stringify({ labId: input.labId, caseId: input.caseId, caseLabel: input.caseLabel, days: input.days, note: input.note,
    spec: input.spec, consent: input.consent, files: input.files.map(f => f.label) }));
  for (const file of input.files) form.append("file", file.blob, file.label);
  return call(token, "/api/lab-shares", { method: "POST", body: form });
}

/** A mailto: link for the clinician's own mail app; nothing is sent by SmileCompose. */
export function labEmail(lab: { name: string; email: string }, caseLabel: string, url: string, expiresAt: string, from: string): string {
  const date = new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const subject = `Case ${caseLabel}: lab pack`;
  const body = `Hello ${lab.name},\n\nHere is the lab pack for case ${caseLabel}: photos, the agreed concept and the design specification.\n\n${url}\n\nThe link is private to your lab and works until ${date}.\n\nThank you,\n${from}`;
  return `mailto:${encodeURIComponent(lab.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
