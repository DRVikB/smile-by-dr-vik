"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { captureWorkspace } from "@/lib/workspace";
import { createLibraryStore } from "@/lib/caseLibrary";
import { useAccount } from "@/components/account/AccountProvider";
import { DOCUMENT_VERSIONS } from "@/config/legal";
import type { LibraryCase } from "@/lib/types";
import type { StyleReferenceCandidate } from "@/lib/styleMatching";
import { recordConsents } from "@/services/account/accountApi";
import {
  CaseLibraryError, addReferenceCase, deleteReferenceCase, listCaseLibrary, updateReferenceCase, type ReferenceTags,
} from "@/services/caseLibrary/caseLibraryApi";
import { CaseLibraryContext, type AddResult, type CaseLibraryContextValue, type CaseLibraryMode, type ReferenceCase } from "./caseLibraryContext";
import { CaseLibraryView } from "./CaseLibraryView";

export { useCaseLibrary } from "./caseLibraryContext";

const DEVICE_AUTHORITY_KEY = "smile.caseLibraryAuthority";
const LINK_LIFETIME_MS = 8 * 60 * 1000;

function fromDevice(entry: LibraryCase, thumb: string | null, image: string | null): ReferenceCase {
  return {
    id: entry.id, label: entry.label, material: entry.material, teethTreated: entry.context?.teeth ?? [],
    startingConditions: entry.context?.features ?? [], validationOnly: Boolean(entry.validationOnly), createdAt: entry.addedAt,
    bytes: (thumb?.length ?? 0) + (image?.length ?? 0), thumbnailUrl: thumb, imageUrl: image,
  };
}

export function CaseLibraryProvider({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  const mode: CaseLibraryMode = !account.configured ? "device" : account.user ? "cloud" : "signedOut";
  const userId = account.user?.id ?? null;
  const [cases, setCases] = useState<ReferenceCase[] | null>(null);
  const [bytes, setBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [view, setView] = useState<{ add: boolean; key: number } | null>(null);
  const [legacyTools, setLegacyToolsState] = useState<(() => void) | null>(null);
  const setLegacyTools = useCallback((handler: (() => void) | null) => setLegacyToolsState(() => handler), []);
  const loadedAt = useRef(0);
  const [scope] = useState(captureWorkspace);
  const [deviceLibrary] = useState(() => createLibraryStore(scope));
  const refreshSequence = useRef(0);

  const refresh = useCallback(async () => {
    if (scope.signal.aborted) return;
    const sequence = ++refreshSequence.current;
    setError(null);
    try {
      if (mode === "cloud") {
        const token = await account.getAccessToken();
        if (!token) return;
        const listing = await listCaseLibrary(token);
        scope.assert(); if (sequence !== refreshSequence.current) return;
        setCases(listing.cases.map(c => ({ ...c, createdAt: Date.parse(c.createdAt) || 0 })));
        setBytes(listing.bytes);
        setAuthorityConfirmed(listing.authorityConfirmed);
        loadedAt.current = Date.now();
      } else if (mode === "device") {
        const { listLibrary, readLibraryMedia } = deviceLibrary;
        const entries = await listLibrary();
        const withMedia = await Promise.all(entries.map(async e => {
          const media = await readLibraryMedia(e.id).catch(() => null);
          return fromDevice(e, media?.thumb ?? null, media?.image ?? null);
        }));
        scope.assert(); if (sequence !== refreshSequence.current) return;
        setCases(withMedia);
        setBytes(withMedia.reduce((sum, c) => sum + c.bytes, 0));
        try { setAuthorityConfirmed(localStorage.getItem(DEVICE_AUTHORITY_KEY) === DOCUMENT_VERSIONS.case_library_authority); } catch { setAuthorityConfirmed(false); }
      } else {
        setCases([]);
        setBytes(0);
      }
    } catch (e) {
      if (scope.signal.aborted || sequence !== refreshSequence.current) return;
      setError(e instanceof CaseLibraryError ? e.message : "Your Case Library couldn’t be opened.");
      setCases(current => current ?? []);
    }
  }, [mode, account, scope, deviceLibrary]);

  // Load when the account changes; never keep another account's library on screen.
  useEffect(() => { setCases(null); setBytes(0); setAuthorityConfirmed(false); setError(null); setView(null); loadedAt.current = 0; void refresh(); return () => { refreshSequence.current++; }; }, [mode, userId]);

  const confirmAuthority = useCallback(async () => {
    scope.assert();
    const version = DOCUMENT_VERSIONS.case_library_authority;
    if (mode === "cloud") {
      const token = await account.getAccessToken();
      if (!token) throw new Error("Sign in again to continue.");
      await recordConsents(token, [{ type: "case_library_authority", version }]);
    } else {
      try { localStorage.setItem(DEVICE_AUTHORITY_KEY, version); } catch { /* the confirmation still applies to this session */ }
    }
    scope.assert();
    setAuthorityConfirmed(true);
  }, [mode, account, scope, deviceLibrary]);

  const addCases = useCallback(async (files: File[], tags: ReferenceTags, onProgress?: (done: number, total: number) => void): Promise<AddResult> => {
    scope.assert();
    const { prepareReferenceImages } = await import("@/lib/referenceImages");
    let added = 0;
    let failed = 0;
    let firstError: string | undefined;
    for (const [index, file] of files.slice(0, 20).entries()) {
      try {
        const images = await prepareReferenceImages(file, scope);
        scope.assert();
        if (mode === "cloud") {
          const token = await account.getAccessToken();
          if (!token) throw new Error("Sign in again to continue.");
          await addReferenceCase(token, tags, images);
        } else if (mode === "device") {
          const { addLibraryCase } = deviceLibrary;
          const { thumbnail } = await import("@/lib/thumb");
          const id = crypto.randomUUID();
          await addLibraryCase(
            { id, material: tags.material, label: tags.label ?? "", addedAt: Date.now(), context: { features: tags.startingConditions ?? [], teeth: tags.teethTreated ?? [], adjuncts: [] } },
            { id, image: images.reference, thumb: await thumbnail(images.reference, 360, 0.72) },
          );
        } else {
          throw new Error("Sign in to use your Case Library.");
        }
        added += 1;
      } catch (e) {
        failed += 1;
        firstError ??= e instanceof Error ? e.message : "That photo couldn’t be added.";
      }
      scope.assert();
      onProgress?.(index + 1, files.length);
    }
    await refresh();
    return { added, failed, firstError };
  }, [mode, account, refresh, scope, deviceLibrary]);

  const updateCase = useCallback(async (id: string, patch: Partial<ReferenceTags>) => {
    scope.assert();
    if (mode === "cloud") {
      const token = await account.getAccessToken();
      if (!token) throw new Error("Sign in again to continue.");
      await updateReferenceCase(token, id, patch);
    } else if (mode === "device") {
      const { listLibrary, readLibraryMedia, addLibraryCase } = deviceLibrary;
      const entry = (await listLibrary()).find(c => c.id === id);
      const media = await readLibraryMedia(id);
      if (!entry || !media) throw new Error("That case could not be opened.");
      await addLibraryCase({
        ...entry,
        ...(patch.material ? { material: patch.material } : {}),
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        context: {
          features: patch.startingConditions ?? entry.context?.features ?? [],
          teeth: patch.teethTreated ?? entry.context?.teeth ?? [],
          adjuncts: entry.context?.adjuncts ?? [],
          ...(entry.context?.followUpWeeks !== undefined ? { followUpWeeks: entry.context.followUpWeeks } : {}),
        },
      }, media);
    }
    await refresh();
  }, [mode, account, refresh, scope, deviceLibrary]);

  const removeCase = useCallback(async (id: string) => {
    scope.assert();
    if (mode === "cloud") {
      const token = await account.getAccessToken();
      if (!token) throw new Error("Sign in again to continue.");
      await deleteReferenceCase(token, id);
    } else if (mode === "device") {
      await deviceLibrary.deleteLibraryCase(id);
    }
    await refresh();
  }, [mode, account, refresh, scope, deviceLibrary]);

  const open = useCallback((options?: { add?: boolean }) => {
    if (mode === "signedOut") { account.openAuth("signIn"); return; }
    // Private links are short-lived: refresh them when the library opens.
    if (mode === "cloud" && Date.now() - loadedAt.current > LINK_LIFETIME_MS) void refresh();
    setView({ add: Boolean(options?.add), key: Date.now() }); // re-opening resets the view
  }, [mode, account, refresh, scope, deviceLibrary]);

  const candidates = useMemo<StyleReferenceCandidate[]>(() => (cases ?? []).map(c => ({
    id: c.id, material: c.material, teethTreated: c.teethTreated, startingConditions: c.startingConditions, createdAt: c.createdAt, validationOnly: c.validationOnly,
  })), [cases]);

  const value = useMemo<CaseLibraryContextValue>(() => ({
    mode, cases, bytes, error, authorityConfirmed, refresh, confirmAuthority, addCases, updateCase, removeCase, candidates,
    open, close: () => setView(null), isOpen: Boolean(view),
    legacyTools: mode === "device" ? legacyTools : null, setLegacyTools,
  }), [mode, cases, bytes, error, authorityConfirmed, refresh, confirmAuthority, addCases, updateCase, removeCase, candidates, open, view, legacyTools, setLegacyTools]);

  return (
    <CaseLibraryContext.Provider value={value}>
      {children}
      {view && <CaseLibraryView key={view.key} startWithAdd={view.add} onClose={() => setView(null)} />}
    </CaseLibraryContext.Provider>
  );
}
