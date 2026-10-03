import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as subscriptions from "../src/config/subscriptions";

// Render the actual component's signed-out/web branches without inventing
// an App Store offer. Remote commercial configuration is never changed here.
function renderPlans(user: null | { id: string }) {
  const source = readFileSync("src/components/account/ProPlans.tsx", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, unknown> = {};
  const link = ({ children }: { children?: React.ReactNode }) => createElement("span", null, children);
  const modules: Record<string, unknown> = {
    react: React, "react/jsx-runtime": jsxRuntime,
    "lucide-react": { Check: () => null }, "@/config/subscriptions": subscriptions,
    "@/native/platform": { isNativeApp: () => false },
    "@/services/purchases/purchases": { purchasesAvailable: () => false },
    "./AccountProvider": { useAccount: () => ({ configured: true, user, hasProAccess: false }) },
    "./LegalLinks": { AppleEulaLink: link, PrivacyLink: link, TermsLink: link },
  };
  new Function("require", "exports", code)((id: string) => { assert.ok(id in modules, id); return modules[id]; }, exports);
  return renderToStaticMarkup(createElement(exports.ProPlans as React.ComponentType));
}
for (const user of [null, { id: "qa" }]) {
  test(`static plans do not promise an unverified free trial (${user ? "web" : "signed out"})`, () => {
    const html = renderPlans(user);
    assert.doesNotMatch(html, /3-day free trial|Start your free trial|during your trial|trial converts/i);
    assert.match(html, /50 smile generations each month/);
    assert.match(html, /600 smile generations each year/);
    if (!user) assert.match(html, /Create account/);
  });
}
