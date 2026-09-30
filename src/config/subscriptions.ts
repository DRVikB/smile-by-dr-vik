/**
 * SmileCompose Pro — the single source of truth for subscription products.
 * UI, purchase code and the server all read from here; no component should
 * hardcode monthly/annual logic or prices (prices always come from StoreKit).
 */
export const PRO_ENTITLEMENT_ID = "pro";

export const SUBSCRIPTION_PRODUCTS = {
  monthly: {
    productId: "uk.co.drvik.smilecompose.pro.monthly",
    label: "Monthly",
    period: "month",
    /** UK price shown on the website only. In the app, prices always come from StoreKit. Keep in step with App Store Connect. */
    displayPrice: "£29.99",
    /** Smile generations included in each billing period. Business decision: adjust before launch. */
    generationsPerPeriod: 50,
  },
  annual: {
    productId: "uk.co.drvik.smilecompose.pro.annual",
    label: "Annual",
    period: "year",
    displayPrice: "£299.99",
    generationsPerPeriod: 600,
  },
} as const;

export type PlanKey = keyof typeof SUBSCRIPTION_PRODUCTS;

/**
 * Smile generations during the free trial (both plans offer a 3-day free trial
 * as an App Store introductory offer). Apple's trial unlocks Pro; the server
 * limits generations until the first paid period begins. Business decision.
 */
export const TRIAL_GENERATIONS = 3;

/** Monthly generations for a server-side complimentary override without its own value. */
export const OVERRIDE_DEFAULT_MONTHLY_GENERATIONS = 50;

/** Generations added after each successful monthly billing cycle. */
export const MONTHLY_GENERATIONS = SUBSCRIPTION_PRODUCTS.monthly.generationsPerPeriod;
/** Unused monthly generations roll over while the subscription stays active, up to this balance. */
export const MONTHLY_ROLLOVER_CAP = 100;
/** Generations for each annual billing period. Unused ones don't carry into the next year. */
export const ANNUAL_GENERATIONS = SUBSCRIPTION_PRODUCTS.annual.generationsPerPeriod;

/** What a subscription billing period is, for its generation allowance. */
export type PeriodKind = "trial" | "monthly" | "annual";

export function periodKind(productId: string | null | undefined, trial: boolean): PeriodKind {
  if (trial) return "trial";
  return planForProduct(productId) === "annual" ? "annual" : "monthly";
}

/**
 * The allowance a period starts with and the most it may hold. The database
 * applies the rules (grant_subscription_period); these are the only numbers it uses:
 * trial 3 (never carried), monthly 50 rolling over to at most 100, annual 600 (reset each year).
 */
export function periodAllowance(kind: PeriodKind): { allowance: number; rolloverCap: number } {
  if (kind === "trial") return { allowance: TRIAL_GENERATIONS, rolloverCap: TRIAL_GENERATIONS };
  if (kind === "annual") return { allowance: ANNUAL_GENERATIONS, rolloverCap: ANNUAL_GENERATIONS };
  return { allowance: MONTHLY_GENERATIONS, rolloverCap: MONTHLY_ROLLOVER_CAP };
}

export function planForProduct(productId: string | null | undefined): PlanKey | null {
  if (!productId) return null;
  // Apple product IDs may arrive with a plan suffix from RevenueCat (e.g. "id:plan").
  const base = productId.split(":")[0];
  return (Object.keys(SUBSCRIPTION_PRODUCTS) as PlanKey[]).find(key => SUBSCRIPTION_PRODUCTS[key].productId === base) ?? null;
}

/** The allowance for a billing period: the trial allowance while trialling, otherwise the plan's. */
export function generationsForPeriod(productId: string | null | undefined, trial: boolean): number {
  return trial ? TRIAL_GENERATIONS : generationsForProduct(productId);
}

export function generationsForProduct(productId: string | null | undefined): number {
  const plan = planForProduct(productId);
  return plan ? SUBSCRIPTION_PRODUCTS[plan].generationsPerPeriod : SUBSCRIPTION_PRODUCTS.monthly.generationsPerPeriod;
}

export const PRO_FEATURES = [
  "AI smile visualisations from your patient photographs",
  "Treatment, shade and tooth-shape design controls",
  "Before-and-after comparison and consultation view",
  "Branded reports, reveal videos and case history",
  "One subscription across iPhone, iPad and the web",
] as const;
