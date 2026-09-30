"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { describeAllowance, entitlementOf, type AllowanceView } from "@/lib/allowance";
import { useAccount } from "./AccountProvider";

const DISMISS_KEY = "smile.allowance.dismissed";

/** The signed-in Pro clinician's allowance, or null (signed out, no Pro, or not loaded). Display only. */
export function useAllowance(): AllowanceView | null {
  const { configured, status, hasProAccess } = useAccount();
  if (!configured || !status || !hasProAccess) return null;
  return describeAllowance(entitlementOf(status));
}

/** "38 generations remaining · Renews 14 October": quiet, and opens Subscription. */
export function AllowancePill({ className = "" }: { className?: string }) {
  const allowance = useAllowance();
  const { openSettings } = useAccount();
  if (!allowance) return null;
  return (
    <button type="button" className={`allowance-pill level-${allowance.level} ${className}`.trim()} onClick={() => openSettings("subscription")}
      aria-label={`${allowance.summary}${allowance.renewal ? `. ${allowance.renewal}` : ""}. Open subscription.`}>
      <span className="allowance-dot" aria-hidden="true" />
      <span>{allowance.summary}{allowance.renewal && <small> · {allowance.renewal}</small>}</span>
    </button>
  );
}

/** "Uses 1 generation · 37 remaining", beside Generate. */
export function AllowanceLine({ uses = 1 }: { uses?: number }) {
  const allowance = useAllowance();
  if (!allowance) return null;
  return <p className={`allowance-line level-${allowance.level}`} role="status">
    Uses {uses} generation{uses === 1 ? "" : "s"} · {allowance.remaining} remaining{allowance.trial ? " in your trial" : ""}
  </p>;
}

/**
 * A quiet note at 10 or fewer, 5 or fewer, and none left. The first two can be
 * put away until the level or period changes; running out stays visible, with
 * the plan's next step and a way to manage the subscription.
 */
export function AllowanceBanner({ className = "" }: { className?: string }) {
  const allowance = useAllowance();
  const { openSettings } = useAccount();
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => { try { setDismissed(localStorage.getItem(DISMISS_KEY)); } catch { /* shown again next time */ } }, []);
  if (!allowance?.announcement) return null;
  const key = `${allowance.level}:${allowance.renewal ?? ""}:${allowance.plan ?? ""}`;
  if (allowance.level !== "empty" && dismissed === key) return null;
  return (
    <div className={`allowance-banner level-${allowance.level} ${className}`.trim()} role="status">
      <span className="allowance-dot" aria-hidden="true" />
      <p>
        {allowance.announcement}
        {allowance.level === "empty" && allowance.emptyDetail && <small>{allowance.emptyDetail}</small>}
      </p>
      <button type="button" className="allowance-banner-action" onClick={() => openSettings("subscription")}>
        {allowance.level === "empty" ? "Manage" : "Details"}
      </button>
      {allowance.level !== "empty" && (
        <button type="button" className="allowance-banner-close" aria-label="Dismiss" onClick={() => {
          setDismissed(key);
          try { localStorage.setItem(DISMISS_KEY, key); } catch { /* session only */ }
        }}><X size={14} /></button>
      )}
    </div>
  );
}
