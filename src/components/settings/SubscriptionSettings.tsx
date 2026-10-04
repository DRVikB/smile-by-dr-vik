"use client";
import { ChevronRight, Crown } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { planForProduct } from "@/config/subscriptions";
import { describeAllowance, entitlementOf, widgetAllowance } from "@/lib/allowance";
import { isNativeApp } from "@/native/platform";
import { openManageSubscriptions, purchasesAvailable, redeemOfferCode, restorePurchases } from "@/services/purchases/purchases";
import { Group, Row, UsageBar, formatBytes, formatDate, useSettingsNav } from "./settingsParts";

/** One entitlement from the server: plan, status, balance and renewal (display only). */
function usePlan() {
  const { status, statusState } = useAccount();
  const entitlement = status ? entitlementOf(status) : null;
  const allowance = entitlement ? describeAllowance(entitlement) : null;
  const plan = entitlement?.plan ?? null;
  const planName = !entitlement ? null
    : plan === "complimentary" ? "Complimentary access"
      : plan === "trial" ? `SmileCompose Pro ${planForProduct(status?.subscription?.productId) === "annual" ? "Annual" : "Monthly"} · free trial`
        : plan ? `SmileCompose Pro ${plan === "annual" ? "Annual" : "Monthly"}`
          : "Not subscribed";
  const end = entitlement?.periodEnd ?? null;
  const statusLine = !entitlement
    ? (statusState === "failed" ? "Unavailable offline" : "Checking…")
    : ({
      active: "Active",
      trial: end ? `Free trial until ${formatDate(end)}` : "Free trial",
      cancelling: end ? `Cancels on ${formatDate(end)}` : "Cancelled",
      billing_issue: "Payment problem — update your payment method in App Store settings",
      complimentary: status?.overrideExpiresAt ? `Until ${formatDate(status.overrideExpiresAt)}` : "No end date",
      expired: status?.subscription?.expiresAt ? `Expired ${formatDate(status.subscription.expiresAt)}` : "Expired",
      none: "Not subscribed",
    } as const)[entitlement.subscriptionStatus];
  const inactive = entitlement ? entitlement.subscriptionStatus === "expired" || entitlement.subscriptionStatus === "none" : false;
  return { entitlement, allowance, plan, planName, end, statusLine, inactive };
}

/**
 * Plan & Usage on the main Settings list: the membership, how many generations
 * are left, and a way into the details. The balance is never shown as "x / y"
 * (a monthly balance can roll over past one period's allowance); the bar shows
 * the share of one period's allowance and only when that allowance is known.
 */
export function PlanCard() {
  const account = useAccount();
  const { configured, user, status, statusState } = account;
  const nav = useSettingsNav();
  const { entitlement, plan, statusLine, inactive } = usePlan();
  const title = !configured || !user || !entitlement ? "SmileCompose Pro"
    : inactive ? (entitlement.subscriptionStatus === "expired" ? "SmileCompose Pro" : "SmileCompose Free")
      : plan === "annual" ? "SmileCompose Pro · Annual" : plan === "monthly" ? "SmileCompose Pro · Monthly" : "SmileCompose Pro";
  const sub = !configured ? "Not available in this version"
    : !user ? "Sign in to see your plan and generations"
      : !entitlement ? statusLine
        : plan === "complimentary" ? (status?.overrideExpiresAt ? `Complimentary access · until ${formatDate(status.overrideExpiresAt)}` : "Complimentary access")
          : entitlement.subscriptionStatus === "active" ? (describeAllowance(entitlement).renewal ?? statusLine) : statusLine;
  const showBalance = Boolean(entitlement && !inactive);
  const bar = entitlement && showBalance && entitlement.allowance ? widgetAllowance(entitlement).fraction : null;

  return (
    <section className="settings-group plan-card" id="settings-subscription" aria-labelledby="settings-plan-title">
      <div className="settings-list">
        <div className="plan-card-head">
          <span className="plan-card-icon" aria-hidden="true"><Crown size={17} strokeWidth={1.7} /></span>
          <h3 id="settings-plan-title">Plan &amp; Usage</h3>
          {configured && user && (
            <button type="button" className="plan-card-link" onClick={() => nav.openPage({ kind: "plan" })}>
              Manage plan<ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="plan-card-body">
          <div className="plan-card-name">
            <p className="plan-card-title">{title}</p>
            <p className="plan-card-sub">{sub}</p>
          </div>
          {showBalance && entitlement && (
            <p className="plan-card-balance"><strong>{entitlement.balance}</strong><span>generations<br />remaining</span></p>
          )}
          {bar !== null && <span className="plan-card-bar"><UsageBar value={Math.round(bar * 100)} max={100} label="Generations remaining this period" /></span>}
          {status && inactive && (
            <button className="primary-button plan-card-action" onClick={account.openPaywall}>{entitlement?.subscriptionStatus === "expired" ? "Reactivate SmileCompose Pro" : "See SmileCompose Pro"}</button>
          )}
          {user && (!nav.online || statusState === "failed") && <p className="plan-card-note">Some account information requires an internet connection.</p>}
        </div>
      </div>
    </section>
  );
}

/**
 * Settings › Plan & Usage. The plan, status, balance and renewal all come from the
 * server's generation entitlement (RevenueCat plus complimentary overrides and
 * the allowance ledger); storage from server-side accounting. Nothing here is
 * calculated from editable fields.
 */
export function PlanDetailsPage() {
  const account = useAccount();
  const { configured, user, status, statusState, customerInfo } = account;
  const nav = useSettingsNav();
  const native = isNativeApp();
  const { entitlement, allowance, plan, planName, end, statusLine, inactive } = usePlan();

  if (!configured) {
    return (
      <Group id="settings-subscription" title="Subscription">
        <Row label="SmileCompose Pro" value="Not available" detail="Subscriptions aren’t enabled in this version of SmileCompose." />
      </Group>
    );
  }
  if (!user) {
    return (
      <Group id="settings-subscription" title="Subscription" footer="Your subscription and generations belong to your SmileCompose account.">
        <Row label="Sign in to see your subscription" onClick={() => account.openAuth("signIn")} />
      </Group>
    );
  }

  const storage = status?.storage;
  const offline = !nav.online || statusState === "failed";

  async function act(action: () => Promise<string | void>) {
    try {
      const result = await action();
      if (result) nav.say(result);
    } catch {
      nav.say("That couldn’t be completed. Please try again.");
    }
  }

  return (
    <>
      <Group id="settings-subscription" title="Subscription"
        footer={offline ? "Some account information requires an internet connection." : status?.subscription?.environment === "sandbox" ? "App Store sandbox (testing) purchase." : undefined}>
        <Row label="Plan" value={planName ?? "—"} />
        <Row label="Status" value={statusLine} />
        {entitlement && !inactive && (
          <>
            <Row label="Generations remaining" value={<strong className="settings-balance">{entitlement.balance}</strong>}
              detail={allowance?.level === "empty" ? [allowance.announcement, allowance.emptyDetail].filter(Boolean).join(" ") : undefined} />
            {entitlement.subscriptionStatus === "active" && end && <Row label="Next renewal" value={formatDate(end)} />}
            {entitlement.subscriptionStatus === "trial" && end && <Row label="Paid plan starts" value={formatDate(end)} detail="Your plan’s allowance begins once your trial converts." />}
            {plan === "monthly" && entitlement.rolloverCap && <Row label="Rollover" value={`Up to ${entitlement.rolloverCap}`} detail={`Unused generations roll over up to ${entitlement.rolloverCap} while your subscription remains active.`} />}
            {plan === "annual" && entitlement.allowance && <Row label="Allowance" value={`${entitlement.allowance} a year`} detail={`${entitlement.allowance} generations per annual billing period. Unused generations don’t carry into the next year.`} />}
            {plan === "trial" && entitlement.allowance && <Row label="Allowance" value={`${entitlement.allowance} in your trial`} detail="Trial generations don’t carry over or add to your paid allowance." />}
          </>
        )}
        {status && inactive && (
          <div className="settings-plan">
            <button className="primary-button" onClick={account.openPaywall}>{entitlement?.subscriptionStatus === "expired" ? "Reactivate SmileCompose Pro" : "See SmileCompose Pro"}</button>
            {entitlement?.subscriptionStatus === "expired" && <p className="control-hint">Your saved cases stay on this device and remain available.</p>}
          </div>
        )}
      </Group>

      {process.env.NODE_ENV === "development" && entitlement?.debug && (
        <Group id="settings-entitlement-debug" title="Entitlement (development only)">
          <Row label="Plan · status" value={`${entitlement.plan ?? "none"} · ${entitlement.subscriptionStatus}`} />
          <Row label="Balance · can generate" value={`${entitlement.balance} · ${entitlement.canGenerate ? "yes" : "no"}`} />
          <Row label="Billing period" value={`${entitlement.periodStart ? formatDate(entitlement.periodStart) : "—"} → ${end ? formatDate(end) : "—"}`} />
          <Row label="Carried over" value={String(entitlement.debug.carriedOver ?? "—")} />
          <Row label="Last allowance event" value={entitlement.debug.lastAllowanceEventId ?? "live check"} detail={entitlement.debug.lastAllowanceGrantedAt ? `Granted ${new Date(entitlement.debug.lastAllowanceGrantedAt).toLocaleString("en-GB")}` : undefined} />
          <Row label="Verified with" value={`${entitlement.debug.verifiedWith} · ${entitlement.debug.environment ?? "—"}`} />
        </Group>
      )}

      <Group id="settings-storage" title="Cloud storage">
        {storage && storage.limitBytes ? (
          <div className="settings-usage">
            <p><strong>{formatBytes(storage.usedBytes)}</strong> of {formatBytes(storage.limitBytes)}</p>
            <UsageBar value={storage.usedBytes} max={storage.limitBytes} label="Cloud storage used" />
          </div>
        ) : (
          <Row label="Cloud storage"
            value={storage ? (storage.usedBytes > 0 ? formatBytes(storage.usedBytes) : "Not used") : "Unavailable"}
            detail={storage ? "This usage figure covers your Case Library. Patient cases also sync privately; their media usage is not included in this figure." : "Storage usage couldn’t be loaded."} />
        )}
      </Group>

      <Group id="settings-subscription-actions" title="Manage"
        footer={!native ? "Manage or cancel your subscription in the App Store on the iPhone or iPad where you subscribed." : undefined}>
        {native && purchasesAvailable() ? (
          <>
            <Row label="Manage Subscription" onClick={() => void openManageSubscriptions(customerInfo)} />
            <Row label="Restore Purchases" onClick={() => void act(async () => { const r = await restorePurchases(); await account.refresh(); return r.message; })} />
            <Row label="Redeem Offer Code" onClick={() => void act(() => redeemOfferCode())} />
          </>
        ) : (
          <Row label="Refresh subscription status" onClick={() => void act(async () => { await account.refresh(); return "Subscription status updated."; })} />
        )}
      </Group>
    </>
  );
}
