import test from "node:test";
import assert from "node:assert/strict";
import { GeminiSmileProvider } from "../src/lib/generation/gemini";
import { generateSmile } from "../src/lib/generation/provider";
import { defaultSettings } from "../src/lib/types";
import { safeProviderDiagnostic, type ProviderDiagnostic } from "../src/lib/generation/providerDiagnostics";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII=";
const requestId = "e09b96b1-1260-49ed-94ef-019e6c3ba5a3";
const input = { originalImage: `data:image/png;base64,${png}`, settings: { ...defaultSettings, notes: "PRIVATE_NOTE" } };
const candidate = (parts: unknown[], finishReason = "STOP") => ({ candidates: [{ finishReason, content: { parts } }] });
const blob = (mimeType = "image/png", data = png, thought = false) => ({ inlineData: { mimeType, data }, thought });

test("provider diagnostics distinguish structural causes and never retain response contents", async () => {
  for (const [body, category] of [
    [candidate([blob()]), "success"],
    [{ promptFeedback: { blockReason: "SAFETY" } }, "blocked"],
    [candidate([], "IMAGE_PROHIBITED_CONTENT"), "blocked"],
    [candidate([blob("image/webp")]), "unsupported_mime"],
    [candidate([blob("image/png", "invalid")]), "malformed_image"],
    [candidate([]), "empty_response"],
    [candidate([{ text: "PRIVATE_PROVIDER_TEXT" }]), "text_only"],
    [candidate([blob("image/png", png, true)]), "thought_only"],
    [candidate([blob()], "MAX_TOKENS"), "incomplete_response"],
    [candidate([], "PRIVATE_UNKNOWN_ENUM"), "unknown_response"],
    [candidate([], "MALFORMED_RESPONSE"), "malformed_response"],
    [{ candidates: "PRIVATE_BAD_PAYLOAD" }, "unknown_response"],
  ] as const) {
    const records: ProviderDiagnostic[] = [];
    let calls = 0;
    const provider = new GeminiSmileProvider({ apiKey: "PRIVATE_KEY", fetcher: async () => { calls++; return Response.json(body); } });
    await generateSmile(input, undefined, provider, { requestId, onDiagnostic: d => { records.push(d); } }).catch(() => {});
    const d = records.at(-1)!;
    assert.equal(d.category, category);
    assert.equal(d.httpStatus, 200);
    assert.equal(d.requestId, requestId);
    assert.equal(d.model, "gemini-3.1-flash-image");
    assert.equal(d.inputWidth, 1);
    // Only a reply with no image at all is retried, once.
    const retried = ["empty_response", "text_only", "thought_only"].includes(category);
    assert.equal(d.retryCount, retried ? 1 : 0);
    assert.equal(calls, retried ? 2 : 1);
    assert.ok(d.latencyMs! >= 0);
    assert.doesNotMatch(JSON.stringify(records), /PRIVATE_|iVBOR|base64|originalImage/);
  }
});

test("timeout and caller cancellation have distinct evidence, with one attempted request", async () => {
  for (const cancelled of [false, true]) {
    let record: ProviderDiagnostic | undefined;
    let calls = 0;
    const controller = new AbortController();
    const provider = new GeminiSmileProvider({ apiKey: "test", timeoutMs: cancelled ? 1000 : 5, fetcher: async (_url, init) => {
      calls++;
      return new Promise<Response>((resolve, reject) => {
        // A referenced timer also keeps Node alive while AbortSignal.timeout fires.
        const timer = setTimeout(() => resolve(Response.json(candidate([blob()]))), 100);
        init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(init.signal?.reason); }, { once: true });
      });
    } });
    const timer = cancelled ? setTimeout(() => controller.abort(), 5) : undefined;
    try {
      await assert.rejects(generateSmile(input, controller.signal, provider, { requestId, onDiagnostic: d => { record = d; } }));
      assert.equal(record?.category, cancelled ? "cancelled" : "timeout");
      assert.equal(record?.httpStatus, null);
      assert.equal(calls, 1);
    } finally { clearTimeout(timer); }
  }
});
test("diagnostics are an explicit allowlist and observers cannot break delivery", async () => {
  const records: ProviderDiagnostic[] = [];
  const provider = new GeminiSmileProvider({ apiKey: "test", fetcher: async () => Response.json(candidate([blob()])) });
  await generateSmile(input, undefined, provider, { requestId, onDiagnostic: d => { records.push(d); throw new Error("PRIVATE_LOG_ERROR"); } });
  const safe = safeProviderDiagnostic({ ...records.at(-1), notes: "PRIVATE_NOTE", image: png, providerCode: "PRIVATE_CODE", finishReasons: "PRIVATE_FINISH" });
  assert.ok(safe);
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE_|iVBOR/);
});
test("transport errors and provider HTTP errors remain separate; no retry", async () => {
  for (const [fetcher, category, status] of [
    [async () => { throw new Error("PRIVATE_NETWORK"); }, "transport_error", null],
    [async () => Response.json({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "PRIVATE_ERROR" } }, { status: 429 }), "http_error", 429],
    [async () => new Response("PRIVATE_INVALID_JSON"), "malformed_response", 200],
  ] as const) {
    let record: ProviderDiagnostic | undefined;
    let calls = 0;
    await generateSmile(input, undefined, new GeminiSmileProvider({ apiKey: "test", fetcher: async () => { calls++; return fetcher(); } }), { requestId, onDiagnostic: d => { record = d; } }).catch(() => {});
    assert.equal(record?.category, category);
    assert.equal(record?.httpStatus, status);
    assert.equal(record?.retryCount, 0);
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(record), /PRIVATE/);
  }
});

test("diagnostic storage that never settles cannot hold a delivered image indefinitely", async () => {
  let unblock!: () => void;
  const neverUntilCleanup = new Promise<void>(resolve => { unblock = resolve; });
  const provider = new GeminiSmileProvider({ apiKey: "test", fetcher: async () => Response.json(candidate([blob()])) });
  let timer: ReturnType<typeof setTimeout>;
  try {
    const result = await Promise.race([
      generateSmile(input, undefined, provider, { requestId, onDiagnostic: () => neverUntilCleanup }),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 2500); }),
    ]);
    assert.ok(result?.image, "diagnostic writes must have a bounded wait");
  } finally { clearTimeout(timer!); unblock(); }
});

test("QA request evidence records exact prompt digest and image roles without retaining content", async () => {
  let record: ProviderDiagnostic | undefined;
  const provider = new GeminiSmileProvider({ apiKey: "test", maskGuidance: true, fetcher: async () => Response.json(candidate([blob()])) });
  await generateSmile({ ...input, referenceImage: input.originalImage, styleReferences: [input.originalImage], editMask: input.originalImage }, undefined, provider,
    { requestId, onDiagnostic: d => { record = d; } });
  const value = record as unknown as Record<string, unknown>;
  assert.match(String(value.promptHash), /^[a-f0-9]{64}$/);
  assert.equal(value.imagePartOrder, "source,direct_reference,style_reference,edit_mask,prompt");
  assert.equal(value.referenceCount, 2);
  assert.equal(value.maskSent, true);
  assert.equal(value.outputWidth, 1);
  assert.equal(value.outputHeight, 1);
  const safe = safeProviderDiagnostic({ ...value, imagePartOrder: "PRIVATE_ROLE", promptHash: "PRIVATE_NOTE", referenceCount: 200, outputWidth: NaN });
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE_|NaN/);
});

test("final response selection evidence survives the private diagnostic boundary", async () => {
  let record: ProviderDiagnostic | undefined;
  const provider = new GeminiSmileProvider({ apiKey: "test", fetcher: async () => Response.json(candidate([
    blob("image/png", png, true),
    { thoughtSignature: "PRIVATE_SIGNATURE", ...blob() },
  ])) });
  await generateSmile(input, undefined, provider, { requestId, onDiagnostic: d => { record = d; } });
  const value = record as unknown as Record<string, unknown>;
  assert.equal(value.finalImageCount, 1);
  assert.equal(value.selectedCandidateIndex, 0);
  assert.equal(value.selectedPartIndex, 1);
  assert.deepEqual(value.responseImageParts, [
    { candidateIndex: 0, partIndex: 0, thought: true, mimeType: "image/png", finishReason: "STOP", width: 1, height: 1 },
    { candidateIndex: 0, partIndex: 1, thought: false, mimeType: "image/png", finishReason: "STOP", width: 1, height: 1 },
  ]);
  assert.doesNotMatch(JSON.stringify(record), /PRIVATE_|iVBOR|base64|thoughtSignature/);
});

test("per-image diagnostics are bounded and allowlisted even with an untrusted provider record", () => {
  const baseline = { requestId, provider: "google", model: "gemini-3.1-flash-image", promptVersion: "2026-10-03-treatment-contract-v8", category: "ambiguous_image" };
  const safe = safeProviderDiagnostic({ ...baseline, finalImageCount: 2, selectedCandidateIndex: -1, selectedPartIndex: "PRIVATE_INDEX", responseImageParts: Array.from({ length: 50 }, (_, partIndex) => ({
    candidateIndex: 0, partIndex, thought: true, mimeType: "image/png", finishReason: "STOP", width: 1, height: 1,
    data: png, thoughtSignature: "PRIVATE_SIGNATURE", text: "PRIVATE_TEXT",
  })) }) as unknown as Record<string, unknown>;
  assert.equal(safe.category, "ambiguous_image");
  assert.equal(safe.finalImageCount, 2);
  assert.equal(safe.selectedCandidateIndex, undefined);
  assert.equal(safe.selectedPartIndex, undefined);
  assert.equal((safe.responseImageParts as unknown[]).length, 16);
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE_|iVBOR|base64|thoughtSignature|text/);
});

test("an empty Gemini response is retried once in the same request; a second empty reply fails", async () => {
  const records: ProviderDiagnostic[] = []; let calls = 0;
  const provider = new GeminiSmileProvider({ apiKey: "test", fetcher: async () => Response.json(++calls === 1 ? candidate([], "NO_IMAGE") : candidate([blob()])) });
  const result = await generateSmile(input, undefined, provider, { requestId, onDiagnostic: d => { records.push(d); } });
  assert.ok(result.image);
  assert.equal(calls, 2, "one retry after a reply with no image");
  assert.deepEqual(records.map(d => [d.requestId, d.retryCount, d.category]),
    [[requestId, 0, "started"], [requestId, 0, "empty_response"], [requestId, 1, "started"], [requestId, 1, "success"]]);
  let empty = 0;
  const never = new GeminiSmileProvider({ apiKey: "test", fetcher: async () => { empty++; return Response.json(candidate([], "NO_IMAGE")); } });
  await assert.rejects(generateSmile(input, undefined, never, { requestId, onDiagnostic: () => {} }), (error: unknown) =>
    error instanceof Error && "code" in error && error.code === "provider_no_image");
  assert.equal(empty, 2, "never more than one retry");
});
test("empty-response cancellation cannot initiate another provider invocation", async () => {
  for (const cancel of [false, true]) {
    let calls = 0; const controller = new AbortController();
    const provider = new GeminiSmileProvider({ apiKey: "test", fetcher: async () => { calls++; return Response.json(candidate([], "NO_IMAGE")); } });
    await assert.rejects(generateSmile(input, controller.signal, provider, { requestId, onDiagnostic: d => { if (cancel && d.category === "empty_response") controller.abort(); } }));
    assert.equal(calls, cancel ? 1 : 2, cancel ? "cancelling prevents the retry" : "one retry, then fail");
  }
});
