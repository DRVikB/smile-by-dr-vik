/** Explicit private-device QA. Never called by normal test/build/release scripts. */
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const phase = option("phase"), device = option("device"), team = option("team");
const suites = { "self-test": "PhysicalCaptureTests", "fixture-sign-in": "PhysicalFixtureSignInTests", live: "PhysicalOneInvocationTests", replay: "PhysicalReplayTests", "saved-reopen": "PhysicalSavedReopenTests" };
if (!suites[phase] || !device || !/^[A-Z0-9-]+$/i.test(device) || !team || !/^[A-Z0-9]{10}$/.test(team)) throw Error("Specify an explicit --phase=self-test|live|replay|saved-reopen, --device=UDID and --team=TEAM");
if (phase === "live" && !args.includes("--one-authorised-invocation")) throw Error("Live phase requires --one-authorised-invocation; a failed or timed-out invocation must never be repeated");
const out = resolve(option("output") ?? "output/framing-physical-capture-2026-10-04");
await fs.mkdir(out, { recursive: true, mode: 0o700 });
const timestamp = Date.now(), logPath = resolve(out, `${phase}-${timestamp}.log`), resultPath = resolve(out, `${phase}-${timestamp}.xcresult`);
const log = await fs.open(logPath, "w", 0o600);
try {
  await new Promise((accept, reject) => {
    const command = ["-project", "ios/QA/SmileComposeQA.xcodeproj", "-scheme", phase === "live" ? "SmileComposeLiveQA" : "SmileComposeQA", "-configuration", "Release", "-destination", `platform=iOS,id=${device}`, "-derivedDataPath", resolve(out, "uitests"), "-resultBundlePath", resultPath,
      "CODE_SIGNING_ALLOWED=YES", "CODE_SIGN_STYLE=Automatic", `DEVELOPMENT_TEAM=${team}`, "-allowProvisioningUpdates", "-parallel-testing-enabled", "NO", `-only-testing:SmileComposeQA/${suites[phase]}`, "test"];
    const child = spawn("xcodebuild", command, { cwd: process.cwd(), stdio: ["ignore", log.fd, log.fd] });
    child.on("error", reject); child.on("exit", code => code === 0 ? accept() : reject(Error(`Physical ${phase} automation failed (${code}); inspect private Xcode result`)));
  });
  console.log(JSON.stringify({ phase, automation: "PASS", providerRetries: 0, resultPath, logPath }));
} finally { await log.close(); }
