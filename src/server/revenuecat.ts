import { PRO_ENTITLEMENT_ID } from "@/config/subscriptions";

/** The current "pro" entitlement as RevenueCat reports it. */
export interface ProEntitlement {
  active: boolean;
  productId: string | null;
  /** Start of the current billing period (latest purchase or renewal). */
  periodStart: string | null;
  /** End of the current billing period. Null would mean lifetime; not sold. */
  expiresAt: string | null;
  environment: "production" | "sandbox";
  willRenew: boolean;
  billingIssue: boolean;
  managementUrl: string | null;
  /** In the free trial (introductory offer): generations are limited until it converts. */
  trial: boolean;
}

export interface RevenueCatClient {
  proEntitlement(appUserId: string): Promise<ProEntitlement>;
  deleteSubscriber(appUserId: string): Promise<void>;
}

const API = "https://api.revenuecat.com/v1";

interface SubscriberResponse {
  subscriber?: {
    management_url?: string | null;
    entitlements?: Record<string, { expires_date?: string | null; grace_period_expires_date?: string | null; product_identifier?: string; purchase_date?: string }>;
    subscriptions?: Record<string, { is_sandbox?: boolean; period_type?: string; unsubscribe_detected_at?: string | null; billing_issues_detected_at?: string | null; expires_date?: string | null; purchase_date?: string }>;
  };
}

/** Interpret a RevenueCat v1 subscriber payload. Pure, for testing. */
export function readProEntitlement(body: SubscriberResponse, now = Date.now()): ProEntitlement {
  const subscriber = body.subscriber ?? {};
  const entitlement = subscriber.entitlements?.[PRO_ENTITLEMENT_ID];
  const productId = entitlement?.product_identifier ?? null;
  const subscription = productId ? subscriber.subscriptions?.[productId] : undefined;
  const expires = entitlement?.expires_date ? Date.parse(entitlement.expires_date) : null;
  const grace = entitlement?.grace_period_expires_date ? Date.parse(entitlement.grace_period_expires_date) : null;
  const active = Boolean(entitlement) && (expires === null || expires > now || (grace !== null && grace > now));
  return {
    active,
    productId,
    periodStart: entitlement?.purchase_date ?? null,
    expiresAt: entitlement?.expires_date ?? null,
    environment: subscription?.is_sandbox ? "sandbox" : "production",
    willRenew: Boolean(subscription) && !subscription?.unsubscribe_detected_at,
    billingIssue: Boolean(subscription?.billing_issues_detected_at),
    managementUrl: subscriber.management_url ?? null,
    trial: subscription?.period_type === "trial",
  };
}

export function createRevenueCatClient(secretKey: string, fetcher: typeof fetch = (i, init) => globalThis.fetch(i, init)): RevenueCatClient {
  const headers = { Authorization: `Bearer ${secretKey}`, Accept: "application/json" };
  return {
    async proEntitlement(appUserId) {
      const response = await fetcher(`${API}/subscribers/${encodeURIComponent(appUserId)}`, {
        headers, signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`RevenueCat subscriber lookup failed (${response.status})`);
      return readProEntitlement(await response.json() as SubscriberResponse);
    },
    async deleteSubscriber(appUserId) {
      const response = await fetcher(`${API}/subscribers/${encodeURIComponent(appUserId)}`, {
        method: "DELETE", headers, signal: AbortSignal.timeout(8000),
      });
      if (!response.ok && response.status !== 404) throw new Error(`RevenueCat subscriber deletion failed (${response.status})`);
    },
  };
}
