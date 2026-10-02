/** Reusable serial worker RPC. Cancellation releases in-flight patient pixels. */
export interface WorkerPort {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}
export function createInferenceWorker(create:()=>WorkerPort, timeout=60000) {
  let worker:WorkerPort|null=null,sequence=0,serial=Promise.resolve();
  let pending:{reject:(error:Error)=>void;finish:()=>void}|null=null;
  function reset(message="Analysis cancelled.") {
    worker?.terminate();worker=null;
    if(pending){const p=pending;pending=null;p.finish();p.reject(new Error(message));}
  }
  function request<T>(payload:unknown,signal?:AbortSignal,transfer:Transferable[]=[]):Promise<T> {
    const task=serial.catch(()=>{}).then(()=>new Promise<T>((resolve,reject)=>{
      if(signal?.aborted){reject(signal.reason??new Error("Analysis cancelled."));return;}
      try{worker??=create();}catch(error){reject(error);return;}
      const current=worker,id=++sequence;
      const finish=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);};
      const abort=()=>reset();
      const timer=setTimeout(()=>reset("Analysis timed out."),timeout);
      pending={reject,finish};signal?.addEventListener("abort",abort,{once:true});
      current.onerror=()=>reset("On-device analysis is unavailable.");
      current.onmessage=(event)=>{
        if(current!==worker||event.data.id!==id)return;
        pending=null;finish();
        if(event.data.error)reject(new Error("On-device analysis is unavailable."));
        else resolve(event.data.result as T);
      };
      try{current.postMessage({id,payload},transfer);}catch{reset("On-device analysis is unavailable.");}
    }));
    serial=task.then(()=>{},()=>{});return task;
  }
  return {request,reset};
}
