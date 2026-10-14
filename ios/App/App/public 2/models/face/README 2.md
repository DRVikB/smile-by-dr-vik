# Bundled MediaPipe Face Landmarker

Source: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

Version: float16 / 1 (fixed; never fetched at application runtime).

SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`

Size: 3,758,596 bytes. Build rejects checksum changes.

The bundled model components and MediaPipe Tasks Vision package are Apache-2.0. The Apache license is retained in LICENSE.txt. Official component model cards identify their licensing:

- FaceMesh-V2: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
- BlazeFace: https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf
- Blendshape: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf

Runtime: `@mediapipe/tasks-vision` 1.0.1, only the SIMD CPU classic-worker loader and WASM binary. `scripts/copy-ort.mjs` copies these from the installed package on every build. No alternate GPU/module/no-SIMD runtime binaries are copied. The official task bundle is used intact; optional blendshape output is disabled.

Google copyright and source are retained. This model estimates face landmarks; it is not a dental measurement model or clinical predictor. See the model cards for limitations.
