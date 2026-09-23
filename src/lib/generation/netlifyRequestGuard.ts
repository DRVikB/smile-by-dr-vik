import { getStore } from "@netlify/blobs";
import { claimInMemory, type RequestClaim } from "./requestGuard";
/** Keep the claim even after an error: a provider may have charged already.
 * Never store or replay patient images server-side. Duplicate submissions
 * receive an explicit conflict, rather than starting another paid generation.
 */
export const claimHostedRequest: RequestClaim = async id => {
  const hosted = Boolean(process.env.NETLIFY || (globalThis as { Netlify?: unknown }).Netlify);
  if (!hosted) return claimInMemory(id);
  const store = getStore({ name: "smile-request-markers", consistency: "strong" });
  const result = await store.set(id, String(Date.now()), { onlyIfNew: true });
  if (result.modified && !result.etag) throw new Error("Request marker was not confirmed.");
  return result.modified;
};
