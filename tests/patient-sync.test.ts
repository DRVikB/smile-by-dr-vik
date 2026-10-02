import { before,after,test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { backend,device,lease,A,B } from "./fixtures/patient-sync";
import { EMPTY_STATE,EMPTY_SUMMARY,PatientSyncError,type CaseMutation,type PatientAsset,type PatientState } from "../src/services/cases/sync/types";
import { encodePatientState,hydrate,dataUrlBlob,blobDataUrl } from "../src/services/cases/sync/media";
import { defaultSettings,type SmileCase } from "../src/lib/types";
import { validStructured } from "../src/server/patientCaseHandlers";
import { createPatientLocalStore } from "../src/services/cases/sync/localStore";
let server:Awaited<ReturnType<typeof backend>>;
before(async()=>{server=await backend();});after(async()=>{await server.db.close();});
const uuid=()=>crypto.randomUUID();
const create=(id=uuid()):CaseMutation=>({id,operationId:uuid(),type:"CREATE_CASE",expectedRevision:0,state:EMPTY_STATE(),summary:EMPTY_SUMMARY()});
const update=(m:CaseMutation,revision:number):CaseMutation=>({...m,operationId:uuid(),type:"UPDATE_CASE",expectedRevision:revision});
const image="data:image/jpeg;base64,AQIDBAUGBwgJ";
function state(tag="Phone"):PatientState{return {...EMPTY_STATE(),draft:{caseId:"stable",patientName:tag,settings:{...defaultSettings,selectedTeeth:[11,21],notes:"Keep the original lip opening"},photo:{name:"capture.jpg",width:100,height:150,toothMap:{version:1,method:"manual",photoId:"p",arch:"upper",confirmedByClinician:true,teeth:[{id:"tooth-11",fdi:11,outline:[[0.4,0.5],[0.5,0.5],[0.5,0.6]]}]},analysisSnapshot:{algorithmVersion:"v1",landmarks:[[4,5]],analysis:{cantDeg:1}}},result:{variationId:"stable-generation",generation:{model:"gemini",promptVersion:"v1"},review:{reviewer:"Dr Vik",notes:"Reviewed"}}},preferredDesignId:"stable-generation",entries:[{id:"stable-generation",caseId:"stable",exports:[{kind:"report",draft:{notes:"Discuss options"},at:123}]}],media:[{id:"stable-generation",preferences:{settings:defaultSettings}}]} as unknown as PatientState;}
async function roundTrip(){const from=device(server),to=device(server),id=uuid();const s=state();await from.sync.enqueue(id,s,EMPTY_SUMMARY());await from.sync.run();await to.sync.run();const got=await to.store.getCase(id);from.stop();to.stop();return {got,s,id};}

test("local case sync keeps its stable UUID on a second device",async()=>{const {got,id}=await roundTrip();assert.equal(got?.id,id);assert.equal(got?.revision,2);});
for(const direction of ["iPhone → iPad","iPhone → web","iPad → web","iPad → iPhone","web → iPhone","web → iPad"]){test(`simulated ${direction}: complete state round trip`,async()=>{const {got,s}=await roundTrip();assert.deepEqual(got?.state,s);});}
for(const [name,read] of [
 ["selected teeth",(s:PatientState)=>((s.draft as Record<string,unknown>).settings as Record<string,unknown>).selectedTeeth],
 ["confirmed Tooth Map",(s:PatientState)=>((s.draft as Record<string,unknown>).photo as Record<string,unknown>).toothMap],
 ["analysis + algorithm metadata",(s:PatientState)=>((s.draft as Record<string,unknown>).photo as Record<string,unknown>).analysisSnapshot],
 ["preferred concept",(s:PatientState)=>s.preferredDesignId],
 ["report draft + export history",(s:PatientState)=>(s.entries[0] as Record<string,unknown>).exports],
 ["clinician reviews + generation IDs",(s:PatientState)=>(s.draft as Record<string,unknown>).result],
] as const){test(`${name} survives sync`,async()=>{const {got,s}=await roundTrip();assert.deepEqual(read(got!.state),read(s));});}

test("generated concepts round-trip as binary assets, not JSON base64",async()=>{
 const a=device(server),b=device(server),id=uuid();const d={caseId:id,photo:{dataUrl:image,name:"patient.jpg",width:10,height:10},settings:defaultSettings,result:{image,variationId:uuid(),mode:"live"},screen:"preview"} as SmileCase;
 const encoded=await encodePatientState(a.scope,a.store,id,{entries:[],media:[],draft:d});assert.equal(JSON.stringify(encoded.state).includes("data:"),false);
 await a.sync.enqueue(id,encoded.state,encoded.summary,encoded.assets);await a.sync.run();await b.sync.run();
 const remote=await b.store.getCase(id);const restored=await hydrate<SmileCase>(remote!.state.draft!,aid=>b.sync.loadAsset(id,aid),b.scope);
 assert.equal(restored.photo.dataUrl,image);assert.equal(restored.result?.image,image);a.stop();b.stop();
});

test("list carries summaries + thumbnail refs and performs no binary downloads",async()=>{
 const before=server.counts().downloadCount;const d=device(server);const page=await d.api.list();assert.ok(page.cases.length);assert.ok(page.cases.every(c=>!("state"in c)&&!("assets"in c)));assert.equal(server.counts().downloadCount,before);d.stop();
});
test("local cache list resolves without any cloud response",async()=>{
 const d=device(server),id=uuid();d.offline(true);await d.sync.enqueue(id,state(),EMPTY_SUMMARY());assert.equal((await d.store.cases()).some(c=>c.id===id),true);assert.equal((await d.store.getCase(id))?.status,"pending");d.stop();
});
test("a refresh drains local edits queued while its metadata request is in flight",async()=>{
 const d=device(server),id=uuid();await d.sync.enqueue(id,state("initial"),EMPTY_SUMMARY());await d.sync.run();
 const list=d.api.list;let release:()=>void=()=>{},entered:()=>void=()=>{};
 const gate=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});let hold=true;
 d.api.list=async(cursor)=>{if(hold){hold=false;entered();await gate;}return list(cursor);};
 const run=d.sync.run();await started;await d.sync.enqueue(id,state("new edit during refresh"),EMPTY_SUMMARY());release();await run;
 assert.equal((await d.store.getCase(id))?.status,"synced");assert.deepEqual((await d.api.get(id)).state,state("new edit during refresh"));d.stop();
});
test("queue dependencies follow the previous edit regardless of IndexedDB UUID ordering",async()=>{
 const d=device(server),id=uuid();d.sync.disconnect();
 const read=d.store.outbox;d.store.outbox=async()=>{const ops=await read();return ops.sort((a,b)=>Number(a.type==="CREATE_CASE")-Number(b.type==="CREATE_CASE"));};
 await d.sync.enqueue(id,state("first offline edit"),EMPTY_SUMMARY());const first=(await read()).find(o=>o.type==="UPDATE_CASE")!;
 await d.sync.enqueue(id,state("second offline edit"),EMPTY_SUMMARY());const second=(await read()).find(o=>o.type==="UPDATE_CASE"&&o.id!==first.id)!;
 assert.ok(second.dependencies.includes(first.id));d.sync.connect(d.api);await d.sync.run();assert.equal((await d.store.getCase(id))?.status,"synced");assert.deepEqual((await d.api.get(id)).state,state("second offline edit"));d.stop();
});
test("offline pending edit + binary survive restart and reconnect",async()=>{
 const factory=new IDBFactory(),a=device(server,A,factory),id=uuid();a.offline(true);const encoded=await encodePatientState(a.scope,a.store,id,{entries:[],media:[],draft:{caseId:id,photo:{dataUrl:image,width:10,height:10,name:"x"},settings:defaultSettings,result:null,screen:"design"}});
 await a.sync.enqueue(id,encoded.state,encoded.summary,encoded.assets);a.stop();const b=device(server,A,factory);assert.ok((await b.store.outbox()).length>=3);await b.sync.run();assert.equal((await b.store.getCase(id))?.status,"synced");assert.equal((await b.store.outbox()).length,0);b.stop();
});
test("idempotent create retries do not duplicate cases or revisions",async()=>{const m=create();const first=await server.store.mutate(A,m),again=await server.store.mutate(A,m);assert.equal(first.revision,again.revision);assert.equal(first.id,again.id);assert.equal((await server.db.query('select * from patient_cases where id=$1',[m.id])).rows.length,1);});
test("a reused operation ID with a different payload is rejected",async()=>{const m=create();await server.store.mutate(A,m);await assert.rejects(server.store.mutate(A,{...m,summary:{...m.summary,patientName:"altered"}}),e=>e instanceof PatientSyncError&&e.code==="operation_reused");});
test("accepted update increments revision once across retries",async()=>{const m=create();await server.store.mutate(A,m);const patch=update(m,1);assert.equal((await server.store.mutate(A,patch)).revision,2);assert.equal((await server.store.mutate(A,patch)).revision,2);});
test("stale revision returns HTTP 409 without overwriting",async()=>{const d=device(server),m=create();await d.api.mutate(m);await d.api.mutate(update(m,1));await assert.rejects(d.api.mutate({...update(m,1),state:state("stale")}),e=>e instanceof PatientSyncError&&e.status===409);assert.deepEqual((await d.api.get(m.id)).state,EMPTY_STATE());d.stop();});
test("two device conflict preserves the losing local clinical draft",async()=>{
 const a=device(server),b=device(server),id=uuid();await a.sync.enqueue(id,state("initial"),EMPTY_SUMMARY());await a.sync.run();await b.sync.run();b.sync.disconnect();
 await a.sync.enqueue(id,state("phone edit"),EMPTY_SUMMARY());await a.sync.run();await b.sync.enqueue(id,state("iPad offline edit"),EMPTY_SUMMARY());b.sync.connect(b.api);await b.sync.run();
 const c=await b.store.getCase(id);assert.equal(c?.status,"conflict");assert.deepEqual(c?.state,state("iPad offline edit"));assert.deepEqual(c?.conflict?.cloud.state,state("phone edit"));a.stop();b.stop();
});
test("conflict can explicitly adopt cloud",async()=>{
 const a=device(server),b=device(server),id=uuid();await a.sync.enqueue(id,state(),EMPTY_SUMMARY());await a.sync.run();await b.sync.run();b.sync.disconnect();await a.sync.enqueue(id,state("cloud"),EMPTY_SUMMARY());await a.sync.run();await b.sync.enqueue(id,state("local"),EMPTY_SUMMARY());b.sync.connect(b.api);await b.sync.run();assert.equal((await b.store.getCase(id))?.status,"conflict");await b.sync.resolve(id,"cloud");assert.deepEqual((await b.store.getCase(id))?.state,state("cloud"));assert.equal((await b.store.outbox()).length,0);a.stop();b.stop();
});
test("conflict can preserve local as a different stable case",async()=>{
 const a=device(server),b=device(server),id=uuid();await a.sync.enqueue(id,state(),EMPTY_SUMMARY());await a.sync.run();await b.sync.run();b.sync.disconnect();await a.sync.enqueue(id,state("cloud"),EMPTY_SUMMARY());await a.sync.run();await b.sync.enqueue(id,state("local"),EMPTY_SUMMARY());b.sync.connect(b.api);await b.sync.run();assert.equal((await b.store.getCase(id))?.status,"conflict");await b.sync.resolve(id,"preserve-local");const cases=await b.store.cases();assert.ok(cases.some(c=>c.id!==id&&(c.state.draft as Record<string,unknown>)?.patientName==="local"));assert.deepEqual((await b.store.getCase(id))?.state,state("cloud"));a.stop();b.stop();
});
test("a conflict copy remaps thumbnails, concepts and preferred version references and syncs successfully",async()=>{
 const a=device(server),b=device(server),id=uuid(),version=uuid();
 const enc=await encodePatientState(a.scope,a.store,id,{entries:[{id:version,caseId:id,patientName:"AB",createdAt:1,mode:"live",summary:"",thumb:image}],media:[{id:version,image,originalImage:image}],draft:{caseId:id,photo:{dataUrl:image,width:10,height:10,name:"x"},settings:defaultSettings,result:{variationId:version,image,mode:"live"},screen:"preview"},preferredDesignId:version});
 await a.sync.enqueue(id,enc.state,enc.summary,enc.assets);await a.sync.run();await b.sync.run();
 for(const asset of (await b.store.assets()).filter(a=>a.meta.caseId===id))await b.sync.loadAsset(id,asset.id);
 b.sync.disconnect();await a.sync.enqueue(id,{...enc.state,preferredDesignId:null},enc.summary);await a.sync.run();
 await b.sync.enqueue(id,{...enc.state,draft:{...enc.state.draft as object,patientName:"Preserve local"}},enc.summary);b.sync.connect(b.api);await b.sync.run();assert.equal((await b.store.getCase(id))?.status,"conflict");
 await b.sync.resolve(id,"preserve-local");await b.sync.run();
 const copy=(await b.store.cases()).find(c=>c.id!==id&&(c.state.draft as Record<string,unknown>)?.patientName==="Preserve local")!;assert.equal(copy.status,"synced");
 assert.notEqual(copy.state.preferredDesignId,version);assert.equal((copy.state.draft as {result:{variationId:string}}).result.variationId,copy.state.preferredDesignId);
 const cloud=await b.api.get(copy.id);assert.equal(cloud.summary.entries[0]&&typeof cloud.summary.entries[0]==="object"&&!Array.isArray(cloud.summary.entries[0])?cloud.summary.entries[0].caseId:null,copy.id);
 assert.ok(cloud.assets.every(asset=>asset.caseId===copy.id));assert.ok(!JSON.stringify(cloud.summary).includes(enc.assets[0].id));a.stop();b.stop();
});
test("delete propagates tombstone to other devices",async()=>{const a=device(server),b=device(server),id=uuid();await a.sync.enqueue(id,state(),EMPTY_SUMMARY());await a.sync.run();await b.sync.run();await a.sync.enqueue(id,EMPTY_STATE(),EMPTY_SUMMARY(),[],true);await a.sync.run();await b.sync.run();assert.equal((await b.store.getCase(id))?.status,"deleted");a.stop();b.stop();});
test("an offline device cannot resurrect a deleted case",async()=>{const a=device(server),b=device(server),id=uuid();await a.sync.enqueue(id,state(),EMPTY_SUMMARY());await a.sync.run();await b.sync.run();b.offline(true);await b.sync.enqueue(id,state("offline"),EMPTY_SUMMARY());await a.sync.enqueue(id,EMPTY_STATE(),EMPTY_SUMMARY(),[],true);await a.sync.run();b.offline(false);await b.sync.run();assert.equal((await b.store.getCase(id))?.status,"conflict");assert.ok((await a.api.get(id)).deletedAt);a.stop();b.stop();});
test("binary upload retries retain one immutable asset",async()=>{const d=device(server),id=uuid(),enc=await encodePatientState(d.scope,d.store,id,{entries:[],media:[],draft:{caseId:id,photo:{dataUrl:image,name:"x",width:10,height:10},settings:defaultSettings,result:null,screen:"design"}});await d.api.mutate(create(id));const a=enc.assets[0];await d.api.upload(a.meta,a.blob!);await d.api.upload(a.meta,a.blob!);assert.equal((await d.api.get(id)).assets.length,1);assert.equal((await d.api.get(id)).assets[0].uploadStatus,"confirmed");d.stop();});
test("asset service failures return a retryable private JSON response",async()=>{
 const d=device(server),id=uuid();await d.api.mutate(create(id));
 const request=new Request(`https://app.example/api/patient-cases/${id}/assets`,{method:"POST",headers:{Authorization:`Bearer ${A}`,"Content-Type":"application/json"},body:JSON.stringify({id:uuid(),kind:"THUMBNAIL",mimeType:"image/jpeg",width:null,height:null,byteSize:3,checksum:"a".repeat(64),provenance:"prepared"})});
 const {handlePatientCases}=await import("../src/server/patientCaseHandlers");
 const response=await handlePatientCases(request,{...server.services,patients:{...server.store,authoriseAsset:async()=>{throw new PatientSyncError(503,"patient_store_unavailable");}}});
 assert.equal(response.status,503);assert.equal(response.headers.get("Cache-Control"),"no-store");assert.equal((await response.json()).code,"patient_store_unavailable");d.stop();
});
test("checksum mismatch cannot be confirmed",async()=>{const d=device(server),id=uuid(),enc=await encodePatientState(d.scope,d.store,id,{entries:[],media:[],draft:{caseId:id,photo:{dataUrl:image,name:"x",width:10,height:10},settings:defaultSettings,result:null,screen:"design"}});await d.api.mutate(create(id));await assert.rejects(d.api.upload(enc.assets[0].meta,new Blob([new Uint8Array(9)],{type:"image/jpeg"})),e=>e instanceof PatientSyncError&&e.code==="asset_checksum_mismatch");d.stop();});
test("failed object deletion leaves a durable cleanup job and retries",async()=>{
 const d=device(server),id=uuid(),enc=await encodePatientState(d.scope,d.store,id,{entries:[],media:[],draft:{caseId:id,photo:{dataUrl:image,name:"x",width:10,height:10},settings:defaultSettings,result:null,screen:"design"}});
 await d.sync.enqueue(id,enc.state,enc.summary,enc.assets);await d.sync.run();server.setFailRemove(true);await d.sync.enqueue(id,EMPTY_STATE(),EMPTY_SUMMARY(),[],true);await d.sync.run();assert.ok((await server.db.query('select * from patient_case_cleanup_jobs where case_id=$1',[id])).rows.length);
 server.setFailRemove(false);await server.db.query('update patient_case_cleanup_jobs set next_attempt_at=now() where case_id=$1',[id]);await d.api.list();assert.equal((await server.db.query('select * from patient_case_cleanup_jobs where case_id=$1',[id])).rows.length,0);assert.equal(server.media.has(enc.assets[0].meta.objectPath),false);d.stop();
});
test("User B cannot GET, PATCH or DELETE User A's case through service role API",async()=>{const a=device(server),b=device(server,B),m=create();await a.api.mutate(m);await assert.rejects(b.api.get(m.id),e=>e instanceof PatientSyncError&&e.status===404);for(const type of ["UPDATE_CASE","DELETE_CASE"] as const)await assert.rejects(b.api.mutate({...update(m,1),type}),e=>e instanceof PatientSyncError&&e.status===404);a.stop();b.stop();});
test("User B cannot access or attach User A asset",async()=>{const a=device(server),b=device(server,B),id=uuid(),enc=await encodePatientState(a.scope,a.store,id,{entries:[],media:[],draft:{caseId:id,photo:{dataUrl:image,width:10,height:10,name:"x"},settings:defaultSettings,result:null,screen:"design"}});await a.sync.enqueue(id,enc.state,enc.summary,enc.assets);await a.sync.run();const asset=enc.assets[0].meta;await assert.rejects(b.api.download(id,asset.id),e=>e instanceof PatientSyncError&&e.status===404);const bob=create();await b.api.mutate(bob);await assert.rejects(b.api.upload({...asset,caseId:bob.id},enc.assets[0].blob!),e=>e instanceof PatientSyncError&&e.status===404);await assert.rejects(server.store.mutate(B,{...update(bob,1),state:{...EMPTY_STATE(),draft:{$asset:asset.id}}}),/invalid_state/);a.stop();b.stop();});
test("forged paths and unknown asset IDs are rejected",async()=>{const d=device(server),id=uuid();await d.api.mutate(create(id));const response=await server.request(`/api/patient-cases/${id}/assets`,{method:"POST",headers:{Authorization:`Bearer ${A}`,"Content-Type":"application/json"},body:JSON.stringify({id:uuid(),kind:"THUMBNAIL",objectPath:`${B}/victim`,mimeType:"image/jpeg",width:null,height:null,byteSize:3,checksum:"a".repeat(64),provenance:"generated"})});assert.equal(response.status,400);await assert.rejects(d.api.download(id,uuid()),e=>e instanceof PatientSyncError&&e.status===404);d.stop();});
test("cloud state rejects base64, signed/public URLs and blob URLs",async()=>{for(const url of [image,"https://storage.example/signed?token=private","blob:123"]){assert.equal(validStructured({photo:url}),false);const d=device(server),m=create();await assert.rejects(d.api.mutate({...m,state:{...EMPTY_STATE(),draft:{photo:url}}}),e=>e instanceof PatientSyncError&&e.status===400);d.stop();}});
test("account namespaces isolate cases, blobs and outbox",async()=>{const factory=new IDBFactory(),a=device(server,A,factory),b=device(server,B,factory);a.offline(true);await a.sync.enqueue(uuid(),state(),EMPTY_SUMMARY());assert.equal((await b.store.cases()).length,0);assert.equal((await b.store.outbox()).length,0);assert.equal((await b.store.assets()).length,0);a.stop();b.stop();});
test("account switch during network response prevents a stale cache write",async()=>{const factory=new IDBFactory(),scope=lease(),store=createPatientLocalStore(scope,factory);let release:()=>void=()=>{};const pending=new Promise<void>(r=>{release=r;});const d=device(server);const m=create();await d.api.mutate(m);const original=d.api.list;d.api.list=async()=>{await pending;return original();};const {createSyncCoordinator}=await import("../src/services/cases/sync/coordinator");const sync=createSyncCoordinator(scope,store,()=>{},async()=>{});sync.connect(d.api);const run=sync.run();scope.abort();release();await run;assert.equal((await createPatientLocalStore(lease(),factory).cases()).length,0);d.stop();});
test("eviction retains pending uploads and cheap thumbnails",async()=>{const scope=lease(),store=createPatientLocalStore(scope,new IDBFactory()),id=uuid();const blob=dataUrlBlob(image),base={id:uuid(),ownerUserId:A,caseId:id,kind:"GENERATED_CONCEPT",objectPath:"",mimeType:blob.type,width:null,height:null,byteSize:blob.size,checksum:"a".repeat(64),provenance:"generated",createdAt:new Date().toISOString(),uploadStatus:"confirmed"} as PatientAsset;
 await store.putAsset({id:base.id,meta:base,blob,pending:true,lastAccess:0});const synced={...base,id:uuid()};await store.putAsset({id:synced.id,meta:synced,blob,pending:false,lastAccess:0});const thumb={...base,id:uuid(),kind:"THUMBNAIL"} as PatientAsset;await store.putAsset({id:thumb.id,meta:thumb,blob,pending:false,lastAccess:0});await store.evict(0);assert.ok((await store.asset(base.id))?.blob);assert.equal((await store.asset(synced.id))?.blob,undefined);assert.ok((await store.asset(thumb.id))?.blob);scope.abort();});
test("legacy dataURL conversion is binary and labels prepared originals honestly",async()=>{const d=device(server),id=uuid();const enc=await encodePatientState(d.scope,d.store,id,{entries:[],media:[{id:uuid(),originalImage:image,image}],draft:null});assert.equal(enc.assets.find(a=>a.meta.kind==="PREPARED_PHOTO")?.meta.provenance,"legacy-prepared-original");assert.equal(await blobDataUrl(enc.assets[0].blob!),image);d.stop();});
test("repeated source photographs deduplicate within one case",async()=>{const d=device(server),id=uuid();const enc=await encodePatientState(d.scope,d.store,id,{entries:[],media:[{id:uuid(),originalImage:image,image},{id:uuid(),originalImage:image,image}],draft:null});assert.equal(enc.assets.filter(a=>a.meta.kind==="PREPARED_PHOTO").length,1);assert.equal(enc.assets.filter(a=>a.meta.kind==="GENERATED_CONCEPT").length,1);d.stop();});

async function asUser<T>(owner:string,run:()=>Promise<T>){await server.db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}';`);try{return await run();}finally{await server.db.exec('reset role;reset request.jwt.claim.sub;');}}
test("RLS: owner reads own case metadata; another user and anonymous cannot",async()=>{const m=create();await server.store.mutate(A,m);await asUser(B,async()=>assert.equal((await server.db.query('select * from patient_cases where id=$1',[m.id])).rows.length,0));await asUser(A,async()=>assert.equal((await server.db.query('select * from patient_cases where id=$1',[m.id])).rows.length,1));await server.db.exec('set role anon;');try{await assert.rejects(server.db.query('select * from patient_cases'),/permission denied/);}finally{await server.db.exec('reset role;');}});
test("RLS: direct case/revision writes and privileged RPC calls are refused",async()=>{await asUser(A,async()=>{await assert.rejects(server.db.query('update patient_cases set revision=999'),/permission denied/);await assert.rejects(server.db.query('select mutate_patient_case($1,$2,$3,$4,$5,$6,$7,null)',[B,uuid(),uuid(),"CREATE_CASE",0,"{}","{}"]),/permission denied/);await assert.rejects(server.db.query('select * from patient_case_mutations'),/permission denied/);await assert.rejects(server.db.query('select * from patient_case_cleanup_jobs'),/permission denied/);});});
test("composite FK refuses owner/asset mismatches even with privileged writes",async()=>{const m=create();await server.store.mutate(A,m);const id=uuid();await assert.rejects(server.db.query(`insert into patient_case_assets(id,owner_user_id,case_id,kind,object_path,mime_type,byte_size,checksum) values($1,$2,$3,'THUMBNAIL',$4,'image/jpeg',1,$5)`,[id,B,m.id,`${B}/${m.id}/${id}/thumbnail`,"a".repeat(64)]),/foreign key/);});
test("private bucket read/upload policies require registered owner/case/asset paths",async()=>{
 const m=create();await server.store.mutate(A,m);const id=uuid(),meta={id,caseId:m.id,ownerUserId:A,kind:"THUMBNAIL",mimeType:"image/jpeg",width:null,height:null,byteSize:1,checksum:"b".repeat(64),provenance:"generated"} as PatientAsset;
 const a=await server.store.authoriseAsset(A,m.id,meta);
 await asUser(B,async()=>{await assert.rejects(server.db.query("insert into storage.objects(bucket_id,name) values('patient-cases',$1)",[a.objectPath]),/row-level security/);});
 await asUser(A,async()=>{await assert.rejects(server.db.query("insert into storage.objects(bucket_id,name) values('patient-cases',$1)",[`${A}/${m.id}/${uuid()}/thumbnail`]),/row-level security/);await server.db.query("insert into storage.objects(bucket_id,name) values('patient-cases',$1)",[a.objectPath]);assert.equal((await server.db.query("select * from storage.objects where name=$1",[a.objectPath])).rows.length,0);});
 await server.store.confirmAsset(A,m.id,id);
 await asUser(A,async()=>{assert.equal((await server.db.query("select * from storage.objects where name=$1",[a.objectPath])).rows.length,1);assert.equal((await server.db.query("update storage.objects set name=name where name=$1",[a.objectPath])).affectedRows,0);});
 await asUser(B,async()=>assert.equal((await server.db.query("select * from storage.objects where name=$1",[a.objectPath])).rows.length,0));
 const bucket=await server.db.query<{public:boolean}>("select public from storage.buckets where id='patient-cases'");assert.equal(bucket.rows[0].public,false);
});
test("tombstone scrubs previous clinical mutation snapshots",async()=>{const m={...create(),state:state("sensitive notes")};const c=await server.store.mutate(A,m);await server.store.mutate(A,{...update(m,c.revision),type:"DELETE_CASE"});const rows=await server.db.query('select * from patient_case_mutations where case_id=$1',[m.id]);assert.equal(JSON.stringify(rows.rows).includes("sensitive notes"),false);await assert.rejects(server.store.mutate(A,m),e=>e instanceof PatientSyncError&&e.status===410);});
test("list keyset pagination has no missing or repeated UUIDs",async()=>{const ids:string[]=[];for(let i=0;i<54;i++){const m=create();ids.push(m.id);await server.store.mutate(B,m);}let cursor:string|undefined;const all:string[]=[];do{const page=await server.store.list(B,cursor);all.push(...page.cases.map(c=>c.id));cursor=page.nextCursor??undefined;}while(cursor);assert.equal(new Set(all).size,all.length);assert.ok(ids.every(id=>all.includes(id)));});
