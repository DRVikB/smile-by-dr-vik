/** Local technical QA only. No provider calls, photographs in logs, or remote analytics. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { GOLDEN_CASES, GOLDEN_COVERAGE_GAPS } from "../fixtures/golden-cases";
import { preparePhoto, prepareGenerationPhoto, alignPreview } from "../../src/lib/photos";
import { detectFace } from "../../src/lib/face/landmarks";
import { detectToothMap } from "../../src/lib/toothMap/detect";
import { activateWorkspace } from "../../src/lib/workspace";
function Harness() {
 const [busy,setBusy]=useState(false),[results,setResults]=useState<object[]>([]),[status,setStatus]=useState("Ready. Local processing only; no AI generation.");
 async function run(){
  setBusy(true);setResults([]);activateWorkspace({kind:"unowned"});
  for(const [i,item] of GOLDEN_CASES.entries()){
   setStatus(`Checking ${item.id} (${i+1}/${GOLDEN_CASES.length})…`);
   const start=performance.now(),timings:Record<string,number>={};
   try {
    const response=await fetch(`/golden-input/${i}`);if(!response.ok)throw Error("fixture_missing");
    let t=performance.now();const photo=await preparePhoto(new File([await response.blob()],item.file,{type:i===0?"image/heic":"image/jpeg"}));timings.prepareMs=Math.round(performance.now()-t);
    t=performance.now();const padded=await prepareGenerationPhoto(photo);const aligned=await alignPreview(padded.photo.dataUrl,photo,padded);timings.canvasRoundTripMs=Math.round(performance.now()-t);
    const image=new Image();image.src=aligned;await image.decode();
    const dimensions=image.naturalWidth===photo.width&&image.naturalHeight===photo.height;
    const b=padded.sourceBounds;const fullFrame=b.x>=0&&b.y>=0&&b.x+b.width<=1.001&&b.y+b.height<=1.001;
    t=performance.now();const face=item.shot==="Full face"?await detectFace(photo.dataUrl):null;timings.analysisMs=Math.round(performance.now()-t);
    t=performance.now();const map=await detectToothMap(photo,item.shot,undefined,{refine:false});timings.roughMapMs=Math.round(performance.now()-t);
    const maskBounds=map?map.teeth.every(tooth=>tooth.outline.every(p=>p.every(n=>Number.isFinite(n)&&n>=0&&n<=1))):null;
    setResults(r=>[...r,{id:item.id,result:dimensions&&fullFrame&&maskBounds!==false?"pass":"fail",dimensions:[photo.width,photo.height],cropRoundTrip:dimensions&&fullFrame,faceFound:!!face,mapTeeth:map?.teeth.length??0,mapBounds:maskBounds,slimSam:"not requested",...timings,totalMs:Math.round(performance.now()-start)}]);
   }catch{setResults(r=>[...r,{id:item.id,result:"fail",category:"local_processing",...timings,totalMs:Math.round(performance.now()-start)}]);}
  }
  setBusy(false);setStatus("Complete. Cosmetic quality and generated-output integrity still require live generation and human review.");
 }
 return <main style={{padding:24,fontFamily:"system-ui"}}><h1>Golden Cases · local technical checks</h1><p>No network provider, cloud upload or patient-image output.</p><button disabled={busy} onClick={()=>void run()} style={{minHeight:44}}>Run local Golden Cases</button><p role="status">{status}</p><pre aria-label="Golden Case results" style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(results,null,2)}</pre><p>Coverage still needed: {GOLDEN_COVERAGE_GAPS.join(", ")}.</p></main>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
