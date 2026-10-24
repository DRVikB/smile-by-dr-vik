"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Play, RefreshCw, Share, Trash2, X } from "lucide-react";
import { SPEECH_STEPS, scanNotes, speechNotes, type CaseMediaRecord, type FaceScanRecord, type SpeechRecord } from "@/lib/caseMedia";
import { faceScanAvailable, listCaseMedia, openFaceScan, recordSpeechVideo, removeCaseMedia, scanFace, setSpeechFrame, shareCaseMedia } from "@/native/caseMedia";
import { haptic } from "@/native/haptics";
import { guideSvg, svgToPng } from "./art";
import { buildMediaTile, type MediaKind, type Playing } from "./mediaArt";

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`; };

/** An empty tile's drawing; its motion plays once (`delay` after the page opens), and again on a long press. */
function MediaArt({ kind, delay }: { kind: MediaKind; delay: number }) {
  const host = useRef<HTMLSpanElement>(null);
  const tile = useRef<ReturnType<typeof buildMediaTile> | null>(null);
  const playing = useRef<Playing[]>([]);
  useLayoutEffect(() => {
    const t = buildMediaTile(kind); tile.current = t;
    host.current?.replaceChildren(t.svg);
    playing.current = reducedMotion() ? [] : t.play(delay);
    return () => playing.current.forEach(p => p.cancel());
  }, [kind, delay]);
  const timer = useRef(0);
  const replay = () => { if (reducedMotion() || !tile.current) return; playing.current.forEach(p => p.cancel()); playing.current = tile.current.play(); };
  return <span ref={host} className="ps-art"
    onPointerDown={() => { timer.current = window.setTimeout(replay, 380); }}
    onPointerUp={() => clearTimeout(timer.current)} onPointerLeave={() => clearTimeout(timer.current)} onPointerCancel={() => clearTimeout(timer.current)} />;
}

function MediaTile({ kind, label, detail, poster, delay, disabled, onClick }: {
  kind: MediaKind; label: string; detail: string; poster?: string; delay: number; disabled: boolean; onClick: () => void;
}) {
  return <button type="button" className={`ps-media-tile${poster ? " filled" : ""}`} disabled={disabled} onClick={onClick}
    aria-label={`${label}, ${detail}`}>
    <span className="ps-media-art">{poster ? <><img src={poster} alt="" draggable={false} /><span className="ps-media-mark" aria-hidden="true">
      {kind === "speech" ? <Play size={10} strokeWidth={2.8} /> : <Box size={11} strokeWidth={2.4} />}</span></> : <MediaArt kind={kind} delay={delay} />}</span>
    <span className="ps-media-text"><strong>{label}</strong><small>{detail}</small></span>
  </button>;
}

/** Delete needs a second tap within a few seconds. */
function useSecondTap(action: () => void): [boolean, () => void] {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(t); }, [armed]);
  return [armed, () => { if (armed) { setArmed(false); action(); } else setArmed(true); }];
}

/**
 * The speech video and the 3D face scan in a case's photo set: admin-only for now, recorded in the iOS app and
 * kept on this device. An empty tile records or scans; a filled one opens it. A new take replaces the last.
 */
export function CaseMediaGroup({ caseId, reference, disabled, delay, onStatus }: {
  caseId: string; reference?: string; disabled: boolean; delay: number; onStatus: React.Dispatch<React.SetStateAction<string>>;
}) {
  // A done message clears itself, so the page keeps fitting one screen.
  const done = (text: string) => { onStatus(text); window.setTimeout(() => onStatus(cur => (cur === text ? "" : cur)), 3500); };
  const [records, setRecords] = useState<CaseMediaRecord[]>([]);
  const [working, setWorking] = useState(false);
  const [viewing, setViewing] = useState<MediaKind | null>(null);
  const load = useCallback(async () => { try { setRecords(await listCaseMedia(caseId)); } catch { setRecords([]); } }, [caseId]);
  useEffect(() => { void load(); }, [load]);
  const speech = records.find((r): r is SpeechRecord => r.kind === "speech");
  const scan = records.find((r): r is FaceScanRecord => r.kind === "scan");

  const keep = async (record: CaseMediaRecord) => {
    await Promise.all(records.filter(r => r.kind === record.kind && r.id !== record.id).map(r => removeCaseMedia(caseId, r.id).catch(() => {})));
    await load();
  };
  const take = async (kind: MediaKind) => {
    setViewing(null); setWorking(true); onStatus("");
    try {
      if (kind === "scan" && !(await faceScanAvailable())) { onStatus("The face scan needs an iPhone or iPad with Face ID (the TrueDepth camera)."); return; }
      const record = kind === "speech" ? await recordSpeechVideo(caseId, await svgToPng(guideSvg("rest")).catch(() => undefined)) : await scanFace(caseId);
      if (!record) return;
      await keep(record);
      haptic("success");
      done(kind === "speech" ? "Speech video saved on this device" : "Face scan saved on this device");
      setViewing(kind);
    } catch (e) {
      onStatus(e instanceof Error ? e.message : kind === "speech" ? "The speech video couldn’t be recorded." : "The face scan couldn’t be made.");
    } finally { setWorking(false); }
  };
  const remove = async (record: CaseMediaRecord) => {
    setViewing(null);
    try { await removeCaseMedia(caseId, record.id); done(record.kind === "speech" ? "Speech video deleted" : "Face scan deleted"); }
    catch { onStatus("That couldn’t be deleted. Please try again."); }
    await load();
  };
  const share = async (record: CaseMediaRecord) => {
    try { if (await shareCaseMedia(caseId, record.id, record.kind === "speech" ? speechNotes(record, reference) : scanNotes(record, reference))) done("Shared"); }
    catch (e) { onStatus(e instanceof Error ? e.message : "That couldn’t be shared."); }
  };

  return <>
    <section className="ps-group ps-media" aria-label="Speech video and 3D face scan">
      <h3>Video and scan<em>Admin only</em></h3>
      <div className="ps-tiles">
        <MediaTile kind="speech" label="Speech video" poster={speech?.poster || undefined} delay={delay} disabled={disabled || working}
          detail={speech ? `${Math.round(speech.duration)} s · ${speech.steps.length} frames` : "Tap to record"}
          onClick={() => (speech ? setViewing("speech") : void take("speech"))} />
        <MediaTile kind="scan" label="3D face scan" poster={scan?.poster || undefined} delay={delay + 120} disabled={disabled || working}
          detail={scan ? `${scan.captures.length} ${scan.captures.length === 1 ? "scan" : "scans"}` : "Tap to scan"}
          onClick={() => (scan ? setViewing("scan") : void take("scan"))} />
      </div>
    </section>
    {/* Full screen, above the case card (which clips what's inside it). */}
    {viewing === "speech" && speech && createPortal(<SpeechViewer caseId={caseId} record={speech} onClose={() => setViewing(null)}
      onShare={() => void share(speech)} onRetake={() => void take("speech")} onDelete={() => void remove(speech)}
      onChange={r => setRecords(list => list.map(x => (x.id === r.id ? r : x)))} />, document.body)}
    {viewing === "scan" && scan && createPortal(<ScanViewer caseId={caseId} record={scan} onClose={() => setViewing(null)}
      onShare={() => void share(scan)} onRetake={() => void take("scan")} onDelete={() => void remove(scan)} />, document.body)}
  </>;
}

function ViewerTop({ title, createdAt, retake, onShare, onRetake, onDelete, onClose }: {
  title: string; createdAt: string; retake: string; onShare: () => void; onRetake: () => void; onDelete: () => void; onClose: () => void;
}) {
  const [armed, del] = useSecondTap(onDelete);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return <div className="pt-viewer-top">
    <span>{title}<small> · {when(createdAt)}</small></span>
    <span className="pt-viewer-actions">
      <button type="button" aria-label="Share" onClick={onShare}><Share size={15} /><span className="mv-label">Share</span></button>
      <button type="button" aria-label={retake} onClick={onRetake}><RefreshCw size={15} /><span className="mv-label">{retake}</span></button>
      <button type="button" className={armed ? "mv-armed" : undefined} aria-label={armed ? "Tap again to delete" : "Delete"} onClick={del}>
        <Trash2 size={15} />{armed ? <span>Tap again</span> : <span className="mv-label">Delete</span>}
      </button>
      <button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
    </span>
  </div>;
}

/** The speech video with its steps: each step's still frame for the lab, moved to a better moment if needed. */
function SpeechViewer({ caseId, record, onClose, onShare, onRetake, onDelete, onChange }: {
  caseId: string; record: SpeechRecord; onClose: () => void; onShare: () => void; onRetake: () => void; onDelete: () => void; onChange: (r: SpeechRecord) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [selected, setSelected] = useState(0);
  const [at, setAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const step = record.steps[selected];
  const guide = SPEECH_STEPS.find(s => s.id === step?.id);
  const pick = (i: number) => {
    setSelected(i); setNote("");
    const v = video.current, s = record.steps[i];
    if (v && s) { v.pause(); v.currentTime = s.frameTime; }
  };
  const paused = () => { const v = video.current; if (v && v.paused) setAt(v.currentTime); };
  const moved = at !== null && !!step && Math.abs(at - step.frameTime) > 0.04 && at >= step.start - 0.5 && at <= step.end + 0.5;
  const saveMoment = async () => {
    if (!step || at === null) return;
    setSaving(true);
    try { const r = await setSpeechFrame(caseId, record.id, step.id, at); if (r) { onChange(r); setNote(`Frame moved to ${at.toFixed(1)} s`); } }
    catch { setNote("That frame couldn’t be saved. Please try again."); }
    finally { setSaving(false); }
  };
  return <div className="pt-viewer media-viewer" role="dialog" aria-modal="true" aria-label="Speech video">
    <ViewerTop title="Speech video" createdAt={record.createdAt} retake="Record again" onShare={onShare} onRetake={onRetake} onDelete={onDelete} onClose={onClose} />
    <div className="mv-body">
      <video ref={video} className="mv-video" src={record.video} poster={record.poster || undefined} controls playsInline preload="metadata"
        onPause={paused} onSeeked={paused} />
      <div className="mv-steps" role="tablist" aria-label="Steps">
        {record.steps.map((s, i) => <button key={s.id} type="button" role="tab" aria-selected={i === selected} className="mv-step" onClick={() => pick(i)}>
          {s.frame ? <img src={s.frame} alt="" draggable={false} /> : <span className="mv-step-blank" />}
          <span>{s.title}</span>
        </button>)}
      </div>
      {step && <div className="mv-note">
        <strong>{step.title} · frame at {step.frameTime.toFixed(1)} s</strong>
        <p>{guide?.checks}</p>
        {moved && <button type="button" className="primary-button" disabled={saving} onClick={() => void saveMoment()}>Use {at!.toFixed(1)} s for this frame</button>}
        {!moved && !note && <p className="mv-hint">To use a better moment, pause the video there.</p>}
        {note && <p className="mv-hint" role="status">{note}</p>}
      </div>}
      <p className="mv-privacy">Kept on this device only. Sharing sends an identifiable video of the patient: check they have agreed before it goes to the lab.</p>
    </div>
  </div>;
}

/** The face scan's captures, opened in 3D by the iOS app. */
function ScanViewer({ caseId, record, onClose, onShare, onRetake, onDelete }: {
  caseId: string; record: FaceScanRecord; onClose: () => void; onShare: () => void; onRetake: () => void; onDelete: () => void;
}) {
  const [note, setNote] = useState("");
  return <div className="pt-viewer media-viewer" role="dialog" aria-modal="true" aria-label="3D face scan">
    <ViewerTop title="3D face scan" createdAt={record.createdAt} retake="Scan again" onShare={onShare} onRetake={onRetake} onDelete={onDelete} onClose={onClose} />
    <div className="mv-body">
      <div className="mv-scans">
        {record.captures.map(c => <figure key={c.id} className="mv-scan">
          {c.preview ? <img src={c.preview} alt={`${c.title} scan`} draggable={false} /> : <span className="mv-step-blank" />}
          <figcaption><strong>{c.title}</strong><span>Turned {Math.round(c.turned[0])}° left, {Math.round(c.turned[1])}° right · {c.vertices.toLocaleString("en-GB")} points</span></figcaption>
        </figure>)}
      </div>
      <button type="button" className="primary-button mv-open" onClick={() => void openFaceScan(caseId, record.id).catch(() => setNote("The scan couldn’t be opened."))}>
        <Box size={17} strokeWidth={1.8} aria-hidden="true" />View in 3D
      </button>
      {note && <p className="mv-hint" role="status">{note}</p>}
      <p className="mv-hint">Studies of iPhone face scans report about 0.4–1 mm across the face, with larger errors around the lips: use it for facial proportions and planes. The lab lines it up with the intraoral scan on the front teeth in the Teeth showing scan.</p>
      <p className="mv-privacy">Kept on this device only. Sharing sends an identifiable scan of the patient’s face: check they have agreed before it goes to the lab.</p>
    </div>
  </div>;
}
