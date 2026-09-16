import { z } from "zod";
import { upperTeeth } from "../types";
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
    selectedTeeth: z.array(z.number().int()).min(4).max(10),
    treatment: z.enum(["Composite", "Porcelain"]),
    currentShade: z.enum(["A3", "A2", "A1", "B1"]),
    targetShade: z.enum(["The same", "Whiten", "Bleach", "A1", "B1", "BL3", "BL2", "BL1"]),
    shape: z.enum(["Square", "Rounded", "Triangular"]),
    texture: z.enum(["Smooth", "Natural", "Textured"]),
    shotType: z.enum(["Full face", "Close-up"]),
    faceShape: z.enum(["Auto", "Square", "Ovoid", "Tapering"]),
    character: z.enum(["Soft", "Balanced", "Defined"]),
    intensity: z.number().int().min(0).max(100),
    notes: z.string().max(400).default(""),
  })
  .refine(
    (s) =>
      s.selectedTeeth.length === upperTeeth[s.teeth].length &&
      s.selectedTeeth.every((id, i) => id === upperTeeth[s.teeth][i]),
    "Choose a symmetric set of upper anterior teeth.",
  );
const fraction = z.number().min(0).max(1);
export const framingSchema = z.object({
  x: fraction,
  y: fraction,
  width: fraction,
  height: fraction,
});
export const generationSchema = z.object({
  originalImage: imageSchema,
  referenceImage: imageSchema.optional(),
  framing: framingSchema.optional(),
  settings: settingsSchema,
});
export type GenerationInput = z.infer<typeof generationSchema>;
