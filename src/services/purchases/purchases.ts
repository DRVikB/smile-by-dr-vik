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

export function purchasesAvailable(): boolean {
  return isNativeApp() && Boolean(REVENUECAT_IOS_API_KEY);
}

async function sdk() {
  return (await import("@revenuecat/purchases-capacitor")).Purchases;
}

export function customerHasPro(info: CustomerInfo | null | undefined): boolean {
  return Boolean(info?.entitlements.active[PRO_ENTITLEMENT_ID]?.isActive);
}

/** Configure RevenueCat for this Supabase user, or switch to them. */
export async function identifyPurchaser(userId: string): Promise<CustomerInfo | null> {
  if (!purchasesAvailable()) return null;
  const Purchases = await sdk();
  const { isConfigured } = await Purchases.isConfigured();
  if (!isConfigured) {
    await Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY, appUserID: userId });
  } else if ((await Purchases.getAppUserID()).appUserID !== userId) {
    await Purchases.logIn({ appUserID: userId });
  }
  identifiedUser = userId;
  packages.clear();
  return (await Purchases.getCustomerInfo()).customerInfo;
}

/** On sign-out: RevenueCat's recommended logOut, so the next account starts clean. */
export async function resetPurchaser(): Promise<void> {
  if (!purchasesAvailable() || !identifiedUser) return;
  identifiedUser = null;
  packages.clear();
  const Purchases = await sdk();
  await Purchases.logOut().catch(() => {}); // already anonymous: nothing to reset
}

export async function refreshCustomerInfo(): Promise<CustomerInfo | null> {
  if (!purchasesAvailable() || !identifiedUser) return null;
  return (await (await sdk()).getCustomerInfo()).customerInfo;
}

export async function onCustomerInfo(listener: (info: CustomerInfo) => void): Promise<() => void> {
  if (!purchasesAvailable()) return () => {};
  const Purchases = await sdk();
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

/** Monthly and annual plans from the current RevenueCat offering. */
export async function loadPlans(): Promise<PlanOffer[]> {
  if (!purchasesAvailable() || !identifiedUser) return [];
  const offerings = await (await sdk()).getOfferings();
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
      pricePerMonthString: plan === "annual" ? pkg.product.pricePerMonthString : null,
      periodLabel: config.period,
      introductoryOffer: describeIntro(pkg),
    });
  }
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
    const { customerInfo } = await (await sdk()).purchasePackage({ aPackage: pkg });
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
    const { customerInfo } = await (await sdk()).restorePurchases();
    const pro = customerHasPro(customerInfo);
    return { pro, message: pro ? "SmileCompose Pro has been restored." : "No active SmileCompose Pro subscription was found for this Apple ID." };
  } catch (error) {
    return { pro: false, message: FAILURE[errorCode(error)] ?? "Purchases couldn’t be restored. Please try again." };
  }
}

/** Apple's offer-code redemption sheet. CustomerInfo refreshes via the listener and on return. */
export async function redeemOfferCode(): Promise<void> {
  if (!purchasesAvailable() || !identifiedUser) return;
  await (await sdk()).presentCodeRedemptionSheet();
}

export async function openManageSubscriptions(info: CustomerInfo | null): Promise<void> {
  const url = info?.managementURL || LEGAL_LINKS.manageSubscriptions;
  // In the app, external links open in Safari / the App Store.
  window.location.assign(url);
}
