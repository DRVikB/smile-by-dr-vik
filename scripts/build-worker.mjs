import { build } from "esbuild";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
// Next prerenders the client application; use the same Web API handler at the edge.
await rm("dist", { recursive: true, force: true });
await mkdir("dist/client/_next", { recursive: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await cp(".next/static", "dist/client/_next/static", { recursive: true });
await cp("public", "dist/client", { recursive: true });
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await build({
  entryPoints: ["scripts/sites-worker.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  loader: { ".html": "text" },
  minify: true,
});
const worker = await import(
  new URL("../dist/server/index.js", import.meta.url)
);
if (typeof worker.default.fetch !== "function")
  throw new Error("Worker entrypoint is missing fetch.");
const home = await worker.default.fetch(new Request("https://smile.test/"), {});
if (home.status !== 200 || !(await home.text()).includes("Smile"))
  throw new Error("Prerendered page is invalid.");
console.log("Sites worker and Next.js browser assets ready.");
