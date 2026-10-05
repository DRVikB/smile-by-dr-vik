import { readFile, writeFile } from "node:fs/promises";

// Every upload to App Store Connect (TestFlight included) needs a build number higher
// than the last. This raises CURRENT_PROJECT_VERSION by one for every App target build
// configuration; the marketing version (MARKETING_VERSION, e.g. 1.0) is unchanged.
const path = "ios/App/App.xcodeproj/project.pbxproj";
const project = await readFile(path, "utf8");
const numbers = [...project.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map(m => Number(m[1]));
if (!numbers.length) throw new Error("No CURRENT_PROJECT_VERSION found in the Xcode project.");
const next = Math.max(...numbers) + 1;
await writeFile(path, project.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${next};`));
const marketing = project.match(/MARKETING_VERSION = ([^;]+);/)?.[1] ?? "?";
console.log(`Build number is now ${next} (version ${marketing}).`);
