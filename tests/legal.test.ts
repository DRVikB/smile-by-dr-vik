import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { privacyPolicyHtml } from "../src/legal/privacyPolicy";
import { termsOfServiceHtml } from "../src/legal/termsOfService";
import { escapeHtml, valueOr } from "../src/legal/layout";
import { LEGAL_REVIEW_COMPLETE, MINOR_PATIENTS_PERMITTED, UPLOAD_AUTHORITY_TEXT } from "../src/config/legal";

test("privacy policy covers the required UK GDPR transparency topics", () => {
  const html = privacyPolicyHtml();
  for (const topic of ["Who we are", "Our role", 'id="patient-data"', "Lawful basis", "special category", "Who receives information",
    "International transfers", "How long we keep", "Your rights", "Deleting your account", "ico.org.uk", "AI processing", "train", "AI image-generation provider", "list of the service providers"])
    assert.ok(html.includes(topic), `missing: ${topic}`);
  // The app presents itself as one service: recipients are named by category, not by vendor or model.
  for (const vendor of ["Google", "Gemini", "Cloudflare", "OpenAI"]) assert.ok(!html.includes(vendor), `names a vendor: ${vendor}`);
  assert.ok(html.includes("18 or over"), "adults-only V1 policy stated");
});

test("unconfirmed legal details and unreviewed documents stay visibly marked", () => {
  assert.equal(LEGAL_REVIEW_COMPLETE.terms, false);
  assert.equal(LEGAL_REVIEW_COMPLETE.privacy, false);
  assert.match(termsOfServiceHtml(), /LEGAL REVIEW REQUIRED/);
  assert.match(privacyPolicyHtml(), /REQUIRES SOLICITOR\/DPO REVIEW/);
  assert.match(privacyPolicyHtml(), /data-required>\[LEGAL ENTITY NAME — OWNER DECISION REQUIRED\]/);
  assert.equal(valueOr("", "X"), "<span data-required>[X — OWNER DECISION REQUIRED]</span>");
  assert.equal(escapeHtml('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
});

test("terms leave commercial legal clauses to a solicitor", () => {
  const html = termsOfServiceHtml();
  for (const clause of ["Warranty disclaimers", "Governing law", "Ownership of the software"])
    assert.match(html, new RegExp(`data-required>\\[${clause}[^\\]]*LEGAL REVIEW REQUIRED\\]`));
});

test("V1 is adults-only until a legal/DPIA decision, and the upload confirmation says so", () => {
  assert.equal(MINOR_PATIENTS_PERMITTED, false);
  assert.match(UPLOAD_AUTHORITY_TEXT, /aged 18 or over/);
});

test("no GDPR certification or full-compliance claims in the product", () => {
  const claim = /GDPR[ -]certified|fully GDPR[ -]compliant|GDPR[ -]compliant|HIPAA[ -]compliant/i;
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(tsx?|html|json|css)$/.test(name) ? [path] : [];
  });
  const offenders = [...walk("src"), ...walk("public")].filter((path) => claim.test(readFileSync(path, "utf8")));
  assert.deepEqual(offenders, []);
  assert.ok(!claim.test(privacyPolicyHtml() + termsOfServiceHtml()));
});
