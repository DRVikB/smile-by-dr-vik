import { writeFileSync } from "node:fs";
import { privacyPolicyHtml } from "../src/legal/privacyPolicy";
import { termsOfServiceHtml } from "../src/legal/termsOfService";

// Generate the static legal pages from one source (src/legal + src/config/legal.ts).
// Served on the web at /privacy(.html) and /terms(.html), bundled in the iOS app.
const pages = { "public/privacy.html": privacyPolicyHtml(), "public/terms.html": termsOfServiceHtml() };
for (const [file, html] of Object.entries(pages)) writeFileSync(file, html);
const pending = Object.values(pages).join("").match(/data-required/g)?.length ?? 0;
console.log(`Legal pages generated${pending ? ` with ${pending} items requiring owner/legal decisions` : ""}.`);
