import { AGREED_STAGES, invoiceTotal, stageOf, type CaseAppointment, type CaseEvent, type CaseInvoice } from "@/lib/portal";
import { DAY, daysBetween, gbp, invoiceState, startOfDay } from "@/lib/billing";

/** What a case needs from the clinician, worked out from what's recorded on it. */
export interface CaseFacts {
  labels: string[];
  stageAt?: number;
  createdAt: number;
  updatedAt: number;
  concepts: number;
  /** Smile Previews and reports sent, newest first. */
  sent: { kind: string; at: number }[];
  hasConsent: boolean;
  photoCount: number;
  fee?: number;
  invoices: CaseInvoice[];
  appointment?: CaseAppointment;
  history?: CaseEvent[];
}

export type ActionKind = "invoice-overdue" | "follow-up" | "preview-waiting" | "consent" | "raise-invoice" | "prepare" | "design" | "present" | "photos" | "awaiting-payment" | "booked" | "none";
export interface CaseAction {
  kind: ActionKind;
  /** Short line for lists: "Thinking it over for 9 days". */
  text: string;
  /** The next step, for the case page. */
  title: string;
  detail: string;
  tone: "amber" | "blue" | "gold" | "green" | "plain";
  /** Higher comes first on Home. */
  priority: number;
  /** Shown on Home's "Needs you" (the rest only on the case page). */
  urgent: boolean;
}

const DECIDING = ["Consultation", "Thinking it over"];
/** Days a patient can be deciding before the case asks for a follow-up. */
export const FOLLOW_UP_DAYS = 7;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const when = (t: number) => {
  const days = Math.round((startOfDay(t) - startOfDay(Date.now())) / DAY);
  const clock = new Date(t).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
  return days === 0 ? `today, ${clock}` : days === 1 ? `tomorrow, ${clock}` : `${new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${clock}`;
};

export function caseActions(c: CaseFacts, now = Date.now()): CaseAction[] {
  const out: CaseAction[] = [];
  const stage = stageOf(c.labels);
  const agreed = (AGREED_STAGES as readonly string[]).includes(stage ?? "");
  const live = c.invoices.filter(i => i.status !== "void");
  const overdue = live.filter(i => invoiceState(i, now) === "overdue");
  const unpaid = live.filter(i => i.status === "sent");
  const invoiced = live.filter(i => i.status !== "draft").reduce((s, i) => s + invoiceTotal(i), 0);
  const appt = c.appointment && c.appointment.at >= startOfDay(now) ? c.appointment : undefined;
  const apptSoon = appt && appt.at - now < 2 * DAY;

  for (const inv of overdue) out.push({ kind: "invoice-overdue", text: `${inv.number} is ${plural(daysBetween(inv.dueAt, now), "day")} overdue · ${gbp(invoiceTotal(inv))}`,
    title: "Chase an overdue invoice", detail: `${inv.number} for ${gbp(invoiceTotal(inv))} was due ${new Date(inv.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`, tone: "amber", priority: 90, urgent: true });

  if (apptSoon && !c.concepts) out.push({ kind: "prepare", text: `Appointment ${when(appt.at)}, no concept yet`, title: "Prepare for the appointment",
    detail: `${appt.type} ${when(appt.at)}. Design a concept beforehand so it’s ready to present.`, tone: "amber", priority: 85, urgent: true });

  // A logged call restarts the follow-up clock.
  const lastCall = Math.max(0, ...(c.history ?? []).filter(e => e.kind === "call").map(e => e.at));
  if (stage && DECIDING.includes(stage)) {
    const days = daysBetween(Math.max(c.stageAt ?? c.updatedAt, lastCall), now);
    if (days >= FOLLOW_UP_DAYS) out.push({ kind: "follow-up", text: `${stage} for ${plural(days, "day")}`, title: "Follow up",
      detail: `This case has been at “${stage}” for ${plural(days, "day")}. A short call often answers what’s holding them back.`, tone: "amber", priority: 70 + Math.min(days, 20), urgent: true });
  }
  const lastSent = c.sent.find(s => s.kind === "preview");
  if (lastSent && !agreed && stage !== "Not proceeding" && !out.some(a => a.kind === "follow-up")) {
    const days = daysBetween(lastSent.at, now);
    if (days >= 3 && lastCall < lastSent.at) out.push({ kind: "preview-waiting", text: `Smile Preview sent ${plural(days, "day")} ago, no decision yet`, title: "Follow up the Smile Preview",
      detail: `Their Smile Preview went out ${plural(days, "day")} ago. Check they’ve seen it and ask what they think.`, tone: "blue", priority: 60, urgent: true });
  }
  if (agreed && c.fee && invoiced < c.fee && !live.some(i => i.status === "draft")) out.push({ kind: "raise-invoice", text: `${stage}, ${invoiced ? `${gbp(c.fee - invoiced)} not invoiced` : "no invoice yet"}`,
    title: invoiced ? "Invoice the balance" : "Raise a deposit invoice", detail: `Estimate ${gbp(c.fee)}${invoiced ? `, ${gbp(invoiced)} invoiced so far` : ""}.`, tone: "gold", priority: 50, urgent: true });
  if (c.photoCount + c.concepts > 0 && !c.hasConsent && stage !== "Not proceeding") out.push({ kind: "consent", text: "Patient consent not recorded", title: "Record the patient’s consent",
    detail: "Have the patient sign on this screen or an iPad. It’s kept with the case.", tone: "plain", priority: 40, urgent: true });

  // Gentler next steps for the case page.
  if (unpaid.length && !overdue.length) out.push({ kind: "awaiting-payment", text: "Awaiting payment", title: "Awaiting payment",
    detail: `${unpaid.map(i => `${i.number} (${gbp(invoiceTotal(i))})`).join(", ")} due ${new Date(Math.min(...unpaid.map(i => i.dueAt))).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`, tone: "plain", priority: 20, urgent: false });
  if (appt && !apptSoon) out.push({ kind: "booked", text: `${appt.type} ${when(appt.at)}`, title: `${appt.type} booked`, detail: `Next appointment ${when(appt.at)}.`, tone: "green", priority: 10, urgent: false });
  else if (appt && c.concepts) out.push({ kind: "booked", text: `${appt.type} ${when(appt.at)}`, title: `${appt.type} ${when(appt.at)}`, detail: "The concept is ready to present.", tone: "green", priority: 15, urgent: false });
  if (!c.photoCount && !c.concepts) out.push({ kind: "photos", text: "No photos yet", title: "Add the patient’s photos", detail: "Drop in the smile front to design, and the rest of the set for the record.", tone: "plain", priority: 5, urgent: false });
  else if (!c.concepts) out.push({ kind: "design", text: "Not designed yet", title: "Design the smile", detail: "Open the Design Studio to make the first concept.", tone: "plain", priority: 5, urgent: false });
  else if (!c.sent.length && !agreed) out.push({ kind: "present", text: "Concept ready to present", title: "Present the concept", detail: "Show it full screen in the chair, or send the patient their Smile Preview to take home.", tone: "plain", priority: 4, urgent: false });

  return out.sort((a, b) => b.priority - a.priority);
}

/** Counts per week for the last `weeks` weeks (oldest first), for sparklines. */
export function weekly(times: number[], weeks = 8, now = Date.now()): number[] {
  const end = startOfDay(now) + DAY;
  const out = new Array<number>(weeks).fill(0);
  for (const t of times) { const i = weeks - 1 - Math.floor((end - t) / (7 * DAY)); if (i >= 0 && i < weeks) out[i]++; }
  return out;
}
