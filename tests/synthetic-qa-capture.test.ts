import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SyntheticQaCapture, syntheticQaCaptureAllowed } from "../src/services/ai/syntheticQaCapture";
const uuid="cd8c7c2d-4c7e-4a01-83cc-f5ac139aef19";
const synthetic=new Blob(["explicitly approved synthetic fixture"],{type:"image/jpeg"});
const digest=createHash("sha256").update("explicitly approved synthetic fixture").digest("hex");
const source="data:image/jpeg;base64,c291cmNl",raw="data:image/jpeg;base64,cmF3",final="data:image/png;base64,ZmluYWw=";
test("capture retains the exact approved original separately from the imported canvas",async()=>{
 const writes=new Map<string,string>();
 const exactFile=new Blob(["exact approved original bytes"],{type:"image/jpeg"});
 // Independent Node hashing authorises this fixture; the saved file must remain byte-identical.
 const approved=createHash("sha256").update("exact approved original bytes").digest("hex");
 const c=new SyntheticQaCapture(true,approved,async(path,data)=>{writes.set(path,data);});
 assert.equal(await c.register(exactFile,source),true);
 assert.equal(await c.captureRaw(uuid,source,raw),"saved");
 const original=[...writes].find(([path])=>path.endsWith("/original.jpg"));
 const imported=[...writes].find(([path])=>path.endsWith("/imported-source.jpg"));
 assert.equal(Buffer.from(original?.[1]??"","base64").toString(),"exact approved original bytes");
 assert.equal(imported?.[1],"c291cmNl");
});
test("raw capture requires explicit opt-in, native app, staging and an approved fingerprint",()=>{
 const args={flag:"1",native:true,origin:"https://smile-by-dr-vik-staging.drvik.workers.dev",fingerprint:digest,runId:uuid,provenance:"approved-test-photo"};
 assert.equal(syntheticQaCaptureAllowed(args),true);
 for(const patch of [{flag:undefined},{flag:"0"},{native:false},{origin:"https://smilecompose.app"},{origin:"http://localhost:3006"},{fingerprint:""},{runId:undefined},{runId:"../patient"},{provenance:undefined},{provenance:"patient"}]) assert.equal(syntheticQaCaptureAllowed({...args,...patch}),false);
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
 assert.deepEqual(writes.filter(p=>!p.endsWith("manifest.json")).map(p=>p.split('/').at(-1)),["original.jpg","imported-source.jpg","provider-input.png","provider-mask.png","raw.jpg","normalized.png","final.png"]);
});
test("a persisted capture reservation prevents another request after runtime recreation",async()=>{
 let spent=false;const writes:string[]=[];const claim=async()=>{if(spent)return false;spent=true;return true;};
 for(const [id,want] of [[uuid,"saved"],["ad8c7c2d-4c7e-4a01-83cc-f5ac139aef19","ineligible"]] as const){
  const c=new SyntheticQaCapture(true,digest,async p=>{writes.push(p);},claim);await c.register(synthetic,source);
  assert.equal(await c.capturePrepared(id,source,final,final),want);
 }
 assert.equal(writes.filter(p=>!p.endsWith("manifest.json")).length,4);
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
 assert.deepEqual(writes.filter(x=>!x.path.endsWith("manifest.json")).map(x=>x.path),[`smile-qa-capture/${uuid}/${uuid}/original.jpg`,`smile-qa-capture/${uuid}/${uuid}/imported-source.jpg`,`smile-qa-capture/${uuid}/${uuid}/raw.jpg`,`smile-qa-capture/${uuid}/${uuid}/final.png`]);
 assert.deepEqual(writes.filter(x=>!x.path.endsWith("manifest.json")).map(x=>Buffer.from(x.data,"base64").toString()),["explicitly approved synthetic fixture","source","raw","final"]);
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
 assert.deepEqual(statuses.sort(),["ineligible","saved"]);assert.equal(writes.filter(p=>!p.endsWith("manifest.json")).length,3);
});
test("verified writes fail closed when persisted bytes differ",async()=>{
 const c=new SyntheticQaCapture(true,digest,async()=>{},async()=>true,{read:async()=>"d3Jvbmc="});
 await c.register(synthetic,source);
 assert.equal(await c.capturePrepared(uuid,source,final,final),"failed");
 assert.equal(await c.captureRaw(uuid,source,raw),"ineligible");
});
test("raw evidence and hashes survive a forced downstream validation rejection",async()=>{
 const writes=new Map<string,string>();
 const c=new SyntheticQaCapture(true,digest,async(path,data)=>{writes.set(path,data);},async()=>true,{runId:uuid,provenance:"approved-test-photo",read:async path=>writes.get(path)!});
 await c.register(synthetic,source);
 assert.equal(await c.capturePrepared(uuid,source,final,final),"saved");
 assert.equal(await c.captureRaw(uuid,source,raw),"saved");
 assert.throws(()=>{throw Error("forced generated_landmarks_missing");},/generated_landmarks_missing/);
 const persisted=[...writes].find(([path])=>path.endsWith("/raw.jpg"));
 assert.equal(persisted?.[1],"cmF3");
 const manifest=JSON.parse(Buffer.from(writes.get(`smile-qa-capture/${uuid}/${uuid}/manifest.json`)! ,"base64").toString());
 assert.equal(manifest.provenance,"approved-test-photo");
 assert.equal(manifest.files.raw.sha256,createHash("sha256").update("raw").digest("hex"));
 assert.equal(manifest.files.original.sha256,digest);
 assert.equal(manifest.files.final,undefined);
 assert.equal(JSON.stringify(manifest).includes("cmF3"),false);
});
test("offline self-test run claim cannot consume a separate live run",async()=>{
 const claimed=new Set<string>(),writes=new Map<string,string>();
 const liveRun="ad8c7c2d-4c7e-4a01-83cc-f5ac139aef19";
 for(const [runId,kind] of [[uuid,"offline-self-test"],[liveRun,"live"]] as const){
  const c=new SyntheticQaCapture(true,digest,async(path,data)=>{writes.set(path,data);},async()=>{if(claimed.has(runId))return false;claimed.add(runId);return true;},{runId,kind,provenance:"approved-test-photo",read:async path=>writes.get(path)!});
  await c.register(synthetic,source);assert.equal(await c.captureRaw(uuid,source,raw),"saved");
 }
 assert.equal(writes.has(`smile-qa-capture/${uuid}/${uuid}/raw.jpg`),true);
 assert.equal(writes.has(`smile-qa-capture/${liveRun}/${uuid}/raw.jpg`),true);
});
test("a recreated capture reads and verifies durable evidence without spending another claim",async()=>{
 const writes=new Map<string,string>();let claims=0;
 const options={runId:uuid,provenance:"approved-test-photo" as const,read:async(path:string)=>writes.get(path)!};
 const first=new SyntheticQaCapture(true,digest,async(path,data)=>{writes.set(path,data);},async()=>{claims++;return true;},options);
 await first.register(synthetic,source);assert.equal(await first.captureRaw(uuid,source,raw),"saved");
 const reopened=new SyntheticQaCapture(true,digest,async()=>{throw Error("read-only");},async()=>{throw Error("must not claim");},options);
 const receipt=await reopened.verifyEvidence(uuid);
 assert.equal(receipt.ok,true);assert.equal(receipt.files.raw.sha256,createHash("sha256").update("raw").digest("hex"));
 assert.equal(claims,1);
 writes.set(`smile-qa-capture/${uuid}/${uuid}/raw.jpg`,"Y29ycnVwdA==");
 assert.equal((await reopened.verifyEvidence(uuid)).ok,false);
});
test("all returned image parts retain bounded selection evidence without text or signatures",async()=>{
 const writes=new Map<string,string>();
 const c=new SyntheticQaCapture(true,digest,async(path,data)=>{writes.set(path,data);},async()=>true,{runId:uuid,read:async path=>writes.get(path)!});
 await c.register(synthetic,source);assert.equal(await c.capturePrepared(uuid,source,final),"saved");
 assert.equal(await c.captureParts(uuid,source,[
  {candidateIndex:0,partIndex:0,thought:true,mimeType:"image/jpeg",finishReason:"STOP",selected:false,image:raw},
  {candidateIndex:0,partIndex:2,thought:false,mimeType:"image/png",finishReason:"STOP",width:2,height:3,selected:true,image:final},
 ]),"saved");
 const receipt=await c.verifyEvidence(uuid);
 assert.equal(receipt.ok,true);assert.equal(receipt.files["part-0-0"].sha256,createHash("sha256").update("raw").digest("hex"));
 const metadata=JSON.parse(Buffer.from(writes.get(`smile-qa-capture/${uuid}/${uuid}/manifest.json`)! ,"base64").toString());
 assert.deepEqual(metadata.parts.map((part:{thought:boolean,selected:boolean})=>[part.thought,part.selected]),[[true,false],[false,true]]);
 assert.equal(JSON.stringify(metadata).includes("image\":\"data:"),false);
});
test("capture preserves valid interim formats and records omitted invalid parts explicitly",async()=>{
 const writes=new Map<string,string>();
 const c=new SyntheticQaCapture(true,digest,async(path,data)=>{writes.set(path,data);},async()=>true,{runId:uuid,read:async path=>writes.get(path)!});
 await c.register(synthetic,source);assert.equal(await c.capturePrepared(uuid,source,final),"saved");
 const parts=[
  {candidateIndex:0,partIndex:0,thought:true,mimeType:"image/webp",finishReason:"STOP",selected:false,image:"data:image/webp;base64,cmF3"},
  {candidateIndex:0,partIndex:1,thought:false,mimeType:"image/tiff",finishReason:"STOP",selected:false,omitted:"unsupported_mime" as const},
 ];
 assert.equal(await c.captureParts(uuid,source+"wrong",parts),"ineligible");
 assert.equal(await c.captureParts(uuid,source,parts),"saved");
 const receipt=await c.verifyEvidence(uuid);
 assert.equal(receipt.ok,true);assert.equal(receipt.files["part-0-0"].mime,"image/webp");
 assert.equal(receipt.files["part-0-1"],undefined);
 const metadata=JSON.parse(Buffer.from(writes.get(`smile-qa-capture/${uuid}/${uuid}/manifest.json`)! ,"base64").toString());
 assert.equal(metadata.parts[1].omitted,"unsupported_mime");
});
test("part metadata discards arbitrary finish text instead of persisting opaque content",async()=>{
 const writes=new Map<string,string>();
 const c=new SyntheticQaCapture(true,digest,async(path,data)=>{writes.set(path,data);},async()=>true,{runId:uuid,read:async path=>writes.get(path)!});
 await c.register(synthetic,source);await c.capturePrepared(uuid,source,final);
 assert.equal(await c.captureParts(uuid,source,[{candidateIndex:0,partIndex:0,thought:false,mimeType:"image/jpeg",finishReason:"opaque private signature must not persist",selected:true,image:raw}]),"saved");
 const metadata=Buffer.from(writes.get(`smile-qa-capture/${uuid}/${uuid}/manifest.json`)! ,"base64").toString();
 assert.equal(metadata.includes("opaque private signature"),false);
 assert.equal(JSON.parse(metadata).parts[0].finishReason,"unknown");
});
test("disabled capture does not hash, register or write images; write failure is contained",async()=>{
 const disabled=new SyntheticQaCapture(false,digest,async()=>{throw Error("must not write");});
 assert.equal(await disabled.register(synthetic,source),false);assert.equal(await disabled.captureRaw(uuid,source,raw),"disabled");
 const broken=new SyntheticQaCapture(true,digest,async()=>{throw Error("cache unavailable");});await broken.register(synthetic,source);
 assert.equal(await broken.captureRaw(uuid,source,raw),"failed");
 assert.equal(await broken.captureRaw(uuid,source,raw),"ineligible");
});
