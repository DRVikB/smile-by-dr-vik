import type { AiProcessingConsent } from "@/lib/aiConsent";
import type { CaseLogEntry, CaseLogMedia, ClinicianReview, GenerationMetadata, SmileSettings } from "@/lib/types";

/**
 * The central smile-design model. It is the existing, server-validated
 * SmileSettings (see settingsSchema in src/lib/generation/schema.ts): the
 * controls the app actually offers — treatment material, design goal, tooth
 * selection and per-tooth plans, tooth shape, target shade, character, smile
 * arc, texture, intensity and notes. It is aliased rather than duplicated so
 * the UI, storage, validation and prompt builder cannot drift apart.
 */
export type SmileDesign = SmileSettings;

/** A reference to media that is not implemented yet (video, scans, exports). */
export interface CaseAttachment {
  id: string;
  createdAt: number;
  kind: string;
  /** Local or secure-storage URI. Never a public URL. */
  uri?: string;
  format?: string;
}

export interface CasePhotograph {
  id: string;
  /** Data URL kept on the device. */
  image: string;
  width?: number;
  height?: number;
  addedAt: number;
}

export interface CaseDesign {
  id: string;
  createdAt: number;
  settings: SmileDesign;
}

export interface CaseVisualisation {
  id: string;
  createdAt: number;
  designId?: string;
  photographId: string;
  image: string;
  mode: "mock" | "live";
  testMode?: boolean;
  label?: string;
  generation?: GenerationMetadata;
  review?: ClinicianReview;
  aiConsent?: AiProcessingConsent;
}

/**
 * One patient case. V1 uses patient, photographs, designs and visualisations.
 * The other collections are reserved so video, face/dental scans, treatment
 * plans and lab exports can be added without reshaping stored cases.
 */
export interface SmileComposeCase {
  id: string;
  createdAt: number;
  updatedAt: number;
  patient: { name?: string };
  captures: {
    photographs: CasePhotograph[];
    videos?: CaseAttachment[];
    faceScans?: CaseAttachment[];
    dentalScans?: CaseAttachment[];
  };
  designs: CaseDesign[];
  visualisations: CaseVisualisation[];
  treatmentPlans?: CaseAttachment[];
  labExports?: CaseAttachment[];
  metadata: { schemaVersion: 1; storage: "device" };
}

export interface SmileComposeCaseSummary {
  id: string;
  patientName: string;
  createdAt: number;
  updatedAt: number;
  visualisationCount: number;
  thumb: string;
}

/** Legacy log entries have no caseId; each becomes its own single-visualisation case. */
export function caseIdOf(entry: CaseLogEntry): string {
  return entry.caseId ?? entry.id;
}

/** Newest case first. Summaries never load full-resolution media. */
export function summariseCases(entries: CaseLogEntry[]): SmileComposeCaseSummary[] {
  const byCase = new Map<string, CaseLogEntry[]>();
  for (const entry of entries) byCase.set(caseIdOf(entry), [...(byCase.get(caseIdOf(entry)) ?? []), entry]);
  return [...byCase.entries()].map(([id, group]) => {
    const sorted = [...group].sort((a, b) => b.createdAt - a.createdAt);
    return {
      id,
      patientName: sorted.find(e => e.patientName)?.patientName ?? "",
      createdAt: sorted[sorted.length - 1].createdAt,
      updatedAt: sorted[0].createdAt,
      visualisationCount: sorted.length,
      thumb: sorted[0].thumb,
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Assemble a case from its saved visualisations. Identical photos and designs are shared. */
export function buildCase(id: string, entries: CaseLogEntry[], media: Map<string, CaseLogMedia>): SmileComposeCase | null {
  const group = entries.filter(e => caseIdOf(e) === id).sort((a, b) => a.createdAt - b.createdAt);
  if (!group.length) return null;
  const photographs = new Map<string, CasePhotograph>();
  const designs = new Map<string, CaseDesign>();
  const visualisations: CaseVisualisation[] = [];
  for (const entry of group) {
    const m = media.get(entry.id);
    if (!m) continue;
    let photo = [...photographs.values()].find(p => p.image === m.originalImage);
    if (!photo) {
      photo = { id: `photo-${photographs.size + 1}`, image: m.originalImage, addedAt: entry.createdAt };
      photographs.set(photo.id, photo);
    }
    let designId: string | undefined;
    if (m.preferences?.settings) {
      const key = JSON.stringify(m.preferences.settings);
      const existing = [...designs.values()].find(d => JSON.stringify(d.settings) === key);
      designId = existing?.id ?? `design-${designs.size + 1}`;
      if (!existing) designs.set(designId, { id: designId, createdAt: entry.createdAt, settings: m.preferences.settings });
    }
    visualisations.push({
      id: entry.id,
      createdAt: entry.createdAt,
      designId,
      photographId: photo.id,
      image: m.image,
      mode: entry.mode,
      testMode: entry.testMode,
      label: entry.label,
      generation: m.generation,
      review: m.review,
      aiConsent: m.aiConsent,
    });
  }
  return {
    id,
    createdAt: group[0].createdAt,
    updatedAt: group[group.length - 1].createdAt,
    patient: { name: [...group].reverse().find(e => e.patientName)?.patientName || undefined },
    captures: { photographs: [...photographs.values()] },
    designs: [...designs.values()],
    visualisations,
    metadata: { schemaVersion: 1, storage: "device" },
  };
}
