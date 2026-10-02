import { captureWorkspace, onWorkspaceDetach } from "../workspace";
import type { Point } from "./geometry";
import { createInferenceWorker } from "../vision/workerClient";
/** Locally bundled MediaPipe CPU inference, isolated from UI execution. */
const inference=createInferenceWorker(()=>new Worker("/vision/face-worker.js"));
export function warmFaceModel():void{void inference.request({}).catch(()=>{});}
export function faceModelAvailable():Promise<boolean>{return inference.request<boolean>({}).catch(()=>false);}
const cache=new Map<string,Promise<Point[]|null>>();
export function clearFaceAnalysisCache(){cache.clear();inference.reset();}
export function primeFaceAnalysis(src:string,points:Point[]){
  captureWorkspace().assert();cache.set(src,Promise.resolve(points));
  while(cache.size>6)cache.delete(cache.keys().next().value!);
}
onWorkspaceDetach(clearFaceAnalysisCache);
export function detectFace(src:string,signal?:AbortSignal):Promise<Point[]|null>{
  const scope=captureWorkspace();scope.assert();
  if(signal?.aborted)return Promise.resolve(null);
  const hit=cache.get(src);
  if(hit)return hit.then(points=>{scope.assert();signal?.throwIfAborted();return points;});
  const cancellation=new AbortController(),abort=()=>cancellation.abort();
  scope.signal.addEventListener("abort",abort,{once:true});signal?.addEventListener("abort",abort,{once:true});
  const job=inference.request<Point[]|null>({src},cancellation.signal).then(points=>{
    scope.assert();signal?.throwIfAborted();return points;
  }).catch(()=>null).finally(()=>{scope.signal.removeEventListener("abort",abort);signal?.removeEventListener("abort",abort);});
  cache.set(src,job);while(cache.size>6)cache.delete(cache.keys().next().value!);
  void job.then(points=>{if(points===null&&cache.get(src)===job)cache.delete(src);});return job;
}
