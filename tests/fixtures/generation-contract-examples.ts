import { defaultSettings, upperTeeth, type SmileSettings } from "../../src/lib/types";
import { chooseFullArch, chooseStandard } from "../../src/lib/fullArch";
import { updateToothPlan } from "../../src/lib/teeth";

// Synthetic settings only. No patient photograph, identity, notes or live call.
const base: SmileSettings = { ...defaultSettings, teeth: 6, selectedTeeth: upperTeeth[6], designIntent: "Reshape", libraryStyle: false };
export const contractExamples: Record<string, SmileSettings> = {
  Whitening: chooseStandard({ ...base, currentShade: "A3", currentShadeSource: "clinician" }, { treatment: "Whitening", targetShade: "Whiten" }),
  Composite: chooseStandard(base, { treatment: "Layered composite", targetShade: "B1" }),
  Porcelain: chooseStandard(base, { treatment: "Porcelain", targetShade: "B1" }),
  Alignment: chooseStandard(base, { alignment: { arches: "Both", only: true }, treatment: "Porcelain", targetShade: "Bleach" }),
  "Single tooth": updateToothPlan({ ...base, selectedTeeth: [], toothPlans: [], treatment: "Layered composite", texture: "Textured" }, { tooth: 11, condition: "Natural", intent: "Reshape", targetShade: "B1", shape: "Soft square", width: 1, length: 1, edge: "Soft" }),
  "Full Arch preserve gingiva": chooseFullArch({ ...base, targetShade: "The same", smileArc: "Flatter" }, { arch: "upper", restorationType: "zirconia", prostheticGingiva: "exclude" }),
  "Full Arch include prosthetic gingiva": chooseFullArch({ ...base, targetShade: "B1", smileArc: "Follow lower lip" }, { arch: "upper", restorationType: "zirconia", prostheticGingiva: "include" }),
};
