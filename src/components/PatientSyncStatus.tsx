"use client";
import { ComposingMark } from "@/components/ComposingMark";
import { useEffect, useState } from "react";
import { getCaseRepository } from "@/services/cases/caseRepository";
import type { LocalPatientCase } from "@/services/cases/sync/localStore";
/** Uses the existing sheet typography/buttons; only exposes exceptional sync states and safe choices. */
export function PatientSyncStatus({showPending=true}:{showPending?:boolean}){
 const [repository]=useState(getCaseRepository),[cases,setCases]=useState<LocalPatientCase[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{let live=true;const load=()=>{void repository.syncStatuses().then(c=>{if(live)setCases(c);}).catch(()=>{});};load();const off=repository.subscribe(load);return()=>{live=false;off();};},[repository]);
 if(repository.scope.owner.kind!=="account")return null;
 const conflicts=cases.filter(c=>c.status==="conflict"),pending=cases.filter(c=>c.status==="pending");
 async function resolve(ids:string[],choice:"cloud"|"preserve-local"){setBusy(true);setError("");try{for(const id of ids)await repository.resolveConflict(id,choice);}catch{setError("The resolution couldn’t finish. Both versions are kept. Check your connection and try again.");}finally{setBusy(false);}}
 return <div aria-live="polite">
  {showPending&&pending.length>0&&<p className="control-hint">{pending.length} {pending.length===1?"case":"cases"} saved on this device · waiting to sync.</p>}
  {conflicts.length>0&&<div className="sync-conflict" role="status" aria-busy={busy}>
   <p><strong>{conflicts.length===1?(conflicts[0].summary.patientName||"A case"):`${conflicts.length} cases`}</strong> changed on another device.</p>
   {busy?<div className="sync-conflict-busy"><ComposingMark motion="sheen" tone="auto" className="sync-mark"/><span>Updating…</span></div>
    :<div className="sync-conflict-actions">
     <button className="secondary-button" onClick={()=>void resolve(conflicts.map(c=>c.id),"cloud")}>Use cloud</button>
     <button className="secondary-button" onClick={()=>void resolve(conflicts.map(c=>c.id),"preserve-local")}>Use this device</button>
    </div>}
  </div>}
  {error&&<p className="error-message">{error}</p>}
 </div>;
}
