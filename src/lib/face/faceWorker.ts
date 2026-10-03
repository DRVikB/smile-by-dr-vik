// Classic worker: MediaPipe's locally bundled loader uses importScripts.
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { runFaceDetection } from "./detectionResult";
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
    try{
      if(!payload.src){await load();self.postMessage({id,result:true});return;}
      const result=await runFaceDetection(payload.src,{
        load,
        decode:async src=>createImageBitmap(await (await fetch(src)).blob()),
        detect:(landmarker,image)=>{
          const faces=landmarker.detect(image).faceLandmarks;
          if(!faces)return undefined;
          if(!faces.length)return [];
          return faces[0]?.map(p=>[p.x*image.width,p.y*image.height]);
        },
      });
      self.postMessage({id,result});
    }catch{self.postMessage({id,error:true});}
  });
};
