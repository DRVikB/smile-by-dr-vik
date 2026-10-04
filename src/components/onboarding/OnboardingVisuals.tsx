"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { CaptureSymbol, ComposeSymbol, IconTile, PresentSymbol, ShareSymbol, VisualiseSymbol } from "@/components/icons/SmileIcons";
import { EXAMPLE_COMPARISON, EXAMPLE_PORTRAITS, SUBSCRIPTION_COMPARISON } from "@/lib/exampleImages";
import { SUBSCRIPTION_PRODUCTS } from "@/config/subscriptions";

/**
 * Purpose-built onboarding visuals. They are composed from SmileCompose's own
 * sample case and fictional portraits,
 * and the Home screen's hero photograph. They are themed through the tokens in
 * src/app/theme.css, so they work in Light and Dark. Motion is decorative and is
 * removed under Reduce Motion.
 */
const BEFORE = "/onboarding/smile-before.jpg";
const AFTER = "/onboarding/smile-after.jpg";
const HERO = "/smile-hero-dr-vik-v2.webp";
/** Smile-region crops of the sample material cases, and a new patient's design. */
const STYLE_CASES = [
  { src: "/onboarding/case-porcelain.jpg", label: "Porcelain" },
  { src: "/onboarding/case-layered.jpg", label: "Layered" },
  { src: "/onboarding/case-single-shade.jpg", label: "Single shade" },
];
const NEW_DESIGN = "/examples/smile-detail-v1-960.webp";
/** Full-resolution frames of the same case, including on dense mobile displays. */
const BEFORE_LARGE = EXAMPLE_COMPARISON.before;
const AFTER_LARGE = EXAMPLE_COMPARISON.after;
// Full portraits on phones too: viewport width alone is not a reliable indicator
// of display density or how large a photograph will become in landscape.
function Photo({ src, large, className }: { src: string; large?: string; className: string }) {
  return <img className={className} src={large ?? src} alt="" draggable={false} decoding="async" />;
}

/** Before / after of the sample case with an animated reveal. */
export function SmileReveal({ animate = true, size = "hero", handle = "dot", comparison, interactive = false }: {
  animate?: boolean;
  size?: "hero" | "compact";
  /** The divider's handle: a gold dot, or the arrows of a slider. */
  handle?: "dot" | "arrows";
  comparison?: { before: string; after: string };
  interactive?: boolean;
}) {
  const [introDone, setIntroDone] = useState(!animate);
  const [position, setPosition] = useState(50);
  const [interacted, setInteracted] = useState(false);
  const dragging = useRef<number | null>(null);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const respectMotion = () => { if (motion.matches) setIntroDone(true); };
    respectMotion();
    motion.addEventListener("change", respectMotion);
    return () => motion.removeEventListener("change", respectMotion);
  }, []);
  const startInteraction = () => { setIntroDone(true); setInteracted(true); };
  const slideTo = (clientX: number, frame: HTMLDivElement) => {
    const box = frame.getBoundingClientRect();
    if (box.width) setPosition(Math.round(Math.min(100, Math.max(0, (clientX - box.left) / box.width * 100))));
  };
  return (
    <figure className={`reveal-card ${size}${animate && !introDone ? " animate" : ""}${interactive ? " interactive" : ""}`}
      style={{ "--split": `${position}%` } as React.CSSProperties}
      onAnimationEnd={e => { if (e.target === e.currentTarget && e.animationName === "reveal-split") setIntroDone(true); }}>
      <div className="reveal-frame"
        role={interactive ? "slider" : undefined} tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? "Before and concept comparison" : undefined}
        aria-valuemin={interactive ? 0 : undefined} aria-valuemax={interactive ? 100 : undefined}
        aria-valuenow={interactive ? position : undefined}
        aria-valuetext={interactive ? `${position} percent before, ${100 - position} percent concept` : undefined}
        onPointerDown={interactive ? e => {
          if (!e.isPrimary || e.button !== 0) return;
          startInteraction(); dragging.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId); slideTo(e.clientX, e.currentTarget);
        } : undefined}
        onPointerMove={interactive ? e => { if (dragging.current === e.pointerId) slideTo(e.clientX, e.currentTarget); } : undefined}
        onPointerUp={() => { dragging.current = null; }}
        onPointerCancel={() => { dragging.current = null; }}
        onLostPointerCapture={() => { dragging.current = null; }}
        onKeyDown={interactive ? e => {
          const delta = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -10, PageUp: 10 }[e.key];
          if (delta === undefined && e.key !== "Home" && e.key !== "End") return;
          e.preventDefault(); startInteraction();
          setPosition(value => e.key === "Home" ? 0 : e.key === "End" ? 100 : Math.min(100, Math.max(0, value + delta!)));
        } : undefined}>
        <Photo className="reveal-img" src={comparison?.before ?? BEFORE} large={!comparison && size === "hero" ? BEFORE_LARGE : undefined} />
        <Photo className="reveal-img reveal-after" src={comparison?.after ?? AFTER} large={!comparison && size === "hero" ? AFTER_LARGE : undefined} />
        <span className="reveal-divider" aria-hidden="true">
          {handle === "arrows" || interactive && introDone
            ? <span className="reveal-handle arrows"><ChevronLeft size={14} strokeWidth={2} /><ChevronRight size={14} strokeWidth={2} /></span>
            : <span className="reveal-handle" />}
        </span>
        <span className="reveal-tag before" aria-hidden="true">Before</span>
        <span className="reveal-tag after" aria-hidden="true">Concept</span>
      </div>
      {interactive && introDone && !interacted && <span className="reveal-hint" role="status">Try it for yourself<small>Swipe left or right</small></span>}
      <figcaption className="sr-only">An illustrative demo smile, before and as a smile concept.</figcaption>
    </figure>
  );
}

/** Welcome: the before/after reveal, full bleed. */
export function WelcomeVisual() {
  return (
    <div className="ob-stage welcome-stage">
      <SmileReveal interactive />
    </div>
  );
}

/**
 * A full-bleed photograph with its caption laid over the foot of it: a small line (a greeting, or the
 * wordmark), the headline in the display serif, and a short gold rule.
 */
export function HeroPhoto({ photo, eyebrow, title, brandEyebrow = false }: {
  photo: "portrait" | "smile";
  eyebrow: string;
  title: React.ReactNode;
  /** Set the small line as the letter-spaced wordmark rather than a sentence. */
  brandEyebrow?: boolean;
}) {
  return (
    <div className={`ob-hero ob-hero-${photo}`} aria-hidden="true">
      {photo === "portrait" ? <img className="ob-hero-img" {...EXAMPLE_PORTRAITS.woman} sizes="(min-width: 700px) and (orientation: landscape) 66vw, 100vw" alt="" draggable={false} decoding="async" /> : <img className="ob-hero-img" src={HERO} alt="" draggable={false} />}
      <div className="ob-hero-caption">
        <span className={`ob-hero-eyebrow${brandEyebrow ? " is-brand" : ""}`}>{eyebrow}</span>
        <span className="ob-hero-title">{title}</span>
      </div>
    </div>
  );
}

/* "A smarter way": each card's photograph fills its right-hand side. */
function MediaCapture() {
  return <img className="how-media-photo how-media-capture" {...EXAMPLE_PORTRAITS.man} sizes="(min-width: 700px) 280px, 46vw" alt="" draggable={false} decoding="async" />;
}

function MediaCompose() {
  return <img className="how-media-photo how-media-compose" src={HERO} alt="" draggable={false} />;
}

function MediaVisualise() {
  return (
    <div className="how-media-split">
      <img src={BEFORE} alt="" draggable={false} />
      <img className="after" src={AFTER} alt="" draggable={false} />
      <span className="how-media-divider" />
    </div>
  );
}

function MediaShare() {
  return (
    <div className="how-media-tablet">
      <div className="how-media-screen">
        <img className="how-media-hero" src={AFTER_LARGE} alt="" draggable={false} />
        <div className="how-media-strip">
          <img src={BEFORE} alt="" draggable={false} />
          <img src={AFTER} alt="" draggable={false} />
          <img src={STYLE_CASES[0].src} alt="" draggable={false} />
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { title: "Capture", body: "Take a photo or choose one from your library.", Icon: CaptureSymbol, Media: MediaCapture },
  { title: "Compose", body: "Adjust shape, shade and treatment.", Icon: ComposeSymbol, Media: MediaCompose },
  { title: "Visualise", body: "See the before and after, side by side.", Icon: VisualiseSymbol, Media: MediaVisualise },
  { title: "Share", body: "Save, present and share with patients.", Icon: ShareSymbol, Media: MediaShare },
] as const;

/** How it works: four numbered cards, from capture to consultation, each with its photograph. */
export function HowItWorksVisual() {
  return (
    <ol className="how-visual">
      {STEPS.map(({ title, body, Icon, Media }, index) => (
        <li key={title} className={`how-card how-card-${title.toLowerCase()}`} style={{ "--how-index": index } as React.CSSProperties}>
          <div className="how-card-text">
            <span className="how-card-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <IconTile icon={Icon} />
            <strong>{title}</strong>
            <span>{body}</span>
          </div>
          <div className="how-card-media" aria-hidden="true"><Media /></div>
        </li>
      ))}
    </ol>
  );
}

/** Subscription: the before/after, full bleed, with a slider handle between Before and Concept. */
export function ProHero() {
  return (
    <div className="ob-stage pro-hero">
      <SmileReveal interactive handle="arrows" comparison={SUBSCRIPTION_COMPARISON} />
    </div>
  );
}

/** Paywall: the result Pro creates, with the plan's real allowance. */
export function ProValueVisual({ compact = false }: { compact?: boolean }) {
  const monthly = SUBSCRIPTION_PRODUCTS.monthly.generationsPerPeriod;
  return (
    <div className={`ob-stage pro-stage${compact ? " compact" : ""}`} aria-hidden="true">
      <SmileReveal animate={!compact} size={compact ? "compact" : "hero"} />
      <ul className="pro-callouts">
        <li className="ob-chip float-a"><VisualiseSymbol size={15} />{monthly} generations a month</li>
        <li className="ob-chip float-b"><ComposeSymbol size={15} />Compare materials &amp; shapes</li>
        <li className="ob-chip float-c"><PresentSymbol size={15} />Consultation view &amp; reports</li>
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
          <span className="style-flow-label">{own?.length ? "Your finished cases" : "Illustrative material examples"}</span>
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
          <span className="style-engine-mark"><VisualiseSymbol size={15} />SmileCompose</span>
          <span className="style-engine-line" />
        </div>
        <figure className="style-result">
          <span className="style-flow-label">{own?.length ? "New patient design" : "Sample design"}</span>
          <img src={NEW_DESIGN} srcSet="/examples/smile-detail-v1-480.webp 480w, /examples/smile-detail-v1-960.webp 960w, /examples/smile-detail-v1-1536.webp 1536w" sizes="(min-width: 700px) 380px, 320px" alt="" draggable={false} decoding="async" />
          <figcaption><Check size={13} strokeWidth={2.2} />{own?.length ? "Your contour, texture and finish" : "Illustrative contour, texture and finish"}</figcaption>
        </figure>
      </div>
    </div>
  );
}
