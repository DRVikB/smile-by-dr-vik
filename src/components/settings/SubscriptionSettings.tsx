"use client";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/account/AccountProvider";
import { SUBSCRIPTION_PRODUCTS, planForProduct } from "@/config/subscriptions";
import { isNativeApp } from "@/native/platform";
import { openManageSubscriptions, purchasesAvailable, redeemOfferCode, restorePurchases } from "@/services/purchases/purchases";
import { Group, Row, UsageBar, formatBytes, formatDate, useSettingsNav } from "./settingsParts";

/**
 * Subscription & Usage. Entitlement comes from the server's RevenueCat check
 * (plus complimentary overrides); usage from the allowance ledger; storage from
 * server-side accounting. Nothing here is calculated from editable fields.
 */
export function SubscriptionSection() {
  const account = useAccount();
  const { configured, user, status, statusState, customerInfo, hasProAccess } = account;
  const nav = useSettingsNav();
  const [deviceBytes, setDeviceBytes] = useState<number | null>(null);
  const native = isNativeApp();

  useEffect(() => {
    void import("@/lib/dataExport").then(m => m.deviceStorageUsed()).then(setDeviceBytes);
  }, []);

  if (!configured) {
    return (
      <Group id="settings-subscription" title="Subscription & usage">
        <Row label="SmileCompose Pro" value="Not available" detail="Subscriptions aren’t enabled in this version of SmileCompose." />
      </Group>
    );
  }
  if (!user) {
    return (
      <Group id="settings-subscription" title="Subscription & usage" footer="Your subscription and generations belong to your SmileCompose account.">
        <Row label="Sign in to see your subscription" onClick={() => account.openAuth("signIn")} />
      </Group>
    );
  }

  const subscription = status?.subscription ?? null;
  const plan = planForProduct(subscription?.productId);
  const complimentary = hasProAccess && status?.source === "override";
  const expired = !hasProAccess && Boolean(subscription?.expiresAt);
  const planName = complimentary ? "Complimentary access" : plan ? `${SUBSCRIPTION_PRODUCTS[plan].label} plan` : null;
  const state = !status
    ? (statusState === "failed" ? "Unavailable offline" : "Checking…")
    : subscription?.active
      ? subscription.billingIssue ? "Payment problem — update your payment method in App Store settings"
        : subscription.trial ? (subscription.willRenew ? `Free trial — paid plan starts ${formatDate(subscription.expiresAt)}` : `Free trial ends ${formatDate(subscription.expiresAt)}`)
        : subscription.willRenew ? `Renews ${formatDate(subscription.expiresAt)}` : `Ends ${formatDate(subscription.expiresAt)} (renewal cancelled)`
      : complimentary ? (status.overrideExpiresAt ? `Until ${formatDate(status.overrideExpiresAt)}` : "No end date")
        : expired ? `Expired ${formatDate(subscription?.expiresAt)}` : "Not subscribed";
  const generations = status?.generations;
  // The server's "remaining" includes purchased credits; the plan allowance is shown on its own.
  const includedRemaining = generations ? Math.max(0, generations.included - generations.used) : 0;
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
      <Group id="settings-subscription" title="Subscription & usage"
        footer={offline ? "Some account information requires an internet connection." : subscription?.environment === "sandbox" ? "App Store sandbox (testing) purchase." : undefined}>
        <div className="settings-plan">
          <p className="settings-plan-name">SmileCompose Pro{expired ? <span className="settings-plan-flag">Expired</span> : !hasProAccess && status ? <span className="settings-plan-flag muted">Inactive</span> : null}</p>
          {planName && <p className="settings-plan-detail">{planName}</p>}
          <p className="settings-plan-detail">{state}</p>
          {status && !hasProAccess && (
            <button className="primary-button" onClick={account.openPaywall}>{expired ? "Reactivate SmileCompose Pro" : "See SmileCompose Pro"}</button>
          )}
          {expired && <p className="control-hint">Your saved cases stay on this device and remain available.</p>}
        </div>
      </Group>

      <Group id="settings-usage" title="Generations">
        {generations && (generations.included > 0 || generations.purchased > 0) ? (
          <>
            {generations.included > 0 && (
              <div className="settings-usage">
                <p><strong>{includedRemaining}</strong> of {generations.included} remaining</p>
                <UsageBar value={includedRemaining} max={generations.included} label="Included generations remaining" />
                {generations.periodEnd && <p className="settings-usage-note">Resets {formatDate(generations.periodEnd)}</p>}
              </div>
            )}
            {generations.purchased > 0 && <Row label="Purchased generations" value={`${generations.purchased} remaining`} detail="Kept separately from your plan’s allowance." />}
          </>
        ) : (
          <Row label="Generations" value={status ? "None available" : "—"} detail={status ? "SmileCompose Pro includes an allowance for each billing period. Failed generations aren’t counted." : undefined} />
        )}
      </Group>

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
