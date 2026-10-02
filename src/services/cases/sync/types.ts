/** Cloud state contains structured metadata and immutable asset references, never image bytes/URLs. */
export const PATIENT_BUCKET = "patient-cases";
export const ASSET_KINDS = ["ORIGINAL_PHOTO", "PREPARED_PHOTO", "PRESENTATION_PHOTO", "THUMBNAIL", "GENERATED_CONCEPT", "REPORT", "EDIT_MASK", "REFERENCE_PHOTO"] as const;
export type AssetKind = typeof ASSET_KINDS[number];
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface AssetRef { $asset: string }
export interface PatientAsset {
  id: string; ownerUserId: string; caseId: string; kind: AssetKind; objectPath: string;
  mimeType: string; width: number | null; height: number | null; byteSize: number; checksum: string;
  provenance: "original" | "legacy-prepared-original" | "prepared" | "generated" | "report" | "mask" | "reference";
  createdAt: string; uploadStatus: "pending" | "confirmed" | "deleted";
}
export interface PatientState {
  schemaVersion: 1;
  entries: Json[];
  media: Json[];
  draft: Json | null;
  preferredDesignId: string | null;
  draftThumb?: Json;
  caseStatus?: { archivedAt:number|null; deletedAt:number|null };
  /** Analysis snapshots and confirmed Tooth Maps live in media/draft, unchanged. */
}
export interface PatientSummary { entries: Json[]; patientName: string; visualisationCount: number; thumbnail: Json | null }
export interface PatientCase {
  id: string; ownerUserId: string; createdAt: string; updatedAt: string; revision: number;
  archivedAt: string | null; deletedAt: string | null; schemaVersion: 1;
  state: PatientState; summary: PatientSummary; assets: PatientAsset[];
}
export type PatientCaseSummary = Omit<PatientCase,"state" | "assets">;
export type MutationType = "CREATE_CASE" | "UPDATE_CASE" | "DELETE_CASE";
export interface CaseMutation { operationId: string; id: string; type: MutationType; expectedRevision: number; state: PatientState; summary: PatientSummary; archivedAt?: string | null }
export interface PatientApi {
  list(cursor?: string): Promise<{ cases: PatientCaseSummary[]; nextCursor: string | null }>;
  get(id: string): Promise<PatientCase>;
  mutate(input: CaseMutation): Promise<PatientCase>;
  upload(asset: PatientAsset, blob: Blob): Promise<PatientAsset>;
  download(caseId: string, assetId: string): Promise<Blob>;
}
export class PatientSyncError extends Error {
  constructor(readonly status: number, readonly code: string, readonly cloud?: PatientCase) { super(code); this.name = "PatientSyncError"; }
}
export const EMPTY_STATE = (): PatientState => ({ schemaVersion:1, entries:[], media:[], draft:null, preferredDesignId:null });
export const EMPTY_SUMMARY = (): PatientSummary => ({ entries:[], patientName:"", visualisationCount:0, thumbnail:null });
export const uuidValid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export function assetPath(owner: string, caseId: string, id: string, kind: AssetKind) { return `${owner}/${caseId}/${id}/${kind.toLowerCase()}`; }
