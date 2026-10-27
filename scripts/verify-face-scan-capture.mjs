/** Runs the exact production capture-lifecycle policy with adversarial timing and job-order fixtures. */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = process.cwd();
const production = await readFile(resolve(root, "ios/App/App/CaseMediaPlugin.swift"), "utf8");
const start = "// BEGIN FACE_SCAN_CAPTURE_POLICY";
const end = "// END FACE_SCAN_CAPTURE_POLICY";
const from = production.indexOf(start);
const to = production.indexOf(end, from + start.length);
if (from < 0 || to < 0 || production.indexOf(start, from + start.length) >= 0) {
  throw new Error("Expected one production FaceScanCapturePolicy region; tests cannot use a copied implementation.");
}

const temporary = await mkdtemp(resolve(tmpdir(), "smile-face-capture-policy-"));
try {
  const test = await readFile(resolve(root, "tests/native/face-scan-capture-policy.swift"), "utf8");
  const source = resolve(temporary, "main.swift");
  const binary = resolve(temporary, "face-scan-capture-policy-tests");
  await writeFile(source, `import Foundation\n${production.slice(from + start.length, to)}\n${test}`);
  execFileSync("xcrun", ["swiftc", "-module-cache-path", resolve(temporary, "modules"), source, "-o", binary], { stdio: "inherit" });
  execFileSync(binary, [], { stdio: "inherit" });
} finally {
  await rm(temporary, { recursive: true, force: true });
}
