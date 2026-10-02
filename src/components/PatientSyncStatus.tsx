"use client";
import { useEffect, useState } from "react";
import { getCaseRepository } from "@/services/cases/caseRepository";
import type { LocalPatientCase } from "@/services/cases/sync/localStore";
/** Uses the existing sheet typography/buttons; only exposes exceptional sync states and safe choices. */
export function PatientSyncStatus(){
 const [repository]=useState(getCaseRepository),[cases,setCases]=useState<LocalPatientCase[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{let live=true;const load=()=>{void repository.syncStatuses().then(c=>{if(live)setCases(c);}).catch(()=>{});};load();const off=repository.subscribe(load);return()=>{live=false;off();};},[repository]);
 if(repository.scope.owner.kind!=="account")return null;
 const conflicts=cases.filter(c=>c.status==="conflict"),pending=cases.filter(c=>c.status==="pending");
 async function resolve(id:string,choice:"cloud"|"preserve-local"){setBusy(true);setError("");try{await repository.resolveConflict(id,choice);}catch{setError("The resolution couldn’t finish. Both versions are kept. Check your connection and try again.");}finally{setBusy(false);}}
 return <div aria-live="polite">
  {pending.length>0&&<p className="control-hint">{pending.length} {pending.length===1?"case":"cases"} saved on this device · waiting to sync.</p>}
  {conflicts.map(c=><div className="error-message" key={c.id} role="status">
   <p>{c.summary.patientName||"This case"} {c.conflict?.cloud.deletedAt?"was deleted":"changed"} on another device. Your local work is kept.</p>
   <button className="text-button" disabled={busy} onClick={()=>void resolve(c.id,"cloud")}>Use cloud version</button>
   <button className="text-button" disabled={busy} onClick={()=>void resolve(c.id,"preserve-local")}>Keep local as separate case</button>
  </div>)}
  {error&&<p className="error-message">{error}</p>}
 </div>;
}
