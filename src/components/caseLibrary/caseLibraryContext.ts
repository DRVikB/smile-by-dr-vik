"use client";
import { createContext, useContext } from "react";
import type { CaseFeature, CaseMaterial } from "@/lib/types";
import type { StyleReferenceCandidate } from "@/lib/styleMatching";
import type { ReferenceTags } from "@/services/caseLibrary/caseLibraryApi";

/**
 * Case Library: the clinician's own finished work, used as style references.
 * NOT patient Cases (those are the "Cases" button and stay on the device).
 *
 *   cloud      signed in: private storage in the clinician's account; the
 *              server chooses references for each generation
 *   device     builds without accounts (local development): this device only
 *   signedOut  accounts exist but nobody is signed in
 */
export type CaseLibraryMode = "cloud" | "device" | "signedOut";

export interface ReferenceCase {
  id: string;
  label: string;
  material: CaseMaterial;
  teethTreated: number[];
  startingConditions: CaseFeature[];
  validationOnly: boolean;
  createdAt: number;
  bytes: number;
  thumbnailUrl: string | null;
  imageUrl: string | null;
}

export interface AddResult { added: number; failed: number; firstError?: string }

export interface CaseLibraryContextValue {
  mode: CaseLibraryMode;
  cases: ReferenceCase[] | null;
  bytes: number;
  error: string | null;
  authorityConfirmed: boolean;
  refresh(): Promise<void>;
  confirmAuthority(): Promise<void>;
  addCases(files: File[], tags: ReferenceTags, onProgress?: (done: number, total: number) => void): Promise<AddResult>;
  updateCase(id: string, patch: Partial<ReferenceTags>): Promise<void>;
  removeCase(id: string): Promise<void>;
  candidates: StyleReferenceCandidate[];
  open(options?: { add?: boolean }): void;
  close(): void;
  isOpen: boolean;
  /** Device builds only: the older pin / validation / import tools, registered by the workspace. */
  legacyTools: (() => void) | null;
  setLegacyTools(handler: (() => void) | null): void;
}

export const CaseLibraryContext = createContext<CaseLibraryContextValue | null>(null);

export function useCaseLibrary(): CaseLibraryContextValue {
  const value = useContext(CaseLibraryContext);
  if (!value) throw new Error("useCaseLibrary must be used inside CaseLibraryProvider.");
  return value;
}
