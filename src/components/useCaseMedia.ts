"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseLogMedia } from "@/lib/types";
import type { CaseRepository } from "@/services/cases/caseRepository";
import type { CaseMediaStatus } from "@/services/cases/sync/mediaStatus";

/** Open just this version; queue/cache remain the source of sync truth. */
export function useCaseMedia(repository: CaseRepository, id?: string) {
  const [media, setMedia] = useState<CaseLogMedia | null>(null);
  const [status, setStatus] = useState<CaseMediaStatus | null>(null);
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    let live = true, busy = false, loaded = false, wasAvailable = false, revision = 0;
    setMedia(null); setStatus(null);
    if (!id) return;
    const update = async () => {
      const request = ++revision;
      const next = await repository.mediaStatus(id).catch(() => null);
      if (!live || request !== revision) return;
      setStatus(next);
      const becameAvailable = next?.available && !wasAvailable;
      wasAvailable = !!next?.available;
      if (becameAvailable && !loaded && !busy) void load();
    };
    const load = async (manual = false) => {
      if (busy || !live) return;
      busy = true;
      try {
        const result = await (manual ? repository.retryMedia(id) : repository.readPresentationMedia(id));
        if (live) { loaded = !!result; setMedia(result); }
      } catch { /* Safe status/copy comes from the sync coordinator, never raw provider errors. */ }
      finally { busy = false; if (live) void update(); }
    };
    const recover = () => {
      if (document.visibilityState === "hidden") return;
      void update();
      if (!loaded) void load();
      void repository.refreshSync();
    };
    retry.current = () => { void load(true); };
    const off = repository.subscribe(() => { void update(); });
    window.addEventListener("online", recover);
    window.addEventListener("offline", update);
    window.addEventListener("pageshow", recover);
    document.addEventListener("visibilitychange", recover);
    void load(); void update();
    return () => {
      live = false; off(); retry.current = () => {};
      window.removeEventListener("online", recover); window.removeEventListener("offline", update);
      window.removeEventListener("pageshow", recover); document.removeEventListener("visibilitychange", recover);
    };
  }, [repository, id]);
  return { media: media?.id === id ? media : null, status, retry: useCallback(() => retry.current(), []) };
}
