"use client";
import { Camera, Check, Lock, Monitor, Share2, SlidersHorizontal, Smartphone, Sparkles, Tablet } from "lucide-react";
import { SUBSCRIPTION_PRODUCTS } from "@/config/subscriptions";
import { BrandLockup } from "@/components/Brand";
import { greeting, initials } from "@/lib/profile";

/**
 * Purpose-built onboarding visuals. They are composed from SmileCompose's own
 * sample case (test-mode images, cropped for size) and app UI, and are themed
 * entirely through the tokens in src/app/theme.css, so they work in Light and
 * Dark. Motion is decorative and is removed under Reduce Motion.
 */
const BEFORE = "/onboarding/smile-before.jpg";
const AFTER = "/onboarding/smile-after.jpg";
const HERO = "/smile-hero-dr-vik-v2.png";
/** Smile-region crops of the sample material cases, and a new patient's design. */
const STYLE_CASES = [
  { src: "/onboarding/case-porcelain.jpg", label: "Porcelain" },
  { src: "/onboarding/case-layered.jpg", label: "Layered" },
  { src: "/onboarding/case-single-shade.jpg", label: "Single shade" },
];
const NEW_DESIGN = "/onboarding/new-design.jpg";

/** Before / after of the sample case with an animated reveal. */
export function SmileReveal({ animate = true, size = "hero" }: { animate?: boolean; size?: "hero" | "compact" }) {
  return (
    <figure className={`reveal-card ${size}${animate ? " animate" : ""}`}>
      <div className="reveal-frame">
        <img className="reveal-img" src={BEFORE} alt="" draggable={false} />
        <img className="reveal-img reveal-after" src={AFTER} alt="" draggable={false} />
        <span className="reveal-divider" aria-hidden="true"><span className="reveal-handle" /></span>
        <span className="reveal-tag before" aria-hidden="true">Before</span>
        <span className="reveal-tag after" aria-hidden="true">Concept</span>
      </div>
      <figcaption className="sr-only">A sample patient smile, before and as a porcelain smile concept.</figcaption>
    </figure>
  );
}

/** Welcome hero: the reveal card, a layered plate behind it and two design callouts. */
export function WelcomeVisual() {
  return (
    <div className="ob-stage welcome-stage">
      <SmileReveal />
      <span className="ob-chip chip-spec float-a" aria-hidden="true"><i className="chip-swatch" />Porcelain · BL2</span>
      <span className="ob-chip chip-note float-b" aria-hidden="true"><Sparkles size={13} strokeWidth={1.8} />Concept visualisation</span>
    </div>
  );
}

/** Account: what the account carries (and what stays on the device). */
export function AccountVisual({ name }: { name: string | null }) {
  return (
    <div className="ob-stage account-stage" aria-hidden="true">
      <div className="account-card">
        <div className="account-card-head">
          <span className="account-medallion">{initials(name) || "SC"}</span>
          <span>
            <strong>{name ?? "Your account"}</strong>
            <small>SmileCompose Pro</small>
          </span>
        </div>
        <ul className="account-devices">
          <li><Smartphone size={18} strokeWidth={1.6} />iPhone</li>
          <li><Tablet size={18} strokeWidth={1.6} />iPad</li>
          <li><Monitor size={18} strokeWidth={1.6} />Web</li>
        </ul>
        <p className="account-card-note"><Lock size={13} strokeWidth={1.8} />Patient cases stay on this device</p>
      </div>
    </div>
  );
}

/** Personalise: a live preview of the greeting on the workspace. */
export function GreetingPreview({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const shown = name.trim() || "Dr Vik";
  return (
    <div className="greeting-preview" aria-hidden="true">
      <img className="greeting-preview-image" src={HERO} alt="" draggable={false} />
      <div className="greeting-preview-top">
        <BrandLockup inverse />
        {avatarUrl
          ? <span className="greeting-preview-avatar has-photo"><img src={avatarUrl} alt="" draggable={false} /></span>
          : <span className="greeting-preview-avatar">{initials(shown)}</span>}
      </div>
      <div className="greeting-preview-copy">
        <span className="greeting-preview-hello">{greeting(shown)}</span>
        <span className="greeting-preview-title">Smile design,<br />visualised.</span>
        <span className="greeting-preview-cta">New Smile Design</span>
      </div>
    </div>
  );
}

function MiniCapture() {
  return (
    <div className="mini mini-capture">
      <img src={BEFORE} alt="" draggable={false} />
      <span className="mini-corner tl" /><span className="mini-corner tr" /><span className="mini-corner bl" /><span className="mini-corner br" />
      <span className="mini-guide" />
      <span className="mini-shutter" />
    </div>
  );
}

function MiniCompose() {
  return (
    <div className="mini mini-compose">
      <div className="mini-shades">
        <span style={{ background: "#EFE3CC" }}>A2</span>
        <span style={{ background: "#F6EFE2" }}>B1</span>
        <span className="selected" style={{ background: "#FFFDF8" }}>BL2</span>
      </div>
      <div className="mini-slider"><span /><i /></div>
      <div className="mini-segment"><span>Composite</span><span className="selected">Porcelain</span></div>
    </div>
  );
}

function MiniVisualise() {
  return (
    <div className="mini mini-visualise">
      <img src={BEFORE} alt="" draggable={false} />
      <img className="after" src={AFTER} alt="" draggable={false} />
      <span className="mini-divider" />
    </div>
  );
}

function MiniShare() {
  return (
    <div className="mini mini-share">
      <div className="mini-report">
        <div className="mini-report-pair">
          <img src={BEFORE} alt="" draggable={false} />
          <img src={AFTER} alt="" draggable={false} />
        </div>
        <span className="mini-report-line" />
        <span className="mini-report-line short" />
      </div>
      <span className="mini-share-badge"><Share2 size={14} strokeWidth={1.8} /></span>
    </div>
  );
}

const STEPS = [
  { title: "Capture", body: "Add a patient smile photo", Icon: Camera, Mini: MiniCapture },
  { title: "Compose", body: "Choose treatment, shape and shade", Icon: SlidersHorizontal, Mini: MiniCompose },
  { title: "Visualise", body: "Create and compare the smile", Icon: Sparkles, Mini: MiniVisualise },
  { title: "Share", body: "Save or share your preferred design", Icon: Share2, Mini: MiniShare },
] as const;

/** How it works: four illustrated steps built from the app's own UI. */
export function HowItWorksVisual() {
  return (
    <ol className="how-visual">
      {STEPS.map(({ title, body, Icon, Mini }, index) => (
        <li key={title} className="how-card" style={{ "--how-index": index } as React.CSSProperties}>
          <Mini />
          <div className="how-card-text">
            <span className="how-card-step"><Icon size={14} strokeWidth={1.8} aria-hidden="true" />{String(index + 1).padStart(2, "0")}</span>
            <strong>{title}</strong>
            <span>{body}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Paywall: the result Pro creates, with the plan's real allowance. */
export function ProValueVisual({ compact = false }: { compact?: boolean }) {
  const monthly = SUBSCRIPTION_PRODUCTS.monthly.generationsPerPeriod;
  return (
    <div className={`ob-stage pro-stage${compact ? " compact" : ""}`} aria-hidden="true">
      <SmileReveal animate={!compact} size={compact ? "compact" : "hero"} />
      <ul className="pro-callouts">
        <li className="ob-chip float-a"><Sparkles size={13} strokeWidth={1.8} />{monthly} generations a month</li>
        <li className="ob-chip float-b"><SlidersHorizontal size={13} strokeWidth={1.8} />Compare materials &amp; shapes</li>
        <li className="ob-chip float-c"><Share2 size={13} strokeWidth={1.8} />Consultation view &amp; reports</li>
      </ul>
    </div>
  );
}

/** Your style: finished cases → SmileCompose → a new patient's design in the same style. */
export function StyleLibraryVisual({ own }: { own?: { src: string; label: string }[] }) {
  const cases = own?.length ? own.slice(0, 3) : STYLE_CASES;
  return (
    <div className="ob-stage style-stage" aria-hidden="true">
      <div className="style-flow">
        <div className="style-cases">
          <span className="style-flow-label">Your finished cases</span>
          <div className={`style-case-row count-${cases.length}`}>
            {cases.map((c, i) => (
              <figure key={c.src} className="style-case" style={{ "--i": i } as React.CSSProperties}>
                <img src={c.src} alt="" draggable={false} />
                <figcaption>{c.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
        <div className="style-engine">
          <span className="style-engine-line" />
          <span className="style-engine-mark"><Sparkles size={13} strokeWidth={1.8} />SmileCompose</span>
          <span className="style-engine-line" />
        </div>
        <figure className="style-result">
          <span className="style-flow-label">New patient design</span>
          <img src={NEW_DESIGN} alt="" draggable={false} />
          <figcaption><Check size={13} strokeWidth={2.2} />Your contour, texture and finish</figcaption>
        </figure>
      </div>
    </div>
  );
}

/** Ready: a drawn check, then the personalised workspace rising into view. */
export function ReadyVisual({ name }: { name: string | null }) {
  return (
    <div className="ob-stage ready-stage" aria-hidden="true">
      <svg className="ready-ring" viewBox="0 0 64 64">
        <circle className="ready-ring-track" cx="32" cy="32" r="29" />
        <circle className="ready-ring-draw" cx="32" cy="32" r="29" />
        <path className="ready-check" d="M21 33.5l7.2 7.2L43.5 25" />
      </svg>
      <div className="workspace-preview">
        <img className="workspace-preview-image" src={HERO} alt="" draggable={false} />
        <div className="workspace-preview-copy">
          <span className="workspace-hello">{greeting(name)}</span>
          <span className="workspace-title">Smile design,<br />visualised.</span>
          <span className="workspace-cta">New Smile Design</span>
        </div>
        <div className="workspace-recent">
          <img src={AFTER} alt="" draggable={false} />
          <img src={BEFORE} alt="" draggable={false} />
          <span><Check size={14} strokeWidth={2} /></span>
        </div>
      </div>
    </div>
  );
}
