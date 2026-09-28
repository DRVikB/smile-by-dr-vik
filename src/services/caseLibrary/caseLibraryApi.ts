import { apiUrl } from "@/services/api/client";
import type { CaseFeature, CaseMaterial } from "@/lib/types";

/**
 * Case Library (the clinician's own finished work, used as style references).
 * Images are stored privately in the clinician's account; the app only ever
 * receives short-lived links to its own images. Never log these links.
 */
export interface CloudReferenceCase {
  id: string;
  label: string;
  material: CaseMaterial;
  teethTreated: number[];
  startingConditions: CaseFeature[];
  styleTags: string[];
  validationOnly: boolean;
  createdAt: string;
  bytes: number;
  thumbnailUrl: string | null;
  imageUrl: string | null;
}

export interface CaseLibraryListing {
  cases: CloudReferenceCase[];
  count: number;
  bytes: number;
  authorityConfirmed: boolean;
  authorityVersion: string;
}

export interface ReferenceTags {
  material: CaseMaterial;
  label?: string;
  teethTreated?: number[];
  startingConditions?: CaseFeature[];
}

export class CaseLibraryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CaseLibraryError";
  }
}

async function call<T>(path: `/api/${string}`, token: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new CaseLibraryError("network", "Your Case Library couldn’t be reached. Check your connection and try again.");
  }
  const body = await response.json().catch(() => ({})) as { error?: string; code?: string };
  if (!response.ok) throw new CaseLibraryError(body.code ?? "failed", body.error ?? "Something went wrong. Please try again.");
  return body as T;
}

export const listCaseLibrary = (token: string) => call<CaseLibraryListing>("/api/case-library", token);

export const addReferenceCase = (token: string, tags: ReferenceTags, images: { original: string; reference: string }) =>
  call<{ id: string }>("/api/case-library", token, { method: "POST", body: JSON.stringify({ ...tags, ...images }) }, 60000);

export const updateReferenceCase = (token: string, id: string, patch: Partial<ReferenceTags>) =>
  call<{ updated: boolean }>("/api/case-library/update", token, { method: "POST", body: JSON.stringify({ id, ...patch }) });

export const deleteReferenceCase = (token: string, id: string) =>
  call<{ deleted: boolean }>("/api/case-library/delete", token, { method: "POST", body: JSON.stringify({ id }) });

export const sendStyleFeedback = (token: string, requestId: string, rating: "yes" | "not_quite", referenceCount: number) =>
  call<{ saved: boolean }>("/api/case-library/feedback", token, { method: "POST", body: JSON.stringify({ requestId, rating, referenceCount }) });
