import type { Point } from "@/lib/face/geometry";
import { analyseSmile, type SmileAnalysis } from "@/lib/face/analysis";
import { photoFingerprint } from "@/lib/toothMap/types";
export const ANALYSIS_VERSION="mediapipe-478-smile-analysis-v1";
export interface AnalysisSnapshot { algorithmVersion:typeof ANALYSIS_VERSION; photoFingerprint:string; width:number; height:number; capturedAt:number; landmarks:Point[]; analysis:SmileAnalysis|null }
export function makeAnalysisSnapshot(src:string,width:number,height:number,landmarks:Point[]):AnalysisSnapshot {
 return {algorithmVersion:ANALYSIS_VERSION,photoFingerprint:photoFingerprint(src),width,height,capturedAt:Date.now(),landmarks,analysis:analyseSmile(landmarks,width,height)};
}
export function validAnalysisSnapshot(s:AnalysisSnapshot|undefined,src:string):s is AnalysisSnapshot {
 return Boolean(s&&s.algorithmVersion===ANALYSIS_VERSION&&s.photoFingerprint===photoFingerprint(src)&&Number.isFinite(s.width)&&s.width>0&&Number.isFinite(s.height)&&s.height>0&&Array.isArray(s.landmarks)&&s.landmarks.length>=468&&s.landmarks.length<=500&&s.landmarks.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)));
}
export async function restoreAnalysisSnapshot(src:string,s:AnalysisSnapshot|undefined){
 if(!validAnalysisSnapshot(s,src))return;
 const {primeFaceAnalysis}=await import("@/lib/face/landmarks");primeFaceAnalysis(src,s.landmarks);
}
