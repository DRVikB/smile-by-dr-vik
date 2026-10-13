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
    <span className="sc-launch-symbol">
      <img src="/brand/smilecompose-launch-icon.png" alt="" width={288} height={288} fetchPriority="high" />
      {/* The same artwork as the system launch screen, so nothing jumps; a light then travels along its smile. */}
      <svg className="sc-launch-sheen" viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
        <mask id="sc-launch-smile" maskUnits="userSpaceOnUse" x="150" y="330" width="724" height="480"><path d="M216 431C322 770 702 770 808 431" stroke="#fff" strokeWidth="84" strokeLinecap="round" /></mask>
        <g mask="url(#sc-launch-smile)"><path pathLength={100} d="M216 431C322 770 702 770 808 431" /></g>
      </svg>
    </span>
    <span className="sc-wordmark">{SMILECOMPOSE.wordmark}</span>
    <span className="sc-creator sc-launch-creator">
      <span>Designed By</span>
      <img src="/brand/dr-vik-logo-bronze.png" alt="Dr Vik" width={1080} height={453} fetchPriority="high" />
    </span>
  </div>;
}
