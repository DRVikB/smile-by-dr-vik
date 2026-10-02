import type { refineWithSam, RefineStats } from "./sam";
import type { ToothMap } from "./types";
import { captureWorkspace,onWorkspaceDetach } from "../workspace";
import { createInferenceWorker } from "../vision/workerClient";
type RefinementImage = Parameters<typeof refineWithSam>[2];
const inference=createInferenceWorker(()=>new Worker("/ort/sam-worker.js",{type:"module"}));
onWorkspaceDetach(()=>inference.reset());
/** Runtime sessions stay in the worker between photos, never on the UI thread. */
export async function refineInWorker(map:ToothMap,image:RefinementImage,signal?:AbortSignal):Promise<{map:ToothMap;stats:RefineStats}>{
  const scope=captureWorkspace();scope.assert();
  const cancellation=new AbortController(),abort=()=>cancellation.abort();
  scope.signal.addEventListener("abort",abort,{once:true});signal?.addEventListener("abort",abort,{once:true});
  if(signal?.aborted||scope.signal.aborted)abort();
  try{
    const result=await inference.request<{map:ToothMap;stats:RefineStats}>({map,image},cancellation.signal,[image.rgba.buffer as ArrayBuffer]);
    scope.assert();signal?.throwIfAborted();return result;
  }finally{scope.signal.removeEventListener("abort",abort);signal?.removeEventListener("abort",abort);}
}
