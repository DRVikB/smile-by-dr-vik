/**
 * What the current clinician may do. Payments are not implemented yet: the
 * development provider below grants unlimited generation. The next phase
 * replaces it with a RevenueCat + Apple StoreKit backed provider (and a
 * server-side check in the generation endpoint) without changing callers.
 *
 * Never implement payment or subscription logic in the client beyond reading
 * this interface.
 */
export interface Entitlements {
  isPro: boolean;
  plan: "development" | "free" | "pro";
  /** Generations included per billing period; null means unlimited. */
  generationAllowance: number | null;
  /** Generations remaining; null means unlimited. */
  generationBalance: number | null;
}

export interface EntitlementProvider {
  current(): Promise<Entitlements>;
  /** Called once per successful AI generation. Failed generations are never counted. */
  recordGeneration(): Promise<void>;
}

export const developmentEntitlements: EntitlementProvider = {
  async current() {
    return { isPro: true, plan: "development", generationAllowance: null, generationBalance: null };
  },
  async recordGeneration() {
    // No accounting until the payment backend exists.
  },
};

let provider: EntitlementProvider = developmentEntitlements;

export function getEntitlementProvider(): EntitlementProvider {
  return provider;
}

/** Swap in the real provider once RevenueCat/StoreKit is connected. */
export function setEntitlementProvider(next: EntitlementProvider): void {
  provider = next;
}

export function canGenerate(entitlements: Entitlements, count = 1): boolean {
  return entitlements.generationBalance === null || entitlements.generationBalance >= count;
}
