"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { PRO_FEATURES, SUBSCRIPTION_PRODUCTS, type PlanKey } from "@/config/subscriptions";
import { isNativeApp } from "@/native/platform";
import {
  loadPlans, openManageSubscriptions, purchasePlan, purchasesAvailable, redeemOfferCode, restorePurchases, type PlanOffer,
} from "@/services/purchases/purchases";
import { useAccount } from "./AccountProvider";
import { AppleEulaLink, PrivacyLink, TermsLink } from "./LegalLinks";

/**
 * SmileCompose Pro plans, purchase, Restore Purchases and offer-code redemption.
 * Shared by the paywall sheet and onboarding. Prices come from StoreKit via
 * RevenueCat; the generation allowance comes from src/config/subscriptions.ts.
 * Access is always decided by hasProAccess (the "pro" entitlement or a
 * server-side complimentary override), never by plan type.
 */
export function ProPlans({ onPurchased }: { onPurchased?: () => void }) {
  const { configured, user, hasProAccess, customerInfo, refresh, openAuth } = useAccount();
  const native = isNativeApp();
  const canBuy = purchasesAvailable() && Boolean(user);
  const [plans, setPlans] = useState<PlanOffer[] | null>(null);
  const [selected, setSelected] = useState<PlanKey>("annual");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!canBuy) return;
    let live = true;
    loadPlans()
      .then(list => { if (!live) return; setPlans(list); if (list.length && !list.some(p => p.plan === "annual")) setSelected(list[0].plan); })
      .catch(() => { if (live) setLoadFailed(true); });
    return () => { live = false; };
  }, [canBuy]);

  async function subscribe() {
    setBusy(true);
    setMessage("");
    const outcome = await purchasePlan(selected);
    setBusy(false);
    if (outcome.status === "purchased") { await refresh(); setMessage("Welcome to SmileCompose Pro."); onPurchased?.(); return; }
    if (outcome.status !== "cancelled") setMessage(outcome.message);
    if (outcome.status === "processing") void refresh();
  }

  async function restore() {
    setBusy(true);
    setMessage("");
    const result = await restorePurchases();
    await refresh();
    setBusy(false);
    setMessage(result.message);
    if (result.pro) onPurchased?.();
  }

  async function redeem() {
    setMessage("");
    await redeemOfferCode().catch(() => setMessage("Offer codes can’t be redeemed right now. Please try again."));
    // Apple's sheet returns before redemption completes; the CustomerInfo listener
    // and the app-resume refresh unlock Pro once the "pro" entitlement is active.
  }

  const plan = plans?.find(p => p.plan === selected);

  return (
    <div className="pro-plans">
      <ul className="paywall-features">
        {PRO_FEATURES.map(feature => <li key={feature}><Check size={15} strokeWidth={2} aria-hidden="true" />{feature}</li>)}
      </ul>

      {!configured ? (
        <p className="sheet-sub">Subscriptions aren’t available in this version of SmileCompose.</p>
      ) : !user ? (
        <div className="account-stack">
          <p className="sheet-sub">Create an account or sign in first. Your subscription belongs to your SmileCompose account.</p>
          <button className="primary-button" onClick={() => openAuth("signIn")}>Sign in or create account</button>
        </div>
      ) : hasProAccess ? (
        <div className="account-stack">
          <p className="save-status" role="status"><Check size={14} /> You have SmileCompose Pro.</p>
          {native && <button className="secondary-button" onClick={() => void openManageSubscriptions(customerInfo)}>Manage Subscription</button>}
        </div>
      ) : !native ? (
        <p className="sheet-sub">SmileCompose Pro is available as a subscription in the SmileCompose app for iPhone and iPad. If you already subscribe there, sign in here with the same account.</p>
      ) : (
        <div className="account-stack">
          {plans === null && !loadFailed && <p className="control-hint" role="status">Loading plans…</p>}
          {(loadFailed || plans?.length === 0) && <p className="error-message" role="alert">Plans couldn’t be loaded from the App Store. Check your connection and try again.</p>}
          {plans && plans.length > 0 && (
            <div className="plan-options" role="radiogroup" aria-label="Subscription plan">
              {plans.map(option => (
                <button key={option.plan} type="button" role="radio" aria-checked={selected === option.plan}
                  className={`plan-option${selected === option.plan ? " selected" : ""}`} onClick={() => setSelected(option.plan)}>
                  <span className="plan-name">{SUBSCRIPTION_PRODUCTS[option.plan].label}</span>
                  <span className="plan-price">{option.priceString}<small> / {option.periodLabel}</small></span>
                  {option.pricePerMonthString && <span className="plan-note">{option.pricePerMonthString} per month</span>}
                  {option.introductoryOffer && <span className="plan-note">{option.introductoryOffer}</span>}
                  <span className="plan-note">{SUBSCRIPTION_PRODUCTS[option.plan].generationsPerPeriod} smile generations per {option.periodLabel}</span>
                </button>
              ))}
            </div>
          )}
          <button className="primary-button" disabled={busy || !plan} onClick={() => void subscribe()}>
            {busy ? "Please wait…" : "Subscribe"}
          </button>
          {plan && (
            <p className="control-hint paywall-terms">
              {plan.introductoryOffer ? `${plan.introductoryOffer}, then ` : ""}{plan.priceString} per {plan.periodLabel}. Payment is charged to your Apple ID at confirmation of purchase. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in your App Store account settings.
            </p>
          )}
          <button className="secondary-button" disabled={busy} onClick={() => void restore()}>Restore Purchases</button>
          <p className="paywall-offer">Have an offer code? <button type="button" className="text-button" disabled={busy} onClick={() => void redeem()}>Redeem Code</button></p>
        </div>
      )}

      {message && <p className="save-status" role="status">{message}</p>}
      <p className="paywall-legal"><TermsLink /> · <AppleEulaLink>Terms of Use (EULA)</AppleEulaLink> · <PrivacyLink /></p>
    </div>
  );
}
