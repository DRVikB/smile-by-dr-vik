"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, FlaskConical, Heart, Home, LibraryBig, Plus, Search, Settings, ShieldCheck, UserRound, CreditCard, Cloud } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { useCaseLibrary } from "@/components/caseLibrary/caseLibraryContext";
import { CreatorSignature } from "@/components/Brand";
import { AllowancePill } from "@/components/account/Allowance";
import { DOCUMENT_VERSIONS } from "@/config/legal";
import { PHOTO_SLOTS, caseTitle, cleanReference, initialsOf, statusLabel, type CaseStatus, type PhotoSlot } from "@/lib/portal";
import { PhotoSet, PhotoViewer } from "./PhotoSet";
import { PortalCase } from "./PortalCase";
import { LabNotifications, LabsProvider, LabsView, useLabs } from "./labs";
import { AdminView, useAdmin } from "./AdminView";
import { photoForSlot, relativeDate, usePortalCases, type PortalCaseCard, type SlotPhotos } from "./portalData";
import { features } from "@/config/features";

type View = { name: "home" } | { name: "cases" } | { name: "labs" } | { name: "admin" } | { name: "new"; files?: File[] } | { name: "case"; id: string; tab?: "lab" };
type Filter = "all" | CaseStatus | "fav";

export interface PortalStart { hasDraft: boolean; name: string; front?: string }

/**
 * The SmileCompose web portal for signed-in clinicians on a computer: cases built around the
 * clinical photo set, the Design Studio for the smile itself, and Labs for secure lab links.
 */
export function WebPortal(props: { onOpenStudio: (caseId: string, start: PortalStart) => void }) {
  return <LabsProvider><Portal {...props} /></LabsProvider>;
}

function Portal({ onOpenStudio }: { onOpenStudio: (caseId: string, start: PortalStart) => void }) {
  const account = useAccount();
  const caseLibrary = useCaseLibrary();
  const { shares } = useLabs();
  const admin = useAdmin();
  const { cases, repository } = usePortalCases();
  // Signing in or opening SmileCompose always starts on Home.
  const [view, setView] = useState<View>({ name: "home" });
  const [query, setQuery] = useState("");
  useEffect(() => {
    // An older version remembered the last screen; forget it so nothing reopens it.
    try { sessionStorage.removeItem("portal.view"); } catch { /* private mode */ }
    window.scrollTo({ top: 0 });
  }, [view]);
  const go = (next: View) => setView(next);
  const openLabs = shares.filter(s => s.state === "sent" || s.state === "viewed").length;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !cases) return null;
    return cases.filter(c => `${caseTitle(c.name, c.reference, c.createdAt)} ${c.reference} ${c.tags.join(" ")} ${c.labels.join(" ")}`.toLowerCase().includes(q)).slice(0, 8);
  }, [query, cases]);

  const nav = (name: View["name"], label: string, Icon: typeof Home, count?: number) =>
    <button className={`pt-nav-item${view.name === name || (name === "cases" && view.name === "case") ? " on" : ""}`} onClick={() => go({ name } as View)}>
      <Icon size={19} strokeWidth={1.7} />{label}{count ? <span className="pt-count">{count}</span> : null}</button>;

  return <div className="pt-app">
    <aside className="pt-side">
      <a className="pt-brand" href="/welcome" aria-label="SmileCompose website"><img src="/brand/smilecompose-mark.svg" alt="" width={28} height={28} />SmileCompose</a>
      <nav className="pt-nav" aria-label="Portal">
        {nav("home", "Home", Home)}
        {nav("cases", "Cases", CalendarDays, cases?.length)}
        <button className="pt-nav-item" onClick={() => caseLibrary.open()}><LibraryBig size={19} strokeWidth={1.7} />Case Library</button>
        {features.labExport && nav("labs", "Labs", FlaskConical, openLabs)}
        {admin.isAdmin && nav("admin", "Admin", ShieldCheck, view.name === "admin" ? 0 : admin.unseen)}
        <hr />
        <button className="pt-nav-item" onClick={() => account.openSettings("profile")}><UserRound size={19} strokeWidth={1.7} />Account</button>
        <button className="pt-nav-item" onClick={() => account.openSettings("subscription")}><CreditCard size={19} strokeWidth={1.7} />Subscription</button>
        <button className="pt-nav-item" onClick={() => account.openSettings()}><Settings size={19} strokeWidth={1.7} />Settings</button>
      </nav>
      <div className="pt-side-card">
        <Cloud size={22} strokeWidth={1.6} />
        <h4>Your cases, on every device</h4>
        <p>Saved privately to your account and ready on iPad, iPhone and here.</p>
      </div>
      <div className="pt-creator"><CreatorSignature /></div>
    </aside>

    <div className="pt-main">
      <header className="pt-top">
        <label className="pt-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search patients, case refs or treatments…" aria-label="Search cases" />
          {matches && <div className="pt-results" role="listbox">{matches.length ? matches.map(c => <button key={c.id} role="option" aria-selected="false" onClick={() => { setQuery(""); go({ name: "case", id: c.id }); }}>
            {c.thumb ? <img src={c.thumb} alt="" /> : <span className="pt-ini">{initialsOf(c.name || c.reference)}</span>}<span><b>{caseTitle(c.name, c.reference, c.createdAt)}</b><small>{[c.reference, statusLabel(c.status), ...c.labels].filter(Boolean).join(" · ")}</small></span></button>)
            : <p className="pt-hint">No cases match “{query}”.</p>}</div>}
        </label>
        <AllowancePill className="pt-allowance" />
        {features.labExport && <LabNotifications onOpenCase={id => go({ name: "case", id, tab: "lab" })} />}
        <button className="pt-me" onClick={() => account.openSettings("profile")}>
          {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <span className="pt-av">{account.initials}</span>}
          <span><b>{account.displayName || "Your account"}</b><small>{account.user?.email}</small></span>
        </button>
      </header>
      <div className="pt-page">
        {view.name === "home" && <HomeView cases={cases} onOpen={id => go({ name: "case", id })} onNew={files => go({ name: "new", files })} name={account.displayName ?? ""} repository={repository} />}
        {view.name === "cases" && <CasesView cases={cases} onOpen={id => go({ name: "case", id })} onNew={() => go({ name: "new" })} />}
        {view.name === "labs" && features.labExport && <LabsView onOpenCase={id => go({ name: "case", id })} />}
        {view.name === "admin" && admin.isAdmin && <AdminView />}
        {view.name === "new" && <NewCaseView initialFiles={view.files} onCancel={() => go({ name: "home" })} repository={repository}
          onSaved={id => go({ name: "case", id })} onDesign={(id, start) => onOpenStudio(id, start)} />}
        {view.name === "case" && <PortalCase key={`${view.id}-${view.tab ?? ""}`} caseId={view.id} initialTab={view.tab} repository={repository} onBack={() => go({ name: "home" })} onOpenStudio={onOpenStudio} />}
      </div>
    </div>
  </div>;
}

function greeting(name: string) {
  const h = new Date().getHours();
  return `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}${name ? `, ${name}` : ""}`;
}

function CaseCard({ c, onOpen, onFavourite, delay }: { c: PortalCaseCard; onOpen: () => void; onFavourite?: () => void; delay: number }) {
  return <article className="pt-card pt-casecard" style={{ animationDelay: `${delay}ms` }}>
    <button className="pt-casecard-hit" onClick={onOpen} aria-label={`Open ${caseTitle(c.name, c.reference, c.createdAt)}`} />
    <div className="pt-thumb">{c.thumb ? <img src={c.thumb} alt="" /> : <span className="pt-thumb-empty">{initialsOf(c.name || c.reference)}</span>}
      <span className={`pt-state ${c.status}`}>{statusLabel(c.status)}</span>
      {onFavourite && <button className={`pt-fav${c.favourite ? " on" : ""}`} aria-pressed={c.favourite} aria-label="Favourite" onClick={onFavourite}><Heart size={15} fill={c.favourite ? "currentColor" : "none"} /></button>}
    </div>
    <div className="pt-casecard-body">
      <div className="pt-casecard-name"><span className="pt-ini">{initialsOf(c.name || c.reference)}</span><b>{caseTitle(c.name, c.reference, c.createdAt)}</b>{c.name && c.reference && <span className="pt-ref">{c.reference}</span>}</div>
      {c.labels.length > 0 && <div className="pt-labels">{c.labels.map(t => <span key={t} className="pt-label">{t}</span>)}</div>}
      <div className="pt-tags">{c.tags.length ? c.tags.map(t => <span key={t} className="pt-tag">{t}</span>) : <span className="pt-tag muted">{c.concepts ? `${c.concepts} concept${c.concepts === 1 ? "" : "s"}` : "Not designed yet"}</span>}</div>
      <span className="pt-when">{relativeDate(c.updatedAt)}</span>
    </div>
  </article>;
}

function HomeView({ cases, onOpen, onNew, name, repository }: { cases: PortalCaseCard[] | null; onOpen: (id: string) => void; onNew: (files?: File[]) => void; name: string; repository: ReturnType<typeof usePortalCases>["repository"] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const shown = (cases ?? []).filter(c => (filter === "all" || (filter === "fav" ? c.favourite : c.status === filter)) && (!tag || c.labels.includes(tag)));
  const usedTags = [...new Set((cases ?? []).flatMap(c => c.labels))];
  const filters: [Filter, string][] = [["all", "All"], ["progress", "In progress"], ...(features.labExport ? [["lab", "With lab"] as [Filter, string]] : []), ["done", "Completed"], ["fav", "Favourites"]];
  return <section className="pt-view">
    <div className="pt-row pt-between">
      <div><h1 className="pt-h1">{greeting(name)}</h1><p className="pt-sub">Pick up where you left off, or drop in a new patient’s photos to start.</p></div>
      <button className="pt-btn pt-btn-dark" onClick={() => onNew()}><Plus size={16} />New case</button>
    </div>
    <div className={`pt-drop${over ? " over" : ""}`} role="button" tabIndex={0} onClick={() => onNew()} onKeyDown={e => { if (e.key === "Enter") onNew(); }}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)); if (files.length) onNew(files); }}>
      <div>
        <p className="pt-eyebrow">Start with photos</p>
        <h2>Drop a patient’s photos here</h2>
        <p>Up to eight: smile front, right and left, retracted front, right and left, and both arches. They fill the slots in order, and you can move any of them before you save. The smile front is used for the design.</p>
      </div>
      <div className="pt-mini">{PHOTO_SLOTS.map(s => <span key={s.id} className={s.id === "front" ? "key" : ""}>{s.short}</span>)}</div>
    </div>
    <div className="pt-row pt-between pt-gap-b">
      <h2 className="pt-h2 flush">Recent cases</h2>
      <div className="pt-filters">{filters.map(([key, label]) => <button key={key} className={`pt-chip${filter === key ? " on" : ""}`} onClick={() => setFilter(key)}>{key === "fav" && <Heart size={13} />}{label}</button>)}</div>
    </div>
    {usedTags.length > 0 && <div className="pt-tagbar" role="group" aria-label="Filter by tag">
      <span className="pt-hint">Tags</span>
      {usedTags.map(t => <button key={t} className={`pt-label pt-label-btn${tag === t ? " on" : ""}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>)}
    </div>}
    {cases === null ? <div className="pt-grid">{[0, 1, 2, 3].map(i => <div key={i} className="pt-card pt-casecard pt-skeleton" />)}</div>
      : shown.length ? <div className="pt-grid">{shown.slice(0, 12).map((c, i) => <CaseCard key={c.id} c={c} delay={i * 40} onOpen={() => onOpen(c.id)}
          onFavourite={c.latestEntryId ? () => void repository.setFavourite(c.latestEntryId!, !c.favourite) : undefined} />)}</div>
      : <div className="pt-card pt-empty-card"><p>{cases.length ? "No cases match this filter." : "Your cases will appear here. Drop a patient’s photos above to start your first one."}</p></div>}
  </section>;
}

function CasesView({ cases, onOpen, onNew }: { cases: PortalCaseCard[] | null; onOpen: (id: string) => void; onNew: () => void }) {
  return <section className="pt-view">
    <div className="pt-row pt-between"><div><h1 className="pt-h1">Cases</h1><p className="pt-sub">Every case on your account, newest first.</p></div><button className="pt-btn pt-btn-dark" onClick={onNew}><Plus size={16} />New case</button></div>
    <div className="pt-card pt-table-wrap pt-gap-t">
      {cases?.length ? <table className="pt-table">
        <thead><tr><th>Patient</th><th>Case ref</th><th>Tags</th><th>Treatment</th><th>Photos</th><th>Status</th><th>Updated</th></tr></thead>
        <tbody>{cases.map(c => <tr key={c.id} className="pt-click" onClick={() => onOpen(c.id)}>
          <td><div className="pt-row">{c.thumb ? <img className="pt-mini-thumb" src={c.thumb} alt="" /> : <span className="pt-ini">{initialsOf(c.name || c.reference)}</span>}<button className="pt-link" onClick={() => onOpen(c.id)}><b>{caseTitle(c.name, c.reference, c.createdAt)}</b></button></div></td>
          <td className="pt-ref">{c.reference || "–"}</td><td>{c.labels.length ? <span className="pt-labels inline">{c.labels.map(t => <span key={t} className="pt-label">{t}</span>)}</span> : "–"}</td><td>{c.tags.join(", ") || (c.concepts ? "Concept" : "Not designed yet")}</td><td>{c.photoCount || "–"}</td>
          <td><span className={`pt-pill ${c.status === "done" ? "ok" : c.status === "lab" ? "gold" : "wait"}`}>{statusLabel(c.status)}</span></td><td className="pt-ref">{relativeDate(c.updatedAt)}</td>
        </tr>)}</tbody></table>
        : <p className="pt-hint pt-pad">{cases ? "No cases yet." : "Loading cases…"}</p>}
    </div>
  </section>;
}

function NewCaseView({ initialFiles, onCancel, onSaved, onDesign, repository }: {
  initialFiles?: File[]; onCancel: () => void; onSaved: (id: string) => void; onDesign: (id: string, start: PortalStart) => void;
  repository: ReturnType<typeof usePortalCases>["repository"];
}) {
  const account = useAccount();
  const [id] = useState(() => crypto.randomUUID());
  const [photos, setPhotos] = useState<SlotPhotos>({});
  const [name, setName] = useState(""), [reference, setReference] = useState("");
  const [authority, setAuthority] = useState(false);
  const [viewing, setViewing] = useState<PhotoSlot | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    if (!initialFiles?.length) return;
    let cancelled = false;
    void (async () => {
      const next: SlotPhotos = {};
      const slots = PHOTO_SLOTS.map(s => s.id);
      for (let i = 0; i < Math.min(PHOTO_SLOTS.length, initialFiles.length); i++) {
        try { next[slots[i]] = await photoForSlot(initialFiles[i]); } catch (e) { setError(e instanceof Error ? e.message : "A photo couldn’t be added."); }
      }
      if (!cancelled) setPhotos(next);
    })();
    return () => { cancelled = true; };
  }, [initialFiles]);
  const change = (changes: Partial<Record<PhotoSlot, string | null>>) => setPhotos(current => {
    const next = { ...current };
    for (const [slot, value] of Object.entries(changes)) { if (value) next[slot as PhotoSlot] = value; else delete next[slot as PhotoSlot]; }
    return next;
  });
  async function save(design: boolean) {
    setError("");
    if (!Object.keys(photos).length) { setError("Add at least one photo."); return; }
    if (design && !photos.front) { setError("Add the smile front photo to design the smile."); return; }
    if (!authority) { setError("Confirm you’re authorised to upload these photos."); return; }
    setBusy(true);
    try {
      void account.recordConsent({ type: "upload_authority", version: DOCUMENT_VERSIONS.upload_authority, caseId: id });
      const { front, ...rest } = photos;
      // The smile front travels with the design once the studio opens; until then it's part of the set.
      await repository.updatePortal(id, { name, reference: cleanReference(reference), status: "progress", photos: design ? rest : photos });
      if (design) onDesign(id, { hasDraft: false, name, front }); else onSaved(id);
    } catch {
      setError("The case couldn’t be saved. Check your connection and try again.");
      setBusy(false);
    }
  }
  return <section className="pt-view">
    <button className="pt-back" onClick={onCancel}><ArrowRight size={15} className="pt-flip" />Home</button>
    <h1 className="pt-h1">New case</h1>
    <p className="pt-sub">Add the photos you have. Only the smile front is needed to design; the rest stay with the case{features.labExport ? " and can go to the lab" : ""}.</p>
    <div className="pt-newgrid">
      <div className="pt-card pt-pad">
        <PhotoSet thumbs={photos} layout="large" busy={busy} onAdd={change}
          onSwap={(a, b) => setPhotos(current => { const next = { ...current }; const x = next[a], y = next[b]; if (y) next[a] = y; else delete next[a]; if (x) next[b] = x; else delete next[b]; return next; })}
          onOpen={setViewing} />
        {viewing && <PhotoViewer slot={viewing} filled={PHOTO_SLOTS.map(s => s.id).filter(id => photos[id])} load={async slot => photos[slot] ?? null}
          onClose={() => setViewing(null)} onMove={setViewing} onReplace={(slot, photo) => change({ [slot]: photo })} onRemove={slot => change({ [slot]: null })} />}
      </div>
      <aside className="pt-card pt-pad pt-sticky">
        <label className="pt-field">Patient name or initials<input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="e.g. Sophie R." /></label>
        <label className="pt-field">Case reference<input value={reference} maxLength={40} onChange={e => setReference(e.target.value)} placeholder="e.g. SR-1025" />
          <span className="pt-hint">Your practice reference. Avoid dates of birth or NHS numbers.</span></label>
        <label className="pt-check pt-consent"><input type="checkbox" checked={authority} onChange={e => setAuthority(e.target.checked)} /><span>I’m authorised to upload these photos and the patient has agreed to their use for this consultation.</span></label>
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="pt-btn pt-btn-gold pt-btn-block" disabled={busy} onClick={() => void save(true)}>Continue to Design Studio <ArrowRight size={16} /></button>
        <button className="pt-btn pt-btn-line pt-btn-block" disabled={busy} onClick={() => void save(false)}>Save case for later</button>
      </aside>
    </div>
  </section>;
}
