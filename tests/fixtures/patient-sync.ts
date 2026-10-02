import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import type { AccountServices } from "../../src/server/access";
import { assetRecord,caseRecord,type PatientCaseStore } from "../../src/server/patientCaseStore";
import { handlePatientCases,type PatientServices } from "../../src/server/patientCaseHandlers";
import { createPatientLocalStore } from "../../src/services/cases/sync/localStore";
import { createSyncCoordinator } from "../../src/services/cases/sync/coordinator";
import { createPatientApi } from "../../src/services/cases/sync/patientApi";
import { PatientSyncError,type PatientApi } from "../../src/services/cases/sync/types";
import type { WorkspaceLease } from "../../src/lib/workspace";
export const A="00000000-0000-4000-8000-00000000000a",B="00000000-0000-4000-8000-00000000000b";
export async function backend(){
 const db=new PGlite();await db.exec(`
 create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated,service_role;grant all on storage.objects,storage.buckets to service_role;grant select,insert,update,delete on storage.objects to authenticated;
 create function public.export_account_data(p_user uuid) returns jsonb language sql as $$select jsonb_build_object('user_id',p_user)$$;
 insert into auth.users values('${A}'),('${B}');
 `);
 await db.exec(readFileSync("supabase/migrations/20261002093305_patient_case_sync.sql","utf8"));
 const media=new Map<string,Uint8Array>();let failRemove=false,uploadCount=0,downloadCount=0;
 const store:PatientCaseStore={
  async list(owner,cursor){const after=cursor?JSON.parse(atob(cursor)):null;const r=await db.query<Record<string,unknown>>(`select id,owner_user_id,created_at,updated_at,revision,archived_at,deleted_at,schema_version,summary from patient_cases where owner_user_id=$1 ${after?'and (updated_at,id)>($2::timestamptz,$3::uuid)':''} order by updated_at,id limit 51`,after?[owner,...after]:[owner]);const last=r.rows.slice(0,50).at(-1);return {cases:r.rows.slice(0,50).map(r=>{const {state,assets,...summary}=caseRecord(r);void state;void assets;return summary;}),nextCursor:r.rows.length>50?btoa(JSON.stringify([last!.updated_at,last!.id])):null};},
  async get(owner,id){const r=await db.query<Record<string,unknown>>('select * from patient_cases where owner_user_id=$1 and id=$2',[owner,id]);if(!r.rows[0])return null;const a=await db.query<Record<string,unknown>>('select * from patient_case_assets where owner_user_id=$1 and case_id=$2',[owner,id]);return caseRecord(r.rows[0],a.rows.map(assetRecord));},
  async mutate(owner,m){const r=await db.query<{r:{status:number;code?:string;case:Record<string,unknown>}}>('select mutate_patient_case($1,$2,$3,$4,$5,$6,$7,$8) r',[owner,m.operationId,m.id,m.type,m.expectedRevision,JSON.stringify(m.state),JSON.stringify(m.summary),m.archivedAt??null]);const x=r.rows[0].r;if(x.status>=400)throw new PatientSyncError(x.status,x.code!,x.case?caseRecord(x.case):undefined);return caseRecord(x.case);},
  async authoriseAsset(owner,id,a){const r=await db.query<{r:{status:number;code?:string;asset:Record<string,unknown>}}>('select authorise_patient_asset($1,$2,$3,$4) r',[owner,id,a.id,JSON.stringify(a)]);const x=r.rows[0].r;if(x.status>=400)throw new PatientSyncError(x.status,x.code!);return assetRecord(x.asset);},
  async asset(owner,cid,id){const r=await db.query<Record<string,unknown>>('select * from patient_case_assets where owner_user_id=$1 and case_id=$2 and id=$3',[owner,cid,id]);return r.rows[0]?assetRecord(r.rows[0]):null;},
  async confirmAsset(owner,cid,id){return (await db.query<{r:boolean}>('select confirm_patient_asset($1,$2,$3) r',[owner,cid,id])).rows[0].r;},
  async enqueueCleanup(owner,cid,path){await db.query('insert into patient_case_cleanup_jobs(owner_user_id,case_id,object_path) values($1,$2,$3) on conflict(object_path) do nothing',[owner,cid,path]);},
  async cleanupJobs(owner){const r=await db.query<{id:string;case_id:string;object_path:string;attempts:number}>('select * from patient_case_cleanup_jobs where owner_user_id=$1 and next_attempt_at<=now()',[owner]);return r.rows.map(x=>({id:x.id,caseId:x.case_id,objectPath:x.object_path,attempts:x.attempts}));},
  async cleanupDone(owner,id){await db.query('delete from patient_case_cleanup_jobs where owner_user_id=$1 and id=$2',[owner,id]);},
  async cleanupRetry(owner,id,attempts){await db.query("update patient_case_cleanup_jobs set attempts=$3,next_attempt_at=now()+interval '1 minute' where owner_user_id=$1 and id=$2",[owner,id,attempts+1]);},
 };
 const accounts={store:{verifyAccessToken:async(token:string)=>[A,B].includes(token)?{id:token,aal:"aal1",mfaEnrolled:false}:null},media:{
  async put(bucket:string,path:string,b:Uint8Array){uploadCount++;if(media.has(path))throw new Error("Already exists");media.set(path,b);},
  async download(bucket:string,path:string){downloadCount++;return media.get(path)??null;},
  async remove(bucket:string,paths:string[]){if(failRemove)throw new Error("Storage offline");for(const path of paths)media.delete(path);},
 }} as unknown as AccountServices;
 const services:PatientServices={accounts,patients:store};
 const request:typeof fetch=async(input,init)=>{
  const url=typeof input==="string"?input:input instanceof Request?input.url:input.toString();return handlePatientCases(new Request(new URL(url,"https://app.example"),init),services);
 };
 return {db,store,services,request,media,setFailRemove:(v:boolean)=>{failRemove=v;},counts:()=>({uploadCount,downloadCount})};
}
export function lease(owner=A):WorkspaceLease&{abort():void}{const c=new AbortController();return {owner:{kind:"account",userId:owner},key:`account:${owner}`,epoch:1,signal:c.signal,assert(){if(c.signal.aborted)throw new Error("Workspace changed");},abort:()=>c.abort()};}
export function device(server:Awaited<ReturnType<typeof backend>>,owner=A,factory=new IDBFactory()){
 const scope=lease(owner),store=createPatientLocalStore(scope,factory);let offline=false;
 const remote=createPatientApi(scope,async()=>owner,async(...args)=>{if(offline)throw new Error("offline");return server.request(...args);});
 const api:PatientApi=remote;const sync=createSyncCoordinator(scope,store,()=>{},async()=>{});sync.connect(api);
 return {scope,store,sync,api,factory,offline:(value:boolean)=>{offline=value;},stop:()=>{sync.disconnect();scope.abort();}};
}
