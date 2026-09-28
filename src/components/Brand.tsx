import { SMILECOMPOSE } from "@/lib/brand";

export function CreatorSignature({ inverse = false, className = "" }: { inverse?: boolean; className?: string }) {
  return <span className={`sc-creator${inverse ? " sc-creator-inverse" : ""} ${className}`}>
    <span>Designed By</span>
    <img src="/dr-vik-logo.png" alt="Dr Vik" width={1086} height={447} />
  </span>;
}

export function BrandLockup({ inverse = false, className = "" }: { inverse?: boolean; className?: string }) {
  return <span className={`sc-lockup${inverse ? " sc-lockup-inverse" : ""} ${className}`} aria-label={SMILECOMPOSE.name}>
    <img className="sc-symbol" src="/brand/smilecompose-symbol.svg" alt="" aria-hidden="true" />
    <span className="sc-wordmark" aria-hidden="true">{SMILECOMPOSE.wordmark}</span>
  </span>;
}

/** Shown while the app loads. Matches the native iOS launch screen (bronze artwork, same sizes), so the hand-off doesn't jump. */
export function BrandLaunch() {
  return <div className="sc-launch" role="status" aria-label="Opening SmileCompose">
    <img className="sc-launch-symbol" src="/brand/smilecompose-symbol-bronze.svg" alt="" fetchPriority="high" />
    <span className="sc-wordmark">{SMILECOMPOSE.wordmark}</span>
    <span className="sc-creator sc-launch-creator">
      <span>Designed By</span>
      <img src="/brand/dr-vik-logo-bronze.png" alt="Dr Vik" width={1080} height={453} fetchPriority="high" />
    </span>
  </div>;
}
