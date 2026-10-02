/** Transfer colour, never candidate anatomy, for shade-only edits. */
export function shadeOnlyPixels(original:Uint8ClampedArray,candidate:Uint8ClampedArray,exact:Uint8Array):Uint8ClampedArray{
  const out=new Uint8ClampedArray(candidate),hist=[new Uint32Array(511),new Uint32Array(511),new Uint32Array(511)];let count=0;
  for(let i=0,p=0;i<exact.length;i++,p+=4){
    if(!exact[i]||original[p]<40||original[p+1]<40||original[p+2]<40||original[p]>245)continue;
    count++;for(let c=0;c<3;c++)hist[c][candidate[p+c]-original[p+c]+255]++;
  }
  const delta=hist.map(h=>{let n=0;for(let i=0;i<h.length;i++){n+=h[i];if(n>count/2)return Math.max(-35,Math.min(55,i-255));}return 0;});
  for(let i=0,p=0;i<exact.length;i++,p+=4)if(exact[i]){
    for(let c=0;c<3;c++)out[p+c]=Math.max(0,Math.min(255,original[p+c]+delta[c]));out[p+3]=original[p+3];
  }
  return out;
}
