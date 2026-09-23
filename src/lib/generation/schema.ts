import { z } from "zod";
import { upperTeeth, caseFeatures } from "../types";
import { supportedTeeth } from "../teeth";
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
    teeth: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]),
    selectedTeeth: z.array(toothId).max(28),
    caseFeatures: z.array(z.enum(caseFeatures)).max(6).optional(),
    toothPlans: z.array(z.object({ tooth: toothId, intent: z.enum(["Auto", "Preserve", "Shade only", "Repair edges", "Close gaps", "Reshape"]), condition: z.enum(["Natural", "Restored", "Missing"]), targetShade: z.enum(["The same", "Whiten", "Bleach"]).optional() })).max(28).optional(),
    treatment: z.enum(["Composite", "Single-shade composite", "Layered composite", "Porcelain"]),
    designIntent: z.enum(["Auto", "Shade only", "Repair edges", "Close gaps", "Reshape"]).optional(),
    currentShade: z.enum(["A3", "A2", "A1", "B1"]),
    targetShade: z.enum(["The same", "Whiten", "Bleach", "A1", "B1", "BL3", "BL2", "BL1"]),
    shape: z.enum(["Square", "Rounded", "Triangular"]),
    texture: z.enum(["Smooth", "Natural", "Textured"]),
    shotType: z.enum(["Full face", "Close-up"]),
    faceShape: z.enum(["Auto", "Square", "Ovoid", "Tapering"]),
    character: z.enum(["Soft", "Balanced", "Defined"]),
    libraryStyle: z.boolean().default(true),
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
  width: fraction,
  height: fraction,
});
/**
 * Style references are downscaled before sending: three of them plus the
 * patient photograph must still fit inside the request body cap.
 */
export const styleImageSchema = imageSchema.refine(
  (value) => value.length <= 2_200_000,
  "Style reference is too large.",
);
export const generationSchema = z.object({
  originalImage: imageSchema,
  resolution: z.enum(["512", "1K"]).optional(),
  referenceImage: imageSchema.optional(),
  styleReferences: z.array(styleImageSchema).max(3).optional(),
  framing: framingSchema.optional(),
  settings: settingsSchema,
});
export type GenerationInput = z.infer<typeof generationSchema>;
