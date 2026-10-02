import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function worker(badManifest=false, assets=["/_next/static/chunks/app-abc.js"]) {
 const handlers=new Map<string,(event:unknown)=>void>();
 const stores=new Map<string,Map<string,Response>>();
 const requests:string[]=[];let offline=false;
 const caches={
  async keys(){return [...stores.keys()];},
  async delete(name:string){return stores.delete(name);},
  async open(name:string){const data=stores.get(name)??new Map<string,Response>();stores.set(name,data);return {
   async match(path:string){return data.get(path)?.clone();},
   async put(path:string,response:Response){data.set(path,response.clone());},
  };},
 };
 runInNewContext(readFileSync("public/sw.js","utf8"),{
  URL,Response,caches,self:{location:{origin:"https://smile.test"},skipWaiting:async()=>{},clients:{claim:async()=>{}},addEventListener:(name:string,fn:(event:unknown)=>void)=>handlers.set(name,fn)},
  fetch:async(input:string|Request)=>{
   const path=typeof input==="string"?input:new URL(input.url).pathname;requests.push(path);
   if(offline)throw new Error("offline");
   if(path==="/offline-assets.json")return Response.json({version:"a".repeat(20),assets:badManifest?["/api/patient-cases"]:assets});
   return new Response(path==="/offline-shell.html"?"<html>Public build shell</html>":"public script",{headers:{"Content-Type":path.endsWith("html")?"text/html":"text/javascript"}});
  },
 });
 async function install(){const pending:Promise<unknown>[]=[];handlers.get("install")!({waitUntil:(p:Promise<unknown>)=>pending.push(p)});await Promise.all(pending);}
 async function request(path:string,mode="cors",method="GET"){
  let response:Promise<Response>|undefined;const pending:Promise<unknown>[]=[];
  handlers.get("fetch")!({request:{url:path.startsWith("https:")?path:`https://smile.test${path}`,method,mode},respondWith:(p:Promise<Response>)=>{response=p;},waitUntil:(p:Promise<unknown>)=>pending.push(p)});
  const result=response?await response:undefined;await Promise.all(pending);return result;
 }
 return {install,request,stores,requests,offline:()=>{offline=true;}};
}
test("offline installation caches only the build-time public shell and listed hashed assets",async()=>{
 const w=worker();await w.install();assert.deepEqual([...([...w.stores.values()][0].keys())],["/_next/static/chunks/app-abc.js","/offline-shell.html"]);
});
test("a cold offline root navigation uses the public shell",async()=>{const w=worker();await w.install();w.offline();assert.match(await (await w.request("/","navigate"))!.text(),/Public build shell/);});
test("hashed build assets remain available offline",async()=>{const w=worker();await w.install();w.offline();assert.equal(await (await w.request("/_next/static/chunks/app-abc.js"))!.text(),"public script");});
test("patient APIs, photos, avatars, external requests and non-root pages bypass shared caching",async()=>{
 const w=worker();await w.install();const before=w.requests.length;
 for(const path of ["/api/patient-cases","/api/patient-cases/id/assets/id","/api/account/avatar","/patient.jpg","https://supabase.test/storage/patient-cases/image","/_next/static/chunks/app-abc.js?token=x","/settings"])
  assert.equal(await w.request(path,path==="/settings"?"navigate":"cors"),undefined,path);
 assert.equal(await w.request("/","navigate","POST"),undefined);assert.equal(w.requests.length,before);
});
test("a forged offline manifest cannot cache authenticated API responses",async()=>{const w=worker(true);await assert.rejects(w.install(),/Invalid public shell manifest/);assert.equal(w.stores.size,0);});
test("a first offline launch without a prepared shell shows an honest reconnect state",async()=>{const w=worker();w.offline();assert.equal((await w.request("/","navigate"))?.status,503);});
test("bundled face, SlimSAM and HEIC workers/models are available offline but arbitrary model paths are not cached",async()=>{
 const paths=["/vision/face-worker.js","/vision/heic-worker.js","/vision/vision_wasm_internal.js","/vision/vision_wasm_internal.wasm","/models/face/face_landmarker.task","/models/slimsam/onnx/vision_encoder_quantized.onnx","/models/slimsam/onnx/prompt_encoder_mask_decoder_quantized.onnx","/ort/sam-worker.js","/ort/ort-wasm-simd-threaded.wasm"];
 const w=worker(false,paths);await w.install();w.offline();for(const path of paths)assert.equal((await w.request(path))?.status,200,path);
 assert.equal(await w.request("/models/patient-photo.png"),undefined);
});
