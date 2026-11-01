import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanInvoice, invoiceTotal, mergePortal, readBilling, stageOf } from "../src/lib/portal";
import { gbp, invoiceState, invoicesCsv, nextInvoiceNumber } from "../src/lib/billing";
import { caseActions, weekly, type CaseFacts } from "../src/components/portal/caseSignals";

const DAY = 86_400_000;
const invoice = (over: Record<string, unknown> = {}) => cleanInvoice({ id: "i1", number: "INV-0001", issuedAt: Date.now() - DAY, dueAt: Date.now() + 13 * DAY, items: [{ description: "Deposit", amount: 600 }], status: "sent", ...over })!;

test("the pipeline stage is the furthest stage tag; Not proceeding closes the case; own tags don't count", () => {
  assert.equal(stageOf(["Consultation", "Going ahead", "VIP"]), "Going ahead");
  assert.equal(stageOf(["Going ahead", "Not proceeding"]), "Not proceeding");
  assert.equal(stageOf(["Follow-up", "VIP"]), null);
});

test("invoices are cleaned: amounts to the penny, never negative, nothing the sync store would refuse", () => {
  const i = cleanInvoice({ id: "a", number: "INV-0009", issuedAt: 1, dueAt: 2, status: "nonsense", items: [{ description: "https://example.com veneers", amount: 12.345 }, { description: "Refund", amount: -50 }] })!;
  assert.equal(i.status, "draft");
  assert.equal(i.items[0].description, "example.com veneers");
  assert.equal(i.items[0].amount, 12.35);
  assert.equal(i.items[1].amount, 0);
  assert.equal(cleanInvoice({ number: "INV-1" }), null);
  assert.equal(invoiceTotal({ items: [{ description: "", amount: 0.1 }, { description: "", amount: 0.2 }] }), 0.3);
});

test("moving stage stamps the case and adds to its timeline; fee, appointment and events save", () => {
  let p = mergePortal(null, { tags: ["Consultation"] });
  assert.ok(typeof p.stageAt === "number");
  p = mergePortal(p, { tags: ["Consultation", "VIP"] });
  assert.equal((p.history as unknown[]).length, 1, "a non-stage tag doesn't add a stage event");
  p = mergePortal(p, { tags: ["Going ahead"], fee: 2400.5, feeNote: "Bonding", appointment: { at: Date.now() + DAY, type: "Review" }, event: { kind: "call", text: "Called" } });
  const b = readBilling(p);
  assert.equal(b.fee, 2400.5);
  assert.equal(b.appointment?.type, "Review");
  assert.deepEqual(b.history?.map(e => e.kind), ["stage", "stage", "call"]);
  p = mergePortal(p, { fee: null, appointment: null });
  assert.equal(readBilling(p).fee, undefined);
  assert.equal(readBilling(p).appointment, undefined);
});

test("invoice numbers continue across the account; overdue is a sent invoice past its due date", () => {
  assert.equal(nextInvoiceNumber([]), "INV-0001");
  assert.equal(nextInvoiceNumber([invoice({ number: "INV-0009" }), invoice({ number: "INV-0012" })]), "INV-0013");
  assert.equal(invoiceState(invoice({ dueAt: Date.now() - 3 * DAY })), "overdue");
  assert.equal(invoiceState(invoice({ dueAt: Date.now() - 3 * DAY, status: "paid", paidAt: Date.now() })), "paid");
  assert.equal(gbp(1150), "£1,150");
  assert.equal(gbp(12.5), "£12.50");
});

test("CSV export guards against spreadsheet formulas", async () => {
  const csv = await invoicesCsv([{ invoice: invoice(), patient: "=HYPERLINK(1)", reference: "SR-1", caseId: "c" }]).text();
  assert.match(csv, /"'=HYPERLINK\(1\)"/);
});

const facts = (over: Partial<CaseFacts> = {}): CaseFacts => ({ labels: [], createdAt: Date.now() - 20 * DAY, updatedAt: Date.now() - 20 * DAY, concepts: 1, sent: [], hasConsent: true, photoCount: 1, invoices: [], ...over });

test("next steps: overdue invoices first, follow-ups after a week, a logged call restarts the clock", () => {
  assert.equal(caseActions(facts({ labels: ["Thinking it over"], stageAt: Date.now() - 9 * DAY, invoices: [invoice({ dueAt: Date.now() - 5 * DAY })] }))[0].kind, "invoice-overdue");
  assert.equal(caseActions(facts({ labels: ["Thinking it over"], stageAt: Date.now() - 9 * DAY }))[0].kind, "follow-up");
  assert.ok(!caseActions(facts({ labels: ["Thinking it over"], stageAt: Date.now() - 3 * DAY })).some(a => a.urgent));
  assert.ok(!caseActions(facts({ labels: ["Thinking it over"], stageAt: Date.now() - 9 * DAY, history: [{ at: Date.now() - DAY, kind: "call", text: "Called" }] })).some(a => a.kind === "follow-up"));
  assert.equal(caseActions(facts({ labels: ["Going ahead"], fee: 2000 }))[0].kind, "raise-invoice");
  assert.ok(caseActions(facts({ hasConsent: false })).some(a => a.kind === "consent"));
  assert.equal(caseActions(facts({ concepts: 0, photoCount: 0, hasConsent: false }))[0].kind, "photos");
});

test("weekly counts put each time in its week, oldest first", () => {
  const now = Date.now();
  assert.deepEqual(weekly([now, now - DAY, now - 8 * DAY, now - 100 * DAY], 4, now), [0, 0, 1, 2]);
});
