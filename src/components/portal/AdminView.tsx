"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Copy, Infinity as InfinityIcon, Mail, Minus, Plus, RefreshCw, Search, UserPlus, MessageSquare, CreditCard } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { ESTIMATED_GENERATION_COST_GBP, UNLIMITED_THRESHOLD } from "@/config/subscriptions";
import {
  adminAccounts, adminCodes, adminLeads, adminMe, adminOverview, changeAllowance, createCodes, revokeCode, updateLead,
  type AccessCode, type AdminAccount, type AdminEvent, type AdminLead, type AdminOverview, type AllowanceChange, type LeadStatus,
} from "@/services/admin/adminApi";

const SEEN_KEY = "smilecompose.admin.seenAt";
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) ?? ""; } catch { return ""; } };

interface AdminState {
  isAdmin: boolean;
  /** Notifications since the admin last opened the dashboard. */
  unseen: number;
  token: () => Promise<string>;
  markSeen: () => void;
  seenAt: string;
}
const AdminContext = createContext<AdminState>({ isAdmin: false, unseen: 0, token: async () => "", markSeen: () => {}, seenAt: "" });
export const useAdmin = () => useContext(AdminContext);

/** Checks once whether this account is an administrator, then watches for new enquiries and sign-ups. */
export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { getAccessToken, user } = useAccount();
  const userId = user?.id ?? null;
  const [isAdmin, setIsAdmin] = useState(false);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [seenAt, setSeenAt] = useState(readSeen);
  const token = useCallback(async () => {
    const value = await getAccessToken();
    if (!value) throw new Error("Sign in to continue.");
    return value;
  }, [getAccessToken]);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    (async () => { try { const yes = await adminMe(await token()); if (live) setIsAdmin(yes); } catch { /* not an admin, or offline */ } })();
    return () => { live = false; };
  }, [token, userId]);
  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => { try { setEvents((await adminOverview(await token(), 7)).events); } catch { /* shown on the dashboard */ } };
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 120_000);
    return () => clearInterval(timer);
  }, [isAdmin, token]);
  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    try { localStorage.setItem(SEEN_KEY, now); } catch { /* private mode */ }
    setSeenAt(now);
  }, []);
  const unseen = events.filter(e => e.at > seenAt).length;
  return <AdminContext.Provider value={{ isAdmin, unseen, token, markSeen, seenAt }}>{children}</AdminContext.Provider>;
}

const number = (n: number) => n.toLocaleString("en-GB");
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const EVENT_ICON = { lead: Mail, account: UserPlus, subscription: CreditCard } as const;
const EVENT_LABEL = { lead: "Enquiry", account: "New account", subscription: "Subscription" } as const;
/** App Store subscription events, in plain words. */
const STORE_EVENTS: Record<string, string> = {
  INITIAL_PURCHASE: "Started a subscription or trial", RENEWAL: "Renewed", CANCELLATION: "Turned off renewal", UNCANCELLATION: "Turned renewal back on",
  EXPIRATION: "Subscription ended", BILLING_ISSUE: "Payment problem", PRODUCT_CHANGE: "Changed plan", NON_RENEWING_PURCHASE: "Bought generations",
  SUBSCRIPTION_PAUSED: "Paused", TRANSFER: "Moved to another account", TEMPORARY_ENTITLEMENT_GRANT: "Temporary access",
};
const eventDetail = (e: AdminEvent) => e.kind !== "subscription" ? e.detail
  : e.detail.replace(/^[A-Z_]+/, type => STORE_EVENTS[type] ?? type.toLowerCase().replace(/_/g, " "));

type Tab = "overview" | "accounts" | "codes" | "enquiries";

/** The admin dashboard: how SmileCompose is being used, accounts and their generations, and website enquiries. */
export function AdminView({ embedded = false }: { embedded?: boolean }) {
  const { markSeen, seenAt } = useAdmin();
  const [tab, setTab] = useState<Tab>("overview");
  // What was new when the page opened stays highlighted while it's open.
  const [since] = useState(seenAt);
  useEffect(() => { markSeen(); }, [markSeen]);
  return <section className={`pt-view ad-root${embedded ? " ad-embedded" : ""}`}>
    {!embedded && <div className="ad-head">
      <div><h1 className="pt-h1">Admin</h1><p className="pt-sub">How SmileCompose is being used, accounts and their generations, tester codes and website enquiries.</p></div>
    </div>}
    <div className="pt-seg ad-tabs" role="tablist">
      {(["overview", "accounts", "codes", "enquiries"] as Tab[]).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "codes" ? "Tester codes" : t[0].toUpperCase() + t.slice(1)}</button>)}
    </div>
    {tab === "overview" && <Overview since={since} onOpen={t => setTab(t)} />}
    {tab === "accounts" && <Accounts />}
    {tab === "codes" && <Codes />}
    {tab === "enquiries" && <Enquiries />}
  </section>;
}

function Overview({ since, onOpen }: { since: string; onOpen: (tab: Tab) => void }) {
  const { token } = useAdmin();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ overview: AdminOverview; events: AdminEvent[] } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setData(await adminOverview(await token(), days)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "The dashboard couldn’t be loaded."); }
  }, [token, days]);
  useEffect(() => { void load(); }, [load]);
  if (error && !data) return <p className="error-message" role="alert">{error}</p>;
  if (!data) return <div className="ad-stats">{Array.from({ length: 8 }, (_, i) => <div key={i} className="pt-card ad-stat pt-skeleton" />)}</div>;
  const o = data.overview;
  const peak = Math.max(1, ...o.by_day.map(d => d.count));
  const cost = o.generations * ESTIMATED_GENERATION_COST_GBP;
  const stats: { label: string; value: string; note?: string; tab?: Tab }[] = [
    { label: "Accounts", value: number(o.accounts), note: `${number(o.accounts_new)} new`, tab: "accounts" },
    { label: "Subscribers", value: number(o.subscribers), note: `${number(o.complimentary)} complimentary` },
    { label: "Generations", value: number(o.generations), note: `${number(o.generations_today)} today` },
    { label: "Estimated cost", value: `£${cost.toFixed(2)}`, note: `about £${ESTIMATED_GENERATION_COST_GBP.toFixed(2)} each` },
    { label: "Not completed", value: number(o.failed), note: "Not counted against allowances" },
    { label: "Cases saved", value: number(o.cases) },
    { label: "Lab links", value: number(o.lab_links), note: `${number(o.lab_links_opened)} opened · ${number(o.lab_replies)} replies` },
    { label: "Enquiries", value: number(o.leads), note: o.leads_new ? `${number(o.leads_new)} waiting for a reply` : "All answered", tab: "enquiries" },
  ];
  return <>
    <div className="pt-row ad-range">
      <div className="pt-seg">{[7, 30, 90].map(d => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d} days</button>)}</div>
      <button className="pt-btn pt-btn-line pt-btn-small" onClick={() => void load()}><RefreshCw size={14} />Refresh</button>
      {error && <span className="pt-hint" role="status">{error}</span>}
    </div>
    <div className="ad-stats">
      {stats.map(s => <button key={s.label} type="button" className={`pt-card ad-stat${s.tab ? " link" : ""}`} disabled={!s.tab} onClick={() => s.tab && onOpen(s.tab)}>
        <span className="ad-stat-label">{s.label}</span><b>{s.value}</b>{s.note && <small>{s.note}</small>}
      </button>)}
    </div>
    <div className="ad-split">
      <div className="pt-card ad-chart">
        <div className="pt-set-head"><h3>Generations per day</h3><span className="pt-hint">Last {days} days</span></div>
        <div className="ad-bars" role="img" aria-label={`Generations per day over the last ${days} days, peaking at ${peak}`}>
          {o.by_day.map(d => <span key={d.day} className="ad-bar" title={`${day(d.day)}: ${d.count}`}><i style={{ height: `${(d.count / peak) * 100}%` }} /></span>)}
        </div>
        <div className="ad-axis"><span>{o.by_day[0] && day(o.by_day[0].day)}</span><span>Peak {peak}</span><span>Today</span></div>
      </div>
      <div className="pt-card ad-feed">
        <div className="pt-set-head"><h3>Notifications</h3><span className="pt-hint">Newest first</span></div>
        {data.events.length ? <ul>{data.events.map(e => {
          const Icon = EVENT_ICON[e.kind] ?? MessageSquare;
          return <li key={`${e.kind}-${e.ref}-${e.at}`} className={e.at > since ? "new" : ""}>
            <span className={`ad-ev ${e.kind}`}><Icon size={14} /></span>
            <span><b>{e.title}</b><small>{EVENT_LABEL[e.kind]} · {eventDetail(e)}</small></span>
            <time>{when(e.at)}</time>
          </li>;
        })}</ul> : <p className="pt-hint">New enquiries, accounts and subscription changes will appear here.</p>}
      </div>
    </div>
  </>;
}

function planOf(a: AdminAccount) {
  if (a.unlimited) return <span className="pt-pill gold">Unlimited</span>;
  if (a.complimentary) return <span className="pt-pill gold">Complimentary</span>;
  if (a.subscription_status === "active") return <span className="pt-pill ok">{a.subscription_product_id?.includes("annual") ? "Pro annual" : "Pro monthly"}</span>;
  if (a.subscription_status === "billing_issue") return <span className="pt-pill wait">Billing issue</span>;
  return <span className="pt-pill off">{a.subscription_status === "none" ? "Free" : a.subscription_status[0].toUpperCase() + a.subscription_status.slice(1)}</span>;
}

function Accounts() {
  const { token } = useAdmin();
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async (q: string) => {
    try { setAccounts(await adminAccounts(await token(), q)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Accounts couldn’t be loaded."); }
  }, [token]);
  useEffect(() => { const t = setTimeout(() => void load(query), query ? 300 : 0); return () => clearTimeout(t); }, [load, query]);
  return <>
    <label className="pt-search ad-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by email or name" aria-label="Search accounts" /></label>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="pt-card pt-table-wrap">
      <table className="pt-table ad-table">
        <thead><tr><th>Account</th><th>Plan</th><th>Remaining</th><th>Last 30 days</th><th>Last generation</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {accounts === null ? <tr><td colSpan={6}><span className="pt-hint">Loading accounts…</span></td></tr>
            : accounts.length === 0 ? <tr><td colSpan={6}><span className="pt-hint">{query ? `No accounts match “${query}”.` : "No accounts yet."}</span></td></tr>
            : accounts.map(a => <AccountRow key={a.id} a={a} open={open === a.id} onToggle={() => setOpen(o => (o === a.id ? null : a.id))} onChanged={() => void load(query)} />)}
        </tbody>
      </table>
    </div>
  </>;
}

function AccountRow({ a, open, onToggle, onChanged }: { a: AdminAccount; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const { token } = useAdmin();
  const [amount, setAmount] = useState(10);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<AllowanceChange | null>(null);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const unlimited = a.unlimited || a.remaining >= UNLIMITED_THRESHOLD;
  const describe = (c: AllowanceChange) => c.action === "add" ? `Add ${c.amount} generation${c.amount === 1 ? "" : "s"}` : c.action === "remove" ? `Remove ${c.amount} generation${c.amount === 1 ? "" : "s"}` : c.action === "unlimited" ? "Turn on unlimited generations" : "Turn off unlimited generations";
  async function apply(change: AllowanceChange) {
    setBusy(true); setStatus("");
    try { await changeAllowance(await token(), a.id, { ...change, note: note.trim() || undefined }); setStatus(`${describe(change)}: done.`); setConfirm(null); setNote(""); onChanged(); }
    catch (e) { setStatus(e instanceof Error ? e.message : "That change couldn’t be made."); }
    finally { setBusy(false); }
  }
  return <>
    <tr className={open ? "ad-open" : ""}>
      <td><b className="ad-name">{a.display_name || a.email || "Account"}{a.is_admin && <BadgeCheck size={14} aria-label="Administrator" />}</b><small className="ad-muted">{a.display_name ? a.email : null}{a.display_name && a.email ? " · " : ""}joined {day(a.created_at)}</small></td>
      <td data-label="Plan">{planOf(a)}</td>
      <td className="ad-num" data-label="Remaining">{unlimited ? <span className="ad-inf" aria-label="Unlimited">∞</span> : number(a.remaining)}</td>
      <td className="ad-num" data-label="Last 30 days">{number(a.generations_30d)}</td>
      <td data-label="Last generation">{when(a.last_generation_at)}</td>
      <td><button className="pt-btn pt-btn-line pt-btn-small" aria-expanded={open} onClick={onToggle}>{open ? "Close" : "Generations"}</button></td>
    </tr>
    {open && <tr className="ad-panel-row"><td colSpan={6}>
      <div className="ad-panel">
        {confirm ? <div className="ad-confirm">
          <p><b>{describe(confirm)}</b> for {a.email ?? "this account"}?{confirm.action === "remove" ? " Generations already used aren’t affected." : ""}</p>
          <div className="pt-row"><button className="pt-btn pt-btn-line pt-btn-small" onClick={() => setConfirm(null)}>Cancel</button>
            <button className={`pt-btn pt-btn-small ${confirm.action === "remove" || confirm.action === "limited" ? "pt-btn-danger" : "pt-btn-dark"}`} disabled={busy} onClick={() => void apply(confirm)}>{busy ? "Saving…" : "Confirm"}</button></div>
        </div> : <>
          <div className="ad-adjust">
            <span className="ad-sec">Extra generations</span>
            <div className="pt-row">
              <input type="number" min={1} max={1000} value={amount} aria-label="Number of generations" onChange={e => setAmount(Math.max(1, Math.min(1000, Math.round(Number(e.target.value) || 1))))} />
              <button className="pt-btn pt-btn-line pt-btn-small" onClick={() => setConfirm({ action: "add", amount })}><Plus size={14} />Add</button>
              <button className="pt-btn pt-btn-line pt-btn-small" onClick={() => setConfirm({ action: "remove", amount })}><Minus size={14} />Remove</button>
            </div>
            <span className="pt-hint">Added generations don’t expire and are used after the monthly allowance.</span>
          </div>
          <div className="ad-adjust">
            <span className="ad-sec">Unlimited access</span>
            <button className="pt-btn pt-btn-line pt-btn-small" onClick={() => setConfirm({ action: unlimited ? "limited" : "unlimited" })}><InfinityIcon size={15} />{unlimited ? "Turn off unlimited" : "Turn on unlimited"}</button>
            <span className="pt-hint">For the team and partners. Every generation is still counted.</span>
          </div>
        </>}
        <label className="pt-field ad-note">Reason (kept in the audit log)<input value={note} maxLength={200} placeholder="e.g. Launch offer, team account" onChange={e => setNote(e.target.value)} /></label>
        {status && <p className="pt-hint" role="status">{status}</p>}
      </div>
    </td></tr>}
  </>;
}

const LEAD_LABEL: Record<LeadStatus, string> = { new: "New", contacted: "Contacted", closed: "Closed" };

function Enquiries() {
  const { token } = useAdmin();
  const [leads, setLeads] = useState<AdminLead[] | null>(null);
  const [filter, setFilter] = useState<LeadStatus | "all">("new");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setLeads(await adminLeads(await token())); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Enquiries couldn’t be loaded."); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => (leads ?? []).filter(l => filter === "all" || l.status === filter), [leads, filter]);
  const count = (s: LeadStatus) => (leads ?? []).filter(l => l.status === s).length;
  return <>
    <div className="pt-seg ad-range">
      {(["new", "contacted", "closed", "all"] as const).map(s => <button key={s} className={filter === s ? "on" : ""} onClick={() => setFilter(s)}>{s === "all" ? "All" : `${LEAD_LABEL[s]} ${count(s) ? `(${count(s)})` : ""}`}</button>)}
    </div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {leads === null ? <p className="pt-hint">Loading enquiries…</p>
      : shown.length === 0 ? <div className="pt-card pt-empty-card"><p className="pt-hint">{filter === "new" ? "No enquiries waiting. Requests from the website’s Book a demo and Early access forms appear here." : "Nothing here."}</p></div>
      : <div className="ad-leads">{shown.map(l => <LeadCard key={l.id} lead={l} onChanged={() => void load()} />)}</div>}
  </>;
}

function LeadCard({ lead, onChanged }: { lead: AdminLead; onChanged: () => void }) {
  const { token } = useAdmin();
  const [note, setNote] = useState(lead.admin_note ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function set(status: LeadStatus) {
    setBusy(true); setError("");
    try { await updateLead(await token(), lead.id, status, note); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "That enquiry couldn’t be updated."); }
    finally { setBusy(false); }
  }
  const subject = encodeURIComponent(lead.interest === "demo" ? "Your SmileCompose demo" : "SmileCompose early access");
  return <article className="pt-card ad-lead">
    <div className="ad-lead-head">
      <div><b>{lead.name}</b><small>{[lead.practice, lead.role[0].toUpperCase() + lead.role.slice(1)].filter(Boolean).join(" · ")}</small></div>
      <span className={`pt-pill ${lead.status === "new" ? "gold" : lead.status === "contacted" ? "ok" : "off"}`}>{LEAD_LABEL[lead.status]}</span>
    </div>
    <p className="ad-lead-meta">{lead.interest === "demo" ? "Booked a demo" : "Asked for early access"} · {when(lead.created_at)}{lead.contacted_at ? ` · contacted ${day(lead.contacted_at)}` : ""}</p>
    {lead.message && <p className="ad-lead-msg">{lead.message}</p>}
    <label className="pt-field">Your notes<input value={note} maxLength={1000} placeholder="e.g. Called, demo booked for Tuesday" onChange={e => setNote(e.target.value)} /></label>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="pt-row">
      <a className="pt-btn pt-btn-line pt-btn-small" href={`mailto:${lead.email}?subject=${subject}`}><Mail size={14} />Email {lead.email}</a>
      {lead.status !== "contacted" && <button className="pt-btn pt-btn-dark pt-btn-small" disabled={busy} onClick={() => void set("contacted")}>Mark contacted</button>}
      {lead.status !== "closed" && <button className="pt-btn pt-btn-line pt-btn-small" disabled={busy} onClick={() => void set("closed")}>Close</button>}
      {lead.status === "closed" && <button className="pt-btn pt-btn-line pt-btn-small" disabled={busy} onClick={() => void set("new")}>Reopen</button>}
      {note !== (lead.admin_note ?? "") && <button className="pt-btn pt-btn-line pt-btn-small" disabled={busy} onClick={() => void set(lead.status)}>Save note</button>}
    </div>
  </article>;
}

const CODE_STATE: Record<AccessCode["state"], { label: string; tone: string }> = {
  unused: { label: "Not used yet", tone: "wait" }, redeemed: { label: "Used", tone: "ok" }, revoked: { label: "Withdrawn", tone: "off" }, expired: { label: "Expired", tone: "off" },
};

/** Single-use tester codes: make a batch, copy them once, and see who has used which. */
function Codes() {
  const { token } = useAdmin();
  const [codes, setCodes] = useState<AccessCode[] | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [count, setCount] = useState(5), [monthly, setMonthly] = useState(25), [days, setDays] = useState(30), [valid, setValid] = useState(60);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    try { setCodes(await adminCodes(await token())); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Codes couldn’t be loaded."); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const clamp = (value: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(value) || min)));
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setCopied(false);
    try { setFresh(await createCodes(await token(), { count, monthlyGenerations: monthly, accessDays: days, validDays: valid, label: label.trim() || undefined })); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Codes couldn’t be created."); }
    finally { setBusy(false); }
  }
  async function copyAll() { try { await navigator.clipboard.writeText(fresh.join("\n")); setCopied(true); } catch { setError("Copy didn’t work here. Select the codes and copy them."); } }
  async function revoke(id: string) {
    try { await revokeCode(await token(), id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "That code couldn’t be withdrawn."); }
  }
  const unused = (codes ?? []).filter(c => c.state === "unused").length;
  return <>
    <form className="pt-card ad-codes-form" onSubmit={create}>
      <div className="pt-set-head"><h3>New tester codes</h3><span className="pt-hint">Each code works once, for one account</span></div>
      <div className="ad-codes-fields">
        <label className="pt-field">How many<input type="number" min={1} max={50} value={count} onChange={e => setCount(clamp(e.target.value, 1, 50))} /></label>
        <label className="pt-field">Generations a month<input type="number" min={1} max={1000} value={monthly} onChange={e => setMonthly(clamp(e.target.value, 1, 1000))} /></label>
        <label className="pt-field">Access lasts (days)<input type="number" min={1} max={366} value={days} onChange={e => setDays(clamp(e.target.value, 1, 366))} /></label>
        <label className="pt-field">Must be used within (days)<input type="number" min={1} max={366} value={valid} onChange={e => setValid(clamp(e.target.value, 1, 366))} /></label>
        <label className="pt-field ad-codes-label">Note for you (optional)<input value={label} maxLength={80} placeholder="e.g. October testers" onChange={e => setLabel(e.target.value)} /></label>
      </div>
      <div className="pt-row"><button className="pt-btn pt-btn-gold" disabled={busy}>{busy ? "Creating…" : `Create ${count} code${count === 1 ? "" : "s"}`}</button>
        {error && <span className="pt-hint" role="alert">{error}</span>}</div>
    </form>
    {fresh.length > 0 && <div className="pt-card ad-codes-fresh" role="status">
      <div className="pt-set-head"><h3>Your new codes</h3><button type="button" className="pt-btn pt-btn-dark pt-btn-small" onClick={() => void copyAll()}><Copy size={14} />{copied ? "Copied" : "Copy all"}</button></div>
      <p className="pt-hint">Copy these now. For safety they aren’t stored in readable form, so they can’t be shown again.</p>
      <ul>{fresh.map(c => <li key={c}><code>{c}</code></li>)}</ul>
    </div>}
    <div className="pt-set-head"><h3>All codes</h3><span className="pt-hint">{codes ? `${unused} not used yet · ${codes.length} in total` : ""}</span></div>
    <div className="pt-card pt-table-wrap">
      <table className="pt-table ad-table">
        <thead><tr><th>Code</th><th>Gives</th><th>Status</th><th>Used by</th><th>Created</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {codes === null ? <tr><td colSpan={6}><span className="pt-hint">Loading codes…</span></td></tr>
            : codes.length === 0 ? <tr><td colSpan={6}><span className="pt-hint">No codes yet. Create some above to give to testers.</span></td></tr>
            : codes.map(c => <tr key={c.id}>
              <td><code className="ad-code">SC-·····-·{c.hint}</code>{c.label && <small className="ad-muted">{c.label}</small>}</td>
              <td data-label="Gives">{c.monthlyGenerations} a month<small className="ad-muted">for {c.accessDays} days</small></td>
              <td data-label="Status"><span className={`pt-pill ${CODE_STATE[c.state].tone}`}>{CODE_STATE[c.state].label}</span>{c.state === "unused" && c.expiresAt && <small className="ad-muted">use by {day(c.expiresAt)}</small>}</td>
              <td data-label="Used by">{c.redeemedBy ?? "—"}{c.redeemedAt && <small className="ad-muted">{day(c.redeemedAt)}</small>}</td>
              <td data-label="Created">{day(c.createdAt)}</td>
              <td>{c.state === "unused" && <button className="pt-btn pt-btn-line pt-btn-small" onClick={() => void revoke(c.id)}>Withdraw</button>}</td>
            </tr>)}
        </tbody>
      </table>
    </div>
  </>;
}
