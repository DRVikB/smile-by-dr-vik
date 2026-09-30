// Copies the ONNX Runtime WebAssembly binary (used on the device by SlimSAM tooth
// refinement) from node_modules into public/, so it ships with the app and is
// never downloaded at run time. Kept out of git: it is regenerated on every build.
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/ort", { recursive: true });
copyFileSync("node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "public/ort/ort-wasm-simd-threaded.wasm");
