import { PRO_ENTITLEMENT_ID, generationsForProduct } from "@/config/subscriptions";
import type { AccountStore } from "./accountStore";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  entitlement_ids?: string[] | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  environment?: string;
}

/** Constant-time string comparison for the shared webhook secret. */
export function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

/** RevenueCat App User IDs are Supabase user IDs; anonymous IDs are never accounts. */
export function resolveUserId(event: RevenueCatEvent): string | null {
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  return candidates.find((id): id is string => typeof id === "string" && UUID.test(id)) ?? null;
}

export async function handleRevenueCatWebhook(
  request: Request,
  options: { store: AccountStore | null; authorization?: string; allowSandbox: boolean },
): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!options.store || !options.authorization)
    return Response.json({ error: "Webhook not configured." }, { status: 503, headers });
  if (!safeEqual(request.headers.get("authorization") ?? "", options.authorization))
    return Response.json({ error: "Unauthorized." }, { status: 401, headers });

  let event: RevenueCatEvent;
  try {
    const body = await request.json() as { event?: RevenueCatEvent };
    event = body.event ?? {};
  } catch {
    return Response.json({ error: "Invalid payload." }, { status: 400, headers });
  }
  if (typeof event.id !== "string" || !event.id || typeof event.type !== "string")
    return Response.json({ error: "Invalid event." }, { status: 400, headers });

  const environment = event.environment === "SANDBOX" ? "sandbox" : "production";
  if (environment === "sandbox" && !options.allowSandbox)
    return Response.json({ outcome: "ignored_sandbox" }, { headers });
  if (Array.isArray(event.entitlement_ids) && event.entitlement_ids.length && !event.entitlement_ids.includes(PRO_ENTITLEMENT_ID))
    return Response.json({ outcome: "ignored_entitlement" }, { headers });

  const productId = typeof event.product_id === "string" ? event.product_id : null;
  const iso = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);
  try {
    const outcome = await options.store.applyRevenueCatEvent({
      eventId: event.id,
      type: event.type,
      userId: resolveUserId(event),
      environment,
      productId,
      periodStart: iso(event.purchased_at_ms),
      periodEnd: iso(event.expiration_at_ms),
      allowance: generationsForProduct(productId),
    });
    return Response.json({ outcome }, { headers });
  } catch {
    // Non-2xx makes RevenueCat retry; the event is applied at most once.
    return Response.json({ error: "Temporarily unavailable." }, { status: 503, headers });
  }
}
