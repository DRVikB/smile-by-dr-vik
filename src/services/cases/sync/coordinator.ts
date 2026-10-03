import type { WorkspaceLease } from "@/lib/workspace";
import type { LocalAsset, LocalPatientCase, OutboxOperation, PatientLocalStore } from "./localStore";
import { EMPTY_STATE, EMPTY_SUMMARY, PatientSyncError, uuidValid, type PatientApi, type PatientCase, type PatientState, type PatientSummary } from "./types";
import { checksum, referencedAssets } from "./media";
import type { MediaTransfers } from "./mediaStatus";
export function createSyncCoordinator(scope:WorkspaceLease,store:PatientLocalStore,onChange:()=>void,onCloud:(c:LocalPatientCase)=>Promise<void>) {
 let pinnedCaseId:string|undefined;
 const uploads=new Set<string>(),downloads=new Map<string,Promise<Blob>>();
 const downloadFailures=new Map<string,{caseId:string;kind:"missing"|"download"|"pending"|"auth"}>();
 const transfers=():MediaTransfers=>({uploading:[...uploads],downloading:[...downloads.keys()],failures:Object.fromEntries([...downloadFailures].map(([id,f])=>[id,f.kind]))});
 let api:PatientApi|null=null,running:Promise<void>|null=null,rerun=false,serial=Promise.resolve(),retryTimer:ReturnType<typeof setTimeout>|undefined;
 function owner(){scope.assert();if(scope.owner.kind!=="account")throw new Error("Not an account workspace.");return scope.owner.userId;}
 function own(c:{ownerUserId:string}){if(c.ownerUserId!==owner())throw new PatientSyncError(403,"wrong_owner");}
 function queue<T>(run:()=>Promise<T>):Promise<T>{const next=serial.catch(()=>{}).then(run);serial=next.then(()=>{},()=>{});return next;}
 async function stage(id:string,state:PatientState,summary:PatientSummary,assets:LocalAsset[]=[],deleted=false){
  scope.assert();if(!uuidValid(id))throw new Error("Patient cases require their stable UUID.");
  const old=await store.getCase(id);if(old?.deletedAt)throw new PatientSyncError(410,"deleted");
  const operations=(await store.outbox()).filter(o=>o.caseId===id),sequence=(old?.sequence??0)+1,now=Date.now();
  const newOps:OutboxOperation[]=[];
  function operation(type:OutboxOperation["type"],expectedRevision:number,dependencies:string[]):OutboxOperation{return {id:crypto.randomUUID(),account:owner(),caseId:id,type,expectedRevision,dependencies,sequence,status:old?.status==="conflict"?"blocked":"pending",attempts:0,nextAttemptAt:0,createdAt:now,updatedAt:now};}
  // IndexedDB getAll is ordered by random operation UUID, not insertion time.
  // Depend on the queue's terminal operations, never the last returned UUID.
  let dependencies=operations.filter(op=>!operations.some(other=>other.dependencies.includes(op.id))).map(op=>op.id);
  const pendingCreates=operations.some(o=>o.type==="CREATE_CASE");
  if(!old?.revision&&!pendingCreates){const op=operation("CREATE_CASE",0,dependencies);op.mutation={id,operationId:op.id,type:"CREATE_CASE",expectedRevision:0,state:EMPTY_STATE(),summary:EMPTY_SUMMARY()};newOps.push(op);dependencies=[op.id];}
  const knownAssets=await store.assets();
  for(const a of assets){
   if(!a.pending||operations.some(o=>o.assetId===a.id)||knownAssets.some(x=>x.id===a.id&&!x.pending))continue;
   const op=operation("UPLOAD_ASSET",0,dependencies);op.assetId=a.id;newOps.push(op);dependencies=[op.id];
  }
  // Existing pending blobs also need an operation after restart/legacy import.
  for(const assetId of referencedAssets(state)) {
   if([...operations,...newOps].some(o=>o.assetId===assetId))continue;
   const a=assets.find(x=>x.id===assetId)??knownAssets.find(x=>x.id===assetId);
   if(a?.pending){const op=operation("UPLOAD_ASSET",0,dependencies);op.assetId=assetId;newOps.push(op);dependencies=[op.id];}
  }
  const expected=(old?.revision??0)+[...operations,...newOps].filter(o=>["CREATE_CASE","UPDATE_CASE","DELETE_CASE"].includes(o.type)).length;
  const op=operation(deleted?"DELETE_CASE":"UPDATE_CASE",expected,dependencies);
  op.mutation={id,operationId:op.id,type:deleted?"DELETE_CASE":"UPDATE_CASE",expectedRevision:expected,state:deleted?EMPTY_STATE():state,summary:deleted?EMPTY_SUMMARY():summary,archivedAt:state.caseStatus?.archivedAt?new Date(state.caseStatus.archivedAt).toISOString():null};newOps.push(op);
  const record:LocalPatientCase={id,ownerUserId:owner(),revision:old?.revision??0,state,summary,sequence,
   status:old?.status==="conflict"?"conflict":"pending",createdAt:old?.createdAt??new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),archivedAt:op.mutation.archivedAt??null,deletedAt:deleted?new Date(now).toISOString():null,...(old?.conflict?{conflict:old.conflict}:{})};
  await store.commit(record,assets,newOps);onChange();kick();return record;
 }
 async function readAsset(caseId:string,id:string):Promise<Blob>{
  scope.assert();const a=await store.asset(id);if(!a||a.meta.caseId!==caseId)throw new Error("Patient media is not available offline yet.");own(a.meta);
  if(a.blob){
   // WebKit can invalidate a retrieved Blob handle when its cache record is
   // overwritten. Preserve independent bytes before updating access metadata.
   const blob=new Blob([await a.blob.arrayBuffer()],{type:a.blob.type});scope.assert();
   await store.putAsset({...a,blob,lastAccess:Date.now()});return blob;
  }
  if(!api)throw new PatientSyncError(503,"offline");
  const b=await api.download(caseId,id);scope.assert();if(await checksum(b)!==a.meta.checksum)throw new PatientSyncError(503,"media_checksum_mismatch");scope.assert();
  // A tombstone that arrived while downloading must not repopulate deleted media.
  const record=await store.getCase(caseId);if(record?.deletedAt)throw new PatientSyncError(410,"deleted");
  await store.putAsset({...a,blob:b,lastAccess:Date.now()});return b;
 }
 function loadAsset(caseId:string,id:string):Promise<Blob>{
  const existing=downloads.get(id);if(existing)return existing;
  const request=readAsset(caseId,id).then(blob=>{downloadFailures.delete(id);return blob;}).catch(error=>{
   if(!scope.signal.aborted)downloadFailures.set(id,{caseId,kind:error instanceof PatientSyncError&&error.status===401?"auth":error instanceof PatientSyncError&&[404,410].includes(error.status)?"missing":error instanceof PatientSyncError&&error.code==="asset_pending"?"pending":"download"});
   throw error;
  }).finally(()=>{downloads.delete(id);if(!scope.signal.aborted)onChange();});
  downloads.set(id,request);if(!scope.signal.aborted)onChange();return request;
 }
 async function refresh(){
  if(!api)return;let cursor:string|undefined;
  do {
   const page=await api.list(cursor);scope.assert();
   for(const summary of page.cases){own(summary);const local=await store.getCase(summary.id);
    if(local&&summary.revision<=local.revision)continue;
    const cloud=await api.get(summary.id);scope.assert();own(cloud);
    if(local&&["pending","conflict"].includes(local.status)){
     // Preserve pending local clinical work, including work conflicting with a deletion.
     if(summary.revision>local.revision)await store.conflict(summary.id,cloud);
     continue;
    }
    await queue(async()=>{const latest=await store.getCase(summary.id);if(latest&&["pending","conflict"].includes(latest.status)){await store.conflict(summary.id,cloud);return;}
     await store.adoptCloud(cloud);const adopted=await store.getCase(summary.id);if(adopted)await onCloud(adopted);
     if(cloud.deletedAt)await store.invalidateMedia(cloud.id);
    });onChange();
   }
   cursor=page.nextCursor??undefined;
  }while(cursor);
 }
 async function flush(){
  if(!api)return;
  while(true){
   scope.assert();const ops=await store.outbox(),now=Date.now();let progressed=false;
   for(const op of ops.sort((a,b)=>a.createdAt-b.createdAt)){
    if(op.account!==owner())throw new PatientSyncError(403,"wrong_owner");
    const record=await store.getCase(op.caseId);
    if(op.status==="blocked"||record?.status==="conflict"||op.nextAttemptAt>now||op.dependencies.some(id=>ops.some(x=>x.id===id)))continue;
    try{
     if(op.type==="UPLOAD_ASSET"){
      const a=await store.asset(op.assetId!);if(!a?.blob)throw new Error("Pending photo bytes missing; keep the local case.");own(a.meta);
      uploads.add(op.id);onChange();
      try{const accepted=await api.upload(a.meta,a.blob);scope.assert();own(accepted);await queue(()=>store.acknowledge(op,undefined,accepted));}
      finally{uploads.delete(op.id);if(!scope.signal.aborted)onChange();}
     }else{
      const cloud=await api.mutate(op.mutation!);scope.assert();own(cloud);await queue(()=>store.acknowledge(op,cloud));
      if(cloud.deletedAt){await store.invalidateMedia(cloud.id);const local=await store.getCase(cloud.id);if(local)await onCloud(local);}
     }
     progressed=true;onChange();
    }catch(e){
     scope.assert();
     if(e instanceof PatientSyncError&&[409,410].includes(e.status)&&e.cloud){
      const cloud=await api.get(op.caseId).catch(()=>e.cloud!);scope.assert();await queue(()=>store.conflict(op.caseId,cloud));onChange();
     }else{await store.retry(op,e instanceof PatientSyncError?e.code:"network",e instanceof PatientSyncError&&[400,403,404,413].includes(e.status));onChange();}
    }
   }
   if(!progressed)break;
  }
 }
 async function run(){
  if(!api||scope.signal.aborted)return;
  if(running){rerun=true;return running;}
  running=(async()=>{do{rerun=false;await serial;await flush();await refresh();await store.evict(undefined,pinnedCaseId);}while(rerun&&api&&!scope.signal.aborted);
   // Retry only media previously requested by a viewer, never the entire library.
   if(api&&!(typeof navigator!=="undefined"&&navigator.onLine===false))for(const [id,f] of [...downloadFailures])if(f.kind!=="missing")await loadAsset(f.caseId,id).catch(()=>{});
  })().catch(()=>{/* Local work remains durable. Account detach is expected. */}).finally(()=>{
   running=null;if(!scope.signal.aborted&&api){void store.outbox().then(ops=>{const blocked=new Set(ops.filter(o=>o.status==="blocked").map(o=>o.caseId));const pending=ops.filter(o=>o.status==="pending"&&!blocked.has(o.caseId));if(pending.length){clearTimeout(retryTimer);retryTimer=setTimeout(()=>{void run();},Math.max(1000,Math.min(60000,...pending.map(o=>o.nextAttemptAt-Date.now()))));}}).catch(()=>{});}
  });return running;
 }
 function kick(){if(api&&!scope.signal.aborted){if(running)rerun=true;clearTimeout(retryTimer);retryTimer=setTimeout(()=>{void run();},250);}}
 scope.signal.addEventListener("abort",()=>{api=null;clearTimeout(retryTimer);},{once:true});
 return {store,scope,transfers,async retry(caseId:string){await store.retryCase(caseId);for(const [id,f]of downloadFailures)if(f.caseId===caseId)downloadFailures.delete(id);onChange();await run();},pinCase(id:string|undefined){pinnedCaseId=id;},enqueue:(...args:Parameters<typeof stage>)=>queue(()=>stage(...args)),loadAsset,run,kick,
  connect(client:PatientApi){scope.assert();api=client;kick();},disconnect(){api=null;clearTimeout(retryTimer);},
  async conflicts(){return (await store.cases()).filter(c=>c.status==="conflict");},
  async resolve(id:string,choice:"cloud"|"preserve-local",prepare?:(selected:PatientCase|LocalPatientCase)=>Promise<void>){
   return queue(async()=>{
    const local=await store.getCase(id);if(!local?.conflict)return;
    let preserved:LocalPatientCase|undefined;
    if(choice==="preserve-local"){
     // A distinct case/draft avoids silently merging reviewed clinical state.
     const newId=crypto.randomUUID(),oldAssets=await store.assets(),newAssets:LocalAsset[]=[],map=new Map<string,string>();
     for(const aid of referencedAssets(local.state)){const a=oldAssets.find(a=>a.id===aid);if(!a)continue;const blob=await loadAsset(id,aid),newAid=crypto.randomUUID();map.set(aid,newAid);
      newAssets.push({...a,id:newAid,blob,pending:true,meta:{...a.meta,id:newAid,caseId:newId,objectPath:`${owner()}/${newId}/${newAid}/${a.meta.kind.toLowerCase()}`,uploadStatus:"pending"}});
     }
     const state=JSON.parse(JSON.stringify(local.state)) as PatientState;
     function remap(v:unknown){if(!v||typeof v!=="object")return;if("$asset"in v&&typeof v.$asset==="string")v.$asset=map.get(v.$asset)??v.$asset;else for(const x of Object.values(v))remap(x);}
     remap(state);const ids=new Map<string,string>();for(const entry of state.entries){const e=entry as Record<string,unknown>;ids.set(e.id as string,crypto.randomUUID());e.caseId=newId;e.id=ids.get(e.id as string)!;}
     for(const media of state.media){const m=media as Record<string,unknown>;m.id=ids.get(m.id as string)??m.id;}
     if(state.draft&&typeof state.draft==="object"&&!Array.isArray(state.draft)){
      state.draft.caseId=newId;
      const draft=state.draft as Record<string,unknown>;
      const resultId=(result:unknown)=>{if(result&&typeof result==="object"&&"variationId"in result&&typeof result.variationId==="string")result.variationId=ids.get(result.variationId)??result.variationId;};
      resultId(draft.result);
      if(Array.isArray(draft.variants))for(const variant of draft.variants)resultId(variant.result);
      draft.preferredDesignId=typeof draft.preferredDesignId==="string"?ids.get(draft.preferredDesignId)??null:null;
     }
     state.preferredDesignId=state.preferredDesignId?ids.get(state.preferredDesignId)??null:null;
     const summary=JSON.parse(JSON.stringify(local.summary)) as PatientSummary;
     remap(summary);
     for(const entry of summary.entries){const e=entry as Record<string,unknown>;e.caseId=newId;e.id=ids.get(e.id as string)??e.id;}
     preserved=await stage(newId,state,summary,newAssets);await onCloud(preserved);
    }
    let cloud=local.conflict.cloud;if(api){cloud=await api.get(id);scope.assert();own(cloud);}
    // Reopening assets must succeed before discarding the conflicting local state.
    if(prepare)await prepare(preserved??cloud);
    await store.replaceWithCloud(cloud);const current=await store.getCase(id);if(current)await onCloud(current);
    if(cloud.deletedAt)await store.invalidateMedia(id);onChange();kick();
   });
  },
 };
}
export type SyncCoordinator=ReturnType<typeof createSyncCoordinator>;
