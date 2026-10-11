import "fake-indexeddb/auto";
import { before,after,test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { IDBFactory } from "fake-indexeddb";
import { backend,lease,A } from "./fixtures/patient-sync";
import { createCaseRepository,type CaseRepository } from "../src/services/cases/caseRepository";
import { createPatientApi } from "../src/services/cases/sync/patientApi";
import { activateWorkspace,legacyWorkspace } from "../src/lib/workspace";
import { createCaseLogStore } from "../src/lib/caseLog";
import { importLegacyCases,listLegacyCases } from "../src/services/cases/legacyImport";
import { defaultSettings,type CaseLogEntry,type CaseLogMedia,type SmileCase } from "../src/lib/types";
import { makeAnalysisSnapshot } from "../src/services/cases/sync/analysisSnapshot";
import { photoFingerprint } from "../src/lib/toothMap/types";
import { PatientSyncError } from "../src/services/cases/sync/types";
let server:Awaited<ReturnType<typeof backend>>;const repositories:CaseRepository[]=[];
before(async()=>{server=await backend();});after(async()=>{repositories.forEach(r=>r.disconnect());await server.db.close();});
const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQYlWM4u2Xaf3yYYWQoAADN88WBHfFyHQAAAABJRU5ErkJggg==";
const uuid=()=>crypto.randomUUID();
test("a recovered full-size demo photograph decodes after second-device download and restart", async()=>{
 const bytes=await readFile("public/sample-smile.jpg");
 const dataUrl=`data:image/jpeg;base64,${bytes.toString("base64")}`;
 const expected=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
 const a=repo(),f=fixture();
 f.media.image=dataUrl;f.media.originalImage=dataUrl;
 await a.recordVisualisation(f.entry,f.media);await a.refreshSync();a.disconnect();
 const factory=new IDBFactory(),b=repo(factory);await b.refreshSync();
 assert.equal((await b.mediaStatus(f.version)).available,false);
 const recovered=await b.readPresentationMedia(f.version);b.disconnect();
 const c=repo(factory);c.disconnect(); // offline restart uses the durable binary cache
 for(const media of [recovered,await c.readPresentationMedia(f.version)]) {
  assert.ok(media);
  for(const image of [media.image,media.originalImage]) {
   const decoded=await sharp(Buffer.from(image.split(",")[1],"base64")).raw().toBuffer({resolveWithObject:true});
   assert.deepEqual(decoded.info,expected.info);
   assert.deepEqual(decoded.data,expected.data);
  }
 }
 assert.equal((await c.mediaStatus(f.version)).available,true);
});
function repo(factory=new IDBFactory()){globalThis.indexedDB=factory;const scope=lease();const r=createCaseRepository(scope);repositories.push(r);r.connect(createPatientApi(scope,async()=>A,server.request));return r;}
function fixture(id=uuid()){
 const version=uuid();const entry:CaseLogEntry={id:version,caseId:id,patientName:"AB",createdAt:Date.now(),mode:"live",summary:"Single-shade",thumb:png};
 const media:CaseLogMedia={id:version,image:png,originalImage:png,preferences:{settings:defaultSettings}};
 const draft:SmileCase={caseId:id,patientName:"AB",photo:{dataUrl:png,name:"x",width:1,height:1},settings:defaultSettings,variants:[],result:{image:png,variationId:version,mode:"live"},screen:"preview"};return {id,version,entry,media,draft};
}
test("launch opens Home but explicit case reopen restores the accepted comparison",async()=>{
 const r=repo(),f=fixture();r.disconnect();await r.persistCase(f.draft);
 const home=await r.readCase({forLaunch:true});
 assert.equal(home?.screen,"start");assert.deepEqual(home?.photo,f.draft.photo);assert.deepEqual(home?.result,f.draft.result);
 const opened=await r.reopenCase(f.id);assert.equal(opened.screen,"preview");assert.deepEqual(opened.result,f.draft.result);
});
test("pending upload never prevents comparison/export locally, including offline",async()=>{
 const r=repo(),f=fixture();r.disconnect();await r.recordVisualisation(f.entry,f.media);
 assert.equal((await r.mediaStatus(f.version)).state,"PENDING_UPLOAD");
 assert.equal((await r.mediaStatus(f.version)).available,true);
 Object.defineProperty(navigator,"onLine",{value:false,configurable:true});
 try {assert.equal((await r.mediaStatus(f.version)).state,"OFFLINE");assert.deepEqual(await r.readPresentationMedia(f.version),f.media);}
 finally {Object.defineProperty(navigator,"onLine",{value:true,configurable:true});}
 r.connect(createPatientApi(r.scope,async()=>A,server.request));await r.refreshSync();
 assert.equal((await r.mediaStatus(f.version)).state,"SYNCED");r.disconnect();
});
test("cloud-only version downloads on demand, reports progress and reopens without duplicate cases",async()=>{
 const a=repo(),f=fixture();await a.recordVisualisation(f.entry,f.media);await a.refreshSync();a.disconnect();
 const b=repo();await b.refreshSync();assert.equal((await b.mediaStatus(f.version)).state,"CLOUD_ONLY");
 const api=createPatientApi(b.scope,async()=>A,server.request);
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),begin=new Promise<void>(r=>started=r);
 b.connect({...api,download:async(c,id)=>{started();await gate;return api.download(c,id);}});
 const first=b.readPresentationMedia(f.version),second=b.readPresentationMedia(f.version);await begin;
 const during=await b.mediaStatus(f.version);assert.equal(during.state,"DOWNLOADING");assert.equal(during.available,false);assert.equal(during.total,2);
 release();assert.deepEqual(await first,f.media);assert.deepEqual(await second,f.media);
 assert.equal((await b.mediaStatus(f.version)).state,"SYNCED");
 assert.equal((await b.listLog()).filter(e=>e.caseId===f.id).length,1);b.disconnect();
});
test("download failure exposes retry and recovers on the next sync cycle",async()=>{
 const a=repo(),f=fixture();await a.recordVisualisation(f.entry,f.media);await a.refreshSync();a.disconnect();
 const b=repo();await b.refreshSync();const api=createPatientApi(b.scope,async()=>A,server.request);
 b.connect({...api,download:async()=>{throw new PatientSyncError(503,"media_unavailable");}});
 await assert.rejects(b.readPresentationMedia(f.version));const failed=await b.mediaStatus(f.version);
 assert.equal(failed.state,"SYNC_FAILED");assert.equal(failed.retry,true);assert.equal(failed.available,false);
 b.connect(api);await b.refreshSync();assert.deepEqual(await b.readPresentationMedia(f.version),f.media);
 assert.equal((await b.mediaStatus(f.version)).available,true);b.disconnect();
});
test("genuinely missing cloud image differs from a temporary download failure",async()=>{
 const a=repo(),f=fixture();await a.recordVisualisation(f.entry,f.media);await a.refreshSync();a.disconnect();
 const asset=(await a.cache.assets()).find(x=>x.meta.caseId===f.id&&x.meta.kind==="GENERATED_CONCEPT")!;server.media.delete(asset.meta.objectPath);
 const b=repo();await b.refreshSync();await assert.rejects(b.readPresentationMedia(f.version),(e:unknown)=>e instanceof PatientSyncError&&e.status===404);
 const missing=await b.mediaStatus(f.version);assert.equal(missing.state,"MISSING");assert.equal(missing.retry,false);assert.equal(missing.available,false);b.disconnect();
});
test("comparison does not download optional editable masks or discard draft metadata",async()=>{
 const a=repo(),f=fixture();f.draft.photo.editMask=png;
 await a.persistCase(f.draft);await a.recordVisualisation(f.entry,f.media);await a.refreshSync();a.disconnect();
 const raw=(await a.cache.assets()).find(x=>x.meta.caseId===f.id&&x.meta.kind==="EDIT_MASK")!;server.media.delete(raw.meta.objectPath);
 const b=repo();await b.refreshSync();const presentation=await b.readPresentationMedia(f.version);
 assert.equal(presentation?.image,png);assert.equal(presentation?.originalImage,png);
 assert.equal((await b.mediaStatus(f.version)).available,true);
 assert.ok(JSON.stringify((await b.cache.getCase(f.id))?.state.draft).includes(raw.id));b.disconnect();
});
test("failed upload remains usable and manual retry preserves immutable case/asset IDs",async()=>{
 const r=repo(),f=fixture(),api=createPatientApi(r.scope,async()=>A,server.request);
 r.connect({...api,upload:async()=>{throw new PatientSyncError(503,"upload_unavailable");}});
 await r.recordVisualisation(f.entry,f.media);await r.refreshSync();const failed=await r.mediaStatus(f.version);
 assert.equal(failed.state,"SYNC_FAILED");assert.equal(failed.available,true);assert.equal(failed.retry,true);assert.deepEqual(await r.readPresentationMedia(f.version),f.media);
 const ids=(await r.cache.assets()).filter(a=>a.meta.caseId===f.id).map(a=>a.id).sort();
 r.connect(api);await r.retryMedia(f.version);assert.equal((await r.mediaStatus(f.version)).state,"SYNCED");
 assert.deepEqual((await r.cache.assets()).filter(a=>a.meta.caseId===f.id).map(a=>a.id).sort(),ids);r.disconnect();
});
test("force-close during upload keeps durable work and resumes once without duplicates",async()=>{
 const factory=new IDBFactory(),a=repo(factory),f=fixture(),api=createPatientApi(a.scope,async()=>A,server.request);
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),begin=new Promise<void>(r=>started=r);
 a.connect({...api,upload:async()=>{started();await gate;throw new PatientSyncError(503,"interrupted");}});
 await a.recordVisualisation(f.entry,f.media);const syncing=a.refreshSync();await begin;
 assert.equal((await a.mediaStatus(f.version)).state,"UPLOADING");
 (a.scope as ReturnType<typeof lease>).abort();a.disconnect();release();await syncing;
 const b=repo(factory);await b.resume();assert.equal((await b.mediaStatus(f.version)).state,"SYNCED");
 assert.deepEqual(await b.readPresentationMedia(f.version),f.media);
 assert.equal((await b.listLog()).filter(e=>e.caseId===f.id).length,1);b.disconnect();
});
test("repository records locally, queues privately and restores saved comparison/export media on a second origin",async()=>{
 const a=repo(),f=fixture();await a.persistCase(f.draft);await a.recordVisualisation(f.entry,f.media);assert.equal((await a.listCases())[0].id,f.id);assert.ok((await a.cache.outbox()).length);await a.refreshSync();const b=repo();await b.refreshSync();const entries=await b.listActiveLog();assert.ok(entries.some(e=>e.id===f.version));assert.deepEqual(await b.readLogMedia(f.version),f.media);assert.deepEqual(await b.reopenCase(f.id),f.draft);a.disconnect();b.disconnect();
});
test("repository cloud refresh downloads thumbnails only until a version is opened",async()=>{
 const a=repo(),f=fixture();await a.recordVisualisation(f.entry,f.media);await a.refreshSync();const b=repo();await b.refreshSync();const cached=(await b.cache.assets()).filter(a=>a.meta.caseId===f.id&&a.blob);assert.deepEqual(cached.map(a=>a.meta.kind),["THUMBNAIL"]);await b.readLogMedia(f.version);assert.ok((await b.cache.assets()).some(a=>a.meta.caseId===f.id&&a.meta.kind==="GENERATED_CONCEPT"&&a.blob));a.disconnect();b.disconnect();
});
test("review, name, report history and preferred smile edits survive a third device",async()=>{
 const a=repo(),f=fixture();await a.recordVisualisation(f.entry,f.media);await a.refreshSync();await a.updateLogReview(f.version,{reviewer:"Dr Vik",reviewedAt:123,notes:"Preserve lip opening"});await a.renameCase(f.id,"CD");await a.recordExport(f.version,{kind:"preview",createdAt:555});await a.setPreferredDesign(f.id,f.version);await a.refreshSync();const b=repo();await b.refreshSync();const entry=(await b.listLog()).find(e=>e.id===f.version);assert.equal(entry?.patientName,"CD");assert.equal(entry?.exports?.[0].createdAt,555);assert.equal((await b.readLogMedia(f.version))?.review?.notes,"Preserve lip opening");assert.equal((await b.cache.getCase(f.id))?.state.preferredDesignId,f.version);a.disconnect();b.disconnect();
});
test("a saved photo-only draft is listed and can reopen on another origin",async()=>{const a=repo(),f=fixture();f.draft.result=null;f.draft.screen="design";await a.persistCase(f.draft);await a.refreshSync();const b=repo();await b.refreshSync();const entry=(await b.listLog()).find(e=>e.caseId===f.id);assert.equal(entry?.draftOnly,true);assert.equal((await b.reopenCase(f.id)).photo.dataUrl,png);a.disconnect();b.disconnect();});

for(const hasResult of [false,true])test(`explicit reopening leaves Home for ${hasResult?"the saved concept":"an unfinished design"}`,async()=>{
 const a=repo(),f=fixture();f.draft.screen="start";if(!hasResult)f.draft.result=null;
 try{
  await a.persistCase(f.draft);await a.refreshSync();
  // A second repository loads the same saved state and real media bytes.
  const b=repo();try{
   await b.refreshSync();const reopened=await b.reopenCase(f.id);
   assert.equal(reopened.screen,hasResult?"preview":"design");
   assert.equal(reopened.photo.dataUrl,f.draft.photo.dataUrl);
   assert.deepEqual(reopened.settings,f.draft.settings);
   assert.deepEqual(reopened.result,f.draft.result);
   assert.equal((await b.readCase())?.screen,reopened.screen);
   // Reopening normalizes navigation, not the stored cloud case or its media.
   const stored=await b.cache.getCase(f.id);
   assert.equal((stored?.state.draft as Record<string,unknown>).screen,"start");
  }finally{b.disconnect();}
 }finally{a.disconnect();}
});
test("using the cloud conflict version replaces the active draft before its next autosave",async()=>{
 const a=repo(),f=fixture();await a.persistCase(f.draft);await a.recordVisualisation(f.entry,f.media);await a.refreshSync();
 const b=repo();await b.refreshSync();await b.reopenCase(f.id);
 await a.persistCase({...f.draft,settings:{...defaultSettings,notes:"Cloud clinician decision"}});await a.refreshSync();
 await b.persistCase({...f.draft,settings:{...defaultSettings,notes:"Local losing decision"}});await b.refreshSync();assert.equal((await b.cache.getCase(f.id))?.status,"conflict");
 let notified:SmileCase|null|undefined;const off=b.subscribeWorkingCase(c=>{notified=c;});await b.resolveConflict(f.id,"cloud");
 const current=await b.readCase();assert.equal(current?.settings.notes,"Cloud clinician decision");assert.equal(notified?.settings.notes,"Cloud clinician decision");
 await b.persistCase(current);await b.refreshSync();assert.equal((await b.cache.getCase(f.id))?.status,"synced");off();a.disconnect();b.disconnect();
});
test("preserving a conflicting active draft switches the editor to the separate case",async()=>{
 const a=repo(),f=fixture();await a.persistCase(f.draft);await a.recordVisualisation(f.entry,f.media);await a.refreshSync();const b=repo();await b.refreshSync();await b.reopenCase(f.id);
 await a.persistCase({...f.draft,patientName:"Cloud"});await a.refreshSync();await b.persistCase({...f.draft,patientName:"Local separate"});await b.refreshSync();
 await b.resolveConflict(f.id,"preserve-local");const current=await b.readCase();assert.notEqual(current?.caseId,f.id);assert.equal(current?.patientName,"Local separate");await b.refreshSync();assert.equal((await b.cache.getCase(current!.caseId!))?.status,"synced");a.disconnect();b.disconnect();
});
test("a remote tombstone clears the active cached draft and notifies the editor",async()=>{
 const a=repo(),f=fixture();await a.persistCase(f.draft);await a.recordVisualisation(f.entry,f.media);await a.refreshSync();const b=repo();await b.refreshSync();await b.reopenCase(f.id);
 let cleared=false;const off=b.subscribeWorkingCase(c=>{cleared=c===null;});await a.deleteCase(f.id);await a.refreshSync();await b.refreshSync();assert.equal(await b.readCase(),null);assert.equal(cleared,true);off();a.disconnect();b.disconnect();
});
test("a valid confirmed map and saved analysis seed reopening without face-model inference",async()=>{
 const a=repo(),f=fixture();const points:Array<[number,number]>=Array.from({length:478},()=>[0.5,0.5]);
 f.draft.photo.analysisSnapshot=makeAnalysisSnapshot(png,1,1,points);
 f.draft.photo.toothMap={photoId:photoFingerprint(png),arch:"upper",version:1,method:"manual",confirmedByClinician:true,teeth:[{id:"tooth-11",fdi:11,detectedIndex:0,confidence:null,bbox:{x:0.4,y:0.4,width:0.1,height:0.1},centroid:{x:0.45,y:0.45},outline:[[0.4,0.4],[0.5,0.4],[0.45,0.5]],exactMaskRef:"mask-11",visible:true,selected:true,requiresReview:false,source:"manual"}]};
 await a.persistCase(f.draft);await a.recordVisualisation(f.entry,f.media);await a.refreshSync();const b=repo();await b.refreshSync();const restored=await b.reopenCase(f.id);
 assert.deepEqual(restored.photo.toothMap,f.draft.photo.toothMap);assert.deepEqual(restored.photo.analysisSnapshot,f.draft.photo.analysisSnapshot);
 const {detectFace}=await import("../src/lib/face/landmarks");assert.deepEqual(await detectFace(png),points);a.disconnect();b.disconnect();
});
test("deleting the last version queues a cloud tombstone and removes the other origin's cached list",async()=>{const a=repo(),f=fixture();await a.recordVisualisation(f.entry,f.media);await a.refreshSync();const b=repo();await b.refreshSync();await a.deleteLogEntry(f.version);await a.refreshSync();await b.refreshSync();assert.equal((await b.listLog()).some(e=>e.caseId===f.id),false);assert.equal((await b.cache.getCase(f.id))?.status,"deleted");assert.equal((await b.cache.assets()).some(a=>a.meta.caseId===f.id),false);a.disconnect();b.disconnect();});
test("explicit legacy migration is resumable, excludes demo content and verifies cloud bytes",async()=>{
 globalThis.indexedDB=new IDBFactory();activateWorkspace({kind:"unowned"});const legacy=createCaseLogStore(legacyWorkspace()),f=fixture(),demo=fixture();await legacy.addLogEntry(f.entry,f.media);await legacy.addLogEntry({...demo.entry,testMode:true,mode:"mock"},demo.media);
 const scope=activateWorkspace({kind:"account",userId:A});const choices=await listLegacyCases(scope);const chosen=choices.find(c=>c.caseId===f.id)!;assert.ok(choices.find(c=>c.caseId===demo.id)?.sample);await importLegacyCases([chosen.key],scope);await importLegacyCases([chosen.key],scope);
 const {getCaseRepository}=await import("../src/services/cases/caseRepository");const r=getCaseRepository();repositories.push(r);r.connect(createPatientApi(scope,async()=>A,server.request));await r.refreshSync();const cloud=await r.cache.getCase(f.id);assert.equal(cloud?.status,"synced");assert.equal((await r.listLog()).filter(e=>e.id===f.version).length,1);assert.equal((await r.cache.getCase(demo.id)),undefined);assert.ok((await createCaseLogStore(legacyWorkspace()).readLogMedia(f.version)));r.disconnect();
});

test("expired session requests sign-in recovery without declaring cloud images missing",async()=>{
 const a=repo(),f=fixture();await a.recordVisualisation(f.entry,f.media);await a.refreshSync();a.disconnect();
 const b=repo();await b.refreshSync();const api=createPatientApi(b.scope,async()=>A,server.request);
 b.connect({...api,download:async()=>{throw new PatientSyncError(401,"auth_required");}});
 await assert.rejects(b.readPresentationMedia(f.version));
 const status=await b.mediaStatus(f.version);
 assert.equal(status.label,"Sign in to download images");assert.equal(status.needsSignIn,true);assert.equal(status.available,false);assert.equal(status.retry,false);
 b.connect(api);await b.refreshSync();assert.deepEqual(await b.readPresentationMedia(f.version),f.media);b.disconnect();
});

// V1 hides new single-tooth generation without rewriting previous consultations.
test("legacy single-tooth case survives sync and reopen with its original result and settings", async()=>{
 const {generationUnavailable}=await import("../src/lib/generation/availability");
 const a=repo(),f=fixture();
 const settings={...defaultSettings,selectedTeeth:[11],toothPlans:[{tooth:11,condition:"Natural" as const,intent:"Reshape" as const,length:1 as const}]};
 f.draft.settings=settings;f.media.preferences={settings};
 await a.persistCase(f.draft);await a.recordVisualisation(f.entry,f.media);await a.refreshSync();a.disconnect();
 const b=repo();await b.resume();const reopened=await b.reopenCase(f.id);
 assert.deepEqual(reopened.settings,settings);assert.equal(reopened.result?.image,png);
 assert.deepEqual(await b.readPresentationMedia(f.version),f.media);
 assert.equal(generationUnavailable(reopened.settings),"Single-tooth design is not available in this version.");
 b.disconnect();
});
test("patient goals saved before any generation survive sync, a relaunch and reopening on another device",async()=>{
 const factory=new IDBFactory(),a=repo(factory),f=fixture();
 f.draft.result=null;f.draft.screen="design";
 f.draft.consultation={schemaVersion:1,patientGoals:["Colour","Gaps"],patientWords:"A little brighter, but still me.",updatedAt:1};
 await a.persistCase(f.draft);await a.refreshSync();a.disconnect();
 const relaunched=repo(factory);relaunched.disconnect();
 assert.deepEqual((await relaunched.readCase())?.consultation,f.draft.consultation,"a failed or absent generation never discards the goals");
 const b=repo();await b.refreshSync();
 assert.deepEqual((await b.reopenCase(f.id)).consultation,f.draft.consultation);
 b.disconnect();
});
test("a case saved before consultation data existed reopens unchanged, with no goals invented",async()=>{
 const a=repo(),f=fixture();f.draft.result=null;f.draft.screen="design";
 await a.persistCase(f.draft);await a.refreshSync();
 const b=repo();await b.refreshSync();const reopened=await b.reopenCase(f.id);
 assert.equal(reopened.consultation,undefined);assert.deepEqual(reopened.settings,defaultSettings);
 a.disconnect();b.disconnect();
});

test("web portal: a case can start from photos alone, then its details and clinical photos sync",async()=>{
 const a=repo(),id=uuid();
 await a.updatePortal(id,{name:"Sophie R.",reference:"SR-1024",status:"progress",photos:{front:png,left:png}});
 await a.refreshSync();
 const index=await a.portalIndex();
 assert.equal(index[id]?.reference,"SR-1024");assert.equal(index[id]?.status,"progress");assert.equal(index[id]?.photoCount,2);
 const listed=(await a.listCases()).find(c=>c.id===id);
 assert.equal(listed?.patientName,"Sophie R.");
 const cloud=await server.store.get(A,id);
 assert.ok(cloud?.assets.some(x=>x.kind==="CLINICAL_PHOTO"&&x.provenance==="clinical"));
 await a.updatePortal(id,{status:"lab",photos:{left:null}});await a.refreshSync();
 const factory=new IDBFactory(),b=repo(factory);await b.refreshSync();
 const details=await b.portalDetails(id);
 assert.equal(details?.portal.status,"lab");assert.equal(details?.portal.reference,"SR-1024");
 assert.deepEqual(Object.keys(details?.portal.thumbs??{}),["front"]);
 // Full photos come only on request.
 assert.match((await b.portalPhoto(id,"front"))!,/^data:image\/png;base64,/);
 assert.equal(await b.portalPhoto(id,"left"),null);
});
test("web portal details survive later design saves",async()=>{
 const r=repo(),f=fixture();
 await r.updatePortal(f.id,{reference:"AB-1",notes:"Natural, not too white"});
 await r.recordVisualisation(f.entry,f.media);
 assert.equal((await r.portalIndex())[f.id]?.reference,"AB-1");
 assert.equal((await r.portalDetails(f.id))?.portal.notes,"Natural, not too white");
});

test("web portal: swapping slots moves the stored photos, and removing one drops its preview",async()=>{
 const r=repo(),id=uuid();
 await r.updatePortal(id,{reference:"SW-1",photos:{front:png,left:png},thumbs:{front:png,left:png}});
 await r.updatePortal(id,{swap:["left","upper"]});
 const after=await r.portalDetails(id);
 assert.deepEqual(Object.keys(after?.portal.thumbs??{}).sort(),["front","upper"]);
 await r.updatePortal(id,{photos:{upper:null}});
 assert.deepEqual(Object.keys((await r.portalDetails(id))?.portal.thumbs??{}),["front"]);
});

test("web portal: a signed consent syncs with the case, its signature stored as a private asset",async()=>{
 const {CONSENT_ITEMS,CONSENT_VERSION}=await import("../src/lib/portal");
 const a=repo(),id=uuid();
 const agreed=Object.fromEntries(CONSENT_ITEMS.map(i=>[i.id,i.required])) as never;
 await a.updatePortal(id,{reference:"CO-1",consent:{version:CONSENT_VERSION,signedAt:Date.parse("2026-10-08T10:00:00Z"),patientName:"Sophie R.",agreed,signature:png}});
 await a.refreshSync();
 const cloud=await server.store.get(A,id);
 assert.ok(cloud?.assets.some(x=>x.kind==="CLINICAL_PHOTO"));
 assert.ok(!JSON.stringify(cloud?.state??{}).includes("data:image"),"no image data inside the case record");
 const b=repo(new IDBFactory());await b.refreshSync();
 const consent=(await b.portalDetails(id))?.portal.consent;
 assert.equal(consent?.patientName,"Sophie R.");assert.equal(consent?.agreed.lab,false);assert.match(consent?.signature??"",/^data:image\/png;base64,/);
 await b.updatePortal(id,{consent:null});
 assert.equal((await b.portalDetails(id))?.portal.consent,undefined);
 a.disconnect();b.disconnect();
});

test("launching again (resume) does not create a new cloud revision for cases that haven't changed",async()=>{
 const a=repo(),f=fixture();
 await a.persistCase(f.draft);await a.recordVisualisation(f.entry,f.media);await a.refreshSync();
 const before=(await server.store.get(A,f.id))?.revision;assert.ok(before);
 for(let i=0;i<3;i++){await a.resume();await a.refreshSync();}
 assert.equal((await server.store.get(A,f.id))?.revision,before,"revision unchanged by launches");
 assert.equal((await a.cache.outbox()).length,0,"nothing left waiting to upload");
 // A real change still saves.
 await a.renameCase(f.id,"AB-1");await a.refreshSync();
 assert.ok(((await server.store.get(A,f.id))?.revision??0)>before);
 a.disconnect();
});

test("saved case content compares equal whatever order its keys are in",async()=>{
 const {stableJson}=await import("../src/services/cases/sync/types");
 assert.equal(stableJson({a:1,b:{c:[{y:1,x:2}],d:null}}),stableJson({b:{d:null,c:[{x:2,y:1}]},a:1}));
 assert.notEqual(stableJson({a:1,b:2}),stableJson({a:1,b:3}));
 assert.notEqual(stableJson({a:[1,2]}),stableJson({a:[2,1]}),"array order still matters");
});
