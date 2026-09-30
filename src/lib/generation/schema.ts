import { z } from "zod";
import { upperTeeth, caseFeatures, smileArcs, biteContexts, toothShapes, toothEdges } from "../types";
import { supportedTeeth } from "../teeth";
import { generationModes } from "./modes";
const toothId = z.number().int().refine(id => supportedTeeth.includes(id));
export const imageSchema = z
  .string()
  .max(8_000_000)
  .regex(
    /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/,
    "Provide a valid JPG or PNG image.",
  )
  .refine((value) => {
    const data = value.split(",")[1] ?? "";
    return value.startsWith("data:image/jpeg")
      ? data.startsWith("/9j/")
      : data.startsWith("iVBORw0KGgo");
  }, "Image content does not match its type.");
export const settingsSchema = z
  .object({
    clinicalData: z.object({
      overbiteMm: z.number().finite().min(-20).max(20).optional(),
      overjetMm: z.number().finite().min(-20).max(20).optional(),
      restorativeSpace: z.enum(["Not assessed", "Limited / uncertain", "Assessed for planned changes"]).optional(),
      constraints: z.string().max(1000).optional(),
      patientPriorities: z.string().max(300).optional(),
    }).optional(),
    teeth: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]),
    selectedTeeth: z.array(toothId).max(28),
    caseFeatures: z.array(z.enum(caseFeatures)).max(6).optional(),
    toothPlans: z.array(z.object({
      tooth: toothId,
      intent: z.enum(["Auto", "Preserve", "Shade only", "Repair edges", "Close gaps", "Reshape"]),
      condition: z.enum(["Natural", "Restored", "Missing"]),
      targetShade: z.enum(["The same", "Whiten", "Bleach", "A1", "B1", "BL3", "BL2", "BL1"]).optional(),
      // Individual tooth design from the Tooth Map controls.
      shape: z.enum(toothShapes).optional(),
      length: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
      width: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
      edge: z.enum(toothEdges).optional(),
    })).max(28).optional(),
    treatment: z.enum(["Composite", "Single-shade composite", "Layered composite", "Porcelain"]),
    alignment: z.object({ arches: z.enum(["Upper", "Lower", "Both"]), only: z.boolean().optional() }).optional(),
    treatmentMode: z.enum(["standard", "full_arch"]).optional(),
    fullArch: z.object({
      arch: z.enum(["upper", "lower", "both"]),
      restorationType: z.enum(["zirconia", "provisional"]),
      prostheticGingiva: z.enum(["auto", "include", "exclude"]),
    }).optional(),
    designIntent: z.enum(["Auto", "Shade only", "Repair edges", "Close gaps", "Reshape"]).optional(),
    smileArc: z.enum(smileArcs).optional(),
    biteContext: z.enum(biteContexts).optional(),
    currentShade: z.enum(["A3", "A2", "A1", "B1"]),
    targetShade: z.enum(["The same", "Whiten", "Bleach", "A1", "B1", "BL3", "BL2", "BL1"]),
    shape: z.enum(["Square", "Rounded", "Triangular"]),
    texture: z.enum(["Smooth", "Natural", "Textured"]),
    shotType: z.enum(["Full face", "Close-up"]),
    faceShape: z.enum(["Auto", "Square", "Ovoid", "Tapering"]),
    character: z.enum(["Soft", "Balanced", "Defined"]),
    // Off unless the clinician switches it on: other patients' photos are sent only then.
    libraryStyle: z.boolean().default(false),
    intensity: z.number().int().min(0).max(100),
    notes: z.string().max(400).default(""),
  })
  .refine(
    (s) => {
      if (new Set(s.selectedTeeth).size !== s.selectedTeeth.length) return false;
      if (!s.toothPlans) return s.selectedTeeth.length === upperTeeth[s.teeth].length && s.selectedTeeth.every((id, i) => id === upperTeeth[s.teeth][i]);
      if (new Set(s.toothPlans.map(p => p.tooth)).size !== s.toothPlans.length) return false;
      const active = s.toothPlans.filter(p => p.intent !== "Preserve" && p.condition !== "Missing").map(p => p.tooth);
      return active.length === s.selectedTeeth.length && active.every(id => s.selectedTeeth.includes(id));
    },
    "Check selected teeth and individual instructions.",
  );
const fraction = z.number().min(0).max(1);
export const framingSchema = z.object({
  x: fraction,
  y: fraction,
  width: fraction.positive(),
  height: fraction.positive(),
}).refine(region => region.x + region.width <= 1 + 1e-6 && region.y + region.height <= 1 + 1e-6, "The photo region must stay inside the image.");
/**
 * Style references are downscaled before sending: three of them plus the
 * patient photograph must still fit inside the request body cap.
 */
export const styleImageSchema = imageSchema.refine(
  (value) => value.length <= 2_200_000,
  "Style reference is too large.",
);
/** Tooth Map guidance: a black-and-white PNG aligned to the request canvas; white = the only area that may change. */
export const editMaskSchema = imageSchema.refine(v => v.startsWith("data:image/png") && v.length <= 1_500_000, "Edit mask must be a small PNG.");
export const generationSchema = z.object({
  originalImage: imageSchema,
  editMask: editMaskSchema.optional(),
  resolution: z.enum(["512", "1K"]).optional(),
  generationMode: z.enum(generationModes).optional(),
  caseId: z.string().max(100).regex(/^[\w-]+$/).optional(),
  referenceImage: imageSchema.optional(),
  styleReferences: z.array(styleImageSchema).max(3).optional(),
  framing: framingSchema.optional(),
  sourceBounds: framingSchema.optional(),
  settings: settingsSchema,
});
export type GenerationInput = z.infer<typeof generationSchema>;
