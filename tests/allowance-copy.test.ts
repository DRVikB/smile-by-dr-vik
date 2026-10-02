import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { friendlyGenerationError, GENERATION_MESSAGES } from "../src/services/ai/smileImageService";
test("uncertain delivery and failed provider responses do not promise an unconfirmed refund",()=>{
 for(const message of [GENERATION_MESSAGES.network,GENERATION_MESSAGES.timeout,GENERATION_MESSAGES.failed,GENERATION_MESSAGES.noImage,friendlyGenerationError(502,"generation_failed").message]) {
  assert.doesNotMatch(message,/not been counted|has been returned|refunded/i);
 }
 assert.doesNotMatch(readFileSync("src/app/page.tsx","utf8"),/any that fail are returned/);
});
