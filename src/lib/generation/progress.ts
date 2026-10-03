import type { GenerationStage } from "@/services/ai/generationDiagnostics";

export const GENERATION_STEP_DELAYS = [2500, 6500, 12000];
export const DEMO_STEP_DELAYS = [350, 800, 1300];

function preparationStep(stage: GenerationStage): number {
  if (stage === "request" || stage === "response") return 1;
  if (["align", "mouth_composite", "edit_area_composite", "arch_composite", "tooth_composite"].includes(stage)) return 2;
  if (stage === "quality_check" || stage === "complete") return 3;
  return 0;
}

/** Pace only the presentation. A timer cannot advance beyond observed work. */
export function visibleGenerationStep(elapsedMs: number, stage: GenerationStage, demo: boolean): number {
  const delays = demo ? DEMO_STEP_DELAYS : GENERATION_STEP_DELAYS;
  return Math.min(delays.filter(delay => elapsedMs >= delay).length, preparationStep(stage));
}

export function earliestGenerationStage(stages: GenerationStage[]): GenerationStage {
  return stages.reduce((earliest, stage) => preparationStep(stage) < preparationStep(earliest) ? stage : earliest, stages[0] ?? "preflight");
}
