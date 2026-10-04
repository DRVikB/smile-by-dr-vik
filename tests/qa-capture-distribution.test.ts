import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("distribution packaging refuses a synthetic raw-capture build before changing native files", () => {
  const result=spawnSync(process.execPath,["scripts/build-native.mjs"],{encoding:"utf8",env:{...process.env,SMILE_RELEASE_BUILD:"1",NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE:"1"}});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/raw-image capture is QA-only/);
});

test("distribution packaging independently refuses the physical QA harness", () => {
  const result = spawnSync(process.execPath, ["scripts/build-native.mjs"], { encoding: "utf8", env: {
    ...process.env, SMILE_RELEASE_BUILD: "1", NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE: "0", NEXT_PUBLIC_SMILE_QA_PHYSICAL_HARNESS: "1",
  } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /physical generation harness is QA-only/);
});

test("distribution packaging rejects compiled QA controls even if shell flags say capture is off", () => {
  const dir = mkdtempSync(join(tmpdir(), "smile-qa-exclusion-"));
  try {
    for (const folder of ["dist/client/_next/static", ".next/server/app", "public"]) mkdirSync(join(dir, folder), { recursive: true });
    writeFileSync(join(dir, ".next/server/app/index.html"), "<!doctype html><html><head></head><body>SmileCompose</body></html>");
    writeFileSync(join(dir, "dist/client/_next/static/fixture.js"), 'const button = "QA one authorised generation";');
    for (const page of ["privacy.html", "terms.html"]) writeFileSync(join(dir, "public", page), "Reviewed fixture");
    const result = spawnSync(process.execPath, [resolve("scripts/build-native.mjs")], { cwd: dir, encoding: "utf8", env: {
      ...process.env, SMILE_RELEASE_BUILD: "1", NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE: "0", NEXT_PUBLIC_SMILE_QA_PHYSICAL_HARNESS: "0",
      NEXT_PUBLIC_REVENUECAT_IOS_API_KEY: "appl_fixture", NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public",
    } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /compiled private QA controls/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
