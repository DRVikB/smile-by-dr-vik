"use client";
import { Fragment, createContext, useCallback, useContext, useEffect, useState } from "react";
import { Bell, Check, Copy, FileText, Lock, Mail, MessageSquare, Plus, Send, Trash2, X } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import {
  createLab, createShare, labEmail, listLabs, removeLab, replyFile, revokeShare, type Lab, type LabPackFile, type LabReply, type LabShare,
} from "@/services/labs/labsApi";

interface LabsValue {
  labs: Lab[] | null; shares: LabShare[]; error: string;
  reload: () => Promise<void>;
  token: () => Promise<string>;
}
const LabsContext = createContext<LabsValue | null>(null);

export function LabsProvider({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  const [labs, setLabs] = useState<Lab[] | null>(null);
  const [shares, setShares] = useState<LabShare[]>([]);
  const [error, setError] = useState("");
  const token = useCallback(async () => {
    const value = await account.getAccessToken();
    if (!value) throw new Error("Sign in to use Labs.");
    return value;
  }, [account]);
  const reload = useCallback(async () => {
    try { const r = await listLabs(await token()); setLabs(r.labs); setShares(r.shares); setError(""); }
    catch (e) { setLabs(current => current ?? []); setError(e instanceof Error ? e.message : "Labs couldn’t be loaded."); }
  }, [token]);
  useEffect(() => {
    void reload();
    // Pick up opens and replies while the portal is open.
    const timer = setInterval(() => { if (document.visibilityState === "visible") void reload(); }, 60_000);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [reload]);
  return <LabsContext.Provider value={{ labs, shares, error, reload, token }}>{children}</LabsContext.Provider>;
}
export function useLabs(): LabsValue {
  const value = useContext(LabsContext);
  if (!value) throw new Error("useLabs needs LabsProvider");
  return value;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(w => w[0]!.toUpperCase()).join("").slice(0, 2);

/** A lab's replies on one link: messages, with photos shown and PDFs to open. */
export function LabReplies({ share }: { share: LabShare }) {
  if (!share.replies?.length) return null;
  return <div className="pt-replies">{share.replies.map(r => <ReplyItem key={r.id} share={share} reply={r} />)}</div>;
}
function ReplyItem({ share, reply }: { share: LabShare; reply: LabReply }) {
  const { token } = useLabs();
  const [urls, setUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    let live = true; const made: string[] = [];
    void (async () => {
      for (const f of reply.files.filter(f => f.mime.startsWith("image/"))) {
        try { const url = URL.createObjectURL(await replyFile(await token(), share.id, reply.id, f.index)); made.push(url); if (live) setUrls(u => ({ ...u, [f.index]: url })); } catch { /* shown as a file chip */ }
      }
    })();
    return () => { live = false; made.forEach(u => URL.revokeObjectURL(u)); };
  }, [share.id, reply, token]);
  const open = async (index: number) => { const url = URL.createObjectURL(await replyFile(await token(), share.id, reply.id, index)); window.open(url, "_blank", "noopener"); };
  return <div className="pt-reply">
    <p className="pt-reply-head"><MessageSquare size={14} /><b>{share.labName}</b><span>{new Date(reply.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></p>
    {reply.message && <p className="pt-reply-msg">{reply.message}</p>}
    {reply.files.length > 0 && <div className="pt-reply-files">{reply.files.map(f => urls[f.index]
      ? <button key={f.index} type="button" className="pt-reply-img" onClick={() => void open(f.index)} aria-label={`Open ${f.label}`}><img src={urls[f.index]} alt={f.label} /></button>
      : <button key={f.index} type="button" className="pt-reply-file" onClick={() => void open(f.index)}><FileText size={14} />{f.label}</button>)}</div>}
  </div>;
}

/** Recent activity on shared links: opened by the lab, or a reply. */
export function labEvents(shares: LabShare[]) {
  const events: { id: string; at: string; caseId: string; text: string; detail?: string }[] = [];
  for (const s of shares) {
    if (s.lastViewedAt) events.push({ id: `v-${s.id}-${s.lastViewedAt}`, at: s.lastViewedAt, caseId: s.caseId, text: `${s.labName} opened ${s.caseLabel}` });
    for (const r of s.replies ?? []) events.push({ id: `r-${r.id}`, at: r.createdAt, caseId: s.caseId, text: `${s.labName} replied on ${s.caseLabel}`, detail: r.message ?? `${r.files.length} file${r.files.length === 1 ? "" : "s"}` });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

const SEEN_KEY = "smilecompose.labs.seenAt";
/** The bell in the portal's top bar: lab opens and replies since you last looked. */
export function LabNotifications({ onOpenCase }: { onOpenCase: (caseId: string) => void }) {
  const { shares } = useLabs();
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(() => { try { return localStorage.getItem(SEEN_KEY) ?? ""; } catch { return ""; } });
  const events = labEvents(shares).slice(0, 20);
  const unseen = events.filter(e => e.at > seenAt).length;
  const toggle = () => {
    setOpen(o => !o);
    if (!open) { const now = new Date().toISOString(); try { localStorage.setItem(SEEN_KEY, now); } catch { /* private mode */ } setTimeout(() => setSeenAt(now), 1500); }
  };
  return <div className="pt-bell-wrap">
    <button type="button" className="pt-bell" aria-label={unseen ? `${unseen} new lab updates` : "Lab updates"} aria-expanded={open} onClick={toggle}>
      <Bell size={19} />{unseen > 0 && <span className="pt-bell-dot">{unseen > 9 ? "9+" : unseen}</span>}
    </button>
    {open && <div className="pt-bell-menu" role="menu">
      <p className="pt-sec">Lab updates</p>
      {events.length ? events.map(e => <button key={e.id} role="menuitem" className={e.at > seenAt ? "new" : ""} onClick={() => { setOpen(false); onOpenCase(e.caseId); }}>
        <b>{e.text}</b>{e.detail && <span className="pt-bell-detail">{e.detail}</span>}
        <small>{new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
      </button>) : <p className="pt-hint">When a lab opens a link or replies, you’ll see it here.</p>}
    </div>}
  </div>;
}

export function ShareState({ share }: { share: LabShare }) {
  if (share.replies?.length) return <span className="pt-pill gold">Replied{share.replies.length > 1 ? ` ${share.replies.length}×` : ""}</span>;
  if (share.state === "viewed") return <span className="pt-pill ok">Viewed{share.viewCount > 1 ? ` ${share.viewCount}×` : ""}</span>;
  if (share.state === "sent") return <span className="pt-pill wait">Not opened</span>;
  if (share.state === "revoked") return <span className="pt-pill off">Withdrawn</span>;
  return <span className="pt-pill off">Expired</span>;
}

export function AddLabForm({ onAdded, onCancel }: { onAdded: (lab: Lab) => void; onCancel?: () => void }) {
  const { token, reload } = useLabs();
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="pt-addlab" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError("");
    try { const lab = await createLab(await token(), { name, email, contact }); await reload(); onAdded(lab); }
    catch (err) { setError(err instanceof Error ? err.message : "That lab couldn’t be saved."); }
    finally { setBusy(false); }
  }}>
    <label className="pt-field">Lab name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ceramic Studio London" /></label>
    <label className="pt-field">Email<input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="orders@lab.co.uk" /></label>
    <label className="pt-field">Contact <span className="pt-hint">Optional</span><input maxLength={120} value={contact} onChange={e => setContact(e.target.value)} placeholder="Technician’s name" /></label>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="pt-row pt-end">
      {onCancel && <button type="button" className="pt-btn pt-btn-line" onClick={onCancel}>Cancel</button>}
      <button className="pt-btn pt-btn-dark" disabled={busy}>{busy ? "Saving…" : "Save lab"}</button>
    </div>
  </form>;
}

/** Labs: the labs you work with and every link you've shared. */
export function LabsView({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const { labs, shares, error, reload, token } = useLabs();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const counts = (labId: string) => ({ sent: shares.filter(s => s.labId === labId).length, open: shares.filter(s => s.labId === labId && (s.state === "sent" || s.state === "viewed")).length });
  async function revoke(share: LabShare) {
    if (!window.confirm(`Withdraw the link for ${share.caseLabel}? ${share.labName} will no longer be able to open it, and its copied files are deleted.`)) return;
    try { await revokeShare(await token(), share.id); await reload(); setNotice("Link withdrawn."); } catch (e) { setNotice(e instanceof Error ? e.message : "That link couldn’t be withdrawn."); }
  }
  async function remove(lab: Lab) {
    if (!window.confirm(`Remove ${lab.name} from your labs? Links you’ve already sent keep working until they expire.`)) return;
    try { await removeLab(await token(), lab.id); await reload(); } catch (e) { setNotice(e instanceof Error ? e.message : "That lab couldn’t be removed."); }
  }
  return <section className="pt-view">
    <div className="pt-row pt-between">
      <div><h1 className="pt-h1">Labs</h1><p className="pt-sub">The labs you work with, and every case you’ve shared with them.</p></div>
      <button className="pt-btn pt-btn-dark" onClick={() => setAdding(true)}><Plus size={16} />Add lab</button>
    </div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {notice && <p className="pt-notice" role="status">{notice}</p>}
    <div className="pt-labs">
      {(labs ?? []).map(lab => { const c = counts(lab.id); return <article key={lab.id} className="pt-card pt-lab">
        <div className="pt-lab-mark">{initials(lab.name)}</div>
        <h3>{lab.name}</h3>
        <p>{lab.email}{lab.contact ? ` · ${lab.contact}` : ""}</p>
        <div className="pt-lab-stats"><span><b>{c.sent}</b> case{c.sent === 1 ? "" : "s"} sent</span><span><b>{c.open}</b> open link{c.open === 1 ? "" : "s"}</span></div>
        <button className="pt-icon-btn pt-lab-remove" aria-label={`Remove ${lab.name}`} onClick={() => void remove(lab)}><Trash2 size={15} /></button>
      </article>; })}
      {adding ? <article className="pt-card pt-lab"><AddLabForm onAdded={() => setAdding(false)} onCancel={() => setAdding(false)} /></article>
        : <button className="pt-card pt-lab pt-lab-add" onClick={() => setAdding(true)}><Plus size={26} /><b>Add a lab</b><span>Name, email and a contact</span></button>}
    </div>
    <h2 className="pt-h2">Shared links</h2>
    {shares.length ? <div className="pt-card pt-table-wrap"><table className="pt-table">
      <thead><tr><th>Case</th><th>Lab</th><th>Sent</th><th>Expires</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{shares.map(s => <Fragment key={s.id}><tr>
        <td><button className="pt-link" onClick={() => onOpenCase(s.caseId)}><b>{s.caseLabel}</b></button></td>
        <td>{s.labName}</td><td>{fmt(s.createdAt)}</td><td>{fmt(s.expiresAt)}</td><td><ShareState share={s} /></td>
        <td className="pt-right">{(s.state === "sent" || s.state === "viewed") && <button className="pt-link" onClick={() => void revoke(s)}>Withdraw</button>}</td>
      </tr>{s.replies?.length > 0 && <tr className="pt-reply-row"><td colSpan={6}><LabReplies share={s} /></td></tr>}</Fragment>)}</tbody></table></div>
      : <div className="pt-card pt-empty-card"><Lock size={22} /><p>When you send a case to a lab, its private link appears here. You can see when it’s opened and withdraw it at any time.</p></div>}
  </section>;
}

export interface LabPackOption { key: string; label: string; detail?: string; defaultOn: boolean; make: () => Promise<LabPackFile | null> }

/** Send to lab: choose the lab and what goes in the pack, confirm consent, get a private link. */
export function SendToLab({ caseId, caseLabel, options, spec, note, onClose, onSent }: {
  caseId: string; caseLabel: string; options: LabPackOption[]; spec: { label: string; value: string }[]; note: string;
  onClose: () => void; onSent: () => void;
}) {
  const account = useAccount();
  const { labs, token, reload } = useLabs();
  const [labId, setLabId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState(() => new Set(options.filter(o => o.defaultOn).map(o => o.key)));
  const [withSpec, setWithSpec] = useState(spec.length > 0);
  const [withNote, setWithNote] = useState(false);
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [done, setDone] = useState<{ url: string; lab: { name: string; email: string }; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const lab = (labs ?? []).find(l => l.id === labId) ?? null;
  useEffect(() => { if (!labId && labs?.length) setLabId(labs[0].id); }, [labs, labId]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);

  async function send() {
    if (!lab) return;
    setBusy(true); setError("");
    try {
      const files: LabPackFile[] = [];
      for (const option of options) if (chosen.has(option.key)) { const f = await option.make(); if (f) files.push(f); }
      if (!files.length) throw new Error("Choose at least one photo or document to share.");
      const result = await createShare(await token(), { labId: lab.id, caseId, caseLabel, days, consent: true, spec: withSpec ? spec : [], note: withNote ? note : undefined, files });
      setDone({ url: result.url, lab: result.lab, expiresAt: result.share.expiresAt });
      void reload(); onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The link couldn’t be created.");
    } finally { setBusy(false); }
  }

  return <div className="pt-scrim" role="dialog" aria-modal="true" aria-labelledby="send-title" onClick={onClose}>
    <div className="pt-modal" onClick={e => e.stopPropagation()}>
      <button className="pt-icon-btn pt-modal-close" aria-label="Close" onClick={onClose}><X size={16} /></button>
      {done ? <>
        <div className="pt-done"><Check size={26} /></div>
        <h2 id="send-title">Link ready for {done.lab.name}</h2>
        <p className="pt-sub">Anyone with this link can open the lab pack until {new Date(done.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. You can withdraw it from Labs at any time. It’s shown once, so copy or email it now.</p>
        <div className="pt-linkbox"><Lock size={15} /><span>{done.url}</span>
          <button className="pt-btn pt-btn-line pt-btn-small" onClick={() => { void navigator.clipboard.writeText(done.url).then(() => setCopied(true)); }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button></div>
        <div className="pt-row pt-end">
          <button className="pt-btn pt-btn-line" onClick={onClose}>Done</button>
          <a className="pt-btn pt-btn-gold" href={labEmail(done.lab, caseLabel, done.url, done.expiresAt, account.displayName || "")}><Mail size={16} />Email with your mail app</a>
        </div>
      </> : <>
        <p className="pt-eyebrow">Send to lab</p>
        <h2 id="send-title">Share {caseLabel} with a lab</h2>
        <p className="pt-sub">We make a private link to a copy of the lab pack. You send it from your own email; it shows the case reference, not the patient’s name.</p>
        <p className="pt-sec">Lab</p>
        {labs === null ? <p className="pt-hint">Loading your labs…</p> : <>
          {labs.map(l => <label key={l.id} className="pt-opt"><input type="radio" name="lab" checked={labId === l.id} onChange={() => setLabId(l.id)} /><span><b>{l.name}</b><small>{l.email}</small></span></label>)}
          {adding || !labs.length ? <AddLabForm onAdded={l => { setLabId(l.id); setAdding(false); }} onCancel={labs.length ? () => setAdding(false) : undefined} />
            : <button className="pt-link" onClick={() => setAdding(true)}><Plus size={14} />Add another lab</button>}
        </>}
        <p className="pt-sec">Include</p>
        {options.map(o => <label key={o.key} className="pt-check"><input type="checkbox" checked={chosen.has(o.key)} onChange={e => setChosen(set => { const next = new Set(set); if (e.target.checked) next.add(o.key); else next.delete(o.key); return next; })} /><span>{o.label}{o.detail && <small> · {o.detail}</small>}</span></label>)}
        {spec.length > 0 && <label className="pt-check"><input type="checkbox" checked={withSpec} onChange={e => setWithSpec(e.target.checked)} /><span>Design specification <small>· shape, shade, treatment</small></span></label>}
        {note.trim() && <label className="pt-check"><input type="checkbox" checked={withNote} onChange={e => setWithNote(e.target.checked)} /><span>Your case notes</span></label>}
        <div className="pt-row pt-expiry"><span>Link works for</span><div className="pt-seg">{([7, 14, 30] as const).map(d => <button key={d} type="button" className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d} days</button>)}</div></div>
        <label className="pt-check pt-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>The patient has agreed to me sharing these images with this lab for their treatment.</span></label>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="pt-row pt-end">
          <button className="pt-btn pt-btn-line" onClick={onClose}>Cancel</button>
          <button className="pt-btn pt-btn-dark" disabled={!lab || !consent || busy || !chosen.size} onClick={() => void send()}><Send size={15} />{busy ? "Creating link…" : "Create secure link"}</button>
        </div>
      </>}
    </div>
  </div>;
}
