import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("distribution packaging refuses a synthetic raw-capture build before changing native files", () => {
  const result=spawnSync(process.execPath,["scripts/build-native.mjs"],{encoding:"utf8",env:{...process.env,SMILE_RELEASE_BUILD:"1",NEXT_PUBLIC_SMILE_QA_RAW_CAPTURE:"1"}});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/raw-image capture is QA-only/);
});
