import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SyntheticQaCapture, syntheticQaCaptureAllowed } from "../src/services/ai/syntheticQaCapture";
const uuid="cd8c7c2d-4c7e-4a01-83cc-f5ac139aef19";
const synthetic=new Blob(["explicitly approved synthetic fixture"]);
const digest=createHash("sha256").update("explicitly approved synthetic fixture").digest("hex");
const source="data:image/jpeg;base64,c291cmNl",raw="data:image/jpeg;base64,cmF3",final="data:image/png;base64,ZmluYWw=";
test("raw capture requires explicit opt-in, native app, staging and an approved fingerprint",()=>{
 const args={flag:"1",native:true,origin:"https://smile-by-dr-vik-staging.drvik.workers.dev",fingerprint:digest,runId:uuid};
 assert.equal(syntheticQaCaptureAllowed(args),true);
 for(const patch of [{flag:undefined},{flag:"0"},{native:false},{origin:"https://smilecompose.app"},{origin:"http://localhost:3006"},{fingerprint:""},{runId:undefined},{runId:"../patient"}]) assert.equal(syntheticQaCaptureAllowed({...args,...patch}),false);
});
test("one synthetic request retains prepared input, mask, raw, normalized and final without accepting another source",async()=>{
 const writes:string[]=[];const c=new SyntheticQaCapture(true,digest,async path=>{writes.push(path);});
 await c.register(synthetic,source);
 const prepared="data:image/png;base64,aW5wdXQ=",mask="data:image/png;base64,bWFzaw==";
 assert.equal(await c.capturePrepared(uuid,source,prepared,mask),"saved");
 assert.equal(await c.captureRaw(uuid,source,raw),"saved");
 await c.captureNormalized(uuid,source,final);await c.captureFinal(uuid,source,final);
 await c.captureNormalized(uuid,source+"patient",final);
 assert.equal(await c.capturePrepared("ad8c7c2d-4c7e-4a01-83cc-f5ac139aef19",source,prepared,mask),"ineligible");
 assert.deepEqual(writes.map(p=>p.split('/').at(-1)),["original.jpg","provider-input.png","provider-mask.png","raw.jpg","normalized.png","final.png"]);
});
test("a persisted capture reservation prevents another request after runtime recreation",async()=>{
 let spent=false;const writes:string[]=[];const claim=async()=>{if(spent)return false;spent=true;return true;};
 for(const [id,want] of [[uuid,"saved"],["ad8c7c2d-4c7e-4a01-83cc-f5ac139aef19","ineligible"]] as const){
  const c=new SyntheticQaCapture(true,digest,async p=>{writes.push(p);},claim);await c.register(synthetic,source);
  assert.equal(await c.capturePrepared(id,source,final,final),want);
 }
 assert.equal(writes.length,3);
});
test("capture never saves unregistered or patient content, even in an enabled QA build",async()=>{
 const writes:string[]=[];const c=new SyntheticQaCapture(true,digest,async path=>{writes.push(path);});
 assert.equal(await c.captureRaw(uuid,source,raw),"ineligible");
 assert.equal(await c.register(new Blob(["patient"]),source),false);
 assert.equal(await c.captureRaw(uuid,source,raw),"ineligible");assert.deepEqual(writes,[]);
});
test("approved file authorizes only its exact prepared source and one request, locally",async()=>{
 const writes:{path:string,data:string}[]=[];const c=new SyntheticQaCapture(true,digest,async(path,data)=>{writes.push({path,data});});
 assert.equal(await c.register(synthetic,source),true);
 assert.equal(await c.captureRaw(uuid,source+"patient",raw),"ineligible");
 assert.equal(await c.captureRaw("../../patient",source,raw),"ineligible");
 assert.equal(await c.captureRaw(uuid,source,raw),"saved");
 assert.equal(await c.captureRaw(uuid,source,raw),"ineligible");
 await c.captureFinal(uuid,source,final);
 assert.deepEqual(writes.map(x=>x.path),[`smile-qa-synthetic/${uuid}/original.jpg`,`smile-qa-synthetic/${uuid}/raw.jpg`,`smile-qa-synthetic/${uuid}/final.png`]);
 assert.deepEqual(writes.map(x=>x.data),["c291cmNl","cmF3","ZmluYWw="]);
});
test("new patient import or workspace detach revokes synthetic authorization",async()=>{
 for(const revoke of ["import","detach"]) {
  const writes:string[]=[];const c=new SyntheticQaCapture(true,digest,async p=>{writes.push(p);});await c.register(synthetic,source);
  if(revoke==="import") await c.register(new Blob(["patient"]),source);else c.clear();
  assert.equal(await c.captureRaw(uuid,source,raw),"ineligible");assert.deepEqual(writes,[]);
 }
});
test("concurrent requests cannot capture more than the single approved attempt",async()=>{
 const writes:string[]=[];const c=new SyntheticQaCapture(true,digest,async path=>{writes.push(path);});await c.register(synthetic,source);
 const statuses=await Promise.all([c.captureRaw(uuid,source,raw),c.captureRaw("ad8c7c2d-4c7e-4a01-83cc-f5ac139aef19",source,raw)]);
 assert.deepEqual(statuses.sort(),["ineligible","saved"]);assert.equal(writes.length,2);
});
test("disabled capture does not hash, register or write images; write failure is contained",async()=>{
 const disabled=new SyntheticQaCapture(false,digest,async()=>{throw Error("must not write");});
 assert.equal(await disabled.register(synthetic,source),false);assert.equal(await disabled.captureRaw(uuid,source,raw),"disabled");
 const broken=new SyntheticQaCapture(true,digest,async()=>{throw Error("cache unavailable");});await broken.register(synthetic,source);
 assert.equal(await broken.captureRaw(uuid,source,raw),"failed");
 assert.equal(await broken.captureRaw(uuid,source,raw),"ineligible");
});
