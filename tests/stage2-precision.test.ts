import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditRegion, compositeWithAlpha, influenceOutline, measureChange, toothEditRule } from '../src/lib/toothMap/masks';
import { protectionPlan } from '../src/lib/toothMap/protect';
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
test('partial preset, stale photo, unreviewed map, duplicate FDI and zero-area boundaries cannot start precision',()=>{
 assert.deepEqual(protectionPlan({...map,teeth:map.teeth.slice(1)},photo,settings(upperTeeth[10])),{ok:false,reason:'incomplete-map'});
 assert.deepEqual(protectionPlan(map,photo+'changed',settings([11])),{ok:false,reason:'stale-map'});
 assert.deepEqual(protectionPlan({...map,confirmedByClinician:false},photo,settings([11])),{ok:false,reason:'unconfirmed'});
 assert.deepEqual(protectionPlan({...map,teeth:[...map.teeth,map.teeth[4]]},photo,settings([11])),{ok:false,reason:'invalid-boundary'});
 assert.deepEqual(protectionPlan({...map,teeth:map.teeth.map(t=>t.fdi===11?{...t,outline:[[0.1,0.1],[0.2,0.2],[0.3,0.3]]}:t)},photo,settings([11])),{ok:false,reason:'invalid-boundary'});
});
test('alignment and full arch retain their independent paths',()=>{assert.deepEqual(protectionPlan(undefined,photo,settings([11],{alignment:{arches:'Upper'}})),{ok:false,reason:'alignment'});assert.deepEqual(protectionPlan(undefined,photo,settings([],{treatmentMode:'full_arch',fullArch:{arch:'both',restorationType:'zirconia',prostheticGingiva:'auto'}})),{ok:false,reason:'full-arch'});});
test('44-pixel invisible touch targets resolve overlapping areas to the nearest tooth',()=>{const targets=[hitTarget({key:'11',fdi:11,x:10,y:10,width:10,height:15},0.5),hitTarget({key:'21',fdi:21,x:24,y:10,width:10,height:15},0.5)];assert.equal(targets[0].width*0.5,44);assert.equal(targets[0].height*0.5,44);assert.equal(nearestHit(targets,15,17)?.fdi,11);assert.equal(nearestHit(targets,29,17)?.fdi,21);assert.equal(nearestHit(targets,500,500),undefined);});
