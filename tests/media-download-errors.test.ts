import { test } from "node:test";
import assert from "node:assert/strict";
import { AccountError, createSupabaseMediaStore } from "../src/server/accountStore";

test("storage object absence is distinct from a service, bucket or authorization failure", async () => {
  const fetcher = globalThis.fetch;
  try {
    for (const [code,status,missing] of [["NoSuchKey",404,true],["not_found",404,true],["NoSuchBucket",404,false],["AccessDenied",403,false],["InternalError",500,false]] as const) {
      globalThis.fetch = async () => Response.json({ code, message: code, statusCode: String(status) }, { status });
      const store = createSupabaseMediaStore("https://storage.example.invalid", "synthetic-test-key");
      if (missing) assert.equal(await store.download("patient-cases", "synthetic/path"), null, code);
      else await assert.rejects(store.download("patient-cases", "synthetic/path"), e => e instanceof AccountError && e.code === "account_service_unavailable", code);
    }
  } finally { globalThis.fetch = fetcher; }
});
