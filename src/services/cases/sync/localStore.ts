import { workspaceDatabase, type WorkspaceLease } from "@/lib/workspace";
import type { CaseMutation, PatientAsset, PatientCase, PatientState, PatientSummary } from "./types";
export const SYNC_DATABASE="smile-patient-sync";
export interface LocalPatientCase {
 id:string; ownerUserId:string; revision:number; state:PatientState; summary:PatientSummary; sequence:number;
 status:"pending"|"synced"|"conflict"|"deleted"; createdAt:string; updatedAt:string; archivedAt:string|null; deletedAt:string|null;
 conflict?: { cloud:PatientCase; detectedAt:number }; error?:string;
}
export interface LocalAsset { id:string; meta:PatientAsset; blob?:Blob; pending:boolean; lastAccess:number }
export interface OutboxOperation {
 id:string; account:string; caseId:string; type:"CREATE_CASE"|"UPDATE_CASE"|"DELETE_CASE"|"UPLOAD_ASSET";
 dependencies:string[]; expectedRevision:number; attempts:number; nextAttemptAt:number; createdAt:number; updatedAt:number;
 sequence:number; mutation?:CaseMutation; assetId?:string; status:"pending"|"blocked"; error?:string;
}
/** All operations capture the same immutable account lease; no callback discovers a new account. */
export function createPatientLocalStore(scope:WorkspaceLease,factory:IDBFactory=globalThis.indexedDB) {
 async function db():Promise<IDBDatabase> {
  scope.assert();return new Promise((resolve,reject)=>{
   const r=factory.open(workspaceDatabase(SYNC_DATABASE,scope),1);
   r.onupgradeneeded=()=>{for(const name of ["cases","assets","outbox"])r.result.createObjectStore(name,{keyPath:"id"});};
   r.onsuccess=()=>{try{scope.assert();r.result.onversionchange=()=>r.result.close();resolve(r.result);}catch(e){r.result.close();reject(e);}};r.onerror=()=>reject(r.error);
  });
 }
 async function transaction<T>(stores:string[],mode:IDBTransactionMode,run:(tx:IDBTransaction,done:(value:T)=>void)=>void):Promise<T> {
  const conn=await db();scope.assert();try{return await new Promise<T>((resolve,reject)=>{
   const tx=conn.transaction(stores,mode);let value:T;let failure:unknown;
   tx.oncomplete=()=>{try{scope.assert();resolve(value);}catch(e){reject(e);}};
   tx.onerror=tx.onabort=()=>reject(failure??tx.error??new Error("Patient cache transaction failed."));
   try{run(tx,v=>{value=v;});}catch(e){failure=e;tx.abort();}
  });}finally{conn.close();}
 }
 const get=<T>(name:string,id:string)=>transaction<T|undefined>([name],"readonly",(tx,done)=>{const r=tx.objectStore(name).get(id);r.onsuccess=()=>done(r.result);});
 const all=<T>(name:string)=>transaction<T[]>([name],"readonly",(tx,done)=>{const r=tx.objectStore(name).getAll();r.onsuccess=()=>done(r.result);});
 return {
  scope, getCase:(id:string)=>get<LocalPatientCase>("cases",id), cases:()=>all<LocalPatientCase>("cases"),
  asset:(id:string)=>get<LocalAsset>("assets",id), assets:()=>all<LocalAsset>("assets"), outbox:()=>all<OutboxOperation>("outbox"),
  async commit(record:LocalPatientCase,assets:LocalAsset[]=[],operations:OutboxOperation[]=[]) {
   scope.assert();await transaction<void>(["cases","assets","outbox"],"readwrite",tx=>{
    tx.objectStore("cases").put(record);for(const a of assets)tx.objectStore("assets").put(a);for(const op of operations)tx.objectStore("outbox").put(op);
   });
  },
  async putAsset(asset:LocalAsset){await transaction<void>(["assets"],"readwrite",tx=>{tx.objectStore("assets").put(asset);});},
  async retry(op:OutboxOperation,error:string,blocked=false){await transaction<void>(["outbox"],"readwrite",tx=>{tx.objectStore("outbox").put({...op,status:blocked?"blocked":"pending",attempts:op.attempts+1,error,updatedAt:Date.now(),nextAttemptAt:Date.now()+Math.min(60000,1000*2**Math.min(op.attempts,6))});});},
  async retryCase(caseId:string){await transaction<void>(["cases","outbox"],"readwrite",tx=>{
   const c=tx.objectStore("cases").get(caseId);c.onsuccess=()=>{if(c.result?.status==="conflict"||c.result?.deletedAt)return;
    const r=tx.objectStore("outbox").getAll();r.onsuccess=()=>{for(const op of r.result as OutboxOperation[])if(op.caseId===caseId){const {error:_error,...rest}=op;void _error;tx.objectStore("outbox").put({...rest,status:"pending",nextAttemptAt:0});}};
   };
  });},
  async acknowledge(op:OutboxOperation,cloud?:PatientCase,asset?:PatientAsset){
   await transaction<void>(["cases","assets","outbox"],"readwrite",tx=>{
    tx.objectStore("outbox").delete(op.id);
    if(cloud){const r=tx.objectStore("cases").get(op.caseId);r.onsuccess=()=>{
     const local=r.result as LocalPatientCase|undefined;if(!local)return;
     tx.objectStore("cases").put({...local,revision:cloud.revision,updatedAt:cloud.updatedAt,
      state:cloud.deletedAt?cloud.state:local.state,summary:cloud.deletedAt?cloud.summary:local.summary,
      status:cloud.deletedAt?"deleted":local.sequence===op.sequence&&op.type!=="CREATE_CASE"?"synced":local.status,deletedAt:cloud.deletedAt});
    };}
    if(asset){const r=tx.objectStore("assets").get(asset.id);r.onsuccess=()=>{if(r.result)tx.objectStore("assets").put({...r.result,meta:asset,pending:false});};}
   });
  },
  async conflict(caseId:string,cloud:PatientCase){await transaction<void>(["cases","outbox"],"readwrite",tx=>{
   const r=tx.objectStore("cases").get(caseId);r.onsuccess=()=>{if(r.result)tx.objectStore("cases").put({...r.result,status:"conflict",conflict:{cloud,detectedAt:Date.now()}});};
   const ops=tx.objectStore("outbox").getAll();ops.onsuccess=()=>{for(const op of ops.result as OutboxOperation[])if(op.caseId===caseId)tx.objectStore("outbox").put({...op,status:"blocked",error:cloud.deletedAt?"deleted_on_another_device":"conflict"});};
  });},
  async adoptCloud(cloud:PatientCase){await transaction<void>(["cases","outbox","assets"],"readwrite",tx=>{
   const r=tx.objectStore("cases").get(cloud.id);r.onsuccess=()=>{
    const local=r.result as LocalPatientCase|undefined;
    // Account-local edits arriving while a download runs cannot be replaced by that download.
    if(local && ["pending","conflict"].includes(local.status))return;
    tx.objectStore("cases").put({id:cloud.id,ownerUserId:cloud.ownerUserId,revision:cloud.revision,state:cloud.state,summary:cloud.summary,sequence:local?.sequence??0,
     status:cloud.deletedAt?"deleted":"synced",createdAt:cloud.createdAt,updatedAt:cloud.updatedAt,archivedAt:cloud.archivedAt,deletedAt:cloud.deletedAt} satisfies LocalPatientCase);
    for(const meta of cloud.assets){const a=tx.objectStore("assets").get(meta.id);a.onsuccess=()=>{tx.objectStore("assets").put({...a.result,id:meta.id,meta,pending:false,lastAccess:a.result?.lastAccess??0});};}
   };
  });},
  async replaceWithCloud(cloud:PatientCase){await transaction<void>(["cases","outbox","assets"],"readwrite",tx=>{
   tx.objectStore("cases").put({id:cloud.id,ownerUserId:cloud.ownerUserId,revision:cloud.revision,state:cloud.state,summary:cloud.summary,sequence:0,status:cloud.deletedAt?"deleted":"synced",createdAt:cloud.createdAt,updatedAt:cloud.updatedAt,archivedAt:cloud.archivedAt,deletedAt:cloud.deletedAt} satisfies LocalPatientCase);
   const r=tx.objectStore("outbox").getAll();r.onsuccess=()=>{for(const op of r.result as OutboxOperation[])if(op.caseId===cloud.id)tx.objectStore("outbox").delete(op.id);};
   for(const meta of cloud.assets)tx.objectStore("assets").put({id:meta.id,meta,pending:false,lastAccess:0});
  });},
  async evict(maxBytes=192*1024*1024,pinnedCaseId?:string){
   const cached=await all<LocalAsset>("assets"),ops=await all<OutboxOperation>("outbox");
   const protectedCases=new Set(ops.map(op=>op.caseId));if(pinnedCaseId)protectedCases.add(pinnedCaseId);
   let bytes=cached.reduce((n,a)=>n+(a.blob?.size??0),0);
   const victims=cached.filter(a=>a.blob&&!a.pending&&a.meta.kind!=="THUMBNAIL"&&!protectedCases.has(a.meta.caseId)).sort((a,b)=>a.lastAccess-b.lastAccess);
   await transaction<void>(["assets"],"readwrite",tx=>{for(const a of victims){if(bytes<=maxBytes)break;bytes-=a.blob!.size;const {blob:_blob,...rest}=a;void _blob;tx.objectStore("assets").put(rest);}});
   return bytes;
  },
  async invalidateMedia(caseId:string){await transaction<void>(["assets"],"readwrite",tx=>{const r=tx.objectStore("assets").getAll();r.onsuccess=()=>{for(const a of r.result as LocalAsset[])if(a.meta.caseId===caseId)tx.objectStore("assets").delete(a.id);};});},
 };
}
export type PatientLocalStore=ReturnType<typeof createPatientLocalStore>;
