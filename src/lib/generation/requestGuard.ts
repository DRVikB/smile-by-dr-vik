/** A request marker contains no photograph, settings, patient name or API key. */
export type RequestClaim = (id: string) => Promise<boolean>;
const claimed = new Map<string, number>();
const RETAIN_MS = 24 * 60 * 60 * 1000;
/** Local / Sites fallback. Netlify injects a durable atomic store instead. */
export const claimInMemory: RequestClaim = async id => {
  const now = Date.now();
  for (const [key, at] of claimed) if (now - at > RETAIN_MS) claimed.delete(key);
  if (claimed.has(id)) return false;
  if (claimed.size >= 10_000) throw new Error("Request guard capacity reached.");
  claimed.set(id, now);
  return true;
};
export function validRequestId(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
