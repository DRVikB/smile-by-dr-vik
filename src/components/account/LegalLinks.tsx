"use client";
import { LEGAL_LINKS } from "@/config/accounts";
import { isNativeApp } from "@/native/platform";
import { useAccount } from "./AccountProvider";

/** Opens outside the app (Safari) on iOS; a new tab on the web. */
export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={event => {
      if (!isNativeApp()) return;
      event.preventDefault();
      window.location.assign(href);
    }}>{children}</a>
  );
}

/** SmileCompose Terms of Service, shown inside the app. */
export function TermsLink({ children = "Terms of Service" }: { children?: React.ReactNode }) {
  const { openPrivacy } = useAccount();
  return <a href={LEGAL_LINKS.terms} onClick={event => { event.preventDefault(); openPrivacy("terms"); }}>{children}</a>;
}

/** Apple's standard licence agreement, which governs App Store subscriptions. */
export function AppleEulaLink({ children = "Apple EULA" }: { children?: React.ReactNode }) {
  return <ExternalLink href={LEGAL_LINKS.appleEula}>{children}</ExternalLink>;
}

/** The bundled privacy notice, shown inside the app (works offline). */
export function PrivacyLink({ children = "Privacy Policy" }: { children?: React.ReactNode }) {
  const { openPrivacy } = useAccount();
  return <a href={LEGAL_LINKS.privacy} onClick={event => { event.preventDefault(); openPrivacy(); }}>{children}</a>;
}
