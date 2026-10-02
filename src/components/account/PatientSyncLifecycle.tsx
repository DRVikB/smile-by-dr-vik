"use client";
import { useEffect, useState } from "react";
import { useAccount } from "./AccountProvider";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { createPatientApi } from "@/services/cases/sync/patientApi";
import { isNativeApp } from "@/native/platform";
/** No new sync screen: launch, foreground and reconnect quietly resume the account's durable queue. */
export function PatientSyncLifecycle(){
 const {user,ready,getAccessToken}=useAccount();const [repository]=useState(getCaseRepository);
 useEffect(()=>{
  if(!ready||!user||repository.scope.owner.kind!=="account")return;
  repository.connect(createPatientApi(repository.scope,getAccessToken));
  void repository.resume().catch(()=>{});
  const wake=()=>{if(!repository.scope.signal.aborted)void repository.refreshSync();};
  const visible=()=>{if(document.visibilityState==="visible")wake();};
  window.addEventListener("online",wake);document.addEventListener("visibilitychange",visible);window.addEventListener("pageshow",wake);
  let cancelled=false,removeNative:(()=>Promise<void>)|undefined;
  if(isNativeApp())void import("@capacitor/app").then(async({App})=>{const listener=await App.addListener("appStateChange",s=>{if(s.isActive)wake();});if(cancelled)await listener.remove();else removeNative=()=>listener.remove();}).catch(()=>{});
  return()=>{cancelled=true;repository.disconnect();window.removeEventListener("online",wake);document.removeEventListener("visibilitychange",visible);window.removeEventListener("pageshow",wake);void removeNative?.();};
 },[ready,user?.id,getAccessToken,repository]);
 return null;
}
