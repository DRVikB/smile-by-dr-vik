import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { opensApp, WEB_ACCOUNT_COOKIE } from "../src/lib/webEntry";
import { requestedWebAuthMode } from "../src/components/account/WebAuthPage";

const root = new URL("https://smilecompose.test/");

test("signed-out visitors to / get the landing page", () => {
  assert.equal(opensApp(root, null), false);
  assert.equal(opensApp(root, "other=1; theme=dark"), false);
  assert.equal(opensApp(root, `${WEB_ACCOUNT_COOKIE}=`), false);
});

test("a signed-in browser or any app address opens the app", () => {
  assert.equal(opensApp(root, `theme=dark; ${WEB_ACCOUNT_COOKIE}=1`), true);
  for (const query of ["?signin", "?signup", "?app", "?flow=verified", "?code=abc"])
    assert.equal(opensApp(new URL(query, root), null), true, query);
});

test("the address picks the sign-in page mode", () => {
  assert.equal(requestedWebAuthMode("?signin"), "signIn");
  assert.equal(requestedWebAuthMode("?signup"), "signUp");
  assert.equal(requestedWebAuthMode("?app"), null);
  assert.equal(requestedWebAuthMode(""), null);
});

test("the landing page has no inline scripts or styles (its CSP allows neither)", () => {
  const html = readFileSync("public/welcome.html", "utf8");
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), false);
  assert.equal(/\sstyle=/i.test(html), false);
  assert.equal(/<style/i.test(html), false);
  assert.match(html, /href="\/\?signin"/);
});
