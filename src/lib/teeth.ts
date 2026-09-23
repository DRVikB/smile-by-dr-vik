import type { SmileSettings, ToothPlan } from "./types";
export const upperArch = [17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27];
export const lowerArch = [47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37];
export const supportedTeeth = [...upperArch, ...lowerArch];
export function activeToothPlans(s: SmileSettings): ToothPlan[] {
  return s.toothPlans?.filter(p => p.intent !== "Preserve" && p.condition !== "Missing") ?? s.selectedTeeth.map(tooth => ({ tooth, intent: s.designIntent ?? "Auto", condition: "Natural" }));
}
export function updateToothPlan(s: SmileSettings, plan: ToothPlan): SmileSettings {
  const plans = s.toothPlans ?? activeToothPlans(s).map(p => ({ ...p, intent: "Auto" as const }));
  const toothPlans = [...plans.filter(p => p.tooth !== plan.tooth), plan].sort((a,b) => a.tooth-b.tooth);
  return { ...s, toothPlans, selectedTeeth: toothPlans.filter(p => p.intent !== "Preserve" && p.condition !== "Missing").map(p => p.tooth) };
}
export function toothSummary(s: Pick<SmileSettings, "selectedTeeth">): string {
  const upper = s.selectedTeeth.filter(id => id < 30).length;
  const lower = s.selectedTeeth.length - upper;
  if (!upper && !lower) return "No teeth selected";
  return [upper && `${upper} upper`, lower && `${lower} lower`].filter(Boolean).join(" + ") + " teeth";
}
export function resolvedToothIntent(s: SmileSettings, p: ToothPlan) {
  return p.intent === "Auto" ? s.designIntent ?? "Auto" : p.intent;
}
