import type { SamRuntime } from "./sam";

/**
 * Loads SlimSAM with onnxruntime-web, from files bundled with the app
 * (public/models/slimsam, public/ort): nothing is downloaded at run time and
 * the photo never leaves the device. Loaded once, on first use.
 */
let runtime: Promise<SamRuntime> | null = null;

export function loadSam(): Promise<SamRuntime> {
  if (!runtime) {
    runtime = (async () => {
      const ort = await import("onnxruntime-web/wasm");
      // Only the .wasm file is fetched; the bundled build carries its own loader script.
      ort.env.wasm.wasmPaths = { wasm: "/ort/ort-wasm-simd-threaded.wasm" };
      // The app's web view isn't cross-origin isolated, so threads aren't available.
      ort.env.wasm.numThreads = 1;
      const options = { executionProviders: ["wasm"], graphOptimizationLevel: "all" as const };
      const [encoder, decoder] = await Promise.all([
        ort.InferenceSession.create("/models/slimsam/onnx/vision_encoder_quantized.onnx", options),
        ort.InferenceSession.create("/models/slimsam/onnx/prompt_encoder_mask_decoder_quantized.onnx", options),
      ]);
      return {
        tensor: (type, data, dims) => new ort.Tensor(type, data, dims),
        encoder: encoder as unknown as SamRuntime["encoder"],
        decoder: decoder as unknown as SamRuntime["decoder"],
      };
    })();
    // A failed load must not stick: the next photo tries again.
    runtime.catch(() => { runtime = null; });
  }
  return runtime;
}
