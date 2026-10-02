import test from 'node:test';
import assert from 'node:assert/strict';
import {buildImageEditPrompt} from '../src/lib/generation/imageEditPrompt';
import {buildSmileInstruction} from '../src/lib/generation/prompt';
import {defaultSettings} from '../src/lib/types';

test('photographic request keeps the essential envelope and drops impossible exact-size demands',()=>{
 const p=buildImageEditPrompt(defaultSettings);
 assert.ok(p.length<buildSmileInstruction(defaultSettings).length*.6);
 assert.match(p,/face, expression, lips, mouth opening, gums/);
 assert.match(p,/same visible upper\/lower tooth exposure/);
 assert.match(p,/intact central incisor must not become longer/);
 assert.match(p,/preserve untreated teeth in both arches/);
 assert.match(p,/ONE complete edited source photograph/);
 assert.match(p,/Never return an enlarged mouth, isolated teeth, a close-up crop/);
 assert.doesNotMatch(p,/exactly the same pixel dimensions/);
});
test('individual Preserve and Missing teeth remain excluded from editable selection',()=>{
 const p=buildImageEditPrompt({...defaultSettings,selectedTeeth:[11,21,23],toothPlans:[{tooth:11,intent:'Preserve',condition:'Natural'},{tooth:21,intent:'Auto',condition:'Missing'},{tooth:23,intent:'Shade only',condition:'Restored',targetShade:'The same'}]});
 assert.match(p,/selected teeth \(FDI: 23\)/);
 assert.match(p,/FDI 11: Natural, preserve unchanged/);
 assert.match(p,/FDI 21: Missing, preserve unchanged/);
 assert.match(p,/FDI 23: Restored; keep edge positions and length unchanged; shade The same/);
 assert.match(p,/does not imply this restoration can be whitened/);
});
test('repair, gap and shade goals stay scoped and carry the established permissions',()=>{
 const p=buildImageEditPrompt({...defaultSettings,toothPlans:[{tooth:11,intent:'Repair edges',condition:'Natural'},{tooth:21,intent:'Close gaps',condition:'Natural'},{tooth:23,intent:'Shade only',condition:'Natural'}]});
 assert.match(p,/Only FDI 11: REPAIR EDGES/);assert.match(p,/Only FDI 21: CLOSE GAPS/);assert.match(p,/Only FDI 23: SHADE ONLY/);
 assert.match(p,/do not lower its entire edge/);assert.match(p,/keep incisal edge length unchanged/);
});
test('single shade, layering and porcelain retain distinct optics without automatic extra length',()=>{
 for(const [treatment,word] of [['Single-shade composite','no separate enamel/dentine layers'],['Layered composite','slight incisal translucency'],['Porcelain','realistic glaze']] as const){
  const p=buildImageEditPrompt({...defaultSettings,treatment});assert.ok(p.includes(word));assert.match(p,/material change/);
 }
});
test('clinical restrictions and explicit per-tooth length remain represented',()=>{
 const p=buildImageEditPrompt({...defaultSettings,toothPlans:[{tooth:11,intent:'Reshape',condition:'Natural',length:1}],clinicalData:{restorativeSpace:'Limited / uncertain',overbiteMm:5},notes:'Do not close gaps'});
 assert.match(p,/FDI 11: Natural; clinician requests slightly longer/);assert.match(p,/SPACE RESTRICTION/);assert.match(p,/Measured overbite: 5 mm/);assert.match(p,/Honour negations/);
});
test('alignment remains a scoped exception without gum motion or extra crown length',()=>{
 const p=buildImageEditPrompt({...defaultSettings,alignment:{arches:'Both',only:true}});
 assert.match(p,/separately permits repositioning/);assert.match(p,/Natural gum tissue and visible margins stay exactly as photographed/);assert.match(p,/ALIGNMENT ONLY/);
});
test('full-arch reconstruction stays conditional and keeps the original visible envelope',()=>{
 const p=buildImageEditPrompt({...defaultSettings,treatmentMode:'full_arch',fullArch:{arch:'upper',restorationType:'zirconia',prostheticGingiva:'exclude'}});
 assert.match(p,/replace compromised/);assert.match(p,/NATURAL SOFT TISSUE IS PROTECTED/);assert.match(p,/the lower arch/);assert.doesNotMatch(p,/exactly the same pixel dimensions/);
});
