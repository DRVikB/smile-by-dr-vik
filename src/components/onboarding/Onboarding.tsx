"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { AppleSignInButton } from "@/components/account/AppleSignInButton";
import { PrivacyLink, TermsLink } from "@/components/account/LegalLinks";
import { ProPlans } from "@/components/account/ProPlans";
import { BrandLockup, CreatorSignature } from "@/components/Brand";
import { NAME_LIMITS, initials as initialsOf, normaliseName } from "@/lib/profile";
import {
  ONBOARDING_PROGRESS, onboardingDecision, readLocalOnboarding, updateAccountFlags, writeLocalOnboarding,
  type AccountOnboardingFlags, type LocalOnboarding, type OnboardingStep,
} from "@/lib/onboarding";
import { isNativeApp } from "@/native/platform";
import { AuthMessage, signInWithApple } from "@/services/auth/authService";
import { AddReferenceCases, materialShort } from "@/components/caseLibrary/CaseLibraryView";
import { useCaseLibrary } from "@/components/caseLibrary/caseLibraryContext";
import { ProfilePhotoEditor } from "@/components/profile/ProfilePhotoEditor";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { AccountVisual, GreetingPreview, HowItWorksVisual, ProValueVisual, ReadyVisual, StyleLibraryVisual, WelcomeVisual } from "./OnboardingVisuals";

/**
 * First-run onboarding: Welcome → Account → Personalise → How it works →
 * Your style (Case Library) → Subscription → Ready. Short, skippable where it
 * should be, and resumable. It collects no professional details; the only
 * patient images are finished cases the clinician chooses to add.
 */
export function Onboarding({ appReady, onCreateFirst, onOpenCases }: {
  appReady: boolean;
  onCreateFirst: () => void;
  onOpenCases: () => void;
}) {
  const account = useAccount();
  const { configured, user, status, statusState, hasProAccess } = account;
  const userId = user?.id ?? null;
  const [local, setLocal] = useState<LocalOnboarding | null>(null);
  const [deviceHasCases, setDeviceHasCases] = useState<boolean | null>(null);
  const [showingReady, setShowingReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const completing = useRef(false);

  useEffect(() => {
    setLocal(readLocalOnboarding());
    void import("@/lib/caseLog")
      .then(async log => { const c = await log.caseCounts(); return c.active + c.archived + c.deleted > 0; })
      .catch(() => false)
      .then(setDeviceHasCases);
  }, []);

  const save = useCallback((next: LocalOnboarding) => { setLocal(next); writeLocalOnboarding(next); }, []);
  const setFlags = useCallback((flags: AccountOnboardingFlags) => {
    if (!local) return;
    if (userId) save(updateAccountFlags(local, userId, flags));
    else save({ ...local, ...(flags.nameSkipped ? { nameSkipped: true } : {}) });
  }, [local, userId, save]);

  // Record completion against the account (and on this device, so it is not shown again offline).
  const complete = useCallback(async () => {
    if (completing.current || !local) return;
    completing.current = true;
    const next = { ...(userId ? updateAccountFlags(local, userId, { completed: true }) : local), completedAt: local.completedAt ?? Date.now() };
    save(next);
    if (userId) await account.updateProfile({ onboardingCompleted: true }).catch(() => { /* retried on next launch: server still says incomplete */ });
    completing.current = false;
  }, [local, userId, save, account]);

  const ready = appReady && account.ready && local !== null && deviceHasCases !== null;
  const decision = ready ? onboardingDecision({
    accountsConfigured: configured,
    userId,
    statusLoaded: statusState === "loaded",
    statusFailed: statusState === "failed",
    profile: status?.profile ?? null,
    hasPro: hasProAccess,
    deviceHasCases: Boolean(deviceHasCases),
    local: local!,
  }) : null;

  useEffect(() => {
    if (!decision || !local) return;
    if (decision.kind === "done" && userId) save({ ...updateAccountFlags(local, userId, { completed: true }), completedAt: local.completedAt ?? Date.now() });
    if (decision.kind === "completeSilently") void complete();
    if (decision.kind === "step" && decision.step === "ready" && !showingReady) { setShowingReady(true); void complete(); }
  }, [decision, local, userId, save, complete, showingReady]);

  if (dismissed) return null;
  if (showingReady) return <ReadyStep name={account.displayName} onCreate={() => { setDismissed(true); onCreateFirst(); }} onCases={() => { setDismissed(true); onOpenCases(); }} onLibrary={() => setDismissed(true)} />;
  if (!ready) return local && !local.completedAt ? <Loading /> : null;
  if (!decision || decision.kind === "none" || decision.kind === "done" || decision.kind === "completeSilently") return null;
  if (decision.kind === "loading") return <Loading label="Loading your workspace…" />;

  const step = decision.step;
  switch (step) {
    case "welcome":
      return <WelcomeStep onStart={() => save({ ...local!, welcomeSeen: true })} />;
    case "account":
      return <AccountStep configured={configured} name={account.displayName} onDefer={() => save({ ...local!, accountDeferred: true })} />;
    case "personalise":
      return <PersonaliseStep configured={configured} returning={decision.returning} initial={account.names.preferredName ?? local!.preferredName ?? ""}
        accountName={account.names.fullName} onSkip={() => setFlags({ nameSkipped: true })}
        onSaved={() => setLocal(readLocalOnboarding())} />;
    case "howItWorks":
      return <HowItWorksStep configured={configured} onContinue={() => save({ ...local!, howItWorksSeen: true })} />;
    case "styleLibrary":
      return <StyleLibraryStep configured={configured} onContinue={() => save({ ...local!, styleLibrarySeen: true })} />;
    case "subscription":
      return <SubscriptionStep configured={configured} onDefer={() => userId ? setFlags({ subscriptionDeferred: true }) : save({ ...local!, subscriptionSeen: true })} />;
    case "ready":
      return null; // shown via showingReady
  }
}

function useFocusHeading(key: string) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [key]);
  return heading;
}

function Loading({ label }: { label?: string }) {
  return (
    <div className="onboarding onboarding-loading" role="status" aria-live="polite">
      <span className="onboarding-loading-mark" aria-hidden="true" />
      <BrandLockup />
      {label && <p>{label}</p>}
    </div>
  );
}

function Progress({ step, configured }: { step: OnboardingStep; configured: boolean }) {
  const steps = ONBOARDING_PROGRESS.filter(s => configured || (s !== "account" && s !== "subscription"));
  const index = steps.indexOf(step);
  if (index < 0) return null;
  return (
    <ol className="onboarding-progress" aria-label={`Step ${index + 1} of ${steps.length}`}>
      {steps.map((s, i) => <li key={s} className={i < index ? "done" : i === index ? "current" : undefined} aria-hidden="true" />)}
    </ol>
  );
}

/**
 * Onboarding page layout.
 * iPhone: headline, visual, then actions, in one focused column.
 * iPad landscape: visual panel on the left, content on the right.
 * iPad portrait: visual panel across the top, content below.
 */
function Frame({ step, configured, visual, head, children, progress = true }: {
  step: OnboardingStep;
  configured: boolean;
  visual: React.ReactNode;
  head: React.ReactNode;
  children: React.ReactNode;
  progress?: boolean;
}) {
  return (
    <div className="onboarding ob-frame" data-step={step}>
      <div className="ob-top">
        <BrandLockup />
        {progress && <Progress step={step} configured={configured} />}
      </div>
      <div className="ob-layout" key={step}>
        <div className="ob-visual">{visual}</div>
        <div className="ob-head">{head}</div>
        <div className="ob-body">{children}</div>
      </div>
    </div>
  );
}

function WelcomeStep({ onStart }: { onStart: () => void }) {
  const heading = useFocusHeading("welcome");
  return (
    <div className="onboarding ob-frame ob-welcome" data-step="welcome">
      <div className="ob-layout">
        <div className="ob-visual"><WelcomeVisual /></div>
        <div className="ob-head">
          <BrandLockup />
          <h1 ref={heading} tabIndex={-1} className="ob-display">Smile design,<br />visualised.</h1>
          <p className="ob-copy">Create realistic smile visualisations for clearer aesthetic consultations.</p>
        </div>
        <div className="ob-body">
          <button className="primary-button ob-cta" onClick={onStart}>Get Started <ArrowRight size={17} strokeWidth={1.8} /></button>
          <CreatorSignature />
        </div>
      </div>
    </div>
  );
}

function AccountStep({ configured, name, onDefer }: { configured: boolean; name: string | null; onDefer: () => void }) {
  const { openAuth } = useAccount();
  const heading = useFocusHeading("account");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apple() {
    setBusy(true);
    setError("");
    try {
      await signInWithApple(); // signed in: onboarding moves on by itself
    } catch (e) {
      setError(e instanceof AuthMessage ? e.message : "Sign in with Apple didn’t complete. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame step="account" configured={configured} visual={<AccountVisual name={name} />} head={<>
      <h1 ref={heading} tabIndex={-1} className="ob-title">Your SmileCompose account</h1>
      <p className="ob-copy">Keep your subscription and generation allowance with you on iPhone, iPad and the web. Patient cases stay securely on this device.</p>
    </>}>
      <div className="ob-actions">
        <AppleSignInButton onClick={() => void apple()} disabled={busy} label="Continue with Apple" />
        <button className="secondary-button ob-button" disabled={busy} onClick={() => openAuth("signUp")}>Continue with Email</button>
        {error && <p className="error-message" role="alert">{error}</p>}
        <p className="ob-legal">By continuing you agree to the <TermsLink /> and acknowledge the <PrivacyLink />.</p>
        <button className="text-button ob-quiet" onClick={onDefer}>Explore without an account</button>
      </div>
    </Frame>
  );
}

function PersonaliseStep({ configured, returning, initial, accountName, onSkip, onSaved }: {
  configured: boolean;
  returning: boolean;
  initial: string;
  accountName: string | null;
  onSkip: () => void;
  /** Without an account the name is saved on this device; refresh onboarding's view of it. */
  onSaved: () => void;
}) {
  const { updateProfile, user, avatarUrl, initials } = useAccount();
  const heading = useFocusHeading("personalise");
  const [name, setName] = useState(initial);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = normaliseName(name, NAME_LIMITS.preferredName);
    if (!value) { setError(value === undefined ? `Use up to ${NAME_LIMITS.preferredName} characters.` : "Enter a name, or skip for now."); return; }
    setBusy(true);
    setError("");
    try {
      await updateProfile({ preferredName: value }); // onboarding moves on once saved
      onSaved();
    } catch {
      setError("Your name couldn’t be saved. Check your connection and try again, or skip for now.");
      setBusy(false);
    }
  }

  return (
    <Frame step="personalise" configured={configured} visual={<GreetingPreview name={name} avatarUrl={avatarUrl} />} head={<>
      <h1 ref={heading} tabIndex={-1} className="ob-title">What should SmileCompose call you?</h1>
      <p className="ob-copy">{returning ? "Welcome back. " : ""}Choose how your name appears throughout the app. You can change this anytime.</p>
    </>}>
      <form className="ob-form" onSubmit={submit}>
        <label className="ob-name-field">
          <span>Preferred name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Dr Vik" autoComplete="nickname" autoCapitalize="words"
            maxLength={NAME_LIMITS.preferredName} enterKeyHint="done" />
        </label>
        {accountName && <p className="ob-account-name"><span>Account name</span>{accountName}</p>}
        {user && (
          <div className="ob-photo-row">
            <UserAvatar initials={initialsOf(name) || initials} url={avatarUrl} size="medium" />
            <button type="button" className="text-button" onClick={() => setEditingPhoto(true)}>{avatarUrl ? "Change profile photo" : "Add profile photo"}</button>
            <span className="muted">Optional</span>
          </div>
        )}
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="ob-actions">
          <button className="primary-button ob-button" type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Continue"}</button>
          <button type="button" className="text-button ob-quiet" disabled={busy} onClick={onSkip}>Skip for now</button>
        </div>
      </form>
      {editingPhoto && <ProfilePhotoEditor onClose={() => setEditingPhoto(false)} />}
    </Frame>
  );
}

function HowItWorksStep({ configured, onContinue }: { configured: boolean; onContinue: () => void }) {
  const heading = useFocusHeading("how");
  return (
    <Frame step="howItWorks" configured={configured} visual={<HowItWorksVisual />} head={<>
      <h1 ref={heading} tabIndex={-1} className="ob-title">A smarter way to design beautiful smiles.</h1>
      <p className="ob-copy">From capture to consultation, in one seamless workflow. Patient photos stay on this device until you choose to generate.</p>
    </>}>
      <div className="ob-actions">
        <button className="primary-button ob-button" onClick={onContinue}>Continue</button>
      </div>
    </Frame>
  );
}

function StyleLibraryStep({ configured, onContinue }: { configured: boolean; onContinue: () => void }) {
  const library = useCaseLibrary();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const heading = useFocusHeading(added !== null ? "style-done" : adding ? "style-add" : "style");
  useEffect(() => { document.querySelector(".onboarding")?.scrollTo({ top: 0 }); }, [adding, added]);

  if (added !== null) {
    const own = (library.cases ?? []).filter(c => c.thumbnailUrl).map(c => ({ src: c.thumbnailUrl!, label: materialShort(c.material) }));
    return (
      <Frame step="styleLibrary" configured={configured} visual={<StyleLibraryVisual own={own} />} head={<>
        <h1 ref={heading} tabIndex={-1} className="ob-title">Your style library is ready</h1>
        <p className="ob-copy">{added} reference {added === 1 ? "case" : "cases"} added. You can add more, edit tags or remove cases anytime in Settings → Case Library.</p>
      </>}>
        <div className="ob-actions">
          <button className="primary-button ob-button" onClick={onContinue}>Continue</button>
        </div>
      </Frame>
    );
  }

  if (adding) {
    return (
      <Frame step="styleLibrary" configured={configured} visual={<StyleLibraryVisual />} head={<>
        <h1 ref={heading} tabIndex={-1} className="ob-title">Add your finished cases</h1>
        <p className="ob-copy">Choose close-up photographs of finished bonding or porcelain work. Nothing is added until you confirm.</p>
      </>}>
        <div className="ob-library-add">
          <AddReferenceCases onDone={result => setAdded(result.added)} onCancel={() => setAdding(false)} cancelLabel="Back" />
        </div>
      </Frame>
    );
  }

  return (
    <Frame step="styleLibrary" configured={configured} visual={<StyleLibraryVisual />} head={<>
      <p className="ob-eyebrow">Your style · Case Library</p>
      <h1 ref={heading} tabIndex={-1} className="ob-title">Make SmileCompose look like you.</h1>
      <p className="ob-copy">Add examples of your finished bonding and porcelain cases. SmileCompose can use them as private visual references when creating new designs, helping results reflect your preferred contour, texture and finish.</p>
    </>}>
      <div className="ob-actions">
        <button className="primary-button ob-button" onClick={() => setAdding(true)}>Add My Finished Cases</button>
        <button className="text-button ob-quiet" onClick={onContinue}>I’ll do this later</button>
      </div>
    </Frame>
  );
}

function SubscriptionStep({ configured, onDefer }: { configured: boolean; onDefer: () => void }) {
  const heading = useFocusHeading("subscription");
  return (
    <Frame step="subscription" configured={configured} visual={<ProValueVisual />} head={<>
      <p className="ob-eyebrow">SmileCompose Pro</p>
      <h1 ref={heading} tabIndex={-1} className="ob-title">Every consultation, visualised.</h1>
    </>}>
      <div className="ob-plans"><ProPlans /></div>
      <div className="ob-actions">
        <button className="text-button ob-quiet" onClick={onDefer}>{isNativeApp() ? "Not now" : "Continue"}</button>
      </div>
    </Frame>
  );
}

function ReadyStep({ name, onCreate, onCases, onLibrary }: { name: string | null; onCreate: () => void; onCases: () => void; onLibrary: () => void }) {
  const heading = useFocusHeading("ready");
  const library = useCaseLibrary();
  const hasLibrary = (library.cases?.length ?? 0) > 0;
  return (
    <div className="onboarding ob-frame ob-ready" data-step="ready">
      <div className="ob-top"><BrandLockup /></div>
      <div className="ob-layout">
        <div className="ob-visual"><ReadyVisual name={name} /></div>
        <div className="ob-head">
          <h1 ref={heading} tabIndex={-1} className="ob-title">You’re all set{name ? `, ${name}` : ""}.</h1>
          <p className="ob-copy">{hasLibrary ? "Your workspace and style library are ready." : "You can add your finished work to Case Library anytime."}</p>
        </div>
        <div className="ob-body">
          <div className="ob-actions">
            <button className="primary-button ob-button" onClick={onCreate}>Create Your First Smile</button>
            {library.mode === "signedOut"
              ? <button className="secondary-button ob-button" onClick={onCases}>View Cases</button>
              : <button className="secondary-button ob-button" onClick={() => { onLibrary(); library.open({ add: !hasLibrary }); }}>{hasLibrary ? "Open Case Library" : "Add to Case Library"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
