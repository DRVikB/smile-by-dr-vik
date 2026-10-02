import { apiUrl } from "@/services/api/client";
import type { WorkspaceLease } from "@/lib/workspace";
import { PatientSyncError, type PatientApi, type PatientAsset, type PatientCase, type PatientCaseSummary } from "./types";
export function createPatientApi(scope:WorkspaceLease,getToken:()=>Promise<string|null>,request:typeof fetch=fetch):PatientApi {
 async function call(path:string,init:RequestInit={},binary=false):Promise<unknown>{
  scope.assert();const token=await getToken();scope.assert();if(!token)throw new PatientSyncError(401,"auth_required");
  const response=await request(apiUrl(`/api/patient-cases${path}`),{...init,headers:{Authorization:`Bearer ${token}`,...(init.body?{"Content-Type":typeof init.body==="string"?"application/json":(init.body as Blob).type}:{}),...init.headers},cache:"no-store",signal:AbortSignal.any([scope.signal,AbortSignal.timeout(60000)])});
  scope.assert();if(binary&&response.ok){const blob=await response.blob();scope.assert();return blob;}
  const value=await response.json();scope.assert();if(!response.ok)throw new PatientSyncError(response.status,value.code??"sync_failed",value.cloud);
  if(value.ownerUserId && (scope.owner.kind!=="account"||value.ownerUserId!==scope.owner.userId))throw new PatientSyncError(403,"wrong_owner");
  return value;
 }
 return {
  list:async cursor=>await call(cursor?`?cursor=${encodeURIComponent(cursor)}`:"") as {cases:PatientCaseSummary[];nextCursor:string|null},
  get:async id=>await call(`/${id}`) as PatientCase,
  mutate:async m=>await call(m.type==="CREATE_CASE"?"":`/${m.id}`,{method:m.type==="CREATE_CASE"?"POST":m.type==="DELETE_CASE"?"DELETE":"PATCH",body:JSON.stringify(m)}) as PatientCase,
  async upload(a,b){const {id,kind,mimeType,width,height,byteSize,checksum,provenance}=a;await call(`/${a.caseId}/assets`,{method:"POST",body:JSON.stringify({id,kind,mimeType,width,height,byteSize,checksum,provenance})});return await call(`/${a.caseId}/assets/${id}`,{method:"PUT",body:b}) as PatientAsset;},
  download:async(caseId,id)=>await call(`/${caseId}/assets/${id}`,{},true) as Blob,
 };
}
