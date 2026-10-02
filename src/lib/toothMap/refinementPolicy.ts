import type { ToothMap } from "./types";
/** A selection alone never starts detection; individual mapping is opt-in. */
export function needsDetection({single,custom,review,show,guides,requested}:{single:boolean;custom:boolean;review:boolean;show:boolean;guides:boolean;requested:boolean}){
  return custom||review||requested||(single&&(show||guides));
}
/** Valid reviewed/saved maps never trigger SAM. */
export function needsRefinement(map:ToothMap|null,{single,custom,review}:{single:boolean;custom:boolean;review:boolean}){
  return Boolean(map&&!map.confirmedByClinician&&map.method==="on-device-v1"&&(single||custom||review));
}
export function createRefinementCache<T>(limit=3){
  const cache=new Map<string,T>();
  return {get(key:string){const value=cache.get(key);if(value!==undefined){cache.delete(key);cache.set(key,value);}return value;},set(key:string,value:T){cache.set(key,value);while(cache.size>limit)cache.delete(cache.keys().next().value!);},clear(){cache.clear();}};
}
