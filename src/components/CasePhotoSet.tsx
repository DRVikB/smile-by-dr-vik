"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Images } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { MAX_PHOTOS, PHOTO_SET_VIEWS, type CaseConsent } from "@/lib/portal";
import { ConsentStatus } from "@/components/consent/ConsentSheet";

/**
 * A case's clinical photo set in the app (the same set as the web portal): small previews only,
 * with each full photo downloaded when it's opened, so a case doesn't fill the device.
 */
export function CasePhotoSet({ caseId, onOpen }: { caseId: string; onOpen: () => void }) {
  const { user } = useAccount();
  const [repository] = useState(getCaseRepository);
  const [count, setCount] = useState(0);
  const [consent, setConsent] = useState<CaseConsent | undefined>();
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");

  const load = useCallback(async () => {
    const d = await repository.portalDetails(caseId).catch(() => null);
    const set = d?.portal.thumbs ?? {};
    const designFront = !set.front && Boolean(d?.hasDesignPhoto);
    setCount(PHOTO_SET_VIEWS.filter(v => set[v.id] || (v.id === "front" && designFront && d?.designThumb)).length);
    setConsent(d?.portal.consent); setName(d?.portal.name ?? ""); setReference(d?.portal.reference ?? "");
  }, [caseId, repository]);
  useEffect(() => { void load(); return repository.subscribe(() => void load()); }, [load, repository]);

  if (!user) return null;
  return <section className="case-photo-set action-list" aria-label="Photo set and consent">
    <button type="button" className="action-row" onClick={onOpen}>
      <span className="action-icon" aria-hidden="true"><Images size={15} strokeWidth={1.8} /></span>
      <span className="action-label">Photo set</span>
      <span className="action-value">{count} of {MAX_PHOTOS}</span>
      <ChevronRight size={17} strokeWidth={1.8} aria-hidden="true" className="action-chevron" />
    </button>
    <ConsentStatus row consent={consent} patientName={name} caseLabel={reference || name || "Case"}
      onSave={async c => { await repository.updatePortal(caseId, { consent: c, ...(c && !name ? { name: c.patientName } : {}) }); setConsent(c ?? undefined); }} />
  </section>;
}
