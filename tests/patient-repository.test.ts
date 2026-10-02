import "fake-indexeddb/auto";
import { before,after,test } from "node:test";
import assert from "node:assert/strict";
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
let server:Awaited<ReturnType<typeof backend>>;const repositories:CaseRepository[]=[];
before(async()=>{server=await backend();});after(async()=>{repositories.forEach(r=>r.disconnect());await server.db.close();});
const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const uuid=()=>crypto.randomUUID();
function repo(factory=new IDBFactory()){globalThis.indexedDB=factory;const scope=lease();const r=createCaseRepository(scope);repositories.push(r);r.connect(createPatientApi(scope,async()=>A,server.request));return r;}
function fixture(id=uuid()){
 const version=uuid();const entry:CaseLogEntry={id:version,caseId:id,patientName:"AB",createdAt:Date.now(),mode:"live",summary:"Single-shade",thumb:png};
 const media:CaseLogMedia={id:version,image:png,originalImage:png,preferences:{settings:defaultSettings}};
 const draft:SmileCase={caseId:id,patientName:"AB",photo:{dataUrl:png,name:"x",width:1,height:1},settings:defaultSettings,variants:[],result:{image:png,variationId:version,mode:"live"},screen:"preview"};return {id,version,entry,media,draft};
}
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
