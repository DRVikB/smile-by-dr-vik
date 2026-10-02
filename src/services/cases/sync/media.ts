import type { CaseLogEntry, CaseLogMedia, SmileCase } from "@/lib/types";
import { assetPath, type AssetKind, type Json, type PatientState, type PatientSummary } from "./types";
import type { LocalAsset, PatientLocalStore } from "./localStore";
import type { WorkspaceLease } from "@/lib/workspace";
export async function checksum(blob:Blob):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,"0")).join("");}
export function dataUrlBlob(value:string):Blob {
 const m=/^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(value);if(!m)throw new Error("Unsupported local media.");
 const binary=atob(m[2]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type:m[1]});
}
export async function blobDataUrl(blob:Blob):Promise<string>{
 const bytes=new Uint8Array(await blob.arrayBuffer());let text="";for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return `data:${blob.type};base64,${btoa(text)}`;
}
const kindFor=(path:string):AssetKind=>/(\.thumb|\.draftThumb)$/.test(path)?"THUMBNAIL":/editMask$/.test(path)?"EDIT_MASK":/reference\./.test(path)?"REFERENCE_PHOTO":/originalDataUrl$/.test(path)?"ORIGINAL_PHOTO":/originalImage$/.test(path)?"PREPARED_PHOTO":/photo\.dataUrl$/.test(path)?"PREPARED_PHOTO":/report/i.test(path)?"REPORT":"GENERATED_CONCEPT";
async function dimensions(blob:Blob):Promise<{width:number|null;height:number|null}>{
 if(typeof createImageBitmap!=="function"||!blob.type.startsWith("image/"))return {width:null,height:null};
 try{const image=await createImageBitmap(blob);const size={width:image.width,height:image.height};image.close();return size;}catch{return {width:null,height:null};}
}
/** Converts every media leaf, retaining all existing clinical fields without a second settings model. */
export async function encodePatientState(scope:WorkspaceLease,store:PatientLocalStore,caseId:string,input:{entries:CaseLogEntry[];media:CaseLogMedia[];draft:SmileCase|null;preferredDesignId?:string|null;draftThumb?:Json;caseStatus?:PatientState["caseStatus"]}) {
 if(scope.owner.kind!=="account")throw new Error("Patient sync needs an account.");
 const existing=(await store.assets()).filter(a=>a.meta.caseId===caseId),assets:LocalAsset[]=[];
 async function encode(value:unknown,path:string):Promise<Json>{
  scope.assert();if(value===undefined)return null;
  if(typeof value==="string"&&value.startsWith("data:")) {
   const blob=dataUrlBlob(value),hash=await checksum(blob);scope.assert();const kind=kindFor(path);
   let a=[...existing,...assets].find(a=>a.meta.checksum===hash&&a.meta.kind===kind);
   if(!a){const id=crypto.randomUUID();const size=await dimensions(blob);scope.assert();
    a={id,blob,pending:true,lastAccess:Date.now(),meta:{id,ownerUserId:scope.owner.kind==="account"?scope.owner.userId:"",caseId,kind,objectPath:assetPath(scope.owner.kind==="account"?scope.owner.userId:"",caseId,id,kind),mimeType:blob.type,...size,byteSize:blob.size,checksum:hash,
      provenance:kind==="ORIGINAL_PHOTO"?"original":kind==="PREPARED_PHOTO"?(input.draft?.photo.sourceProvenance==="prepared"||input.media.some(m=>m.photoMetadata?.sourceProvenance==="prepared")?"prepared":"legacy-prepared-original"):kind==="EDIT_MASK"?"mask":kind==="REFERENCE_PHOTO"?"reference":kind==="REPORT"?"report":"generated",createdAt:new Date().toISOString(),uploadStatus:"pending"}};assets.push(a);
   }else if(!a.blob){a={...a,blob,lastAccess:Date.now()};assets.push(a);}
   return {$asset:a.id};
  }
  if(typeof value==="string"&&/^(blob:|https?:\/\/)/i.test(value))throw new Error("Only local binary media can be synced; URLs are not durable identifiers.");
  if(value===null||typeof value==="string"||typeof value==="boolean")return value;
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  if(Array.isArray(value))return Promise.all(value.map((v,i)=>encode(v,`${path}.${i}`)));
  if(typeof value==="object"&&value){const result:Record<string,Json>={};for(const [k,v]of Object.entries(value))if(v!==undefined)result[k]=await encode(v,`${path}.${k}`);return result;}
  return null;
 }
 const encoded=await encode({...input,schemaVersion:1,preferredDesignId:input.preferredDesignId??null},"") as unknown as PatientState;
 const entries=encoded.entries,first=entries[0] as Record<string,Json>|undefined;
 const smallEntries=entries.map(e=>{const value=e as Record<string,Json>;return Object.fromEntries(Object.entries(value).filter(([key])=>["id","caseId","patientName","createdAt","mode","testMode","label","summary","thumb","archivedAt","deletedAt","favourite","draftOnly"].includes(key)));});
 const summary:PatientSummary={entries:smallEntries,patientName:input.entries.find(e=>e.patientName)?.patientName??input.draft?.patientName??"",visualisationCount:entries.length,thumbnail:first?.thumb??encoded.draftThumb??null};
 return {state:encoded,summary,assets};
}
export async function hydrate<T>(value:Json,load:(id:string)=>Promise<Blob>,scope:WorkspaceLease):Promise<T>{
 async function walk(v:Json):Promise<unknown>{
  scope.assert();if(v&&typeof v==="object"&&!Array.isArray(v)&&typeof v.$asset==="string"){const b=await load(v.$asset);scope.assert();return blobDataUrl(b);}
  if(Array.isArray(v))return Promise.all(v.map(walk));
  if(v&&typeof v==="object"){const out:Record<string,unknown>={};for(const [k,x]of Object.entries(v))out[k]=await walk(x);return out;}return v;
 }
 const result=await walk(value);scope.assert();return result as T;
}
export function referencedAssets(value:unknown):Set<string>{
 const found=new Set<string>();function walk(v:unknown){if(!v||typeof v!=="object")return;if(!Array.isArray(v)&&"$asset"in v&&typeof v.$asset==="string")found.add(v.$asset);else for(const x of Object.values(v))walk(x);}walk(value);return found;
}
