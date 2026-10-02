/** Local-only component harness. Never imported by the app or packaged for release. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CaseLog } from "../../src/components/CaseLog";
import { activateWorkspace } from "../../src/lib/workspace";
import { createCaseLogStore } from "../../src/lib/caseLog";
import { getCaseRepository } from "../../src/services/cases/caseRepository";
import { PatientSyncError, type PatientApi, type PatientCase } from "../../src/services/cases/sync/types";
import { defaultSettings } from "../../src/lib/types";

const scenarios = ["Fully local", "Fully synced", "Cloud only", "Downloading", "Pending upload", "Offline local", "Failed upload", "Failed download", "Missing cloud image", "Another device", "Interrupted upload", "Reconnected", "Conflict"];
const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQYlWM4u2Xaf3yYYWQoAADN88WBHfFyHQAAAABJRU5ErkJggg==";
function Harness() {
  const [fixture,setFixture]=useState<{version:string;key:string}|null>(null),[busy,setBusy]=useState(false),[action,setAction]=useState<()=>void>(()=>()=>{});
  async function select(name:string) {
    setBusy(true);setFixture(null);
    const owner=crypto.randomUUID(),scope=activateWorkspace({kind:"account",userId:owner});
    const repo=getCaseRepository(),caseId=crypto.randomUUID(),version=crypto.randomUUID();
    const entry={id:version,caseId,patientName:"QA synthetic case",createdAt:Date.now(),mode:"live" as const,summary:"6 teeth · Composite",thumb:png,exports:[{kind:"preview" as const,createdAt:Date.now()}]};
    const media={id:version,image:png,originalImage:png,preferences:{settings:{...defaultSettings,teeth:6 as const}}};
    Object.defineProperty(navigator,"onLine",{value:name!=="Offline local",configurable:true});
    if(name==="Fully local")await createCaseLogStore(scope).addLogEntry(entry,media);
    else await repo.recordVisualisation(entry,media);
    const cached=await repo.cache.getCase(caseId),assets=await repo.cache.assets();
    const cloud:PatientCase={...cached!,schemaVersion:1,assets:assets.map(a=>({...a.meta,uploadStatus:"confirmed"})),revision:2};
    const remote=new Map(assets.map(a=>[a.id,a.blob!]));
    const pending=["Pending upload","Offline local","Failed upload","Interrupted upload"].includes(name);
    if(cached&&!pending){for(const op of await repo.cache.outbox())await repo.cache.acknowledge(op);await repo.cache.commit({...cached,status:name==="Conflict"?"conflict":"synced",revision:2,...(name==="Conflict"?{conflict:{cloud,detectedAt:Date.now()}}:{})});}
    const cloudOnly=["Cloud only","Downloading","Failed download","Missing cloud image","Another device","Reconnected"].includes(name);
    for(const a of assets) {
      const {blob,...rest}=a;
      await repo.cache.putAsset({...rest,pending,...(!cloudOnly||a.meta.kind==="THUMBNAIL"?{blob}:{})});
    }
    let failing=name==="Failed upload"||name==="Failed download";
    let unblock:()=>void=()=>{};
    const gate=new Promise<void>(r=>{unblock=r;});
    let held=["Cloud only","Downloading","Another device","Interrupted upload"].includes(name);
    const api:PatientApi={
      list:async()=>({cases:[],nextCursor:null}),get:async()=>cloud,
      mutate:async m=>({...cloud,state:m.state,summary:m.summary,revision:m.expectedRevision+1}),
      upload:async a=>{if(held)await gate;if(failing)throw new PatientSyncError(503,"network");return {...a,uploadStatus:"confirmed"};},
      download:async(_c,id)=>{if(held)await gate;if(name==="Missing cloud image")throw new PatientSyncError(404,"media_missing");if(failing)throw new PatientSyncError(503,"media_unavailable");return remote.get(id)!;},
    };
    if(!["Fully local","Pending upload","Offline local","Conflict"].includes(name))repo.connect(api);
    if(name==="Failed upload")await repo.refreshSync();
    setAction(()=>()=>{failing=false;held=false;unblock();Object.defineProperty(navigator,"onLine",{value:true,configurable:true});repo.connect(api);window.dispatchEvent(new Event("online"));void repo.refreshSync();});
    setFixture({version,key:owner});setBusy(false);
  }
  return <><header className="qa-toolbar"><label>Case state <select aria-label="Case state" disabled={busy} defaultValue="" onChange={e=>void select(e.target.value)}><option value="" disabled>Choose a scenario</option>{scenarios.map(s=><option key={s}>{s}</option>)}</select></label><button onClick={action}>Complete transfer / reconnect</button></header>
    {fixture&&<CaseLog key={fixture.key} initialEntryId={fixture.version} onClose={()=>setFixture(null)} />}
  </>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
