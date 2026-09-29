import { SMILECOMPOSE } from "@/lib/brand";

export function CreatorSignature({ inverse = false, className = "" }: { inverse?: boolean; className?: string }) {
  return <span className={`sc-creator${inverse ? " sc-creator-inverse" : ""} ${className}`}>
    <span>Designed By</span>
    <img src="/dr-vik-logo.png" alt="Dr Vik" width={1086} height={447} />
  </span>;
}

/**
 * The SmileCompose mark, exactly as on the Home Screen app icon: the charcoal glass arc in Light, the Dark
 * icon's champagne arc in Dark and over photographs (`onDark`). The same artwork is used by the widgets.
 */
export function SmileMark({ onDark = false, className = "" }: { onDark?: boolean; className?: string }) {
  return <span className={`sc-mark${onDark ? " on-dark" : ""} ${className}`} aria-hidden="true">
    <img className="sc-mark-light" src="/brand/smilecompose-mark.svg" alt="" />
    <img className="sc-mark-dark" src="/brand/smilecompose-mark-dark.svg" alt="" />
  </span>;
}

export function BrandLockup({ inverse = false, className = "" }: { inverse?: boolean; className?: string }) {
  return <span className={`sc-lockup${inverse ? " sc-lockup-inverse" : ""} ${className}`} aria-label={SMILECOMPOSE.name}>
    <SmileMark className="sc-symbol" onDark={inverse} />
    <span className="sc-wordmark" aria-hidden="true">{SMILECOMPOSE.wordmark}</span>
  </span>;
}

/** Shown while the app loads. Matches the native iOS launch screen (the app icon itself, same sizes), so the hand-off doesn't jump. */
export function BrandLaunch() {
  return <div className="sc-launch" role="status" aria-label="Opening SmileCompose">
    <img className="sc-launch-symbol" src="/brand/smilecompose-launch-icon.png" alt="" width={288} height={288} fetchPriority="high" />
    <span className="sc-wordmark">{SMILECOMPOSE.wordmark}</span>
    <span className="sc-creator sc-launch-creator">
      <span>Designed By</span>
      <img src="/brand/dr-vik-logo-bronze.png" alt="Dr Vik" width={1080} height={453} fetchPriority="high" />
    </span>
  </div>;
}
