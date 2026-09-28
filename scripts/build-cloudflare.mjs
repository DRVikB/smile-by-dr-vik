import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("dist/cloudflare", { recursive: true });
await build({
  entryPoints: ["scripts/cloudflare-worker.ts"],
  outfile: "dist/cloudflare/index.mjs",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  loader: { ".html": "text" },
  minify: true,
});
console.log("Cloudflare worker ready; secrets are supplied only at runtime.");
