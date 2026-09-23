import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, type LibraryCase } from '../src/lib/types';
import { updateToothPlan, toothSummary } from '../src/lib/teeth';
import { settingsSchema } from '../src/lib/generation/schema';
import { buildSmileInstruction } from '../src/lib/generation/prompt';
import { isNoChangeDesign } from '../src/lib/generation/designPlan';
import { chooseLibraryCases, addLibraryCase, clearLibrary, updateLibraryContext, exportLibrary, importLibrary, readLibraryMedia, listLibrary, loadStyleReferences, deleteLibraryCase } from '../src/lib/caseLibrary';
import { validationRecords, saveValidationRecord, validationSchema } from '../src/lib/validation';
import { handleGenerationRequest } from '../src/lib/generation/handler';
import { claimInMemory } from '../src/lib/generation/requestGuard';
import { exceedsRequestLimit, previewFingerprint } from '../src/lib/generation/requestPolicy';
import { preferenceRows } from '../src/lib/report';
import { saveCase, readCase } from '../src/lib/storage';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const mixed = updateToothPlan(defaultSettings, { tooth: 31, intent: 'Shade only', condition: 'Natural', targetShade: 'The same' });
test('an asymmetric mixed-arch plan validates and survives storage', async () => {
  assert.equal(settingsSchema.safeParse(mixed).success, true);
  assert.equal(toothSummary(mixed), '8 upper + 1 lower teeth');
  await saveCase({ photo: { dataUrl: png, width: 1, height: 1, name: 'case' }, settings: mixed, result: null, screen: 'design', requestLimit: 5, validationCaseId: 'held-out' });
  assert.deepEqual((await readCase())?.settings.toothPlans, mixed.toothPlans);
  assert.equal((await readCase())?.requestLimit, 5);
  await saveCase(null);
});
test('missing and preserved teeth are never active, other teeth keep their instructions', () => {
  const missing = updateToothPlan(mixed, { tooth: 11, intent: 'Reshape', condition: 'Missing' });
  assert.equal(settingsSchema.safeParse(missing).success, true);
  assert.equal(missing.selectedTeeth.includes(11), false);
  assert.equal(missing.selectedTeeth.includes(31), true);
  assert.equal(settingsSchema.safeParse({ ...missing, selectedTeeth: [...missing.selectedTeeth,11] }).success, false);
});
test('invalid, duplicate and contradictory tooth plans fail validation', () => {
  for (const s of [
    { ...mixed, selectedTeeth: [...mixed.selectedTeeth,31] },
    { ...mixed, toothPlans: [...mixed.toothPlans!,mixed.toothPlans![0]] },
    { ...mixed, selectedTeeth: [99], toothPlans: [{ tooth: 99, intent:'Reshape', condition:'Natural' }] },
    { ...mixed, selectedTeeth: [] },
  ]) assert.equal(settingsSchema.safeParse(s).success,false);
});
test('individual instructions replace global shade and preserve untreated arches', () => {
  const prompt = buildSmileInstruction(mixed);
  assert.match(prompt,/FDI 31: Natural; shade The same/);
  assert.match(prompt,/individual tooth goals\/shades/);
  assert.match(prompt,/BOTH arches exactly/);
  assert.doesNotMatch(prompt,/Do not whiten the lower/);
  assert.ok(preferenceRows(mixed).some(([k,v]) => k === 'Tooth 31' && v.includes('Shade only') && v.includes('The same')));
});
test('no-change detection considers individual shade overrides and empty custom plans', () => {
  const unchanged = { ...defaultSettings, designIntent: 'Shade only' as const, targetShade: 'The same' as const };
  assert.equal(isNoChangeDesign(unchanged),true);
  assert.equal(isNoChangeDesign(updateToothPlan(unchanged,{tooth:31,intent:'Shade only',condition:'Natural',targetShade:'Whiten'})),false);
  assert.equal(isNoChangeDesign({ ...defaultSettings, selectedTeeth: [], toothPlans: [] }),true);
});
const oldMatch: LibraryCase = { id:'matched',material:'Layered composite',label:'old match',addedAt:1,context:{features:['Wear / chips'],teeth:[11,21],adjuncts:[]} };
const recent: LibraryCase = { id:'recent',material:'Layered composite',label:'recent',addedAt:100 };
const heldOut: LibraryCase = { ...oldMatch,id:'heldout',addedAt:1000,validationOnly:true };
test('starting conditions outrank recency; held-out outcomes never appear even when pinned', () => {
  const settings = { ...defaultSettings,caseFeatures:['Wear / chips'] as const };
  const query = { ...settings,caseFeatures:[...settings.caseFeatures] };
  assert.deepEqual(chooseLibraryCases([recent,heldOut,oldMatch],'Layered composite',[],3,query).map(c => c.id),['matched','recent']);
  assert.deepEqual(chooseLibraryCases([heldOut],'Layered composite',['heldout']),[]);
});
test('paired case, context and holdout survive export/import; duplicate target image is excluded', async () => {
  await clearLibrary(); await addLibraryCase(oldMatch,{id:oldMatch.id,image:png,thumb:png});
  await updateLibraryContext(oldMatch.id,{context:{features:['Gaps'],teeth:[11,21],adjuncts:['Whitening'],followUpWeeks:4},validationOnly:true},png);
  const data = await exportLibrary(); await clearLibrary(); await importLibrary(data);
  assert.equal((await readLibraryMedia(oldMatch.id))?.beforeImage,png);
  assert.deepEqual((await listLibrary())[0].context,data.cases[0].context);
  assert.equal((await listLibrary())[0].validationOnly,true);
  assert.deepEqual(await loadStyleReferences([oldMatch.id],png),[]);
  await clearLibrary();
});
test('validation requires all four ratings; stores no photographs; deletion clears scores', async () => {
  await addLibraryCase(oldMatch,{id:oldMatch.id,image:png,thumb:png});
  const record = { id:'rating',caseId:oldMatch.id,variationId:'preview',createdAt:Date.now(),reviewer:'Dr Vik',notes:'Inspect incisal edges',settings:mixed,scores:{'Tooth contours':3,'Gums preserved':5,'Untreated teeth preserved':5,'Material appearance':4} };
  assert.equal(validationSchema.safeParse({...record,scores:{'Tooth contours':3}}).success,false);
  await saveValidationRecord(record); assert.equal((await validationRecords()).length,1);
  assert.doesNotMatch(JSON.stringify(await validationRecords()),/data:image/);
  await deleteLibraryCase(oldMatch.id); assert.equal((await validationRecords()).length,0);
});
function request(id: string) { return new Request('https://smile.test/api/generate-smile',{method:'POST',headers:{'Content-Type':'application/json','X-Smile-Request-Id':id},body:JSON.stringify({originalImage:png,settings:defaultSettings})}); }
test('atomic claims stop concurrent duplicate submissions', async () => {
  const id = crypto.randomUUID();
  const outcomes = await Promise.all([claimInMemory(id),claimInMemory(id),claimInMemory(id)]);
  assert.deepEqual(outcomes,[true,false,false]);
  const requestId = crypto.randomUUID();
  const replies = await Promise.all([handleGenerationRequest(request(requestId),{SMILE_PROVIDER:'mock'}),handleGenerationRequest(request(requestId),{SMILE_PROVIDER:'mock'})]);
  assert.deepEqual(replies.map(r => r.status).sort(),[200,409]);
});
test('guard failures stop generation rather than bypassing protection', async () => {
  const r = await handleGenerationRequest(request(crypto.randomUUID()),{SMILE_PROVIDER:'mock'},async () => {throw new Error('store unavailable');});
  assert.equal(r.status,503); assert.equal((await r.json()).code,'request_guard_unavailable');
});
test('case allowance includes failures and accounts for full batch size', () => {
  assert.equal(exceedsRequestLimit(3,3,5),true); assert.equal(exceedsRequestLimit(3,2,5),false); assert.equal(exceedsRequestLimit(100,3,0),false);
});
test('reusable result fingerprint changes with resolution, references or edit mask', async () => {
  const input={settings:mixed,image:png,resolution:'1K',references:[]};
  const first=await previewFingerprint(input); assert.equal(first,await previewFingerprint(structuredClone(input)));
  assert.notEqual(first,await previewFingerprint({...input,resolution:'512'}));
  assert.notEqual(first,await previewFingerprint({...input,editMask:png}));
  assert.notEqual(first,await previewFingerprint({...input,references:[png]}));
});

test('identical tooth rules are grouped to keep paid prompt input small', () => {
  const prompt = buildSmileInstruction(mixed);
  assert.equal(prompt.split("AUTO: Choose the smallest").length - 1, 1);
  assert.equal(prompt.split("SHADE ONLY: Change only").length - 1, 1);
  assert.match(prompt, /FDI 11, 12, 13, 14, 21, 22, 23, 24: Natural/);
});
