import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The web build's version for Settings › About (the iOS app reports its bundle version).
const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };

// Private QA switches are always compiled in as constants (empty when unset), so a
// build without them drops the QA code and its chunks rather than shipping them
// behind a runtime check. Release builds refuse any bundle that still contains them.
const QA_FLAGS = ["RAW_CAPTURE", "PHYSICAL_HARNESS", "DIAGNOSTICS", "CAPTURE_RUN_ID", "APPROVED_SOURCE_SHA", "SOURCE_PROVENANCE"] as const;
const qaEnv = Object.fromEntries(QA_FLAGS.map(flag => [`NEXT_PUBLIC_SMILE_QA_${flag}`, process.env[`NEXT_PUBLIC_SMILE_QA_${flag}`] ?? ""]));

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // "internal-testflight" labels a build for the team's own TestFlight testers (Settings › About).
  env: { NEXT_PUBLIC_APP_VERSION: version, NEXT_PUBLIC_DISTRIBUTION: process.env.NEXT_PUBLIC_DISTRIBUTION ?? "", ...qaEnv },
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};
export default config;
