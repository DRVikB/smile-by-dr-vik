import {createInferenceWorker} from './vision/workerClient';
import {captureWorkspace,onWorkspaceDetach} from './workspace';
const decoder=createInferenceWorker(()=>new Worker('/vision/heic-worker.js'));
onWorkspaceDetach(()=>decoder.reset());
/** Same libheif decoder as heic-to/csp; locally hosted, no blob worker or eval. */
export async function heicToJpeg(file:Blob):Promise<Blob>{
 const scope=captureWorkspace();scope.assert();const buffer=await file.arrayBuffer();scope.assert();
 const image=await decoder.request<ImageData>({buffer},scope.signal,[buffer]);scope.assert();
 if(!image?.width||!image.height||image.data.length!==image.width*image.height*4)throw new Error('Invalid HEIC image.');
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
 const context=canvas.getContext('2d');if(!context)throw new Error('Photo preparation unavailable.');
 context.putImageData(image,0,0);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Photo preparation unavailable.')),'image/jpeg',0.94));
 canvas.width=canvas.height=1;scope.assert();return blob;
}
