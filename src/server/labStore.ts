import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AccountError } from "./accountStore";

/** Lab pack files: "<owner>/<share id>/<n>.<ext>", readable only by the server. */
export const LAB_SHARES_BUCKET = "lab-shares";

export interface LabRecord {
  id: string; name: string; email: string; contact: string | null; notes: string | null; createdAt: string;
}
export interface LabInput { name: string; email: string; contact: string | null; notes: string | null }

export interface LabShareFile { label: string; path: string; mime: string; size: number; name: string }
export interface LabShareContents {
  spec: { label: string; value: string }[];
  note: string | null;
  files: LabShareFile[];
  /** Files removed after the link expired or was revoked. */
  purged?: boolean;
}
/** A lab's reply on a shared pack: a message and up to five files. */
export interface LabReply { id: string; createdAt: string; message: string | null; files: LabShareFile[] }

export interface LabShareRecord {
  id: string; ownerUserId: string; labId: string; labName: string; caseId: string; caseLabel: string;
  contents: LabShareContents; createdAt: string; expiresAt: string; revokedAt: string | null;
  firstViewedAt: string | null; lastViewedAt: string | null; viewCount: number;
  replies: LabReply[];
}
export interface NewLabShare {
  id: string; ownerUserId: string; labId: string; caseId: string; caseLabel: string; tokenHash: string;
  contents: LabShareContents; expiresAt: string;
}
export interface PublicLabShare extends LabShareRecord { clinicianName: string }

export interface LabStore {
  listLabs(owner: string): Promise<LabRecord[]>;
  createLab(owner: string, input: LabInput): Promise<LabRecord>;
  updateLab(owner: string, id: string, input: LabInput): Promise<LabRecord | null>;
  archiveLab(owner: string, id: string): Promise<boolean>;
  labOf(owner: string, id: string): Promise<LabRecord | null>;
  createShare(share: NewLabShare): Promise<LabShareRecord>;
  deleteShare(owner: string, id: string): Promise<void>;
  listShares(owner: string): Promise<LabShareRecord[]>;
  revokeShare(owner: string, id: string): Promise<LabShareRecord | null>;
  markPurged(id: string, contents: LabShareContents): Promise<void>;
  /** The share behind a link token (hashed), with the clinician's name for the lab page. */
  shareByTokenHash(hash: string): Promise<PublicLabShare | null>;
  recordView(id: string): Promise<void>;
  addReply(share: LabShareRecord, reply: { id: string; message: string | null; files: LabShareFile[] }): Promise<LabReply>;
  /** One of the clinician's own replies, for downloading its files. */
  replyOf(owner: string, shareId: string, replyId: string): Promise<LabReply | null>;
  /** Expired or withdrawn links whose files haven't been removed yet (daily cleanup). */
  unpurged(limit: number): Promise<LabShareRecord[]>;
}

const fail = (): never => { throw new AccountError("account_service_unavailable", "Lab request failed."); };

function lab(row: Record<string, unknown>): LabRecord {
  return { id: row.id as string, name: row.name as string, email: row.email as string, contact: (row.contact as string) ?? null,
    notes: (row.notes as string) ?? null, createdAt: row.created_at as string };
}
function reply(row: Record<string, unknown>): LabReply {
  return { id: row.id as string, createdAt: row.created_at as string, message: (row.message as string) ?? null, files: (row.files as LabShareFile[]) ?? [] };
}
function share(row: Record<string, unknown>): LabShareRecord {
  const labRow = row.labs as { name?: string } | null;
  const replies = ((row.lab_share_replies as Record<string, unknown>[] | null) ?? []).map(reply).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { id: row.id as string, ownerUserId: row.owner_user_id as string, labId: row.lab_id as string, labName: labRow?.name ?? "",
    caseId: row.case_id as string, caseLabel: row.case_label as string, contents: row.contents as LabShareContents,
    createdAt: row.created_at as string, expiresAt: row.expires_at as string, revokedAt: (row.revoked_at as string) ?? null,
    firstViewedAt: (row.first_viewed_at as string) ?? null, lastViewedAt: (row.last_viewed_at as string) ?? null, viewCount: Number(row.view_count ?? 0), replies };
}
const SHARE_COLUMNS = "id, owner_user_id, lab_id, case_id, case_label, contents, created_at, expires_at, revoked_at, first_viewed_at, last_viewed_at, view_count, labs(name), lab_share_replies(id, created_at, message, files)";

export function createSupabaseLabStore(url: string, serviceRoleKey: string): LabStore {
  const db: SupabaseClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return {
    async listLabs(owner) {
      const { data, error } = await db.from("labs").select("*").eq("owner_user_id", owner).is("archived_at", null).order("name");
      if (error) fail();
      return (data ?? []).map(lab);
    },
    async createLab(owner, input) {
      const { data, error } = await db.from("labs").insert({ owner_user_id: owner, ...input }).select("*").single();
      if (error || !data) fail();
      return lab(data!);
    },
    async updateLab(owner, id, input) {
      const { data, error } = await db.from("labs").update(input).eq("owner_user_id", owner).eq("id", id).is("archived_at", null).select("*").maybeSingle();
      if (error) fail();
      return data ? lab(data) : null;
    },
    async archiveLab(owner, id) {
      const { data, error } = await db.from("labs").update({ archived_at: new Date().toISOString() }).eq("owner_user_id", owner).eq("id", id).select("id");
      if (error) fail();
      return Boolean(data?.length);
    },
    async labOf(owner, id) {
      const { data, error } = await db.from("labs").select("*").eq("owner_user_id", owner).eq("id", id).is("archived_at", null).maybeSingle();
      if (error) fail();
      return data ? lab(data) : null;
    },
    async createShare(s) {
      const { data, error } = await db.from("lab_shares").insert({
        id: s.id, owner_user_id: s.ownerUserId, lab_id: s.labId, case_id: s.caseId, case_label: s.caseLabel, token_hash: s.tokenHash,
        contents: s.contents, consent_confirmed_at: new Date().toISOString(), expires_at: s.expiresAt,
      }).select(SHARE_COLUMNS).single();
      if (error || !data) fail();
      return share(data!);
    },
    async deleteShare(owner, id) {
      const { error } = await db.from("lab_shares").delete().eq("owner_user_id", owner).eq("id", id);
      if (error) fail();
    },
    async listShares(owner) {
      const { data, error } = await db.from("lab_shares").select(SHARE_COLUMNS).eq("owner_user_id", owner).order("created_at", { ascending: false }).limit(200);
      if (error) fail();
      return (data ?? []).map(row => share(row as Record<string, unknown>));
    },
    async revokeShare(owner, id) {
      const { data, error } = await db.from("lab_shares").update({ revoked_at: new Date().toISOString() }).eq("owner_user_id", owner).eq("id", id).is("revoked_at", null).select(SHARE_COLUMNS).maybeSingle();
      if (error) fail();
      return data ? share(data as Record<string, unknown>) : null;
    },
    async markPurged(id, contents) {
      const { error } = await db.from("lab_shares").update({ contents: { ...contents, purged: true } }).eq("id", id);
      if (error) fail();
    },
    async shareByTokenHash(hash) {
      const { data, error } = await db.from("lab_shares").select(SHARE_COLUMNS).eq("token_hash", hash).maybeSingle();
      if (error) fail();
      if (!data) return null;
      const record = share(data as Record<string, unknown>);
      const { data: profile } = await db.from("profiles").select("preferred_name, full_name").eq("id", record.ownerUserId).maybeSingle();
      const clinicianName = (profile?.preferred_name as string) || (profile?.full_name as string) || "your clinician";
      return { ...record, clinicianName };
    },
    async unpurged(limit) {
      const { data, error } = await db.from("lab_shares").select(SHARE_COLUMNS)
        .or(`revoked_at.not.is.null,expires_at.lt.${new Date().toISOString()}`).is("contents->purged", null).limit(limit);
      if (error) fail();
      return (data ?? []).map(row => share(row as Record<string, unknown>));
    },
    async addReply(s, r) {
      const { data, error } = await db.from("lab_share_replies").insert({ id: r.id, share_id: s.id, owner_user_id: s.ownerUserId, message: r.message, files: r.files }).select("*").single();
      if (error || !data) fail();
      return reply(data!);
    },
    async replyOf(owner, shareId, replyId) {
      const { data, error } = await db.from("lab_share_replies").select("*").eq("owner_user_id", owner).eq("share_id", shareId).eq("id", replyId).maybeSingle();
      if (error) fail();
      return data ? reply(data) : null;
    },
    async recordView(id) {
      const { data } = await db.from("lab_shares").select("first_viewed_at, view_count").eq("id", id).maybeSingle();
      const now = new Date().toISOString();
      await db.from("lab_shares").update({ first_viewed_at: data?.first_viewed_at ?? now, last_viewed_at: now, view_count: Number(data?.view_count ?? 0) + 1 }).eq("id", id);
    },
  };
}
