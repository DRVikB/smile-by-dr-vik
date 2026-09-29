"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { describeAllowance, type Allowance } from "@/lib/allowance";
import { useAccount } from "./AccountProvider";

const DISMISS_KEY = "smile.allowance.dismissed";

/** The signed-in Pro clinician's allowance, or null (signed out, no Pro, or not loaded). */
export function useAllowance(): Allowance | null {
  const { configured, status, hasProAccess } = useAccount();
  if (!configured || !status || !hasProAccess) return null;
  const trial = status.source === "subscription" && Boolean(status.subscription?.trial);
  return describeAllowance(status.generations, trial);
}

function Ring({ allowance }: { allowance: Allowance }) {
  const fraction = allowance.total ? Math.min(1, allowance.remaining / allowance.total) : 0;
  const r = 7.5, c = 2 * Math.PI * r;
  return (
    <svg className="allowance-ring" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" className="allowance-ring-track" />
      <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" className="allowance-ring-fill"
        strokeDasharray={`${c * fraction} ${c}`} transform="rotate(-90 10 10)" />
    </svg>
  );
}

/** Always-visible count of smile designs left; opens Subscription & usage. */
export function AllowancePill({ className = "" }: { className?: string }) {
  const allowance = useAllowance();
  const { openSettings } = useAccount();
  if (!allowance) return null;
  return (
    <button type="button" className={`allowance-pill level-${allowance.level} ${className}`.trim()} onClick={() => openSettings("subscription")}
      aria-label={`${allowance.summary}${allowance.renews ? `, renews ${allowance.renews}` : ""}. Open subscription and usage.`}>
      <Ring allowance={allowance} />
      <span>{allowance.summary}{allowance.renews && !allowance.trial && <small> · renews {allowance.renews}</small>}</span>
    </button>
  );
}

/** "Uses 1 smile design · 37 left", beside Generate. */
export function AllowanceLine({ uses = 1 }: { uses?: number }) {
  const allowance = useAllowance();
  if (!allowance) return null;
  return <p className={`allowance-line level-${allowance.level}`} role="status">
    Uses {uses} smile design{uses === 1 ? "" : "s"} · {allowance.remaining} left{allowance.trial ? " in your trial" : ""}
  </p>;
}

/** The low / critical / empty announcement, dismissible until the level or period changes. */
export function AllowanceBanner({ className = "" }: { className?: string }) {
  const allowance = useAllowance();
  const { openSettings } = useAccount();
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => { try { setDismissed(localStorage.getItem(DISMISS_KEY)); } catch { /* shown again next time */ } }, []);
  if (!allowance?.announcement) return null;
  const key = `${allowance.level}:${allowance.renews ?? ""}:${allowance.total}`;
  // Running out is never hidden; lower levels can be put away until things change.
  if (allowance.level !== "empty" && dismissed === key) return null;
  return (
    <div className={`allowance-banner level-${allowance.level} ${className}`.trim()} role="status">
      <Ring allowance={allowance} />
      <p>{allowance.announcement}</p>
      <button type="button" className="allowance-banner-action" onClick={() => openSettings("subscription")}>Details</button>
      {allowance.level !== "empty" && (
        <button type="button" className="allowance-banner-close" aria-label="Dismiss" onClick={() => {
          setDismissed(key);
          try { localStorage.setItem(DISMISS_KEY, key); } catch { /* session only */ }
        }}><X size={14} /></button>
      )}
    </div>
  );
}
