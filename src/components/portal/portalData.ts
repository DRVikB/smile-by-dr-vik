"use client";
import { useCallback, useEffect, useState } from "react";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { caseIdOf } from "@/models/case";
import { standardTreatmentSummary } from "@/lib/fullArch";
import { isCaseStatus, type CaseStatus, type PhotoSlot } from "@/lib/portal";
import type { CaseLogEntry, CaseLogMedia, SmileSettings } from "@/lib/types";

export interface PortalCaseCard {
  id: string;
  name: string;
  reference: string;
  status: CaseStatus;
  thumb: string;
  updatedAt: number;
  createdAt: number;
  /** The case's tags ("Consultation", "Going ahead"…). */
  labels: string[];
  favourite: boolean;
  /** The newest saved concept's entry, for favourites. */
  latestEntryId: string | null;
  tags: string[];
  concepts: number;
  photoCount: number;
}

const TAGS = /(whiten|veneer|porcelain|composite|bonding|align|straighten|full arch|all-on|one tooth|zirconia)/i;

/** "Porcelain · 8 teeth · Whiten" → ["Porcelain", "Whiten"]: the treatment words only. */
export function tagsFrom(summary: string | undefined): string[] {
  if (!summary) return [];
  const parts = summary.split(/\s*(?:·|\+|,)\s*/).map(p => p.trim()).filter(Boolean);
  return [...new Set(parts.filter(p => TAGS.test(p)).map(p => p.replace(/^./, c => c.toUpperCase())))].slice(0, 3);
}

/** The case list for the portal: saved concepts and drafts, with each case's portal details. */
export function usePortalCases() {
  const [repository] = useState(getCaseRepository);
  const [cases, setCases] = useState<PortalCaseCard[] | null>(null);
  const load = useCallback(async () => {
    const [entries, index] = await Promise.all([repository.listLog(), repository.portalIndex()]);
    const byCase = new Map<string, CaseLogEntry[]>();
    for (const entry of entries) {
      if (entry.testMode || entry.mode === "mock" || entry.deletedAt || entry.archivedAt) continue;
      const id = caseIdOf(entry);
      byCase.set(id, [...(byCase.get(id) ?? []), entry]);
    }
    const cards = [...byCase.entries()].map(([id, group]): PortalCaseCard => {
      const sorted = [...group].sort((a, b) => b.createdAt - a.createdAt);
      const saved = sorted.filter(e => !e.draftOnly);
      const details = index[id];
      const name = details?.name || sorted.find(e => e.patientName)?.patientName || "";
      const status = isCaseStatus(details?.status) ? details.status : "progress";
      return {
        id, name, reference: details?.reference ?? "", status, thumb: sorted[0].thumb, updatedAt: sorted[0].createdAt,
        createdAt: sorted[sorted.length - 1].createdAt, labels: details?.tags ?? [],
        favourite: saved.some(e => e.favourite), latestEntryId: saved[0]?.id ?? null,
        tags: tagsFrom(saved[0]?.summary), concepts: saved.length, photoCount: details?.photoCount ?? 0,
      };
    }).sort((a, b) => b.updatedAt - a.updatedAt);
    setCases(cards);
  }, [repository]);
  useEffect(() => {
    void load().catch(() => setCases([]));
    return repository.subscribe(() => void load().catch(() => {}));
  }, [repository, load]);
  return { cases, reload: load, repository };
}

export interface CaseVersion { entry: CaseLogEntry; media: CaseLogMedia }

/** A design's settings as label/value rows, for the Design tab and the lab specification. */
export function designRows(s: SmileSettings | undefined): { label: string; value: string }[] {
  if (!s) return [];
  const rows = [
    { label: "Teeth", value: s.toothMatch ? "One tooth" : `${s.teeth} upper` },
    { label: "Treatment", value: standardTreatmentSummary(s) },
    { label: "Shape", value: String(s.shape) },
    { label: "Shade", value: String(s.targetShade) },
    { label: "Character", value: String(s.character) },
  ];
  if (s.smileArc && s.smileArc !== "Preserve existing") rows.push({ label: "Smile arc", value: s.smileArc });
  return rows.filter(r => r.value && r.value !== "undefined");
}

export const relativeDate = (time: number) => {
  const days = Math.floor((Date.now() - time) / 86400000);
  const clock = new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days <= 0 && new Date(time).toDateString() === new Date().toDateString()) return `Today, ${clock}`;
  if (days <= 1) return `Yesterday, ${clock}`;
  return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: new Date(time).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

/** Downscale a dropped photo for the photo set: JPEG, at most 1600 px on the long side (a few hundred KB), orientation applied. */
export async function photoForSlot(file: Blob, max = 1600): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPEG, PNG or HEIC).");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("That photo couldn’t be opened in this browser. Try a JPEG or PNG."); }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();
export type SlotPhotos = Partial<Record<PhotoSlot, string>>;
