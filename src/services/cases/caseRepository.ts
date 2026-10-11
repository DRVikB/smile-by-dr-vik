import { createCaseLogStore } from "@/lib/caseLog";
import { createDraftStore } from "@/lib/storage";
import { captureWorkspace, guardStore, type WorkspaceLease } from "@/lib/workspace";
import type { CaseLogEntry, CaseLogMedia, SmileCase } from "@/lib/types";
import { buildCase, caseIdOf, summariseCases } from "@/models/case";
import { restoreAnalysisSnapshot } from "./sync/analysisSnapshot";
import { createPatientLocalStore, type LocalPatientCase } from "./sync/localStore";
import { createSyncCoordinator } from "./sync/coordinator";
import { encodePatientState, hydrate, referencedAssets } from "./sync/media";
import { caseMediaStatus } from "./sync/mediaStatus";
import { stableJson, uuidValid, type Json, type PatientApi } from "./sync/types";
import { PHOTO_SLOTS, cleanTags, isCaseStatus, isPhotoSlot, validConsent, type CaseConsent, mergePortal, type PhotoSlot, type PortalDetails, type PortalPatch } from "@/lib/portal";

/** UI -> this session-bound repository -> immediate local working copy + durable cloud outbox. */
export function createCaseRepository(scope: WorkspaceLease) {
 const log=createCaseLogStore(scope),drafts=createDraftStore(scope),local=createPatientLocalStore(scope);
 const listeners=new Set<()=>void>();let writes=Promise.resolve();let lastThumb:{src:string;image:string}|undefined;
 const workingListeners=new Set<(draft:SmileCase|null)=>void>();
 const workingChange=(draft:SmileCase|null)=>{scope.assert();for(const fn of workingListeners)fn(draft);};
 const change=()=>{scope.assert();for(const fn of listeners)fn();};
 const project=async(c:LocalPatientCase)=>{
  const entries:CaseLogEntry[]=[];
  if(!c.deletedAt)for(const item of c.state.entries){
    const e=await hydrate<CaseLogEntry>(item,id=>sync.loadAsset(c.id,id),scope).catch(()=>({...item as object,thumb:""}) as CaseLogEntry);scope.assert();entries.push(e);
  }
  if(!c.deletedAt&&!entries.length&&(c.state.draft||c.state.portal)){
    const thumb=c.state.draftThumb?await hydrate<string>(c.state.draftThumb,id=>sync.loadAsset(c.id,id),scope).catch(()=>""):"";
    entries.push({id:c.id,caseId:c.id,patientName:c.summary.patientName,createdAt:Date.parse(c.createdAt),mode:"live",draftOnly:true,label:"Draft",summary:"Unfinished design · no AI concept generated",archivedAt:c.state.caseStatus?.archivedAt??undefined,deletedAt:c.state.caseStatus?.deletedAt??undefined,thumb});
  }
  await log.replaceCaseMetadata(c.id,entries);
  if(c.deletedAt){const d=await drafts.readCase();if(d?.caseId===c.id){await drafts.persistCase(null);workingChange(null);}}
 };
 const sync=createSyncCoordinator(scope,local,change,project);
 let repairing:Promise<void>|null=null;
 const isAccount=scope.owner.kind==="account"&&uuidValid(scope.owner.userId);
 async function storedVersion(id:string){
  const entry=(await log.listAllLog()).find(e=>e.id===id);
  const record=entry?await local.getCase(caseIdOf(entry)):undefined;
  const value=record?.state.media.find(m=>!!m&&typeof m==="object"&&!Array.isArray(m)&&m.id===id);
  return {record, value:value as Record<string,Json>|undefined};
 }
 async function mediaFor(id:string):Promise<CaseLogMedia|null>{
  const saved=await log.readLogMedia(id);if(saved)return saved;
  const {record:c,value:m}=await storedVersion(id);
  if(m&&c){const media=await hydrate<CaseLogMedia>(m,aid=>sync.loadAsset(c.id,aid),scope);await restoreAnalysisSnapshot(media.originalImage,media.analysisSnapshot??media.photoMetadata?.analysisSnapshot);scope.assert();return media;}
  return log.readLogMedia(id);
 }
 async function snapshot(id:string,force=false,portalOverride?:Json|null){
  if(!isAccount)return;
  const old=await local.getCase(id);if(old?.deletedAt)return;
  const group=(await log.listAllLog()).filter(e=>caseIdOf(e)===id&&!e.testMode&&e.mode!=="mock");
  const entries=group.filter(e=>!e.draftOnly);
  const caseStatus={archivedAt:group.length&&group.every(e=>e.archivedAt)?Math.max(...group.map(e=>e.archivedAt!)):null,deletedAt:group.length&&group.every(e=>e.deletedAt)?Math.max(...group.map(e=>e.deletedAt!)):null};
  const media:CaseLogMedia[]=[];for(const e of entries){
   const m=await log.readLogMedia(e.id)??old?.state.media.find(m=>m&&typeof m==="object"&&!Array.isArray(m)&&m.id===e.id);
   if(m)media.push(m as unknown as CaseLogMedia);
  }
  const active=await drafts.readCase();const draft=active?.caseId===id&&!active.testMode?active:old?.state.draft as unknown as SmileCase|null??null;
  const portal=portalOverride!==undefined?portalOverride:(old?.state.portal??null);
  if(!entries.length&&!draft&&!portal)return;
  const preservedEntries=entries.map(e=>!e.thumb&&old?{...e,thumb:(old.state.entries.find(x=>x&&typeof x==="object"&&!Array.isArray(x)&&x.id===e.id) as Record<string,Json>|undefined)?.thumb as unknown as string??""}:e);
  let draftThumb=old?.state.draftThumb;
  if(!entries.length&&active?.caseId===id&&typeof document!=="undefined"){
    if(lastThumb?.src!==active.photo.dataUrl){const {thumbnail}=await import("@/lib/thumb");const thumb=await thumbnail(active.photo.dataUrl,240,0.65);scope.assert();lastThumb={src:active.photo.dataUrl,image:thumb};}
    draftThumb=lastThumb.image;
  }else if(!entries.length&&!draft&&portal&&typeof document!=="undefined"){
    // A case started from photos alone: its thumbnail comes from the first photo in the set.
    const photos=(portal as Record<string,Json>).photos as Record<string,Json>|undefined;
    const first=PHOTO_SLOTS.map(slot=>photos?.[slot.id]).find(v=>typeof v==="string"&&v.startsWith("data:")) as string|undefined;
    if(first){const {thumbnail}=await import("@/lib/thumb");draftThumb=await thumbnail(first,240,0.65);scope.assert();}
  }
  const encoded=await encodePatientState(scope,local,id,{entries:preservedEntries,media,draft,draftThumb,caseStatus,portal:portal??undefined,preferredDesignId:old?.state.preferredDesignId??draft?.preferredDesignId});
  if(!force&&old&&stableJson(old.state)===stableJson(encoded.state))return;
  await sync.enqueue(id,encoded.state,encoded.summary,encoded.assets);
  if(!entries.length&&(draft||portal)){const portalName=(portal as Record<string,Json>|null)?.name;await log.replaceCaseMetadata(id,[{id,caseId:id,patientName:draft?.patientName||(typeof portalName==="string"?portalName:""),createdAt:Date.parse(old?.createdAt??new Date().toISOString()),mode:"live",draftOnly:true,label:"Draft",summary:draft?"Unfinished design · no AI concept generated":"Photos added · not designed yet",archivedAt:caseStatus.archivedAt??undefined,deletedAt:caseStatus.deletedAt??undefined,thumb:draft?lastThumb?.image??"":await hydrate<string>(encoded.state.draftThumb??"",aid=>sync.loadAsset(id,aid),scope).catch(()=>"")}]);}
  else if((await log.listAllLog()).some(e=>caseIdOf(e)===id&&e.draftOnly)){for(const e of await log.listAllLog())if(caseIdOf(e)===id&&e.draftOnly)await log.deleteLogEntry(e.id);}
  // The binary cache now owns these bytes. Keep inexpensive metadata in the old UI log.
  await log.removeLogMedia(entries.map(e=>e.id));
 }
 function write<T>(run:()=>Promise<T>):Promise<T>{const p=writes.catch(()=>{}).then(()=>{scope.assert();return run();});writes=p.then(()=>{},()=>{});return p;}
 async function editEntry(id:string,action:()=>Promise<boolean>){return write(async()=>{
  const entry=(await log.listAllLog()).find(e=>e.id===id);const result=await action();if(result&&entry)await snapshot(caseIdOf(entry));change();return result;
 });}
 const methods={
  ...log,
  readLogMedia:mediaFor,
  readPresentationMedia:mediaFor,
  async mediaStatus(id:string){
   const [{record,value},saved,assets,operations]=await Promise.all([storedVersion(id),log.readLogMedia(id),local.assets(),local.outbox()]);
   return caseMediaStatus({record,assets,operations,required:value?[...referencedAssets(value)]:[],localAvailable:!!saved,online:typeof navigator==="undefined"||navigator.onLine!==false,transfers:sync.transfers()});
  },
  /** Thumbnails that failed to load when a case last changed (for example while offline) are fetched again; covers that now have one appear. */
  repairThumbs():Promise<void>{
   if(repairing)return repairing;
   repairing=(async()=>{
    const missing=async()=>(await log.listLog()).filter(e=>!e.thumb&&!e.deletedAt);
    const before=await missing(),broken=new Set(before.map(caseIdOf));
    for(const id of broken){const c=await local.getCase(id);if(!c||c.deletedAt)continue;await project(c).catch(()=>{});scope.assert();}
    if(broken.size&&(await missing()).length<before.length)change();
   })().catch(()=>{}).finally(()=>{repairing=null;});
   return repairing;
  },
  async retryMedia(id:string){const {record}=await storedVersion(id);if(record)await sync.retry(record.id);return mediaFor(id);},
  async caseSyncIndicators(){
   const [cases,operations]=await Promise.all([local.cases(),local.outbox()]);
   const active=sync.transfers().uploading;
   return Object.fromEntries(cases.filter(c=>!c.deletedAt).map(c=>{
    const ops=operations.filter(o=>o.caseId===c.id);
    const label=c.status==="conflict"?"Needs review":ops.some(o=>o.error)?"Sync failed":ops.length?(typeof navigator!=="undefined"&&navigator.onLine===false?"Offline · saved locally":ops.some(o=>active.includes(o.id))?"Uploading…":"Waiting to sync"):"";
    return [c.id,label];
   }));
  },
  async listCases(){return summariseCases(await log.listLog());},
  async getCase(id:string){const entries=(await log.listLog()).filter(e=>caseIdOf(e)===id&&!e.draftOnly),media=new Map<string,CaseLogMedia>();for(const e of entries){const m=await mediaFor(e.id);if(m)media.set(e.id,m);}return buildCase(id,entries,media);},
  async recordVisualisation(entry:CaseLogEntry,media:CaseLogMedia){if(!entry.testMode&&entry.mode!=="mock")return write(async()=>{await log.addLogEntry(entry,media);await snapshot(caseIdOf(entry));change();});},
  async addLogEntry(entry:CaseLogEntry,media:CaseLogMedia){return methods.recordVisualisation(entry,media);},
  async readCase(options?:{forLaunch?:boolean}){const draft=await drafts.readCase(options);if(draft){sync.pinCase(draft.caseId);await restoreAnalysisSnapshot(draft.photo.dataUrl,draft.photo.analysisSnapshot);}scope.assert();return draft;},
  async persistCase(value:SmileCase|null){if(value?.testMode)return;sync.pinCase(value?.caseId);return write(async()=>{await drafts.persistCase(value);if(value?.caseId)await snapshot(value.caseId);});},
  async updateLogReview(...args:Parameters<typeof log.updateLogReview>){return editEntry(args[0],async()=>{const media=await mediaFor(args[0]);const entry=(await log.listAllLog()).find(e=>e.id===args[0]);if(media&&entry)await log.addLogEntry(entry,media);return log.updateLogReview(...args);});},
  async setCaseArchived(...args:Parameters<typeof log.setCaseArchived>){return editEntry(args[0],()=>log.setCaseArchived(...args));},
  async moveToRecentlyDeleted(...args:Parameters<typeof log.moveToRecentlyDeleted>){return editEntry(args[0],()=>log.moveToRecentlyDeleted(...args));},
  async restoreCase(...args:Parameters<typeof log.restoreCase>){return editEntry(args[0],()=>log.restoreCase(...args));},
  async setFavourite(...args:Parameters<typeof log.setFavourite>){return editEntry(args[0],()=>log.setFavourite(...args));},
  async recordExport(...args:Parameters<typeof log.recordExport>){return editEntry(args[0],()=>log.recordExport(...args));},
  async renameCase(id:string,name:string){return write(async()=>{const count=await log.renameCase(id,name);await snapshot(id);change();return count;});},
  /** The case's consultation record and the patient's preferred version, for exports and the case view. */
  async caseRecord(id:string){const c=await local.getCase(id);const draft=c?.state.draft as {consultation?:unknown}|null|undefined;const {normaliseConsultation}=await import("@/lib/caseConsultation");return {consultation:normaliseConsultation(draft?.consultation),preferredDesignId:c?.state.preferredDesignId??null};},
  async setPreferredDesign(id:string,designId:string|null){return write(async()=>{await snapshot(id);const c=await local.getCase(id);if(!c)return;if(designId&&!c.state.entries.some(e=>e&&typeof e==="object"&&!Array.isArray(e)&&e.id===designId))throw new Error("Choose a version from this case.");await sync.enqueue(id,{...c.state,preferredDesignId:designId},c.summary);});},
  async deleteCase(id:string){return write(async()=>{
   await snapshot(id);const c=await local.getCase(id);if(c&&!c.deletedAt)await sync.enqueue(id,c.state,c.summary,[],true);
   await log.replaceCaseMetadata(id,[]);const d=await drafts.readCase();if(d?.caseId===id){await drafts.persistCase(null);workingChange(null);}change();
  });},
  async deleteLogEntry(id:string){return write(async()=>{
   const entry=(await log.listAllLog()).find(e=>e.id===id);await log.deleteLogEntry(id);if(!entry)return;
   const caseId=caseIdOf(entry),remaining=(await log.listAllLog()).filter(e=>caseIdOf(e)===caseId);
   if(remaining.length)await snapshot(caseId);else{const c=await local.getCase(caseId);if(c&&!c.deletedAt)await sync.enqueue(caseId,c.state,c.summary,[],true);const d=await drafts.readCase();if(d?.caseId===caseId){await drafts.persistCase(null);workingChange(null);}}change();
  });},
  async moveAllToRecentlyDeleted(now=Date.now()){for(const e of await log.listLog())await methods.moveToRecentlyDeleted(e.id,now);},
  async emptyRecentlyDeleted(){const entries=await log.listLog(["deleted"]);for(const e of entries)await methods.deleteLogEntry(e.id);return entries.length;},
  async purgeRecentlyDeleted(now=Date.now(),days=30){const entries=(await log.listLog(["deleted"])).filter(e=>e.deletedAt!+days*86400000<=now);for(const e of entries)await methods.deleteLogEntry(e.id);return entries.length;},
  async clearLog(){for(const id of new Set((await log.listAllLog()).map(caseIdOf)))await methods.deleteCase(id);},
  async reopenCase(id:string){const c=await local.getCase(id);if(!c||c.deletedAt)throw new Error("This case is no longer available.");if(!c.state.draft)throw new Error("This older case has no saved editable draft; its comparison and exports remain available.");
    const draft=await hydrate<SmileCase>(c.state.draft,aid=>sync.loadAsset(id,aid),scope);
    // Home is a valid last-viewed screen, but explicitly reopening a saved
    // case must show its work rather than restoring Home and closing Cases.
    if(draft.screen==="start")draft.screen=draft.result?"preview":"design";
    await restoreAnalysisSnapshot(draft.photo.dataUrl,draft.photo.analysisSnapshot);scope.assert();sync.pinCase(id);await drafts.persistCase(draft);return draft;},
  async syncStatuses(){return local.cases();},
  /** Web portal: reference, status and notes for every case (no photos). */
  async portalIndex(){const index:Record<string,{reference?:string;status?:string;name?:string;tags:string[];hasDraft:boolean;photoCount:number}>={};for(const c of await local.cases()){if(c.deletedAt)continue;const p=(c.state.portal??{}) as Record<string,Json>;const photos=p.photos&&typeof p.photos==="object"?Object.keys(p.photos):[];index[c.id]={reference:typeof p.reference==="string"?p.reference:undefined,status:typeof p.status==="string"?p.status:undefined,name:typeof p.name==="string"?p.name:undefined,tags:cleanTags(p.tags),hasDraft:Boolean(c.state.draft),photoCount:photos.length};}return index;},
  /**
   * Web portal and app: one case's details with small photo previews only (full photos load on request,
   * so opening a case downloads a few hundred KB, not the whole set). Older sets without previews fall back to the photo.
   */
  async portalDetails(id:string){const c=await local.getCase(id);if(!c||c.deletedAt)return null;
   const raw=(c.state.portal??{}) as Record<string,Json>;const photos=(raw.photos??{}) as Record<string,Json>,thumbRefs=(raw.thumbs??{}) as Record<string,Json>;
   const thumbs:Partial<Record<PhotoSlot,string>>={};
   for(const slot of Object.keys(photos)){if(!isPhotoSlot(slot))continue;const ref=thumbRefs[slot]??photos[slot];const url=await hydrate<string>(ref,aid=>sync.loadAsset(id,aid),scope).catch(()=>"");if(url)thumbs[slot]=url;}
   const portal:PortalDetails={name:typeof raw.name==="string"?raw.name:undefined,reference:typeof raw.reference==="string"?raw.reference:undefined,status:isCaseStatus(raw.status)?raw.status:undefined,notes:typeof raw.notes==="string"?raw.notes:undefined,tags:cleanTags(raw.tags),thumbs};
   if(raw.consent&&typeof raw.consent==="object"){const consent=await hydrate<CaseConsent>(raw.consent,aid=>sync.loadAsset(id,aid),scope).catch(()=>null);if(validConsent(consent))portal.consent=consent;}
   const draft=c.state.draft as Record<string,Json>|null;
   const designRef=(draft?.photo as Record<string,Json>|undefined)?.dataUrl;
   let designThumb=c.state.draftThumb?await hydrate<string>(c.state.draftThumb,aid=>sync.loadAsset(id,aid),scope).catch(()=>""):"";
   // Cases with designs keep no preview of their photo: make one in memory (the photo is usually already on this device).
   if(!designThumb&&designRef&&typeof document!=="undefined"){const full=await hydrate<string>(designRef,aid=>sync.loadAsset(id,aid),scope).catch(()=>"");if(full){const {thumbnail}=await import("@/lib/thumb");designThumb=await thumbnail(full,360,0.72).catch(()=>"");}}
   return {portal,designThumb,hasDesignPhoto:Boolean(designRef),hasDraft:Boolean(draft),createdAt:c.createdAt,updatedAt:c.updatedAt};},
  /** One full-size photo from the set, downloaded only now. */
  async portalPhoto(id:string,slot:PhotoSlot){const c=await local.getCase(id);const ref=((c?.state.portal as Record<string,Json>|undefined)?.photos as Record<string,Json>|undefined)?.[slot];return ref?hydrate<string>(ref,aid=>sync.loadAsset(id,aid),scope):null;},
  /** The full photo the design uses (the draft's photograph). */
  async portalDesignPhoto(id:string){const c=await local.getCase(id);const photo=(c?.state.draft as Record<string,Json>|null|undefined)?.photo as Record<string,Json>|undefined;return photo?.dataUrl?hydrate<string>(photo.dataUrl,aid=>sync.loadAsset(id,aid),scope):null;},
  /** Web portal and app: change a case's details or photo set (creates the case if it only has photos). New photos get a small preview. */
  async updatePortal(id:string,patch:PortalPatch){
   const thumbs:Partial<Record<PhotoSlot,string|null>>={...(patch.thumbs??{})};
   if(patch.photos&&typeof document!=="undefined"){const {thumbnail}=await import("@/lib/thumb");for(const [slot,value] of Object.entries(patch.photos))if(isPhotoSlot(slot)&&typeof value==="string"&&value.startsWith("data:image/")&&!thumbs[slot])thumbs[slot]=await thumbnail(value,360,0.72);}
   return write(async()=>{const c=await local.getCase(id);await snapshot(id,true,mergePortal(c?.state.portal as Record<string,unknown>|undefined,{...patch,thumbs}) as Json);change();});},
  async syncConflicts(){return sync.conflicts();},
  async resolveConflict(id:string,choice:"cloud"|"preserve-local"){return write(async()=>{
    if(!(await local.getCase(id))?.conflict)return;
    const current=await drafts.readCase();const chosen:{draft:SmileCase|null}={draft:null};
    await sync.resolve(id,choice,current?.caseId===id?async c=>{chosen.draft=c.state.draft?await hydrate<SmileCase>(c.state.draft,aid=>sync.loadAsset(c.id,aid),scope):null;}:undefined);
    if(current?.caseId===id){await drafts.persistCase(chosen.draft);sync.pinCase(chosen.draft?.caseId);workingChange(chosen.draft);}
  });},
  async importOwnedCase(id:string){return write(()=>snapshot(id));},
  /** Repair an interrupted local-save/outbox handoff; only already owned account data is inspected. */
  async resume(){if(!isAccount)return;await write(async()=>{for(const id of new Set((await log.listAllLog()).filter(e=>!e.testMode&&e.mode!=="mock").map(caseIdOf)))await snapshot(id);const d=await drafts.readCase();if(d?.caseId&&!d.testMode)await snapshot(d.caseId);});await sync.run();},
 };
 return {scope,...guardStore(scope,methods),subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
  subscribeWorkingCase(fn:(draft:SmileCase|null)=>void){workingListeners.add(fn);return()=>{workingListeners.delete(fn);};},
  connect(client:PatientApi){sync.connect(client);},disconnect:()=>sync.disconnect(),refreshSync:()=>sync.run(),cache:local,
 };
}
export type CaseRepository=ReturnType<typeof createCaseRepository>;
let cached:CaseRepository|null=null;
export function getCaseRepository():CaseRepository{const scope=captureWorkspace();if(!cached||cached.scope.epoch!==scope.epoch||cached.scope.key!==scope.key)cached=createCaseRepository(scope);return cached;}
