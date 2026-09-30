"use client";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/account/AccountProvider";
import { planForProduct } from "@/config/subscriptions";
import { describeAllowance, entitlementOf } from "@/lib/allowance";
import { isNativeApp } from "@/native/platform";
import { openManageSubscriptions, purchasesAvailable, redeemOfferCode, restorePurchases } from "@/services/purchases/purchases";
import { Group, Row, UsageBar, formatBytes, formatDate, useSettingsNav } from "./settingsParts";

/**
 * Subscription. The plan, status, balance and renewal all come from the
 * server's generation entitlement (RevenueCat plus complimentary overrides and
 * the allowance ledger); storage from server-side accounting. Nothing here is
 * calculated from editable fields.
 */
export function SubscriptionSection() {
  const account = useAccount();
  const { configured, user, status, statusState, customerInfo } = account;
  const nav = useSettingsNav();
  const [deviceBytes, setDeviceBytes] = useState<number | null>(null);
  const native = isNativeApp();

  useEffect(() => {
    void import("@/lib/dataExport").then(m => m.deviceStorageUsed()).then(setDeviceBytes);
  }, []);

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

  // One entitlement from the server: plan, status, balance and renewal (display only).
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

      <Group id="settings-storage" title="Storage">
        {storage && storage.limitBytes ? (
          <div className="settings-usage">
            <p><strong>{formatBytes(storage.usedBytes)}</strong> of {formatBytes(storage.limitBytes)}</p>
            <UsageBar value={storage.usedBytes} max={storage.limitBytes} label="Cloud storage used" />
          </div>
        ) : (
          <Row label="Cloud storage"
            value={storage ? (storage.usedBytes > 0 ? formatBytes(storage.usedBytes) : "Not used") : "Unavailable"}
            detail={storage ? "Cloud storage holds your Case Library. Patient cases stay on this device." : "Storage usage couldn’t be loaded."} />
        )}
        <Row label="On this device" value={deviceBytes === null ? "…" : formatBytes(deviceBytes)} />
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
