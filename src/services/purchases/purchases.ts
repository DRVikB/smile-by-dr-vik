import type { CustomerInfo, PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { LEGAL_LINKS, REVENUECAT_IOS_API_KEY } from "@/config/accounts";
import { PRO_ENTITLEMENT_ID, SUBSCRIPTION_PRODUCTS, type PlanKey } from "@/config/subscriptions";
import { isNativeApp } from "@/native/platform";

/**
 * App Store subscriptions through RevenueCat. Purchases happen only in the iOS
 * app, only for a signed-in account, and RevenueCat's App User ID is always the
 * Supabase user.id. Access unlocks only when the "pro" entitlement is active.
 */

export interface PlanOffer {
  plan: PlanKey;
  productId: string;
  /** Localized by StoreKit, e.g. "£9.99". Never hardcoded. */
  priceString: string;
  pricePerMonthString: string | null;
  periodLabel: string;
  /** Introductory offer shown to eligible customers, if configured in App Store Connect. */
  introductoryOffer: string | null;
}

export type PurchaseOutcome =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "pending"; message: string }
  | { status: "processing"; message: string }
  | { status: "failed"; message: string };

const packages = new Map<PlanKey, PurchasesPackage>();
let identifiedUser: string | null = null;
let identifying: Promise<CustomerInfo | null> | null = null;

/** RevenueCat errors stay visible in the Xcode console (codes and messages only, never keys). */
function logPurchasesError(step: string, error: unknown) {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  console.warn(`[Purchases] ${step} failed`, String(code ?? ""), String(message ?? error));
}

export function purchasesAvailable(): boolean {
  return isNativeApp() && Boolean(REVENUECAT_IOS_API_KEY);
}

// The plugin is a Capacitor proxy that answers every property, including "then".
// Returning it from an async function makes the promise try to adopt it as a
// thenable and never settle, so always hand it back wrapped.
async function sdk() {
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  return { Purchases };
}

export function customerHasPro(info: CustomerInfo | null | undefined): boolean {
  return Boolean(info?.entitlements.active[PRO_ENTITLEMENT_ID]?.isActive);
}

/** Configure RevenueCat for this Supabase user, or switch to them. */
export function identifyPurchaser(userId: string): Promise<CustomerInfo | null> {
  if (!purchasesAvailable()) return Promise.resolve(null);
  const attempt = identify(userId).catch(error => { logPurchasesError("identify", error); throw error; });
  const settled = attempt.catch(() => null);
  identifying = settled;
  void settled.then(() => { if (identifying === settled) identifying = null; });
  return attempt;
}

async function identify(userId: string): Promise<CustomerInfo | null> {
  const { Purchases, LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");
  const { isConfigured } = await Purchases.isConfigured();
  if (!isConfigured) {
    // Test Store keys are development-only: show RevenueCat's own diagnostics in Xcode.
    if (REVENUECAT_IOS_API_KEY.startsWith("test_")) await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG }).catch(() => {});
    await Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY, appUserID: userId });
  } else if ((await Purchases.getAppUserID()).appUserID !== userId) {
    await Purchases.logIn({ appUserID: userId });
  }
  // Connected as soon as RevenueCat knows the user: plans must not wait on customer info.
  identifiedUser = userId;
  packages.clear();
  return (await withTimeout(Purchases.getCustomerInfo(), "getCustomerInfo")).customerInfo;
}

/** RevenueCat calls that never answer must fail visibly instead of spinning forever. */
function withTimeout<T>(call: Promise<T>, step: string, ms = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${step} timed out`)), ms); });
  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}

/** On sign-out: RevenueCat's recommended logOut, so the next account starts clean. */
export async function resetPurchaser(): Promise<void> {
  if (!purchasesAvailable() || !identifiedUser) return;
  identifiedUser = null;
  packages.clear();
  const { Purchases } = await sdk();
  await Purchases.logOut().catch(() => {}); // already anonymous: nothing to reset
}

export async function refreshCustomerInfo(): Promise<CustomerInfo | null> {
  if (!purchasesAvailable() || !identifiedUser) return null;
  return (await (await sdk()).Purchases.getCustomerInfo()).customerInfo;
}

export async function onCustomerInfo(listener: (info: CustomerInfo) => void): Promise<() => void> {
  if (!purchasesAvailable()) return () => {};
  const { Purchases } = await sdk();
  const id = await Purchases.addCustomerInfoUpdateListener(listener);
  return () => { void Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: id }).catch(() => {}); };
}

function describeIntro(pkg: PurchasesPackage): string | null {
  const intro = pkg.product.introPrice;
  if (!intro) return null;
  const unit = intro.periodUnit.toLowerCase();
  const span = `${intro.periodNumberOfUnits} ${unit}${intro.periodNumberOfUnits === 1 ? "" : "s"}`;
  return intro.price === 0 ? `Free for ${span}` : `${intro.priceString} for ${span}`;
}

/** Annual price ÷ 12 in the store's currency (the SDK's own figure is wrong in Test Store). */
function monthlyEquivalent(pkg: PurchasesPackage): string | null {
  const { price, currencyCode } = pkg.product;
  if (!price || !currencyCode) return pkg.product.pricePerMonthString ?? null;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(Math.floor((price / 12) * 100) / 100);
  } catch {
    return pkg.product.pricePerMonthString ?? null;
  }
}

/** Monthly and annual plans from the current RevenueCat offering. */
export async function loadPlans(): Promise<PlanOffer[]> {
  if (!purchasesAvailable()) return [];
  if (!identifiedUser && identifying) await Promise.race([identifying, new Promise(resolve => setTimeout(resolve, 15000))]); // the paywall can open while sign-in is still connecting
  if (!identifiedUser) throw new Error("Purchases are not connected to this account yet.");
  const offerings = await withTimeout((await sdk()).Purchases.getOfferings(), "getOfferings").catch(error => { logPurchasesError("getOfferings", error); throw error; });
  if (!offerings.current) console.warn("[Purchases] no current offering", Object.keys(offerings.all ?? {}).join(","));
  const available = offerings.current?.availablePackages ?? [];
  const plans: PlanOffer[] = [];
  packages.clear();
  for (const plan of Object.keys(SUBSCRIPTION_PRODUCTS) as PlanKey[]) {
    const config = SUBSCRIPTION_PRODUCTS[plan];
    const pkg = available.find(p => p.product.identifier === config.productId);
    if (!pkg) continue;
    packages.set(plan, pkg);
    plans.push({
      plan,
      productId: config.productId,
      priceString: pkg.product.priceString,
      pricePerMonthString: plan === "annual" ? monthlyEquivalent(pkg) : null,
      periodLabel: config.period,
      introductoryOffer: describeIntro(pkg),
    });
  }
  if (!plans.length) console.warn("[Purchases] offering has no matching products", available.map(p => p.product.identifier).join(","));
  return plans;
}

const FAILURE: Record<string, string> = {
  "2": "The App Store couldn’t complete the purchase. Please try again.",
  "3": "Purchases aren’t allowed on this device. Check Screen Time restrictions in Settings.",
  "5": "This plan isn’t available right now. Please try again later.",
  "6": "This Apple ID already has SmileCompose Pro. Tap Restore Purchases.",
  "7": "This purchase belongs to another SmileCompose account. Sign in to that account, or contact support.",
  "10": "You appear to be offline. Reconnect and try again.",
  "15": "A purchase is already in progress.",
};

function errorCode(error: unknown): string {
  return String((error as { code?: unknown })?.code ?? "");
}

export async function purchasePlan(plan: PlanKey): Promise<PurchaseOutcome> {
  const pkg = packages.get(plan);
  if (!pkg) return { status: "failed", message: "This plan isn’t available right now. Please try again later." };
  try {
    const { customerInfo } = await (await sdk()).Purchases.purchasePackage({ aPackage: pkg });
    return customerHasPro(customerInfo)
      ? { status: "purchased" }
      : { status: "processing", message: "Your purchase is being confirmed. Pro will unlock shortly; tap Restore Purchases if it doesn’t." };
  } catch (error) {
    const code = errorCode(error);
    if (code === "1" || (error as { userCancelled?: boolean })?.userCancelled) return { status: "cancelled" };
    if (code === "20") return { status: "pending", message: "Your purchase is awaiting approval (for example, Ask to Buy). Pro unlocks once it’s approved." };
    return { status: "failed", message: FAILURE[code] ?? "The purchase couldn’t be completed. You haven’t been charged. Please try again." };
  }
}

export async function restorePurchases(): Promise<{ pro: boolean; message: string }> {
  if (!purchasesAvailable() || !identifiedUser) return { pro: false, message: "Sign in to restore purchases." };
  try {
    const { customerInfo } = await (await sdk()).Purchases.restorePurchases();
    const pro = customerHasPro(customerInfo);
    return { pro, message: pro ? "SmileCompose Pro has been restored." : "No active SmileCompose Pro subscription was found for this Apple ID." };
  } catch (error) {
    return { pro: false, message: FAILURE[errorCode(error)] ?? "Purchases couldn’t be restored. Please try again." };
  }
}

/** Apple's offer-code redemption sheet. CustomerInfo refreshes via the listener and on return. */
export async function redeemOfferCode(): Promise<void> {
  if (!purchasesAvailable() || !identifiedUser) return;
  await (await sdk()).Purchases.presentCodeRedemptionSheet();
}

export async function openManageSubscriptions(info: CustomerInfo | null): Promise<void> {
  const url = info?.managementURL || LEGAL_LINKS.manageSubscriptions;
  // In the app, external links open in Safari / the App Store.
  window.location.assign(url);
}
