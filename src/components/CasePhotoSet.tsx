"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { PhotoSet, PhotoViewer } from "@/components/portal/PhotoSet";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { MAX_PHOTOS, PHOTO_SLOTS, type CaseConsent, type PhotoSlot, type PortalPatch } from "@/lib/portal";
import type { SlotPhotos } from "@/components/portal/portalData";
import { ConsentStatus } from "@/components/consent/ConsentSheet";

/**
 * A case's clinical photo set in the app (the same set as the web portal): small previews only,
 * with each full photo downloaded when it's opened, so a case doesn't fill the device.
 */
export function CasePhotoSet({ caseId }: { caseId: string }) {
  const { user } = useAccount();
  const [repository] = useState(getCaseRepository);
  const [thumbs, setThumbs] = useState<SlotPhotos>({});
  const [designThumb, setDesignThumb] = useState("");
  const [designFront, setDesignFront] = useState(false);
  const [viewing, setViewing] = useState<PhotoSlot | null>(null);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState<CaseConsent | undefined>();
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");

  const load = useCallback(async () => {
    const d = await repository.portalDetails(caseId).catch(() => null);
    const set = d?.portal.thumbs ?? {};
    setThumbs(set);
    setDesignThumb(d?.designThumb ?? "");
    setDesignFront(!set.front && Boolean(d?.hasDesignPhoto));
    setConsent(d?.portal.consent); setName(d?.portal.name ?? ""); setReference(d?.portal.reference ?? "");
  }, [caseId, repository]);
  useEffect(() => { void load(); return repository.subscribe(() => void load()); }, [load, repository]);

  if (!user) return null;
  const save = async (patch: PortalPatch, done: string) => {
    setStatus("Saving…");
    try { await repository.updatePortal(caseId, patch); setStatus(done); }
    catch { setStatus("The photo set couldn’t be saved. Check your connection and try again."); }
  };
  const loadFull = (slot: PhotoSlot) => slot === "front" && designFront ? repository.portalDesignPhoto(caseId) : repository.portalPhoto(caseId, slot);
  const filled = PHOTO_SLOTS.map(s => s.id).filter(id => thumbs[id] || (id === "front" && designFront && designThumb));

  return <section className="case-photo-set" aria-label="Photo set">
    <button type="button" className="case-photo-head case-photo-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <h3>Photo set</h3>
      <span className="control-hint">{filled.length} of {MAX_PHOTOS}</span>
      <ChevronDown size={17} strokeWidth={1.8} aria-hidden="true" className={open ? "open" : ""} />
    </button>
    {open && <>
      <PhotoSet thumbs={thumbs} designThumb={designFront ? designThumb : undefined}
        onAdd={photos => void save({ photos }, "Photo added")}
        onSwap={(a, b) => void save({ swap: [a, b] }, "Photo set saved")} onOpen={setViewing} />
      <p className="control-hint">{status || "Tap a photo to see it full size. Only small previews are kept here; full photos download when you open them."}</p>
    </>}
    <ConsentStatus consent={consent} patientName={name} caseLabel={reference || name || "Case"}
      onSave={async c => { await repository.updatePortal(caseId, { consent: c, ...(c && !name ? { name: c.patientName } : {}) }); setConsent(c ?? undefined); }} />
    {viewing && <PhotoViewer slot={viewing} filled={filled} load={loadFull} onClose={() => setViewing(null)} onMove={setViewing}
      onReplace={(slot, photo) => void save({ photos: { [slot]: photo } }, "Photo replaced")}
      onRemove={viewing === "front" && designFront ? undefined : slot => void save({ photos: { [slot]: null } }, "Photo removed")} />}
  </section>;
}
