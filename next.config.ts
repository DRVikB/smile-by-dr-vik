import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The web build's version for Settings › About (the iOS app reports its bundle version).
const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  env: { NEXT_PUBLIC_APP_VERSION: version },
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};
export default config;
