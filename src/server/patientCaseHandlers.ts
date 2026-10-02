import { z } from "zod";
import { authenticate, type AccountServices } from "./access";
import { AccountError } from "./accountStore";
import { ASSET_KINDS, PATIENT_BUCKET, PatientSyncError, assetPath, uuidValid, type CaseMutation, type Json, type PatientAsset, type PatientState, type PatientSummary } from "@/services/cases/sync/types";
import type { PatientCaseStore } from "./patientCaseStore";
const headers={"Cache-Control":"no-store"};
const metaSchema=z.object({id:z.string().uuid(),kind:z.enum(ASSET_KINDS),mimeType:z.enum(["image/jpeg","image/png","image/webp","application/pdf"]),
  width:z.number().int().positive().max(20000).nullable(),height:z.number().int().positive().max(20000).nullable(),byteSize:z.number().int().positive().max(26214400),
  checksum:z.string().regex(/^[a-f0-9]{64}$/),provenance:z.enum(["original","legacy-prepared-original","prepared","generated","report","mask","reference"])}).strict();
export interface PatientServices { accounts:AccountServices; patients:PatientCaseStore }
function fail(status:number,code:string,cloud?:unknown) {return Response.json({code,error:code==="conflict"?"This case changed on another device. Your local changes are kept.":"Patient sync couldn’t complete. Your local case is kept.",...(cloud?{cloud}:{})},{status,headers});}
async function body(request:Request) {
  const limit=2359296;
  if(Number(request.headers.get("content-length")??0)>limit)throw new PatientSyncError(413,"state_too_large");
  const reader=request.body?.getReader();if(!reader)throw new PatientSyncError(400,"invalid_json");
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new PatientSyncError(413,"state_too_large");}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(bytes);
  const value=JSON.parse(text);if(!value || typeof value!=="object" || Array.isArray(value)) throw new PatientSyncError(400,"invalid_state");return value;
}
/** Bound recursion and reject binary/public/signed URLs anywhere in structured state. */
export function validStructured(value:unknown,depth=0): value is Json {
 if(depth>40) return false;
 if(value===null || typeof value==="boolean")return true;
 if(typeof value==="number")return Number.isFinite(value);
 if(typeof value==="string")return !/^(data:|blob:|https?:\/\/)/i.test(value);
 if(Array.isArray(value))return value.every(v=>validStructured(v,depth+1));
 if(typeof value==="object" && value) {
  const v=value as Record<string,unknown>;
  if("$asset" in v)return Object.keys(v).length===1 && uuidValid(v.$asset);
  return Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&validStructured(x,depth+1));
 }
 return false;
}
function validState(s:unknown):s is PatientState {
 if(!validStructured(s)||!s||Array.isArray(s)||typeof s!=="object")return false;
 const v=s as unknown as PatientState;
 return v.schemaVersion===1 && Array.isArray(v.entries)&&Array.isArray(v.media)&&v.entries.length<=500 &&v.media.length<=500&&
  (v.preferredDesignId===null || typeof v.preferredDesignId==="string")&&("draft" in v);
}
function validSummary(s:unknown):s is PatientSummary {
 if(!validStructured(s)||!s||Array.isArray(s)||typeof s!=="object")return false;
 const v=s as unknown as PatientSummary;
 return Array.isArray(v.entries)&&v.entries.length<=500&&typeof v.patientName==="string"&&v.patientName.length<=100&&Number.isInteger(v.visualisationCount)&&("thumbnail" in v);
}
export async function drainPatientCleanup(owner:string,services:PatientServices) {
 for(const job of await services.patients.cleanupJobs(owner)) {
  // Even a corrupted cleanup record cannot request another owner's storage.
  if(!job.objectPath.startsWith(`${owner}/${job.caseId}/`))continue;
  try {await services.accounts.media.remove(PATIENT_BUCKET,[job.objectPath]);await services.patients.cleanupDone(owner,job.id);}
  catch {await services.patients.cleanupRetry(owner,job.id,job.attempts);}
 }
}
export async function handlePatientCases(request:Request,services:PatientServices|null):Promise<Response> {
 try {
  if(!services) return fail(503,"patient_sync_unconfigured");
  const user=await authenticate(request,services.accounts);if(!user)return fail(401,"auth_required");
  const owner=user.id;
  const url=new URL(request.url), parts=url.pathname.split("/").filter(Boolean).slice(2);
  const id=parts[0];if(id&&!uuidValid(id))return fail(400,"invalid_case_id");
  // Cleanup is retried on ordinary authenticated activity. Failures never lose the job.
  await drainPatientCleanup(owner,services).catch(()=>{});
  if(!id && request.method==="GET") {
    const cursor=url.searchParams.get("cursor")??undefined;
    if(cursor) {try {const p=JSON.parse(atob(cursor));if(!Array.isArray(p)||p.length!==2||typeof p[0]!=="string"||!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(p[0])||!Number.isFinite(Date.parse(p[0]))||!uuidValid(p[1]))return fail(400,"invalid_cursor");}catch{return fail(400,"invalid_cursor");}}
    return Response.json(await services.patients.list(owner,cursor),{headers});
  }
  if(id && parts[1]==="assets")return await handleAsset(request,services,owner,id,parts[2]);
  if(parts.length>1)return fail(404,"not_found");
  if(id && request.method==="GET") {
    const c=await services.patients.get(owner,id);return c?Response.json(c,{headers}):fail(404,"not_found");
  }
  if((!id&&request.method==="POST")||(id&&["PATCH","DELETE"].includes(request.method))) {
    const b=await body(request),caseId=id??b.id;
    if(!uuidValid(caseId)||!uuidValid(b.operationId)||!Number.isInteger(b.expectedRevision)||b.expectedRevision<0)return fail(400,"invalid_mutation");
    const type=request.method==="POST"?"CREATE_CASE":request.method==="PATCH"?"UPDATE_CASE":"DELETE_CASE";
    if(type!=="DELETE_CASE"&&(!validState(b.state)||!validSummary(b.summary)))return fail(400,"invalid_state");
    if(b.archivedAt!==undefined&&b.archivedAt!==null&&(typeof b.archivedAt!=="string"||!Number.isFinite(Date.parse(b.archivedAt))))return fail(400,"invalid_timestamp");
    const input:CaseMutation={id:caseId,operationId:b.operationId,type,expectedRevision:b.expectedRevision,state:b.state??{schemaVersion:1,entries:[],media:[],draft:null,preferredDesignId:null},summary:b.summary??{entries:[],patientName:"",visualisationCount:0,thumbnail:null},archivedAt:b.archivedAt??null};
    const c=await services.patients.mutate(owner,input);
    if(type==="DELETE_CASE")await drainPatientCleanup(owner,services).catch(()=>{});
    return Response.json(c,{status:type==="CREATE_CASE"?201:200,headers});
  }
  return new Response(null,{status:405,headers:{...headers,Allow:id?"GET, PATCH, DELETE":"GET, POST"}});
 }catch(e) {
  if(e instanceof PatientSyncError)return fail(e.status,e.code,e.cloud);
  if(e instanceof AccountError)return fail(e.code==="auth_required"||e.code==="mfa_required"?401:503,e.code);
  if(e instanceof SyntaxError)return fail(400,"invalid_json");
  return fail(503,"patient_sync_unavailable");
 }
}
const digest=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes as Uint8Array<ArrayBuffer>))].map(n=>n.toString(16).padStart(2,"0")).join("");
async function handleAsset(request:Request,s:PatientServices,owner:string,id:string,assetId?:string):Promise<Response> {
 const c=await s.patients.get(owner,id);if(!c)return fail(404,"not_found");if(c.deletedAt)return fail(410,"deleted");
 if(!assetId && request.method==="POST") {
  const b=metaSchema.safeParse(await body(request));if(!b.success)return fail(400,"invalid_asset");
  const a:PatientAsset={...b.data,ownerUserId:owner,caseId:id,objectPath:assetPath(owner,id,b.data.id,b.data.kind),createdAt:new Date().toISOString(),uploadStatus:"pending"};
  return Response.json(await s.patients.authoriseAsset(owner,id,a),{headers});
 }
 if(!uuidValid(assetId))return fail(400,"invalid_asset_id");
 const a=await s.patients.asset(owner,id,assetId);if(!a||a.objectPath!==assetPath(owner,id,a.id,a.kind)||a.uploadStatus==="deleted")return fail(404,"not_found");
 if(request.method==="GET") {
  if(a.uploadStatus!=="confirmed")return fail(409,"asset_pending");
  const bytes=await s.accounts.media.download(PATIENT_BUCKET,a.objectPath);if(!bytes)return fail(503,"media_unavailable");
  return new Response(bytes as Uint8Array<ArrayBuffer>,{headers:{...headers,"Content-Type":a.mimeType,"Content-Length":String(bytes.byteLength),"X-Content-Type-Options":"nosniff"}});
 }
 if(request.method!=="PUT")return new Response(null,{status:405,headers:{...headers,Allow:"GET, PUT"}});
 if(request.headers.get("content-type")?.split(";")[0]!==a.mimeType)return fail(400,"invalid_mime");
 if(Number(request.headers.get("content-length")??0)>26214400)return fail(413,"asset_too_large");
 const reader=request.body?.getReader();if(!reader)return fail(400,"empty_asset");
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>a.byteSize){await reader.cancel();return fail(413,"asset_too_large");}chunks.push(value);}
 if(size!==a.byteSize)return fail(400,"asset_size_mismatch");
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 if(await digest(bytes)!==a.checksum)return fail(400,"asset_checksum_mismatch");
 // Immutable retry: never upsert. An interrupted upload can be confirmed by its exact checksum.
 if(a.uploadStatus!=="confirmed") {
  try {await s.accounts.media.put(PATIENT_BUCKET,a.objectPath,bytes,a.mimeType);}
  catch {const existing=await s.accounts.media.download(PATIENT_BUCKET,a.objectPath);if(!existing||await digest(existing)!==a.checksum)throw new PatientSyncError(503,"media_upload_unavailable");}
  const stored=await s.accounts.media.download(PATIENT_BUCKET,a.objectPath);
  if(!stored||await digest(stored)!==a.checksum)return fail(503,"media_confirmation_failed");
 }
 if(!await s.patients.confirmAsset(owner,id,a.id)) {
  await s.patients.enqueueCleanup(owner,id,a.objectPath);
  await drainPatientCleanup(owner,s).catch(()=>{});
  return fail(410,"deleted");
 }
 return Response.json({...a,uploadStatus:"confirmed"},{headers});
}
