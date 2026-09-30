"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { MONTHLY_ROLLOVER_CAP, PRO_FEATURES, SUBSCRIPTION_PRODUCTS, TRIAL_GENERATIONS, type PlanKey } from "@/config/subscriptions";
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
      .catch(error => { console.warn("[Purchases] plans failed", String((error as Error)?.message ?? error)); if (live) setLoadFailed(true); });
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

  /** What each plan includes, from src/config/subscriptions.ts (annual never described as rolling over). */
  const planCopy = (key: PlanKey) => key === "monthly"
    ? { title: "SmileCompose Pro Monthly", allowance: `${SUBSCRIPTION_PRODUCTS.monthly.generationsPerPeriod} smile generations each month`,
      detail: `Unused generations roll over while your subscription stays active, up to ${MONTHLY_ROLLOVER_CAP}. Cancel anytime.` }
    : { title: "SmileCompose Pro Annual", allowance: `${SUBSCRIPTION_PRODUCTS.annual.generationsPerPeriod} smile generations each year`,
      detail: "Use your allowance whenever you need it throughout the year." };
  const trialCopy = `${TRIAL_GENERATIONS} smile generations during your trial`;
  const trialNote = "Your plan’s full allowance begins when the trial converts to a paid subscription.";

  // The configured UK prices, shown where live App Store prices aren't available (signed out, or the web).
  const staticPlans = (
    <div className="plan-options plan-options-static" aria-label="SmileCompose Pro prices">
      {(Object.keys(SUBSCRIPTION_PRODUCTS) as PlanKey[]).map(key => (
        <div key={key} className="plan-option">
          <span className="plan-name">{planCopy(key).title}</span>
          <span className="plan-price">{SUBSCRIPTION_PRODUCTS[key].displayPrice}<small> / {SUBSCRIPTION_PRODUCTS[key].period}</small></span>
          <span className="plan-note plan-allowance">{planCopy(key).allowance}</span>
          <span className="plan-note">{planCopy(key).detail}</span>
          <span className="plan-note plan-trial">3-day free trial · {trialCopy}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="pro-plans">
      <ul className="paywall-features">
        {PRO_FEATURES.map(feature => <li key={feature}><Check size={15} strokeWidth={2} aria-hidden="true" />{feature}</li>)}
      </ul>

      {!configured ? (
        <p className="sheet-sub">Subscriptions aren’t available in this version of SmileCompose.</p>
      ) : !user ? (
        <div className="account-stack">
          {staticPlans}
          <p className="control-hint">{trialNote}</p>
          <button className="primary-button" onClick={() => openAuth("signUp")}>Start your free trial</button>
          <p className="control-hint">Your subscription belongs to your SmileCompose account, so you’ll create one first. UK prices shown; your App Store price appears before you subscribe.</p>
          <p className="paywall-offer">Already have an account? <button type="button" className="text-button" onClick={() => openAuth("signIn")}>Sign in</button></p>
        </div>
      ) : hasProAccess ? (
        <div className="account-stack">
          <p className="save-status" role="status"><Check size={14} /> You have SmileCompose Pro.</p>
          {native && <button className="secondary-button" onClick={() => void openManageSubscriptions(customerInfo)}>Manage Subscription</button>}
        </div>
      ) : !native ? (
        <div className="account-stack">
          {staticPlans}
          <p className="sheet-sub">Subscribe in the SmileCompose app for iPhone and iPad. If you already subscribe there, sign in here with the same account. UK prices; prices in other countries are shown in the App Store.</p>
        </div>
      ) : (
        <div className="account-stack">
          {plans === null && !loadFailed && <p className="control-hint" role="status">Loading plans…</p>}
          {(loadFailed || plans?.length === 0) && <p className="error-message" role="alert">Plans couldn’t be loaded from the App Store. Check your connection and try again.</p>}
          {plans && plans.length > 0 && (
            <div className="plan-options" role="radiogroup" aria-label="Subscription plan">
              {plans.map(option => (
                <button key={option.plan} type="button" role="radio" aria-checked={selected === option.plan}
                  className={`plan-option${selected === option.plan ? " selected" : ""}`} onClick={() => setSelected(option.plan)}>
                  <span className="plan-name">{planCopy(option.plan).title}</span>
                  <span className="plan-price">{option.priceString}<small> / {option.periodLabel}</small></span>
                  {option.pricePerMonthString && <span className="plan-note">{option.pricePerMonthString} per month</span>}
                  <span className="plan-note plan-allowance">{planCopy(option.plan).allowance}</span>
                  <span className="plan-note">{planCopy(option.plan).detail}</span>
                  {option.introductoryOffer && (
                    <span className="plan-note plan-trial">
                      {option.introductoryOffer}{option.introductoryOffer.startsWith("Free") ? ` · ${trialCopy}` : ""}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          <button className="primary-button" disabled={busy || !plan} onClick={() => void subscribe()}>
            {busy ? "Please wait…" : "Subscribe"}
          </button>
          {plan?.introductoryOffer?.startsWith("Free") && <p className="control-hint">{trialNote}</p>}
          {plan && (
            <p className="control-hint paywall-terms">
              {plan.introductoryOffer ? `${plan.introductoryOffer} (${trialCopy}), then ` : ""}{plan.priceString} per {plan.periodLabel}. Payment is charged to your Apple ID at confirmation of purchase. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in your App Store account settings.
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
