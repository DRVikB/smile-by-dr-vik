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
    assert.equal(d.retryCount, 0);
    assert.equal(calls, 1);
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
    await generateSmile(input, undefined, new GeminiSmileProvider({ apiKey: "test", fetcher }), { requestId, onDiagnostic: d => { record = d; } }).catch(() => {});
    assert.equal(record?.category, category);
    assert.equal(record?.httpStatus, status);
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
