import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditRegion, compositeWithAlpha, influenceOutline, measureChange, toothEditRule } from '../src/lib/toothMap/masks';
import { generationProtectionPlan, protectionPlan } from '../src/lib/toothMap/protect';
import { shadeOnlyPixels } from '../src/lib/toothMap/shade';
import { fillPolygon, type Point } from '../src/lib/toothMap/segment';
import { photoFingerprint, type ToothMap } from '../src/lib/toothMap/types';
import { defaultSettings, upperTeeth, type SmileSettings } from '../src/lib/types';
import { hitTarget, nearestHit } from '../src/lib/toothMap/hitTargets';
const W=240,H=120,photo='data:image/jpeg;base64,stage2-fixture';
const fdis=[15,14,13,12,11,21,22,23,24,25];
const outlines:Point[][]=fdis.map((_,i)=>[[10+i*22,30],[28+i*22,30],[28+i*22,68],[10+i*22,68]]);
const mouth:Point[]=[[5,24],[235,24],[235,87],[5,87]];
const settings=(selectedTeeth:number[],patch:Partial<SmileSettings>={}):SmileSettings=>({...defaultSettings,selectedTeeth,...patch});
const map:ToothMap={photoId:photoFingerprint(photo),version:1,arch:'upper',method:'manual',confirmedByClinician:true,mouthOpening:mouth.map(([x,y])=>[x/W,y/H]),teeth:outlines.map((o,i)=>({id:`t${i}`,fdi:fdis[i],detectedIndex:i,confidence:null,bbox:{x:o[0][0]/W,y:30/H,width:18/W,height:38/H},centroid:{x:(19+i*22)/W,y:49/H},outline:o.map(([x,y])=>[x/W,y/H]),exactMaskRef:`t${i}`,visible:true,selected:false,requiresReview:false,source:'manual'}))};
test('generation uses reviewed outlines only for a single active tooth; old multi-tooth maps cannot clip a preset result',()=>{
 for(const n of [4,6,8,10] as const)assert.deepEqual(generationProtectionPlan(map,photo,settings(upperTeeth[n])),{ok:false,reason:'multiple-teeth'});
 assert.equal(generationProtectionPlan(map,photo,settings([23])).ok,true);
 assert.equal(generationProtectionPlan(undefined,photo,settings([23])).ok,false);
});
function image(){const pixels=new Uint8ClampedArray(W*H*4);for(let i=0;i<W*H;i++)pixels.set([45,30,30,255],i*4);for(const outline of outlines){const mask=fillPolygon(outline,W,H);for(let i=0;i<mask.length;i++)if(mask[i])pixels.set([190,185,175,255],i*4);}return pixels;}
function region(selected:number[],patch:Partial<SmileSettings>={},original?:Uint8ClampedArray){return buildEditRegion({width:W,height:H,selected:outlines.filter((_,i)=>selected.includes(fdis[i])).map((outline,i)=>({outline,rule:toothEditRule(settings(selected,patch),{tooth:selected[i],intent:'Auto',condition:'Natural'})})),protectedTeeth:outlines.filter((_,i)=>!selected.includes(fdis[i])),mouthOpening:mouth,original,feather:1});}
for(const n of [4,6,8,10] as const)test(`${n} selected teeth: complete map; union changes selected teeth only`,()=>{
 assert.equal(protectionPlan(map,photo,settings(upperTeeth[n])).ok,true);
 const r=region(upperTeeth[n]),original=image(),final=compositeWithAlpha(original,new Uint8ClampedArray(original.length).fill(255),r.alpha);
 assert.equal(measureChange(original,final,r.allowed,0).outside,0);
 for(let i=0;i<fdis.length;i++){const offset=(49*W+19+i*22)*4;assert.equal(final[offset]!==original[offset],upperTeeth[n].includes(fdis[i]));}
 assert.equal(r.allowed[49*W+1],0,'not a mouth rectangle');
});
test('Custom separated multi-tooth selection protects intervening teeth',()=>{const s=[14,11,23];assert.equal(protectionPlan(map,photo,settings(s)).ok,true);const r=region(s);for(let i=0;i<fdis.length;i++)assert.equal(Boolean(r.allowed[49*W+19+i*22]),s.includes(fdis[i]));});
test('whitening is exact enamel, with no incisal or cervical enlargement',()=>{const r=region([11],{designIntent:'Shade only'}),m=fillPolygon(outlines[4],W,H);assert.deepEqual(r.allowed,m);});
test('shade-only keeps original gradients/anatomy instead of copying AI geometry',()=>{const original=image(),candidate=new Uint8ClampedArray(original);const m=fillPolygon(outlines[4],W,H);for(let i=0;i<m.length;i++)if(m[i]){original[i*4]=150+i%15;candidate[i*4]=200+i%15;}const out=shadeOnlyPixels(original,candidate,m);for(let i=0;i<m.length;i++)if(m[i])assert.equal(out[i*4]-original[i*4],50);});
test('composite influence stays conservative and porcelain has more local room',()=>{const a=region([11],{treatment:'Single-shade composite'}),b=region([11],{treatment:'Porcelain'});assert.ok(b.allowed.reduce((a,b)=>a+b,0)>a.allowed.reduce((a,b)=>a+b,0));assert.equal(a.allowed[29*W+98],0);});
test('lower teeth expand incisally upwards, not into the lower gum',()=>{const rule=toothEditRule(settings([31]),{tooth:31,intent:'Auto',condition:'Natural'});const grown=influenceOutline([[60,70],[80,70],[80,100],[60,100]],rule);assert.ok(Math.min(...grown.map(p=>p[1]))<70);assert.equal(Math.max(...grown.map(p=>p[1])),100);});
test('unselected tooth restoration includes unknown/unassigned map outlines',()=>{const r=buildEditRegion({width:W,height:H,selected:[{outline:outlines[4],rule:toothEditRule(settings([11]),undefined)}],protectedTeeth:[[[95,65],[125,65],[125,80],[95,80]]],mouthOpening:mouth,feather:1});assert.equal(r.allowed[70*W+110],0);});
test('gingival scallop and lip/face pixels remain original against a hostile full-image edit',()=>{const r=region([11,21]),original=image(),hostile=new Uint8ClampedArray(original.length).fill(255),final=compositeWithAlpha(original,hostile,r.alpha);for(let y=0;y<30;y++)for(let x=0;x<W;x++)assert.equal(final[(y*W+x)*4],original[(y*W+x)*4]);assert.equal(measureChange(original,final,r.allowed,0).outside,0);});
test('unmapped lower enamel and pink gingiva block contour extension',()=>{const original=image();for(let y=68;y<80;y++)for(let x=95;x<125;x++)original.set(x<110?[200,190,170,255]:[170,75,85,255],(y*W+x)*4);const r=region([11],{},original);assert.equal(r.allowed[69*W+103],0);assert.equal(r.allowed[69*W+113],0);});
test('without a trustworthy lip boundary, morphology is limited to exact teeth',()=>{const r=buildEditRegion({width:W,height:H,selected:[{outline:outlines[4],rule:toothEditRule(settings([11]),undefined)}],protectedTeeth:[],feather:0});assert.deepEqual(r.allowed,fillPolygon(outlines[4],W,H));});
test('reviewed tooth enamel stays editable regardless of source colour',()=>{for(const colour of [[80,45,50,255],[170,75,85,255],[200,170,120,255]]){const original=image(),p=(40*W+110)*4;original.set(colour,p);const r=region([11],{},original);assert.equal(r.allowed[40*W+110],1);}});
test('partial preset, stale photo, unreviewed map, duplicate FDI and zero-area boundaries cannot start precision',()=>{
 assert.deepEqual(protectionPlan({...map,teeth:map.teeth.slice(1)},photo,settings(upperTeeth[10])),{ok:false,reason:'incomplete-map'});
 assert.deepEqual(protectionPlan(map,photo+'changed',settings([11])),{ok:false,reason:'stale-map'});
 assert.deepEqual(protectionPlan({...map,confirmedByClinician:false},photo,settings([11])),{ok:false,reason:'unconfirmed'});
 assert.deepEqual(protectionPlan({...map,teeth:[...map.teeth,map.teeth[4]]},photo,settings([11])),{ok:false,reason:'invalid-boundary'});
 assert.deepEqual(protectionPlan({...map,teeth:map.teeth.map(t=>t.fdi===11?{...t,outline:[[0.1,0.1],[0.2,0.2],[0.3,0.3]]}:t)},photo,settings([11])),{ok:false,reason:'invalid-boundary'});
});
test('alignment and full arch retain their independent paths',()=>{assert.deepEqual(protectionPlan(undefined,photo,settings([11],{alignment:{arches:'Upper'}})),{ok:false,reason:'alignment'});assert.deepEqual(protectionPlan(undefined,photo,settings([],{treatmentMode:'full_arch',fullArch:{arch:'both',restorationType:'zirconia',prostheticGingiva:'auto'}})),{ok:false,reason:'full-arch'});});
test('44-pixel invisible touch targets resolve overlapping areas to the nearest tooth',()=>{const targets=[hitTarget({key:'11',fdi:11,x:10,y:10,width:10,height:15},0.5),hitTarget({key:'21',fdi:21,x:24,y:10,width:10,height:15},0.5)];assert.equal(targets[0].width*0.5,44);assert.equal(targets[0].height*0.5,44);assert.equal(nearestHit(targets,15,17)?.fdi,11);assert.equal(nearestHit(targets,29,17)?.fdi,21);assert.equal(nearestHit(targets,500,500),undefined);});

// Automatic maps, restorative designs: one smooth band per arch instead of per-tooth outlines.
test('an automatic restorative edit is one band: room to lengthen, no gaps between teeth, neighbours and the far arch protected',()=>{
  const BW=240,BH=160;
  const box=(x0:number,y0:number,x1:number,y1:number):[number,number][]=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  // Four worn upper teeth with small gaps, an unselected upper tooth either side, and lower teeth just beneath.
  const uppers=[box(70,50,92,80),box(96,50,118,80),box(122,50,144,80),box(148,50,170,80)];
  const besides=[box(44,52,66,78),box(174,52,196,78)];
  const lowers=[box(80,84,110,120),box(112,84,142,120),box(144,84,170,120)];
  const mouthOpening=box(30,40,210,130);
  const rule=toothEditRule(settings([12,11,21,22],{treatment:'Porcelain'}),{tooth:11,intent:'Auto',condition:'Natural'});
  const input={width:BW,height:BH,selected:uppers.map(outline=>({outline,rule})),protectedTeeth:[...besides,...lowers],mouthOpening,feather:2};
  const outlines_=buildEditRegion(input),band=buildEditRegion({...input,band:true});
  const at=(r:{allowed:Uint8Array},x:number,y:number)=>r.allowed[y*BW+x];
  // Between two teeth, and just past the worn incisal edge over a lower tooth: clipped before, part of the edit now.
  assert.equal(at(outlines_,94,65),0);assert.equal(at(band,94,65),1);
  assert.equal(at(outlines_,105,88),0);assert.equal(at(band,105,88),1);
  // Every row of the band is one unbroken run: no notches for the lower teeth to show through.
  for(let y=52;y<=90;y++){let runs=0,inside=false;for(let x=0;x<BW;x++){const on=band.allowed[y*BW+x]===1;if(on&&!inside)runs++;inside=on;}assert.equal(runs,1,`row ${y}`);}
  // Still protected: the teeth beside the band, the lower teeth beyond its reach, and everything outside the mouth.
  assert.equal(at(band,55,65),0);assert.equal(at(band,185,65),0);
  assert.equal(at(band,105,110),0);assert.equal(at(band,120,35),0);
  // Nothing above the gum margins of the selected teeth.
  for(let x=70;x<=170;x++)assert.equal(at(band,x,46),0);
  // A soft edge: full strength inside, fading before the boundary.
  assert.equal(band.alpha[65*BW+120],255);assert.ok(band.alpha[92*BW+120]<255);
});
test('a band never applies to shade-only teeth or without the inner-lip boundary',()=>{
  const box=(x0:number,y0:number,x1:number,y1:number):[number,number][]=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  const teeth=[box(70,50,92,80),box(96,50,118,80)];
  const shade={exactOnly:true,lateral:0,incisal:0,cervical:0};
  const form=toothEditRule(settings([11,21],{treatment:'Porcelain'}),{tooth:11,intent:'Auto',condition:'Natural'});
  const shadeOnly=buildEditRegion({width:240,height:160,selected:teeth.map(outline=>({outline,rule:shade})),protectedTeeth:[],mouthOpening:box(30,40,210,130),feather:0,band:true});
  assert.equal(shadeOnly.allowed[65*240+94],0);
  const noMouth=buildEditRegion({width:240,height:160,selected:teeth.map(outline=>({outline,rule:form})),protectedTeeth:[],mouthOpening:null,feather:0,band:true});
  assert.equal(noMouth.allowed[65*240+94],0);assert.equal(noMouth.allowed[88*240+105],0);
});
