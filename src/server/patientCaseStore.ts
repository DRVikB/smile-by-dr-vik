import { createClient } from "@supabase/supabase-js";
import type { CaseMutation, PatientAsset, PatientCase, PatientCaseSummary } from "@/services/cases/sync/types";
import { PatientSyncError } from "@/services/cases/sync/types";

type Row = Record<string, unknown>;
export function assetRecord(r: Row): PatientAsset {
  return { id:r.id as string, ownerUserId:r.owner_user_id as string, caseId:r.case_id as string, kind:r.kind as PatientAsset["kind"], objectPath:r.object_path as string,
    mimeType:r.mime_type as string, width:r.width as number|null, height:r.height as number|null, byteSize:Number(r.byte_size), checksum:r.checksum as string,
    provenance:r.provenance as PatientAsset["provenance"], createdAt:r.created_at as string, uploadStatus:r.upload_status as PatientAsset["uploadStatus"] };
}
export function caseRecord(r: Row, assets: PatientAsset[] = []): PatientCase {
  return { id:r.id as string, ownerUserId:r.owner_user_id as string, createdAt:r.created_at as string, updatedAt:r.updated_at as string, revision:r.revision as number,
    archivedAt:r.archived_at as string|null, deletedAt:r.deleted_at as string|null, schemaVersion:1, state:r.state as PatientCase["state"], summary:r.summary as PatientCase["summary"], assets };
}
export interface CleanupJob { id:string; caseId:string; objectPath:string; attempts:number }
export interface PatientCaseStore {
  list(owner:string,cursor?:string): Promise<{ cases:PatientCaseSummary[]; nextCursor:string|null }>;
  get(owner:string,id:string): Promise<PatientCase|null>;
  mutate(owner:string,input:CaseMutation): Promise<PatientCase>;
  authoriseAsset(owner:string,caseId:string,asset:PatientAsset): Promise<PatientAsset>;
  asset(owner:string,caseId:string,id:string): Promise<PatientAsset|null>;
  confirmAsset(owner:string,caseId:string,id:string): Promise<boolean>;
  enqueueCleanup(owner:string,caseId:string,path:string): Promise<void>;
  cleanupJobs(owner:string): Promise<CleanupJob[]>;
  cleanupDone(owner:string,id:string): Promise<void>;
  cleanupRetry(owner:string,id:string,attempts:number): Promise<void>;
}
/** Every service-role query is owner-qualified. Atomic RPCs also check the stored owner. */
export function createSupabasePatientCaseStore(url:string,key:string): PatientCaseStore {
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  function check(error:unknown) {
    if(error&&typeof error==="object"&&"message"in error&&/invalid_state|invalid_revision|invalid_mutation/.test(String(error.message)))throw new PatientSyncError(400,"invalid_state");
    if(error) throw new PatientSyncError(503,"patient_store_unavailable");
  }
  return {
    async list(owner,cursor) {
      // A keyset cursor contains only a timestamp + case UUID; never an SQL expression from the client.
      const after=cursor ? JSON.parse(atob(cursor)) as [string,string] : null;
      let q=db.from("patient_cases").select("id,owner_user_id,created_at,updated_at,revision,archived_at,deleted_at,schema_version,summary")
        .eq("owner_user_id",owner).order("updated_at").order("id").limit(51);
      if(after) q=q.or(`updated_at.gt.${after[0]},and(updated_at.eq.${after[0]},id.gt.${after[1]})`);
      const {data,error}=await q; check(error);
      const page=(data??[]).slice(0,50);
      const last=page.at(-1);
      return {cases:page.map(r=> { const {state: _state,assets: _assets,...s}=caseRecord(r); void _state; void _assets; return s; }),
        nextCursor:(data??[]).length>50 && last ? btoa(JSON.stringify([last.updated_at,last.id])):null};
    },
    async get(owner,id) {
      const {data,error}=await db.from("patient_cases").select("*").eq("owner_user_id",owner).eq("id",id).maybeSingle(); check(error);
      if(!data) return null;
      const assets=await db.from("patient_case_assets").select("*").eq("owner_user_id",owner).eq("case_id",id); check(assets.error);
      return caseRecord(data,(assets.data??[]).map(assetRecord));
    },
    async mutate(owner,input) {
      const {data,error}=await db.rpc("mutate_patient_case",{p_owner:owner,p_operation:input.operationId,p_case:input.id,p_type:input.type,p_expected:input.expectedRevision,
        p_state:input.state,p_summary:input.summary,p_archived:input.archivedAt??null}); check(error);
      const result=data as {status:number;code?:string;case?:Row};
      if(result.status>=400) throw new PatientSyncError(result.status,result.code??"failed",result.case?caseRecord(result.case):undefined);
      return caseRecord(result.case!);
    },
    async authoriseAsset(owner,caseId,a) {
      const {data,error}=await db.rpc("authorise_patient_asset",{p_owner:owner,p_case:caseId,p_asset:a.id,p_meta:{kind:a.kind,mimeType:a.mimeType,width:a.width,height:a.height,byteSize:a.byteSize,checksum:a.checksum,provenance:a.provenance}});check(error);
      if(data.status>=400) throw new PatientSyncError(data.status,data.code);
      return assetRecord(data.asset);
    },
    async asset(owner,caseId,id) {
      const {data,error}=await db.from("patient_case_assets").select("*").eq("owner_user_id",owner).eq("case_id",caseId).eq("id",id).maybeSingle();check(error);
      return data?assetRecord(data):null;
    },
    async confirmAsset(owner,caseId,id) { const {data,error}=await db.rpc("confirm_patient_asset",{p_owner:owner,p_case:caseId,p_asset:id});check(error); return data===true; },
    async enqueueCleanup(owner,caseId,path) {
      if(!path.startsWith(`${owner}/${caseId}/`))throw new PatientSyncError(403,"invalid_path");
      const {error}=await db.from("patient_case_cleanup_jobs").upsert({owner_user_id:owner,case_id:caseId,object_path:path},{onConflict:"object_path",ignoreDuplicates:true});check(error);
    },
    async cleanupJobs(owner) {
      const {data,error}=await db.from("patient_case_cleanup_jobs").select("*").eq("owner_user_id",owner).lte("next_attempt_at",new Date().toISOString()).limit(50);check(error);
      return (data??[]).map(r=>({id:r.id,caseId:r.case_id,objectPath:r.object_path,attempts:r.attempts}));
    },
    async cleanupDone(owner,id) { const {error}=await db.from("patient_case_cleanup_jobs").delete().eq("owner_user_id",owner).eq("id",id);check(error); },
    async cleanupRetry(owner,id,attempts) {
      const {error}=await db.from("patient_case_cleanup_jobs").update({attempts:attempts+1,next_attempt_at:new Date(Date.now()+Math.min(3600000,1000*2**Math.min(attempts,12))).toISOString()}).eq("owner_user_id",owner).eq("id",id);check(error);
    },
  };
}
