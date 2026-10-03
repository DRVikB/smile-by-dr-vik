import test from "node:test";
import assert from "node:assert/strict";
import { planMouthLock } from "../src/lib/face/lock";
import { STABLE_POINTS, INNER_LIP, type Point } from "../src/lib/face/geometry";
import { safeGenerationDiagnostic } from "../src/services/ai/generationDiagnostics";
function face(): Point[] {
 const p:Point[]=Array.from({length:478},(_,i)=>[200+i%40,100+Math.floor(i/40)]);
 const anchors:Point[]=[[200,100],[300,100],[400,100],[500,100],[240,200],[340,200],[440,200],[540,200],[220,300],[520,300]];
 STABLE_POINTS.forEach((n,i)=>p[n]=anchors[i]);p[61]=[300,400];p[291]=[500,400];
 INNER_LIP.forEach((n,i)=>p[n]=[400+90*Math.cos(i/20*2*Math.PI),400+20*Math.sin(i/20*2*Math.PI)]);return p;
}
function inspect(a:Point[]|null,b:Point[]|null) { let evidence:Record<string,unknown>|undefined;
 const invoke=planMouthLock as (a:Point[]|null,b:Point[]|null,report:(d:Record<string,unknown>)=>void)=>ReturnType<typeof planMouthLock>;
 const plan=invoke(a,b,d=>evidence=d);return {plan,evidence}; }
for(const [name,a,b,want] of [
 ["absent source",null,face(),"source_landmarks_missing"],
 ["incomplete source",[],face(),"source_landmarks_invalid"],
 ["absent generated",face(),null,"generated_landmarks_missing"],
 ["incomplete generated",face(),[],"generated_landmarks_invalid"],
] as const) test(`mouth rejection identifies ${name}`,()=>{const r=inspect(a as Point[]|null,b as Point[]|null);assert.equal(r.plan,null);assert.equal(r.evidence?.rejection,want);});
test("non-finite source and generated points have distinct invalid categories",()=>{
 for(const side of ["source","generated"]){const a=face(),b=face();(side==="source"?a:b)[33]=[NaN,10];const r=inspect(a,b);assert.equal(r.plan,null);assert.equal(r.evidence?.rejection,`${side}_landmarks_invalid`);}
});
test("insufficient source mouth width is reported without pretending to be a crop",()=>{const a=face();a[291]=[310,400];const r=inspect(a,face());assert.equal(r.plan,null);assert.equal(r.evidence?.rejection,"mouth_width_insufficient");assert.equal(r.evidence?.sourceMouthWidth,10);});
test("scale rejection records the fitted scale with existing limits",()=>{const r=inspect(face(),face().map(([x,y])=>[x*1.3,y*1.3]));assert.equal(r.plan,null);assert.equal(r.evidence?.rejection,"similarity_scale_out_of_range");assert.ok(Math.abs(Number(r.evidence?.fittedScale)-1/1.3)<1e-10);});
test("rotation rejection reports degrees separately from scale",()=>{const rad=15*Math.PI/180;const r=inspect(face(),face().map(([x,y])=>[x*Math.cos(rad)-y*Math.sin(rad),x*Math.sin(rad)+y*Math.cos(rad)]));assert.equal(r.plan,null);assert.equal(r.evidence?.rejection,"similarity_rotation_out_of_range");assert.ok(Math.abs(Number(r.evidence?.fittedRotationDegrees)+15)<1e-10);});
test("excessive median anchor residual remains rejected",()=>{const b=face();STABLE_POINTS.forEach((n,i)=>b[n][1]+=(i%2?1:-1)*16);const r=inspect(face(),b);assert.equal(r.plan,null);assert.equal(r.evidence?.rejection,"anchor_residual_excessive");assert.equal(r.evidence?.allowedResidual,8);assert.ok(Number(r.evidence?.medianResidual)>8);});
test("excessive anchor outliers remain rejected when median is acceptable",()=>{const b=face();b[33][0]+=35;b[133][0]-=35;const r=inspect(face(),b);assert.equal(r.plan,null);assert.equal(r.evidence?.rejection,"anchor_outliers_excessive");assert.ok(Number(r.evidence?.medianResidual)<=8);assert.equal(r.evidence?.anchorOutlierCount,2);assert.equal(r.evidence?.allowedOutlierCount,1);});
test("a passing plan reports bounded metrics and no rejection",()=>{const r=inspect(face(),face());assert.ok(r.plan);assert.equal(r.evidence?.rejection,undefined);assert.equal(r.evidence?.sourceLandmarkCount,478);assert.equal(r.evidence?.generatedLandmarkCount,478);assert.equal(r.evidence?.sourceMouthWidth,200);assert.equal(r.evidence?.generatedMouthWidth,200);assert.equal(r.evidence?.fittedScale,1);assert.equal(r.evidence?.medianResidual,0);assert.equal(r.evidence?.anchorOutlierCount,0);});
test("QA diagnostic retains alignment/raw geometry while dropping private payloads",()=>{
 const v={requestId:"cd8c7c2d-4c7e-4a01-83cc-f5ac139aef19",timestamp:1,generationPath:"standard",selectedToothCount:6,sourceWidth:1320,sourceHeight:1737,serverStatus:200,stage:"mouth_composite",outcome:"failed",alignment:{rejection:"generated_landmarks_missing",sourceLandmarkCount:478,generatedLandmarkCount:0,sourceWidth:1320,sourceHeight:1737,generatedWidth:1320,generatedHeight:1737,landmarks:[[1,2]],patientName:"private",fittedScale:NaN},rawOutput:{width:896,height:1200,mime:"image/jpeg",exifOrientation:6,image:"private"}};
 const r=safeGenerationDiagnostic(v as never) as unknown as typeof v;
 assert.ok(r.alignment);assert.ok(r.rawOutput);assert.equal(r.alignment.rejection,"generated_landmarks_missing");assert.equal(r.rawOutput.width,896);assert.equal(r.rawOutput.exifOrientation,6);assert.doesNotMatch(JSON.stringify(r),/private|"landmarks"|"patientName"|"fittedScale"/);
});
