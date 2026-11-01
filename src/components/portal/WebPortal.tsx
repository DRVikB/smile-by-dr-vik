"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, CalendarDays, Columns3, FlaskConical, Heart, Home, LibraryBig, List, Phone, Plus, ReceiptText, Search, Settings, ShieldCheck, UserRound, CreditCard, Cloud, Upload } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { useCaseLibrary } from "@/components/caseLibrary/caseLibraryContext";
import { CreatorSignature } from "@/components/Brand";
import { AllowancePill, useAllowance } from "@/components/account/Allowance";
import { SettingsView } from "@/components/settings/SettingsView";
import type { SettingsSection } from "@/components/settings/settingsParts";
import { DOCUMENT_VERSIONS } from "@/config/legal";
import { AGREED_STAGES, CASE_TAGS, PHOTO_SLOTS, caseTitle, cleanReference, initialsOf, invoiceTotal, stageOf, statusLabel, type CaseStatus, type PhotoSlot, type PortalPatch } from "@/lib/portal";
import { DAY, daysBetween, gbp, invoiceState, startOfDay } from "@/lib/billing";
import { BillingView } from "./Billing";
import { InsightsView } from "./Insights";
import { caseActions, weekly, FOLLOW_UP_DAYS, type CaseAction } from "./caseSignals";
import { PhotoSet, PhotoViewer } from "./PhotoSet";
import { PortalCase } from "./PortalCase";
import { LabNotifications, LabsProvider, LabsView, useLabs } from "./labs";
import { AdminView, useAdmin } from "./AdminView";
import { photoForSlot, relativeDate, usePortalCases, type PortalCaseCard, type SlotPhotos } from "./portalData";
import { features } from "@/config/features";
import { ComposingMark } from "@/components/ComposingMark";
import { takeWebWelcome } from "@/lib/webEntry";

export type CaseTab = "details" | "activity" | "billing" | "design" | "notes" | "lab";
type View = { name: "home" } | { name: "cases" } | { name: "pipeline" } | { name: "billing" } | { name: "insights" } | { name: "labs" } | { name: "admin" } | { name: "new"; files?: File[] } | { name: "case"; id: string; tab?: CaseTab } | { name: "settings"; section: SettingsSection };
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
  const { cases, allCases, repository } = usePortalCases();
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
  const needs = useMemo(() => (cases ?? []).filter(c => caseActions(c).some(a => a.urgent)).length, [cases]);
  const unpaid = useMemo(() => (allCases ?? []).flatMap(c => c.invoices).filter(i => invoiceState(i) === "overdue").length, [allCases]);
  const update = (id: string, patch: PortalPatch) => repository.updatePortal(id, patch);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !cases) return null;
    return cases.filter(c => `${caseTitle(c.name, c.reference, c.createdAt)} ${c.reference} ${c.tags.join(" ")} ${c.labels.join(" ")}`.toLowerCase().includes(q)).slice(0, 8);
  }, [query, cases]);

  const nav = (name: View["name"], label: string, Icon: typeof Home, count?: number) =>
    <button className={`pt-nav-item${view.name === name || (name === "cases" && view.name === "case") ? " on" : ""}`} onClick={() => go({ name } as View)}>
      <Icon size={19} strokeWidth={1.7} />{label}{count ? <span className="pt-count">{count}</span> : null}</button>;

  // Which menu item a Settings section belongs to: Account and Subscription have their own; the rest is Settings.
  const settingsGroup = (section: SettingsSection) => section === "profile" || section === "subscription" ? section : "appearance";
  const settingsNav = (section: SettingsSection, label: string, Icon: typeof Home) =>
    <button className={`pt-nav-item${view.name === "settings" && settingsGroup(view.section) === section ? " on" : ""}`} onClick={() => go({ name: "settings", section })}>
      <Icon size={19} strokeWidth={1.7} />{label}</button>;

  return <div className="pt-app">
    <WelcomeBack name={account.displayName ?? ""} />
    <aside className="pt-side">
      <a className="pt-brand" href="/welcome" aria-label="SmileCompose website"><img src="/brand/smilecompose-mark.svg" alt="" width={28} height={28} />SmileCompose</a>
      <nav className="pt-nav" aria-label="Portal">
        {nav("home", "Today", Home, needs)}
        {nav("cases", "Cases", CalendarDays, cases?.length)}
        {nav("pipeline", "Pipeline", Columns3)}
        {nav("billing", "Billing", ReceiptText, unpaid)}
        {nav("insights", "Insights", BarChart3)}
        <button className="pt-nav-item" onClick={() => caseLibrary.open()}><LibraryBig size={19} strokeWidth={1.7} />Case Library</button>
        {features.labExport && nav("labs", "Labs", FlaskConical, openLabs)}
        {admin.isAdmin && nav("admin", "Admin", ShieldCheck, view.name === "admin" ? 0 : admin.unseen)}
        <hr />
        {settingsNav("profile", "Account", UserRound)}
        {settingsNav("subscription", "Subscription", CreditCard)}
        {settingsNav("appearance", "Settings", Settings)}
      </nav>
      <SideCard onOpenPlan={() => go({ name: "settings", section: "subscription" })} />
      <div className="pt-creator"><CreatorSignature /></div>
    </aside>

    <div className="pt-main">
      <header className="pt-top">
        <label className="pt-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search patients, case refs or treatments…" aria-label="Search cases" />
          {matches && <div className="pt-results" role="listbox">{matches.length ? matches.map(c => <button key={c.id} role="option" aria-selected="false" onClick={() => { setQuery(""); go({ name: "case", id: c.id }); }}>
            {c.thumb ? <img src={c.thumb} alt="" /> : <span className="pt-ini">{initialsOf(c.name || c.reference)}</span>}<span><b>{caseTitle(c.name, c.reference, c.createdAt)}</b><small>{[c.reference, statusLabel(c.status), ...c.labels].filter(Boolean).join(" · ")}</small></span></button>)
            : <p className="pt-hint">No cases match “{query}”.</p>}</div>}
        </label>
        <AllowancePill className="pt-allowance" onOpen={() => go({ name: "settings", section: "subscription" })} />
        {features.labExport && <LabNotifications onOpenCase={id => go({ name: "case", id, tab: "lab" })} />}
        <button className="pt-me" onClick={() => go({ name: "settings", section: "profile" })}>
          {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <span className="pt-av">{account.initials}</span>}
          <span><b>{account.displayName || "Your account"}</b><small>{account.user?.email}</small></span>
        </button>
      </header>
      <div className="pt-page">
        {view.name === "home" && <HomeView cases={cases} allCases={allCases} onOpen={(id, tab) => go({ name: "case", id, tab })} onNew={files => go({ name: "new", files })} name={account.displayName ?? ""} repository={repository}
          onOpenPipeline={() => go({ name: "pipeline" })} onOpenBilling={() => go({ name: "billing" })} onOpenInsights={() => go({ name: "insights" })} />}
        {(view.name === "cases" || view.name === "pipeline") && <CasesView layout={view.name === "pipeline" ? "pipeline" : "table"} onLayout={l => go({ name: l === "pipeline" ? "pipeline" : "cases" })}
          cases={cases} onOpen={id => go({ name: "case", id })} onNew={() => go({ name: "new" })} repository={repository} />}
        {view.name === "billing" && <BillingView cases={allCases} onOpenCase={id => go({ name: "case", id, tab: "billing" })} update={update} />}
        {view.name === "insights" && <InsightsView cases={cases} />}
        {view.name === "settings" && <section className="pt-view pt-settings">
          <SettingsView embedded initialSection={view.section} onClose={() => go({ name: "home" })}
            onSectionChange={section => setView(current => current.name === "settings" ? { name: "settings", section } : current)} />
        </section>}
        {view.name === "labs" && features.labExport && <LabsView onOpenCase={id => go({ name: "case", id })} />}
        {view.name === "admin" && admin.isAdmin && <AdminView />}
        {view.name === "new" && <NewCaseView initialFiles={view.files} onCancel={() => go({ name: "home" })} repository={repository}
          onSaved={id => go({ name: "case", id })} onDesign={(id, start) => onOpenStudio(id, start)} />}
        {view.name === "case" && <PortalCase key={`${view.id}-${view.tab ?? ""}`} caseId={view.id} initialTab={view.tab} repository={repository} onBack={() => go({ name: "cases" })} onOpenStudio={onOpenStudio} />}
      </div>
    </div>
  </div>;
}

/** Right after signing in on the website: the mark draws, "Welcome back, Vikas", then the dashboard. Once per sign-in; a click skips it. */
function WelcomeBack({ name }: { name: string }) {
  const [phase, setPhase] = useState<"in" | "out" | "gone">(() => (typeof window !== "undefined" && takeWebWelcome() ? "in" : "gone"));
  useEffect(() => {
    if (phase !== "in") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const out = window.setTimeout(() => setPhase("out"), reduce ? 900 : 2300);
    return () => window.clearTimeout(out);
  }, [phase]);
  useEffect(() => {
    if (phase !== "out") return;
    const done = window.setTimeout(() => setPhase("gone"), 650);
    return () => window.clearTimeout(done);
  }, [phase]);
  if (phase === "gone") return null;
  const first = name.trim().split(/\s+/)[0] ?? "";
  return <div className={`pt-welcome${phase === "out" ? " is-out" : ""}`} role="status" aria-live="polite" onClick={() => setPhase("out")}>
    <div className="pt-welcome-inner">
      <ComposingMark motion="draw" tone="gold" className="pt-welcome-mark" />
      <p className="pt-welcome-hello">Welcome back{first ? "," : ""}</p>
      {first && <p className="pt-welcome-name">{first}.</p>}
    </div>
  </div>;
}

/** The sidebar card: what's left this period and when it renews; the cloud note when there's no plan to show. */
function SideCard({ onOpenPlan }: { onOpenPlan: () => void }) {
  const allowance = useAllowance();
  if (!allowance) return <div className="pt-side-card">
    <Cloud size={22} strokeWidth={1.6} />
    <h4>Your cases, on every device</h4>
    <p>Saved privately to your account and ready on iPad, iPhone and here.</p>
  </div>;
  return <button type="button" className={`pt-side-card pt-plan-card level-${allowance.level}`} onClick={onOpenPlan}>
    <small>{allowance.trial ? "Trial" : "Concepts left"}</small>
    <b>{allowance.unlimited ? "∞" : allowance.remaining}</b>
    <span>{allowance.renewal ?? "Your plan"}</span>
    <em>View plan <ArrowRight size={13} /></em>
  </button>;
}

const STAGES = CASE_TAGS.filter(t => t !== "Follow-up") as readonly string[];

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

/** A small trend line: the last eight weeks, oldest first. */
function Spark({ values, tone = "gold" }: { values: number[]; tone?: "gold" | "green" }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 120},${30 - (v / max) * 26}`).join(" ");
  return <svg className={`pt-spark ${tone}`} viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} /></svg>;
}

const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
const TAB_FOR: Partial<Record<CaseAction["kind"], CaseTab>> = { "invoice-overdue": "billing", "raise-invoice": "billing", "follow-up": "activity", "preview-waiting": "activity", consent: "details" };
const ACTION_LABEL: Partial<Record<CaseAction["kind"], string>> = { "invoice-overdue": "Open invoice", "raise-invoice": "Raise invoice", "follow-up": "Follow up", "preview-waiting": "Follow up", consent: "Record consent", prepare: "Design" };

function HomeView({ cases, allCases, onOpen, onNew, name, repository, onOpenPipeline, onOpenBilling, onOpenInsights }: { cases: PortalCaseCard[] | null; allCases: PortalCaseCard[] | null; onOpen: (id: string, tab?: CaseTab) => void; onNew: (files?: File[]) => void; name: string; repository: ReturnType<typeof usePortalCases>["repository"]; onOpenPipeline: () => void; onOpenBilling: () => void; onOpenInsights: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [logged, setLogged] = useState<string | null>(null);
  const all = cases ?? [];
  const since = monthStart();
  const consults = all.filter(c => c.createdAt >= since);
  const conceptTimes = all.flatMap(c => c.conceptTimes);
  const agreedCases = all.filter(c => (AGREED_STAGES as readonly string[]).includes(stageOf(c.labels) ?? ""));
  const agreedMonth = agreedCases.filter(c => (c.stageAt ?? 0) >= since);
  const paidTimes = (allCases ?? []).flatMap(c => c.invoices).filter(i => i.status === "paid" && i.paidAt);
  const paidMonth = paidTimes.filter(i => (i.paidAt ?? 0) >= since).reduce((s, i) => s + invoiceTotal(i), 0);
  const needs = all.flatMap(c => caseActions(c).filter(a => a.urgent).slice(0, 1).map(a => ({ c, a }))).sort((x, y) => y.a.priority - x.a.priority);
  const weekEnd = startOfDay(Date.now()) + 7 * DAY;
  const week = all.filter(c => c.appointment && c.appointment.at >= startOfDay(Date.now()) && c.appointment.at < weekEnd).sort((a, b) => a.appointment!.at - b.appointment!.at);
  const shown = all.filter(c => (filter === "all" || (filter === "fav" ? c.favourite : c.status === filter)) && (!tag || c.labels.includes(tag)));
  const usedTags = [...new Set(all.flatMap(c => c.labels))];
  const filters: [Filter, string][] = [["all", "All"], ["progress", "In progress"], ...(features.labExport ? [["lab", "With lab"] as [Filter, string]] : []), ["done", "Completed"], ["fav", "Favourites"]];
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const summary = [needs.length ? `${needs.length} to follow up` : "Nothing waiting on you", week.length ? `${week.length} appointment${week.length === 1 ? "" : "s"} this week` : ""].filter(Boolean).join(" · ");
  const logCall = async (id: string) => { setLogged(id); await repository.updatePortal(id, { event: { kind: "call", text: "Called the patient" } }).catch(() => setLogged(null)); };

  return <section className="pt-view">
    <div className="pt-row pt-between">
      <div><h1 className="pt-h1">{greeting(name)}</h1><p className="pt-sub">{today} · {cases ? summary : "Loading your cases…"}</p></div>
      <button className="pt-btn pt-btn-dark" onClick={() => onNew()}><Plus size={16} />New case</button>
    </div>
    <div className="pt-stats" role="group" aria-label="This month">
      <button type="button" className="pt-stat" onClick={onOpenInsights}><small>New cases this month</small><b>{cases ? consults.length : "–"}</b><Spark values={weekly(all.map(c => c.createdAt))} /></button>
      <button type="button" className="pt-stat" onClick={onOpenInsights}><small>Concepts this month</small><b>{cases ? conceptTimes.filter(t => t >= since).length : "–"}</b><Spark values={weekly(conceptTimes)} /></button>
      <button type="button" className="pt-stat" onClick={onOpenPipeline}><small>Going ahead</small><b>{cases ? agreedCases.length : "–"}</b><span>{agreedMonth.length ? `${agreedMonth.length} this month` : "Going ahead, booked or in treatment"}{agreedCases.some(c => c.fee) ? ` · ${gbp(agreedCases.reduce((s, c) => s + (c.fee ?? 0), 0), { compact: true })}` : ""}</span></button>
      <button type="button" className="pt-stat" onClick={onOpenBilling}><small>Paid this month</small><b>{allCases ? gbp(paidMonth, { compact: true }) : "–"}</b><Spark tone="green" values={weekly(paidTimes.map(i => i.paidAt!))} /></button>
    </div>

    <div className="pt-today">
      <div className="pt-card pt-needs">
        <div className="pt-row pt-between pt-card-head"><h2 className="pt-h2 flush">Needs you</h2><span className="pt-kicker">{needs.length ? `${needs.length} patient${needs.length === 1 ? "" : "s"}` : ""}</span></div>
        {cases === null ? <div className="pt-needs-empty"><p className="pt-hint">Loading…</p></div>
          : needs.length ? <ul>{needs.slice(0, 6).map(({ c, a }) => <li key={c.id} className={`tone-${a.tone}`}>
            <button type="button" className="pt-needs-hit" onClick={() => onOpen(c.id, TAB_FOR[a.kind])} aria-label={`Open ${caseTitle(c.name, c.reference, c.createdAt)}`} />
            {c.thumb ? <img src={c.thumb} alt="" /> : <span className="pt-ini">{initialsOf(c.name || c.reference)}</span>}
            <div><b>{caseTitle(c.name, c.reference, c.createdAt)}{c.tags[0] ? <span className="pt-dim"> · {c.tags[0]}</span> : null}</b><small>{a.text}</small></div>
            <div className="pt-needs-act">
              {(a.kind === "follow-up" || a.kind === "preview-waiting") && <button type="button" className="pt-btn pt-btn-line pt-btn-small" disabled={logged === c.id} onClick={() => void logCall(c.id)}><Phone size={13} />{logged === c.id ? "Logged" : "Log a call"}</button>}
              <button type="button" className={`pt-btn pt-btn-small ${a.tone === "amber" ? "pt-btn-gold" : "pt-btn-line"}`} onClick={() => onOpen(c.id, TAB_FOR[a.kind])}>{ACTION_LABEL[a.kind] ?? "Open"}</button>
            </div>
          </li>)}</ul>
          : <div className="pt-needs-empty"><b>You’re up to date</b><p className="pt-hint">Cases waiting {FOLLOW_UP_DAYS}+ days for a decision, overdue invoices and missing consent show up here.</p></div>}
      </div>
      <div className="pt-card pt-week">
        <div className="pt-row pt-between pt-card-head"><h2 className="pt-h2 flush">This week</h2><span className="pt-kicker">Appointments</span></div>
        {week.length ? <ul>{week.slice(0, 5).map(c => { const d = new Date(c.appointment!.at); const ready = c.concepts > 0; return <li key={c.id}>
          <button type="button" className="pt-needs-hit" onClick={() => onOpen(c.id)} aria-label={`Open ${caseTitle(c.name, c.reference, c.createdAt)}`} />
          <div className="pt-day"><small>{d.toLocaleDateString("en-GB", { weekday: "short" })}</small><b>{d.getDate()}</b></div>
          <div><b>{caseTitle(c.name, c.reference, c.createdAt)} · {c.appointment!.type}</b><small>{d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}{ready ? " · concept ready" : " · no concept yet"}</small></div>
          <span className={`pt-pill ${ready ? "ok" : "wait"}`}>{ready ? "Ready" : "Prepare"}</span>
        </li>; })}</ul>
          : <div className="pt-needs-empty"><p className="pt-hint">No appointments this week. Add one from a case’s Details tab and it shows here.</p></div>}
      </div>
    </div>

    <div className={`pt-drop compact${over ? " over" : ""}`} role="button" tabIndex={0} onClick={() => onNew()} onKeyDown={e => { if (e.key === "Enter") onNew(); }}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)); if (files.length) onNew(files); }}>
      <span className="pt-drop-icon"><Upload size={18} strokeWidth={1.7} /></span>
      <div><h2>Drop a patient’s photos here</h2><p>Up to eight views. The smile front is used for the design; you can reorder them before saving.</p></div>
      <div className="pt-mini">{PHOTO_SLOTS.filter(s => s.group !== "other").map(s => <span key={s.id} className={s.id === "front" ? "key" : ""}>{s.short}</span>)}</div>
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

function CasesView({ cases, onOpen, onNew, repository, layout, onLayout }: { cases: PortalCaseCard[] | null; onOpen: (id: string) => void; onNew: () => void; repository: ReturnType<typeof usePortalCases>["repository"]; layout: "table" | "pipeline"; onLayout: (layout: "table" | "pipeline") => void }) {
  const choose = onLayout;
  const open = (cases ?? []).filter(c => stageOf(c.labels) !== "Not proceeding" && c.fee);
  const deciding = open.filter(c => ["Consultation", "Thinking it over"].includes(stageOf(c.labels) ?? "")).reduce((s, c) => s + (c.fee ?? 0), 0);
  const agreedValue = open.filter(c => (AGREED_STAGES as readonly string[]).includes(stageOf(c.labels) ?? "")).reduce((s, c) => s + (c.fee ?? 0), 0);
  const list = cases ?? [];
  // Columns nobody has filled in yet are left out rather than shown as a row of dashes.
  const showRef = list.some(c => c.reference), showLabels = list.some(c => c.labels.length), showPhotos = list.some(c => c.photoCount), showFee = list.some(c => c.fee);
  return <section className="pt-view">
    <div className="pt-row pt-between"><div><h1 className="pt-h1">{layout === "pipeline" ? "Pipeline" : "Cases"}</h1><p className="pt-sub">{layout === "pipeline" ? (deciding || agreedValue ? `${gbp(deciding)} deciding · ${gbp(agreedValue)} agreed. Drag a case to move it on.` : "Where each patient is. Drag a case to move it to the next stage; add estimates on a case’s Billing tab to see totals.") : "Every case on your account, newest first."}</p></div>
      <div className="pt-row">
        <div className="pt-seg" role="group" aria-label="Layout">
          <button type="button" className={layout === "table" ? "on" : ""} aria-pressed={layout === "table"} onClick={() => choose("table")}><List size={15} />List</button>
          <button type="button" className={layout === "pipeline" ? "on" : ""} aria-pressed={layout === "pipeline"} onClick={() => choose("pipeline")}><Columns3 size={15} />Pipeline</button>
        </div>
        <button className="pt-btn pt-btn-dark" onClick={onNew}><Plus size={16} />New case</button>
      </div>
    </div>
    {layout === "pipeline" ? <Pipeline cases={cases} onOpen={onOpen} repository={repository} /> :
    <div className="pt-card pt-table-wrap pt-gap-t">
      {cases?.length ? <table className="pt-table">
        <thead><tr><th>Patient</th>{showRef && <th>Case ref</th>}{showLabels && <th>Stage</th>}<th>Treatment</th>{showPhotos && <th>Photos</th>}{showFee && <th className="r">Estimate</th>}<th>Status</th><th>Updated</th></tr></thead>
        <tbody>{cases.map(c => <tr key={c.id} className="pt-click" onClick={() => onOpen(c.id)}>
          <td><div className="pt-row">{c.thumb ? <img className="pt-mini-thumb" src={c.thumb} alt="" /> : <span className="pt-ini">{initialsOf(c.name || c.reference)}</span>}<button className="pt-link" onClick={() => onOpen(c.id)}><b>{caseTitle(c.name, c.reference, c.createdAt)}</b></button></div></td>
          {showRef && <td className="pt-ref">{c.reference || "–"}</td>}{showLabels && <td>{c.labels.length ? <span className="pt-labels inline">{c.labels.map(t => <span key={t} className="pt-label">{t}</span>)}</span> : "–"}</td>}<td>{c.tags.join(", ") || (c.concepts ? "Concept" : "Not designed yet")}</td>{showPhotos && <td>{c.photoCount || "–"}</td>}{showFee && <td className="r">{c.fee ? gbp(c.fee) : "–"}</td>}
          <td><span className={`pt-pill ${c.status === "done" ? "ok" : c.status === "lab" ? "gold" : "wait"}`}>{statusLabel(c.status)}</span></td><td className="pt-ref">{relativeDate(c.updatedAt)}</td>
        </tr>)}</tbody></table>
        : <p className="pt-hint pt-pad">{cases ? "No cases yet." : "Loading cases…"}</p>}
    </div>}
  </section>;
}

const inStage = (c: PortalCaseCard) => { const d = daysBetween(c.stageAt ?? c.updatedAt); return d === 0 ? "Today" : d === 1 ? "1 day" : `${d} days`; };
const stale = (c: PortalCaseCard, col: string) => ["Consultation", "Thinking it over"].includes(col) && daysBetween(c.stageAt ?? c.updatedAt) >= FOLLOW_UP_DAYS;

/** Cases as columns by stage. Dragging a card (or choosing from its menu) swaps its stage tag; the clinician's own tags stay. */
function Pipeline({ cases, onOpen, repository }: { cases: PortalCaseCard[] | null; onOpen: (id: string) => void; repository: ReturnType<typeof usePortalCases>["repository"] }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const columns = ["", ...STAGES];
  const move = (c: PortalCaseCard, stage: string) => {
    if ((stageOf(c.labels) ?? "") === stage) return;
    const tags = [...c.labels.filter(t => !STAGES.includes(t)), ...(stage ? [stage] : [])];
    void repository.updatePortal(c.id, { tags });
  };
  if (!cases) return <p className="pt-hint pt-pad">Loading cases…</p>;
  return <div className="pt-pipeline pt-gap-t">
    {columns.map(col => {
      const inCol = cases.filter(c => (stageOf(c.labels) ?? "") === col);
      const total = inCol.reduce((s, c) => s + (c.fee ?? 0), 0);
      return <div key={col || "none"} className={`pt-col${overCol === col && dragging ? " over" : ""}`}
        onDragOver={e => { if (dragging) { e.preventDefault(); setOverCol(col); } }} onDragLeave={() => setOverCol(null)}
        onDrop={e => { e.preventDefault(); const c = cases.find(x => x.id === dragging); if (c) move(c, col); setDragging(null); setOverCol(null); }}>
        <header><div><b>{col || "No stage yet"}</b><span>{inCol.length}</span></div>{total > 0 && <em>{gbp(total)}</em>}</header>
        <div className="pt-col-list">
          {inCol.map(c => <article key={c.id} className="pt-pcard" draggable onDragStart={() => setDragging(c.id)} onDragEnd={() => { setDragging(null); setOverCol(null); }}>
            <button type="button" className="pt-pcard-hit" onClick={() => onOpen(c.id)} aria-label={`Open ${caseTitle(c.name, c.reference, c.createdAt)}`} />
            {c.thumb ? <img src={c.thumb} alt="" /> : <span className="pt-ini">{initialsOf(c.name || c.reference)}</span>}
            <div><b>{caseTitle(c.name, c.reference, c.createdAt)}</b><small>{c.tags.join(" · ") || (c.concepts ? "Concept" : "Not designed yet")}</small>
              <span className="pt-pcard-foot">{col ? <small className={stale(c, col) ? "stale" : ""}>{inStage(c)}</small> : <small>{relativeDate(c.updatedAt)}</small>}{c.fee ? <b>{gbp(c.fee)}</b> : null}</span></div>
            <select aria-label="Move to stage" value={col} onChange={e => move(c, e.target.value)} onClick={e => e.stopPropagation()}>
              {columns.map(o => <option key={o || "none"} value={o}>{o || "No stage"}</option>)}
            </select>
          </article>)}
          {!inCol.length && <p className="pt-col-empty">{dragging ? "Drop here" : "No cases"}</p>}
        </div>
      </div>;
    })}
  </div>;
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
