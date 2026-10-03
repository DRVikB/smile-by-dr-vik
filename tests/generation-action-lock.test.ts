import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the actual page handlers with controlled asynchronous dependencies.
// This catches an admission race before React's busy state can render.
function handler(name: "generate" | "generateVariants", context: Record<string, unknown>) {
  const source = ts.createSourceFile("page.tsx", readFileSync("src/app/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(declaration);
  const code = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(context), `${code}; return ${name};`)(...Object.values(context)) as (...args: unknown[]) => Promise<void>;
}

function fixture(fingerprint: () => Promise<string>, persist = async () => false) {
  const request: { current: AbortController | null } = { current: null };
  let prompts = 0;
  const context = {
    request, photo: { dataUrl: "approved-synthetic-fixture" }, settings: {}, busy: false,
    normalizeTreatmentScope: (s: unknown) => s, generationUnavailable: () => null,
    isNoChangeDesign: () => false, accountReadyForGeneration: () => true,
    testMode: false, aiConsent: { version: "qa", photoFingerprint: "fixture" },
    fingerprintPhotoForConsent: fingerprint, reference: null, AI_CONSENT_VERSION: "qa",
    setPendingAiConsent: () => { prompts++; }, persistConsentBeforeGeneration: persist,
    setError: () => {}, setBusy: () => {}, setSettings: () => {},
    setGenerationStage: () => {}, showGenerationError: () => {},
    costs: { requested: 0 }, requestLimit: 100, exceedsRequestLimit: () => false,
    setBatchPending: () => {},
  };
  return { context, request, prompts: () => prompts };
}

for (const name of ["generate", "generateVariants"] as const) {
  const args = name === "generate" ? [] : [[{ patch: {} }], true];
  test(`${name}: rapid taps admit one consent preflight before busy renders`, async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>(resolve => { release = resolve; });
    let entered = 0;
    const f = fixture(() => { entered++; return pending; });
    const run = handler(name, f.context);
    const first = run(...args), second = run(...args);
    release("new-photo");
    await Promise.all([first, second]);
    assert.equal(entered, 1);
    assert.equal(f.prompts(), 1);
    assert.equal(f.request.current, null, "consent review must release the admission lock");
    await run(...args);
    assert.equal(entered, 2, "a later deliberate action remains available");
  });
  test(`${name}: pending consent persistence is locked and failed saving releases it`, async () => {
    let release!: (value: boolean) => void;
    const pending = new Promise<boolean>(resolve => { release = resolve; });
    let writes = 0;
    const f = fixture(async () => "fixture", async () => { writes++; return pending; });
    const run = handler(name, f.context);
    const first = run(...args);
    await Promise.resolve();
    const second = run(...args);
    release(false);
    await Promise.all([first, second]);
    assert.equal(writes, 1);
    assert.equal(f.request.current, null);
  });
  test(`${name}: fingerprint failure releases the lock without submitting`, async () => {
    let attempts = 0;
    const f = fixture(async () => { attempts++; throw new Error("fixture decode failure"); });
    const run = handler(name, f.context);
    await run(...args);
    assert.equal(f.request.current, null);
    await run(...args);
    assert.equal(attempts, 2);
  });
  test(`${name}: cancellation during preflight cannot open a stale consent prompt`, async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>(resolve => { release = resolve; });
    const f = fixture(() => pending);
    const run = handler(name, f.context);
    const first = run(...args);
    assert.ok(f.request.current);
    f.request.current.abort();
    f.request.current = null;
    release("different-photo");
    await first;
    assert.equal(f.prompts(), 0);
  });
}
