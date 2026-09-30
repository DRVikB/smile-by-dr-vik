import test from "node:test";
import assert from "node:assert/strict";
import {
  confidenceBand, designPriorities, designSummary, editObservation, initialReportDraft, proposedSmileRows, reportContent,
  shadeObservation, smileObservations, todayVsProposed, treatmentOverview, EXPORT_NAMES,
} from "../src/lib/consultation";
import type { SmileAnalysis } from "../src/lib/face/analysis";
import { jpegPagesToPdf, A4_LONG, A4_SHORT } from "../src/lib/pdf";
import { defaultSettings, upperTeeth, type SmileSettings } from "../src/lib/types";

const composite6: SmileSettings = { ...defaultSettings, teeth: 6, selectedTeeth: upperTeeth[6], treatment: "Single-shade composite", shape: "Square", character: "Soft", targetShade: "B1", texture: "Natural", intensity: 35 };
const porcelain10: SmileSettings = { ...defaultSettings, teeth: 10, selectedTeeth: upperTeeth[10], treatment: "Porcelain", shape: "Rounded", character: "Balanced", targetShade: "BL2", designIntent: "Reshape" };
const whitening: SmileSettings = { ...defaultSettings, designIntent: "Shade only", targetShade: "Whiten" };

/** A level, centred face as the landmarks would measure it. */
const face = (over: Partial<SmileAnalysis> = {}): SmileAnalysis => ({
  pupils: [[380, 500], [620, 500]], midline: { through: [500, 480], direction: [0, 1] }, commissures: [[370, 760], [630, 760]], lowerLipCurve: [[370, 760], [500, 800], [630, 760]],
  headTiltDeg: 0.4, cantDeg: 0.6, midlineOffsetPx: 3, midlineOffsetMm: 0.8, smileWidthPx: 260, smileWidthMm: 66, mmPerPx: 0.25,
  faceBox: { x: 250, y: 200, w: 500, h: 800 }, mouthBox: { x: 330, y: 700, w: 340, h: 180 }, ...over,
});

/** Words a patient must never read about their own teeth. */
const NEGATIVE = /\b(defective|abnormal|bad|unattractive|problematic|problem|flaw|ugly)\b/i;

test("the Smile Preview summary: two lines about the design, in patient words", () => {
  assert.deepEqual(designSummary(composite6), { headline: "Composite bonding · 6 upper teeth", detail: "Soft square · B1 · Natural texture" });
  assert.deepEqual(designSummary(porcelain10), { headline: "Porcelain veneers · 10 upper teeth", detail: "Round · BL2 · Natural texture" });
  assert.deepEqual(designSummary(whitening), { headline: "Whitening · 8 upper teeth", detail: "A brighter shade" });
});

test("the proposed smile lists only what applies to this design", () => {
  const rows = Object.fromEntries(proposedSmileRows(composite6));
  assert.equal(rows.Treatment, "Composite bonding");
  assert.equal(rows["Selected teeth"], "13, 12, 11, 21, 22, 23");
  assert.equal(rows["Tooth shape"], "Soft square");
  assert.equal(rows["Reference smile"], undefined, "no reference, no row");
  const shadeOnly = Object.fromEntries(proposedSmileRows(whitening, true));
  assert.equal(shadeOnly.Treatment, "Whitening");
  assert.equal(shadeOnly["Tooth shape"], undefined);
  assert.equal(shadeOnly.Texture, undefined);
  assert.equal(shadeOnly["Result intensity"], undefined);
  assert.equal(shadeOnly["Reference smile"], "Included");
});

test("observations come from the analysis with a confidence; nothing is invented without it", () => {
  assert.deepEqual(smileObservations(null), [], "no analysis (a close-up): no observations");
  const level = smileObservations(face());
  assert.deepEqual(level.map(o => [o.metric, o.value, confidenceBand(o.confidence)]), [["smile_balance", "balanced", "high"], ["smile_centre", "centred", "high"]]);
  assert.ok(level.every(o => o.source === "face-landmarks" && !/°|%/.test(o.text)), "no degrees or percentages for the patient");
  // Less certain when the head is tilted in the photo and the face is small.
  const uncertain = smileObservations(face({ cantDeg: 3, headTiltDeg: 7, mmPerPx: null }));
  assert.ok(uncertain.every(o => confidenceBand(o.confidence) !== "high"));
  // Nothing about teeth the landmarks can't see.
  assert.ok(level.every(o => !/proportion|visible|arc/i.test(o.title)));
});

test("the clinician's review: high included, medium offered, low left out, and edits become the clinician's", () => {
  const draft = initialReportDraft({ settings: composite6, analysis: face({ cantDeg: 3.1 }), patientLabel: " AB ", now: new Date("2026-09-30T10:00:00Z") });
  const balance = draft.observations.find(o => o.metric === "smile_balance")!;
  assert.deepEqual([balance.band, balance.include], ["medium", false]);
  assert.equal(draft.observations.find(o => o.metric === "smile_centre")!.include, true);
  assert.equal(draft.patientLabel, "AB");
  assert.deepEqual(draft.sections, { observations: true, design: true, treatment: true, comparison: true, technical: false });
  const low = initialReportDraft({ settings: composite6, analysis: face({ cantDeg: 5, midlineOffsetPx: 30, headTiltDeg: 8, mmPerPx: null }) });
  assert.equal(low.observations.length, 0, "low confidence is not offered at all");
  const edited = editObservation(balance, "We agreed the smile looks balanced.");
  assert.deepEqual([edited.source, edited.band, edited.confidence], ["clinician", "high", 1]);
});

test("shade is an estimate unless confirmed, offered rather than included, and can be overridden", () => {
  assert.match(shadeObservation("A2", false)!.text, /appears around A2\. This is an estimated visual shade and requires clinical confirmation\./);
  assert.equal(confidenceBand(shadeObservation("A2", false)!.confidence), "medium");
  assert.equal(shadeObservation("A3", true)!.source, "clinician");
  assert.equal(shadeObservation(null, false), null, "missing shade: nothing said");
  const draft = initialReportDraft({ settings: composite6, analysis: null });
  assert.deepEqual(draft.shade, { value: "A2", confirmed: false, include: false });
  const content = reportContent({ ...draft, shade: { value: "A3", confirmed: false, include: true } }, { settings: composite6, analysis: null });
  assert.equal(content.glance.at(-1)!.title, "Shade");
  assert.equal(content.comparison!.find(r => r.feature === "Shade")!.today, "Around A3 (estimated)");
  const without = reportContent(draft, { settings: composite6, analysis: null });
  assert.equal(without.comparison!.find(r => r.feature === "Shade")!.today, "—", "unknown today stays unknown");
});

test("priorities: at most three, positive and hedged", () => {
  for (const s of [composite6, porcelain10, whitening, { ...composite6, designIntent: "Close gaps" as const, smileArc: "Follow lower lip" as const }]) {
    const list = designPriorities(s);
    assert.ok(list.length >= 1 && list.length <= 3);
    for (const p of list) {
      assert.match(p.text, /\b(could|may|appears)\b/);
      assert.doesNotMatch(`${p.title} ${p.text}`, NEGATIVE);
    }
  }
  assert.deepEqual(designPriorities(whitening).map(p => p.title), ["Brighten the smile"]);
});

test("today vs proposed and the treatment overview follow the actual treatment", () => {
  const rows = todayVsProposed(porcelain10, null);
  assert.deepEqual(rows.map(r => r.feature), ["Shade", "Shape", "Treatment area", "Overall style"]);
  assert.ok(rows.every(r => r.today === "—"), "nothing about today is invented");
  assert.equal(todayVsProposed(whitening, null).some(r => r.feature === "Shape"), false);

  const veneers = treatmentOverview(porcelain10);
  assert.equal(veneers[0].title, "Porcelain veneers on 10 upper teeth");
  const bonding = treatmentOverview(composite6);
  assert.equal(bonding[0].text, "Composite is usually added to the tooth surface and can often require little or no enamel removal. It may require polishing, repair or replacement over time.");
  assert.ok(bonding.some(i => i.title === "Discuss whitening and shade matching"));
  const last = bonding.at(-1)!;
  assert.equal(last.title, "Clinical assessment still required");
  assert.ok(last.bullets!.includes("Treatment suitability"));
  // The report never claims the patient is suitable.
  const all = [...veneers, ...bonding, ...treatmentOverview(whitening)].map(i => `${i.title} ${i.text}`).join(" ");
  assert.doesNotMatch(all, /you are suitable|guarantee/i);
});

test("the report content: sections switch off, technical detail only on request, notes kept", () => {
  const analysis = face();
  const draft = initialReportDraft({ settings: composite6, analysis });
  const content = reportContent({ ...draft, note: "We discussed whitening followed by composite bonding to the upper six teeth." }, { settings: composite6, analysis });
  assert.equal(content.technical, null, "no degrees unless asked");
  assert.ok(content.glance.length === 2 && content.design && content.comparison && content.overview);
  assert.equal(content.note, "We discussed whitening followed by composite bonding to the upper six teeth.");
  assert.doesNotMatch(JSON.stringify(content), /°/);
  const technical = reportContent({ ...draft, sections: { ...draft.sections, technical: true, comparison: false } }, { settings: composite6, analysis });
  assert.ok(technical.technical!.some(r => r.value.includes("°")));
  assert.equal(technical.comparison, null);
  // An older saved case with no settings still makes a report: just the images and what's known.
  const legacy = reportContent(initialReportDraft({ analysis: null }), { analysis: null });
  assert.deepEqual([legacy.design, legacy.comparison, legacy.overview, legacy.priorities.length], [null, null, null, 0]);
  assert.match(legacy.disclaimer, /not a guarantee of the final clinical outcome/);
  assert.equal(EXPORT_NAMES.report, "Consultation Report");
});

test("a two-page report PDF: one A4 page per JPEG, all objects reachable", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  const s = Buffer.from(jpegPagesToPdf([{ jpeg: JPEG, widthPx: 1654, heightPx: 2339 }, { jpeg: JPEG, widthPx: 1654, heightPx: 2339 }])).toString("latin1");
  assert.match(s, /\/Kids \[3 0 R 6 0 R\] \/Count 2/);
  assert.equal((s.match(/\/Type \/Page /g) ?? []).length, 2);
  assert.equal((s.match(new RegExp(`/MediaBox \\[0 0 ${A4_SHORT.toFixed(3)} ${A4_LONG.toFixed(3)}\\]`, "g")) ?? []).length, 2);
  const offsets = [...s.matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
  offsets.forEach((at, i) => assert.ok(s.startsWith(`${i + 1} 0 obj`, at), `object ${i + 1} offset is wrong`));
  assert.equal(Number(/startxref\n(\d+)/.exec(s)![1]), s.indexOf("xref\n0 "));
  assert.throws(() => jpegPagesToPdf([]), /no image/i);
});
