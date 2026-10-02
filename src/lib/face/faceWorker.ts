// Classic worker: MediaPipe's locally bundled loader uses importScripts.
import { FaceLandmarker } from "@mediapipe/tasks-vision";
let model:Promise<FaceLandmarker>|null=null;
function load(){
  if(!model){model=FaceLandmarker.createFromOptions({
    wasmLoaderPath:"/vision/vision_wasm_internal.js",wasmBinaryPath:"/vision/vision_wasm_internal.wasm",
  },{baseOptions:{modelAssetPath:"/models/face/face_landmarker.task",delegate:"CPU"},runningMode:"IMAGE",numFaces:1});model.catch(()=>{model=null;});}
  return model;
}
let serial=Promise.resolve();
self.onmessage=(event:MessageEvent<{id:number;payload:{src?:string}}>)=>{
  const {id,payload}=event.data;
  serial=serial.catch(()=>{}).then(async()=>{
    let image:ImageBitmap|undefined;
    try{
      const landmarker=await load();
      if(!payload.src){self.postMessage({id,result:true});return;}
      image=await createImageBitmap(await (await fetch(payload.src)).blob());
      const points=landmarker.detect(image).faceLandmarks[0];
      self.postMessage({id,result:points?.length>=468?points.map(p=>[p.x*image!.width,p.y*image!.height]):null});
    }catch{self.postMessage({id,error:true});}
    finally{image?.close();}
  });
};
