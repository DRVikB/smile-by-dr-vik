// Copies the web bundle and plugins into the iOS project.
// The Xcode project is SmileCompose.xcodeproj, but Capacitor's command-line tool only looks for
// App.xcodeproj, so it is given that name (a link, removed afterwards) for the length of the sync.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";

const project = "ios/App/SmileCompose.xcodeproj";
const alias = "ios/App/App.xcodeproj";
if (!existsSync(project)) { console.error(`${project} is missing.`); process.exit(1); }
const isLink = path => { try { return lstatSync(path).isSymbolicLink(); } catch { return false; } };
if (isLink(alias)) unlinkSync(alias);
if (existsSync(alias)) { console.error(`${alias} exists alongside ${project}. Remove one of them.`); process.exit(1); }
symlinkSync("SmileCompose.xcodeproj", alias);
let status = 1;
try { status = spawnSync("npx", ["cap", "sync", "ios"], { stdio: "inherit" }).status ?? 1; }
finally { if (isLink(alias)) unlinkSync(alias); }
process.exit(status);
