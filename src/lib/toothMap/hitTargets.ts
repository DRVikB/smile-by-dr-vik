export interface ToothHitTarget { key:string; fdi:number|null; regionId?:string; x:number; y:number; width:number; height:number }
/** Invisible 44 CSS-pixel targets in photo coordinates; overlapping targets resolve to the nearest tooth. */
export function hitTarget(target:ToothHitTarget, pixelsPerPhotoPixel:number):ToothHitTarget {
  const min=44/Math.max(0.000001,pixelsPerPhotoPixel);
  const width=Math.max(target.width,min),height=Math.max(target.height,min);
  return {...target,x:target.x-(width-target.width)/2,y:target.y-(height-target.height)/2,width,height};
}
export function nearestHit(targets:ToothHitTarget[],x:number,y:number):ToothHitTarget|undefined {
  return targets.filter(t=>x>=t.x&&x<=t.x+t.width&&y>=t.y&&y<=t.y+t.height)
    .sort((a,b)=>Math.hypot(x-a.x-a.width/2,y-a.y-a.height/2)-Math.hypot(x-b.x-b.width/2,y-b.y-b.height/2))[0];
}
