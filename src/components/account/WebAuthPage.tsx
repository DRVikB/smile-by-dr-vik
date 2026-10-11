"use client";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLockup, CreatorSignature } from "@/components/Brand";
import { AUTH_TITLES, AuthForm, type AuthMode } from "./AuthSheet";
import { PrivacyLink, TermsLink } from "./LegalLinks";

const LEADS: Partial<Record<AuthMode, string>> = {
  signIn: "Pick up your cases, your Case Library and your allowance on any device.",
  signUp: "One account for iPhone, iPad and the web. Your finished cases become the style for every new design.",
  forgot: "Enter the email you signed up with and we’ll send a reset link.",
  setPassword: "Choose a new password of at least 10 characters.",
};

/**
 * The website's full-page sign-in (opened from the landing page with /?signin or /?signup).
 * Same forms and rules as the in-app sheet; the iOS app never shows this page.
 */
export function WebAuthPage({ initialMode, onSignedIn }: { initialMode: AuthMode; onSignedIn: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const title = mode === "signIn" ? "Welcome back" : AUTH_TITLES[mode];
  return (
    <div className="web-auth" role="main">
      <aside className="web-auth-visual" aria-hidden="true">
        <img src="/smile-hero-dr-vik-v2.webp" alt="" />
        <div className="web-auth-visual-copy">
          <p className="web-auth-kicker">SmileCompose</p>
          <p className="web-auth-quote">Your style.<br /><em>Their smile.</em></p>
          <p className="web-auth-note">Design with your patient in the chair, guided by the cases you’ve already finished.</p>
        </div>
      </aside>
      <section className="web-auth-panel">
        <header className="web-auth-top">
          <a className="web-auth-back" href="/welcome"><ArrowLeft size={16} aria-hidden="true" />SmileCompose</a>
        </header>
        <div className="web-auth-card">
          <BrandLockup className="web-auth-lockup" />
          <h1 id="auth-title">{title}</h1>
          {LEADS[mode] && <p className="web-auth-lead">{LEADS[mode]}</p>}
          <AuthForm mode={mode} setMode={setMode} onSignedIn={onSignedIn} />
        </div>
        <footer className="web-auth-foot">
          <CreatorSignature />
          <span><PrivacyLink /> · <TermsLink /></span>
        </footer>
      </section>
    </div>
  );
}

/** The sign-in mode a website visitor asked for in the address, if any (?signin / ?signup). */
export function requestedWebAuthMode(search: string): AuthMode | null {
  const params = new URLSearchParams(search);
  if (params.has("signup")) return "signUp";
  if (params.has("signin")) return "signIn";
  return null;
}
