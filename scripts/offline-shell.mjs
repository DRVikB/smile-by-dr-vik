import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

/** Public, build-time shell only. No requests or account content enter this manifest. */
export async function prepareOfflineShell() {
  const shell = await readFile(".next/server/app/index.html", "utf8");
  const assets = [];
  async function walk(dir, pattern, prefix) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(path, pattern, prefix);
      else if (pattern.test(entry.name)) assets.push(path.replace(prefix[0], prefix[1]));
    }
  }
  await walk(".next/static", /\.(js|css|woff2?)$/, [/^\.next\//, "/_next/"]);
  // These directories contain only checked-in branding and fictional examples.
  // Never enumerate patient storage, upload paths or API responses here.
  await walk("public/brand", /\.(png|svg|webp)$/, [/^public\//, "/"]);
  await walk("public/examples", /\.webp$/, [/^public\//, "/"]);
  await walk("public/demo-results", /\.webp$/, [/^public\//, "/"]);
  await walk("public/vision", /\.(js|wasm)$/, [/^public\//, "/"]);
  await walk("public/ort", /\.(js|mjs|wasm)$/, [/^public\//, "/"]);
  await walk("public/models", /\.(onnx|task)$/, [/^public\//, "/"]);
  assets.push("/dr-vik-logo.png", "/smile-hero-dr-vik-v2.webp", "/demo-storyboard-before.webp");
  assets.sort();
  const hash = createHash("sha256").update(shell).update(JSON.stringify(assets));
  for (const path of assets) hash.update(await readFile(path.startsWith("/_next/") ? path.replace(/^\/_next\//, ".next/") : `public${path}`));
  const version = hash.digest("hex").slice(0, 20);
  await writeFile("public/offline-shell.html", shell);
  await writeFile("public/offline-assets.json", JSON.stringify({ version, assets }));
}
