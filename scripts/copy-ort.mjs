// Copies the ONNX Runtime WebAssembly binary (used on the device by SlimSAM tooth
// refinement) from node_modules into public/, so it ships with the app and is
// never downloaded at run time. Kept out of git: it is regenerated on every build.
import { copyFileSync, mkdirSync,readFileSync } from "node:fs";
import {createHash} from "node:crypto";
import { build } from "esbuild";
import {copyHeicWorker} from "./heic-worker.mjs";
mkdirSync("public/ort", { recursive: true });
copyFileSync("node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "public/ort/ort-wasm-simd-threaded.wasm");
await build({
  entryPoints: ["src/lib/toothMap/samWorker.ts"],
  outfile: "public/ort/sam-worker.js",
  bundle: true, format: "esm", platform: "browser", target: "safari16",
  minify: true,
});
// SIMD CPU runtime only: no unused GPU/module/no-SIMD variants are installed.
mkdirSync("public/vision",{recursive:true});
for(const name of ["vision_wasm_internal.js","vision_wasm_internal.wasm"])
  copyFileSync(`node_modules/@mediapipe/tasks-vision/wasm/${name}`,`public/vision/${name}`);
const model=readFileSync("public/models/face/face_landmarker.task");
if(createHash("sha256").update(model).digest("hex")!=="64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff")throw new Error("Face model checksum mismatch.");
await build({entryPoints:["src/lib/face/faceWorker.ts"],outfile:"public/vision/face-worker.js",bundle:true,format:"iife",platform:"browser",target:"safari16",minify:true});

await copyHeicWorker();
