"use client";
import { useMemo, useState } from "react";
import { useAllowance } from "@/components/account/Allowance";
import { AGREED_STAGES, invoiceTotal, stageOf } from "@/lib/portal";
import { gbp, startOfDay } from "@/lib/billing";
import type { PortalCaseCard } from "./portalData";

type Period = "month" | "quarter" | "year";
const PERIODS: [Period, string][] = [["month", "This month"], ["quarter", "Last 3 months"], ["year", "This year"]];
function periodStart(p: Period, now = new Date()): number {
  if (p === "month") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (p === "year") return new Date(now.getFullYear(), 0, 1).getTime();
  return startOfDay(now.getTime() - 90 * 86_400_000);
}
const agreed = (c: PortalCaseCard) => (AGREED_STAGES as readonly string[]).includes(stageOf(c.labels) ?? "");
const pct = (n: number, d: number) => d ? Math.round((n / d) * 100) : 0;

/** How consultations turn into treatment, from the cases on this account. */
export function InsightsView({ cases }: { cases: PortalCaseCard[] | null }) {
  const [period, setPeriod] = useState<Period>("month");
  const allowance = useAllowance();
  const from = periodStart(period);
  const all = useMemo(() => cases ?? [], [cases]);
  const inPeriod = all.filter(c => c.createdAt >= from);
  const designed = inPeriod.filter(c => c.concepts > 0);
  const shared = inPeriod.filter(c => c.sent.length > 0);
  const yes = inPeriod.filter(agreed);
  const no = inPeriod.filter(c => stageOf(c.labels) === "Not proceeding");
  const decided = yes.length + no.length;
  const valueAgreed = yes.reduce((s, c) => s + (c.fee ?? 0), 0);
  const paid = all.flatMap(c => c.invoices).filter(i => i.status === "paid" && (i.paidAt ?? 0) >= from).reduce((s, i) => s + invoiceTotal(i), 0);
  const conceptsMade = all.flatMap(c => c.conceptTimes).filter(t => t >= from).length;

  const funnel = [
    { label: "New cases", n: inPeriod.length },
    { label: "Concept designed", n: designed.length },
    { label: "Smile Preview or report sent", n: shared.length },
    { label: "Going ahead", n: yes.length },
  ];
  const byTreatment = useMemo(() => {
    const groups = new Map<string, PortalCaseCard[]>();
    for (const c of inPeriod) { const t = c.tags[0] ?? (c.concepts ? "Other" : null); if (t) groups.set(t, [...(groups.get(t) ?? []), c]); }
    return [...groups.entries()].map(([treatment, list]) => ({ treatment, n: list.length, yes: list.filter(agreed).length, value: list.filter(agreed).reduce((s, c) => s + (c.fee ?? 0), 0) }))
      .sort((a, b) => b.n - a.n);
  }, [inPeriod]);
  // Paid by month, last six months.
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1), end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const total = all.flatMap(c => c.invoices).filter(i => i.status === "paid" && (i.paidAt ?? 0) >= d.getTime() && (i.paidAt ?? 0) < end).reduce((s, i) => s + invoiceTotal(i), 0);
      return { label: d.toLocaleDateString("en-GB", { month: "short" }), total };
    });
  }, [all]);
  const maxMonth = Math.max(1, ...months.map(m => m.total));
  // Left versus used this month (the plan's own total isn't known here, and rollover changes it).
  const monthStart = periodStart("month");
  const usedMonth = all.flatMap(c => c.conceptTimes).filter(t => t >= monthStart).length;
  const ring = !allowance ? 0 : allowance.unlimited ? 1 : allowance.remaining + usedMonth ? allowance.remaining / (allowance.remaining + usedMonth) : 0;

  return <section className="pt-view">
    <div className="pt-row pt-between">
      <div><h1 className="pt-h1">Insights</h1><p className="pt-sub">How consultations turn into treatment, from the cases and invoices on your account.</p></div>
      <div className="pt-seg" role="group" aria-label="Period">{PERIODS.map(([key, label]) => <button key={key} type="button" className={period === key ? "on" : ""} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</div>
    </div>
    {cases === null ? <p className="pt-hint">Loading…</p> : <>
      <div className="pt-stats" role="group" aria-label="Headlines">
        <div className="pt-stat"><small>Going ahead</small><b>{decided ? `${pct(yes.length, decided)}%` : "–"}</b><span>{decided ? `${yes.length} of ${decided} patients who decided` : "No decisions recorded yet"}</span></div>
        <div className="pt-stat"><small>Treatment value agreed</small><b>{gbp(valueAgreed, { compact: true })}</b><span>{yes.some(c => !c.fee) ? `${yes.filter(c => !c.fee).length} agreed case${yes.filter(c => !c.fee).length === 1 ? "" : "s"} without an estimate` : "From case estimates"}</span></div>
        <div className="pt-stat"><small>Paid</small><b>{gbp(paid, { compact: true })}</b><span>Invoices marked paid</span></div>
        <div className="pt-stat"><small>Concepts made</small><b>{conceptsMade}</b><span>{designed.length ? `${(designed.reduce((s, c) => s + c.concepts, 0) / designed.length).toFixed(1)} per designed case` : "In this period"}</span></div>
      </div>
      <div className="pt-ins">
        <div className="pt-card pt-pad">
          <div className="pt-row pt-between pt-card-title"><h2 className="pt-h2 flush">From new case to treatment</h2><span className="pt-kicker">{PERIODS.find(p => p[0] === period)![1]}</span></div>
          {inPeriod.length ? <div className="pt-funnel">{funnel.map((f, i) => <div key={f.label} className="pt-fstep">
            <span>{f.label}</span>
            <div className="pt-fbar">{f.n > 0 && <i style={{ width: `${Math.max(6, pct(f.n, funnel[0].n))}%`, animationDelay: `${i * 70}ms` }}>{f.n}</i>}</div>
            <b>{i === 0 ? f.n : `${pct(f.n, funnel[0].n)}%`}</b>
          </div>)}</div> : <p className="pt-hint">No new cases in this period.</p>}
          <p className="pt-hint pt-gap-t">“Going ahead” counts cases tagged Going ahead, Treatment booked or In treatment.</p>
        </div>
        <div className="pt-card pt-pad">
          <div className="pt-row pt-between pt-card-title"><h2 className="pt-h2 flush">Plan</h2><span className="pt-kicker">{allowance?.renewal ?? ""}</span></div>
          {allowance ? <div className="pt-ring-wrap">
            <svg viewBox="0 0 120 120" className="pt-ring" aria-hidden="true"><circle cx="60" cy="60" r="48" className="track" /><circle cx="60" cy="60" r="48" className="fill" style={{ strokeDasharray: 301.6, strokeDashoffset: 301.6 * (1 - ring) }} /></svg>
            <div className="pt-ring-num"><b>{allowance.unlimited ? "∞" : allowance.remaining}</b><small>concepts left</small></div>
          </div> : <p className="pt-hint">No active plan.</p>}
          <p className="pt-hint">{usedMonth} used this month{allowance?.rolloverNote ? `. ${allowance.rolloverNote}` : "."}</p>
        </div>
      </div>
      <div className="pt-ins">
        <div className="pt-card pt-pad">
          <div className="pt-row pt-between pt-card-title"><h2 className="pt-h2 flush">By treatment</h2><span className="pt-kicker">New cases in period</span></div>
          {byTreatment.length ? <table className="pt-table pt-ins-table"><thead><tr><th>Treatment</th><th className="r">Cases</th><th>Going ahead</th><th className="r">Value agreed</th></tr></thead>
            <tbody>{byTreatment.map(r => <tr key={r.treatment}><td>{r.treatment}</td><td className="r">{r.n}</td>
              <td><span className="pt-minibar"><i style={{ width: `${pct(r.yes, r.n)}%` }} /></span>{pct(r.yes, r.n)}%</td><td className="r">{gbp(r.value)}</td></tr>)}</tbody></table>
            : <p className="pt-hint">Treatments appear once cases have a concept.</p>}
        </div>
        <div className="pt-card pt-pad">
          <div className="pt-row pt-between pt-card-title"><h2 className="pt-h2 flush">Paid by month</h2><span className="pt-kicker">Last 6 months</span></div>
          <div className="pt-months" role="img" aria-label={months.map(m => `${m.label} ${gbp(m.total)}`).join(", ")}>{months.map(m => <div key={m.label} className="pt-month">
            <span className="v">{m.total ? gbp(m.total, { compact: true }) : ""}</span><i style={{ height: `${Math.round((m.total / maxMonth) * 100)}%` }} /><span>{m.label}</span></div>)}</div>
        </div>
      </div>
    </>}
  </section>;
}
