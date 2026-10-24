"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ImagePlus } from "lucide-react";
import { SheetClose } from "@/components/sideRail/SideRail";
import { PhotoViewer } from "@/components/portal/PhotoSet";
import { photoForSlot, type SlotPhotos } from "@/components/portal/portalData";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { PHOTO_SET_VIEWS, PHOTO_SLOTS, type PhotoSlot } from "@/lib/portal";
import { isNativeApp } from "@/native/platform";
import { haptic } from "@/native/haptics";
import { buildTile, guideSvg, GUIDES, hasArt, svgToPng as guidePng, type SetView } from "./art";

const GROUPS: { id: string; title: string; note?: string }[] = [
  { id: "face", title: "Face" }, { id: "smile", title: "Smile" },
  { id: "teeth", title: "Teeth", note: "with retractors" }, { id: "arches", title: "Arches", note: "with a mirror" },
];
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** An empty view's drawing; it plays its motion once (`delay` after the page opens), and again on a long press. */
function ViewArt({ view, delay }: { view: SetView; delay: number }) {
  const host = useRef<HTMLSpanElement>(null);
  const tile = useRef<ReturnType<typeof buildTile> | null>(null);
  useLayoutEffect(() => {
    const t = buildTile(view); tile.current = t;
    host.current?.replaceChildren(t.svg);
    const anims = reducedMotion() ? [] : t.play(delay);
    return () => anims.forEach(a => a.cancel());
  }, [view, delay]);
  const timer = useRef(0);
  return <span ref={host} className="ps-art"
    onPointerDown={() => { timer.current = window.setTimeout(() => { if (!reducedMotion()) tile.current?.play(); }, 380); }}
    onPointerUp={() => clearTimeout(timer.current)} onPointerLeave={() => clearTimeout(timer.current)} onPointerCancel={() => clearTimeout(timer.current)} />;
}

/**
 * A case's photo set, as a page in the case card: the design photo first (Before / Concept), then the nine
 * guided views grouped Face · Smile · Teeth · Arches. Empty views show their drawing; Take photos opens the
 * guided camera at the first empty view; a view on its own is taken or chosen by tapping it.
 */
export function PhotoSetPage({ caseId, before, concept, onBack, onClose }: {
  caseId: string; before?: string; concept?: string; onBack: () => void; onClose: () => void;
}) {
  const [repository] = useState(getCaseRepository);
  const [thumbs, setThumbs] = useState<SlotPhotos>({});
  const [designThumb, setDesignThumb] = useState("");
  const [designFront, setDesignFront] = useState(false);
  const [viewing, setViewing] = useState<PhotoSlot | null>(null);
  const [shown, setShown] = useState<"concept" | "before">(concept ? "concept" : "before");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const native = isNativeApp();
  // The concept arrives a moment after the page opens: show it as soon as it does.
  const hadConcept = useRef(!!concept);
  useEffect(() => { if (concept && !hadConcept.current) { hadConcept.current = true; setShown("concept"); } }, [concept]);
  const files = useRef<HTMLInputElement>(null);
  const target = useRef<PhotoSlot | null>(null);

  const load = useCallback(async () => {
    const d = await repository.portalDetails(caseId).catch(() => null);
    const set = d?.portal.thumbs ?? {};
    setThumbs(set); setDesignThumb(d?.designThumb ?? ""); setDesignFront(!set.front && Boolean(d?.hasDesignPhoto));
  }, [caseId, repository]);
  useEffect(() => { void load(); return repository.subscribe(() => void load()); }, [load, repository]);

  const srcOf = (slot: PhotoSlot) => thumbs[slot] ?? (slot === "front" && designFront ? designThumb : undefined);
  const filled = PHOTO_SLOTS.map(s => s.id).filter(id => srcOf(id)) as PhotoSlot[];
  const taken = PHOTO_SET_VIEWS.filter(v => srcOf(v.id)).length;
  const others = PHOTO_SLOTS.filter(s => s.group === "other" && thumbs[s.id]);

  const save = async (photos: Partial<Record<PhotoSlot, string | null>>, done: string) => {
    setStatus("Saving…");
    try { await repository.updatePortal(caseId, { photos }); setStatus(done); haptic("success"); }
    catch { setStatus("The photo set couldn’t be saved. Check your connection and try again."); }
  };
  const fromFiles = async (list: File[], start?: PhotoSlot) => {
    const empty = PHOTO_SET_VIEWS.map(v => v.id).filter(id => !srcOf(id));
    const slots = start ? [start, ...empty.filter(id => id !== start)] : empty;
    const photos: Partial<Record<PhotoSlot, string>> = {};
    try { for (let i = 0; i < Math.min(list.length, slots.length); i++) photos[slots[i]] = await photoForSlot(list[i]); }
    catch (e) { setStatus(e instanceof Error ? e.message : "That photo couldn’t be added."); return; }
    if (Object.keys(photos).length) await save(photos, Object.keys(photos).length === 1 ? "Photo added" : `${Object.keys(photos).length} photos added`);
  };

  /** The guided camera, from `views` in order (the iOS app); a browser picks files instead. */
  const takeGuided = async (slots: SetView[]) => {
    if (!slots.length) return;
    if (!native) { target.current = slots.length === 1 ? slots[0] : null; files.current?.click(); return; }
    setBusy(true); setStatus("");
    try {
      const { takeNativePhotoSet } = await import("@/native/photos");
      const views = await Promise.all(slots.map(async (slot, i) => {
        const g = GUIDES[slot], jaws = g.motion === "jaws";
        return {
          id: slot, title: PHOTO_SLOTS.find(s => s.id === slot)!.label, hint: g.hint, step: slots.length > 1 ? `${i + 1} of ${slots.length}` : "",
          guide: await guidePng(guideSvg(slot, jaws ? "upper" : undefined)), guideLower: jaws ? await guidePng(guideSvg(slot, "lower")) : undefined,
          motion: g.motion, midlines: g.midlines, mirror: g.mirror, light: g.light, zoom: g.zoom,
        };
      }));
      const shots = await takeNativePhotoSet(views);
      const photos: Partial<Record<PhotoSlot, string>> = {};
      for (const shot of shots) photos[shot.id as PhotoSlot] = await photoForSlot(shot.file);
      if (shots.length) await save(photos, shots.length === 1 ? "Photo added" : `${shots.length} photos added`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "The camera couldn’t be opened.");
    } finally { setBusy(false); }
  };
  const emptyViews = PHOTO_SET_VIEWS.map(v => v.id).filter(id => !srcOf(id) && hasArt(id)) as SetView[];

  let order = 0;
  const tile = (slot: PhotoSlot) => {
    const src = srcOf(slot), label = PHOTO_SLOTS.find(s => s.id === slot)!.label, delay = 80 + order++ * 120;
    return <button key={slot} type="button" className={`ps-tile${src ? " filled" : ""}`} disabled={busy}
      aria-label={src ? `${label}: view photo` : `${label}: add photo`}
      onClick={() => { if (src) setViewing(slot); else if (hasArt(slot)) void takeGuided([slot]); }}>
      {src ? <><img src={src} alt="" draggable={false} /><span className="ps-ok" aria-hidden="true"><Check size={12} strokeWidth={2.6} /></span>{slot === "front" && !thumbs.front && <span className="ps-design">Design</span>}</>
        : hasArt(slot) ? <ViewArt view={slot} delay={delay} /> : null}
      <span className="ps-name">{label}</span>
    </button>;
  };
  const hero = shown === "concept" ? concept : before;

  return <>
    <div className="log-head ps-head">
      <button type="button" className="case-back" onClick={onBack}><ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />Case</button>
      <SheetClose onClose={onClose} />
    </div>
    <div className="ps-body">
      <div className="ps-lead">
        <div className="ps-title"><h2>Photo set</h2><span className="ps-count">{taken} of {PHOTO_SET_VIEWS.length}</span></div>
        {(before || concept) && <div className="ps-hero">
          {hero ? <img src={hero} alt={shown === "concept" ? "Smile concept" : "Before"} /> : null}
          {before && concept && <div className="ps-seg" role="tablist" aria-label="Design photo">
            <button type="button" role="tab" aria-selected={shown === "before"} onClick={() => setShown("before")}>Before</button>
            <button type="button" role="tab" aria-selected={shown === "concept"} onClick={() => setShown("concept")}>Concept</button>
          </div>}
          <span className="ps-hero-label">Design photo</span>
        </div>}
        <div className="ps-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => { target.current = null; files.current?.click(); }}><ImagePlus size={17} strokeWidth={1.8} aria-hidden="true" />{native ? "Choose" : "Add photos"}</button>
          {native && <button type="button" className="primary-button" disabled={busy || !emptyViews.length} onClick={() => void takeGuided(emptyViews)}><Camera size={17} strokeWidth={1.8} aria-hidden="true" />{emptyViews.length ? (taken ? "Take the rest" : "Take photos") : "All taken"}</button>}
        </div>
        {status && <p className="control-hint ps-status" role="status">{status}</p>}
      </div>
      <div className="ps-groups">
        {GROUPS.map(g => <section key={g.id} className={`ps-group ps-${g.id}`} aria-label={g.title}>
          <h3>{g.title}{g.note && <em>{g.note}</em>}</h3>
          <div className="ps-tiles">{PHOTO_SET_VIEWS.filter(v => v.group === g.id).map(v => tile(v.id))}</div>
        </section>)}
        {others.length > 0 && <section className="ps-group ps-other" aria-label="Other photos">
          <h3>Other photos</h3><div className="ps-tiles">{others.map(o => tile(o.id))}</div>
        </section>}
      </div>
    </div>
    <input ref={files} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={e => {
      const list = [...(e.target.files ?? [])]; e.target.value = "";
      if (list.length) void fromFiles(list, target.current ?? undefined);
    }} />
    {viewing && <PhotoViewer slot={viewing} filled={filled}
      load={slot => (slot === "front" && designFront ? repository.portalDesignPhoto(caseId) : repository.portalPhoto(caseId, slot))}
      onClose={() => setViewing(null)} onMove={setViewing}
      onReplace={(slot, photo) => void save({ [slot]: photo }, "Photo replaced")}
      onRemove={viewing === "front" && designFront ? undefined : slot => void save({ [slot]: null }, "Photo removed")} />}
  </>;
}
