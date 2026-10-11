import { test } from "node:test";
import assert from "node:assert/strict";
import { caseTitle, cleanTag, cleanTags, mergePortal, MAX_TAGS } from "../src/lib/portal";

test("case titles fall back from name to reference to the date the case started", () => {
  const at = Date.parse("2026-10-07T10:00:00Z");
  assert.equal(caseTitle("Sophie R.", "SR-1", at), "Sophie R.");
  assert.equal(caseTitle("", "SR-1", at), "SR-1");
  assert.equal(caseTitle(undefined, " ", at), "Case from 7 Oct");
});

test("tags are tidy, unique and limited", () => {
  assert.equal(cleanTag("  going   ahead "), "Going ahead");
  assert.equal(cleanTag("x".repeat(40)).length, 24);
  assert.deepEqual(cleanTags(["Consultation", "consultation", " follow-up", 3, ""]), ["Consultation", "Follow-up"]);
  assert.equal(cleanTags(Array.from({ length: 20 }, (_, i) => `Tag ${i}`)).length, MAX_TAGS);
  const merged = mergePortal({ name: "A", tags: ["Consultation"] }, { tags: ["Going ahead", "going ahead"] });
  assert.deepEqual(merged.tags, ["Going ahead"]);
  assert.equal(merged.name, "A", "other details are kept");
  assert.deepEqual(mergePortal({ tags: ["Consultation"] }, { reference: "X" }).tags, ["Consultation"], "a patch without tags leaves them alone");
});

test("a consent needs every required statement, a name and a signature", async () => {
  const { CONSENT_ITEMS, CONSENT_VERSION, validConsent } = await import("../src/lib/portal");
  type CaseConsent = import("../src/lib/portal").CaseConsent;
  const agreed = Object.fromEntries(CONSENT_ITEMS.map(i => [i.id, i.required])) as Record<string, boolean>;
  const consent = { version: CONSENT_VERSION, signedAt: Date.now(), patientName: "Sophie R.", agreed, signature: "data:image/png;base64,AA==" };
  assert.ok(validConsent(consent));
  assert.ok(!validConsent({ ...consent, signature: "" }), "unsigned");
  assert.ok(!validConsent({ ...consent, agreed: { ...agreed, photos: false } }), "a required statement not agreed");
  assert.ok(!validConsent({ ...consent, agreed: { photos: true } }), "every statement is recorded either way");
  const merged = mergePortal({ name: "A" }, { consent: { ...consent, patientName: "  Sophie   R. " } as CaseConsent });
  assert.equal((merged.consent as CaseConsent | undefined)?.patientName, "Sophie R.");
  assert.equal(mergePortal(merged, { consent: null }).consent, undefined, "a mistaken consent can be removed");
  assert.equal(mergePortal({ name: "A" }, { consent: { ...consent, signature: "" } as CaseConsent }).consent, undefined, "an invalid consent is ignored");
});
