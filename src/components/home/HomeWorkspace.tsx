"use client";
import { RailItems, SheetClose, useSideRail } from "@/components/sideRail/SideRail";
import { CasesSymbol } from "@/components/icons/SmileIcons";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Lock, Settings } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { recentCasePages, recentCaseTreatment, type RecentCase } from "@/lib/recentCases";
import { greeting } from "@/lib/profile";
import { UserAvatar } from "@/components/profile/UserAvatar";

/**
 * The Home headline: "Good morning," above "Dr Vik." once the clinician has a
 * name, otherwise the product line. The heading takes focus on arrival.
 */
export function HomeHeadline({ headingRef }: { headingRef: React.Ref<HTMLHeadingElement> }) {
  const { displayName } = useAccount();
  const named = Boolean(displayName);
  return (
    <>
      {named && <p className="start-greeting">{greeting(null)},</p>}
      <h1 ref={headingRef} tabIndex={-1} className="splash-heading">
        {/* The space keeps the words apart where a compact layout drops the line break. */}
        {named ? <>{displayName}.</> : <>Smile design,<br />{" "}visualised.</>}
      </h1>
      <p className="splash-sub">{named ? "Let’s plan your next smile." : "Digital smile design for clinicians."}</p>
    </>
  );
}

/** The only Home route to Profile / Settings: profile photo, initials, or a settings icon. */
export function ProfileButton({ className = "" }: { className?: string }) {
  const { initials, displayName, user, avatarUrl, openSettings } = useAccount();
  const label = user || displayName ? "Profile and settings" : "Settings";
  const rail = useSideRail();
  if (rail) return (
    <RailItems order={2}>
      <button type="button" className="rail-button" onClick={() => openSettings()} aria-label={label}>
        {initials || avatarUrl ? <UserAvatar initials={initials} url={avatarUrl} size="small" className="rail-avatar" /> : <Settings size={19} strokeWidth={1.7} aria-hidden="true" />}
      </button>
    </RailItems>
  );
  return (
    <button type="button" className={`profile-button${avatarUrl ? " has-photo" : ""} ${className}`} onClick={() => openSettings()} aria-label={label}>
      {initials || avatarUrl ? <UserAvatar initials={initials} url={avatarUrl} size="small" className="profile-button-avatar" /> : <Settings size={17} strokeWidth={1.7} aria-hidden="true" />}
    </button>
  );
}

/** Covers are whole photos: a portrait face shows its smile in the lower middle, a close-up in the centre. */
function frameSmile(image: HTMLImageElement) {
  image.style.objectPosition = image.naturalHeight > image.naturalWidth * 1.15 ? "50% 60%" : "50% 50%";
}

/**
 * Recent cases stay off Home, so a patient in the chair never sees another
 * patient's photo there. A pill under Cases and Case Library opens them in a
 * panel; nothing shows until there is a case.
 */
export function RecentCases({ refreshKey, onOpen, onSeeAll }: { refreshKey: unknown; onOpen: (id: string) => void; onSeeAll: () => void }) {
  const [cases, setCases] = useState<RecentCase[]>([]);
  const [open, setOpen] = useState(false);
  const [syncIndicators, setSyncIndicators] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    const repository = getCaseRepository();
    const load = () => { void repository.listActiveLog()
      .then(list => { if (live) setCases(recentCasePages(list).flat()); })
      .catch(() => { if (live) setCases([]); });
      void repository.caseSyncIndicators().then(next => { if (live) setSyncIndicators(next); }).catch(() => {});
    };
    load(); void repository.repairThumbs().catch(() => {}); const off = repository.subscribe(load);
    return () => { live = false; off(); };
  }, [refreshKey]);
  const close = useCallback(() => setOpen(false), []);

  if (!cases.length) return null;
  return (
    <>
      <button type="button" className="splash-outline splash-recent" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Lock size={17} strokeWidth={1.8} aria-hidden="true" />
        Recent cases
        <ChevronRight className="splash-recent-arrow" size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open && createPortal(
        <RecentCasesPanel cases={cases} syncIndicators={syncIndicators} onClose={close}
          onOpen={id => { setOpen(false); onOpen(id); }} onSeeAll={() => { setOpen(false); onSeeAll(); }} />,
        document.body)}
    </>
  );
}

/** The newest cases, ready to open. Closes on ✕, a tap outside, Escape, a swipe down, or when SmileCompose leaves the screen. */
function RecentCasesPanel({ cases, syncIndicators, onOpen, onSeeAll, onClose }: {
  cases: RecentCase[];
  syncIndicators: Record<string, string>;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { closeButton.current?.focus(); }, []);
  useEffect(() => {
    // Patient photos never stay on screen once SmileCompose is out of sight.
    const hidden = () => { if (document.visibilityState === "hidden") onClose(); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", onClose);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", onClose);
      window.removeEventListener("keydown", escape);
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop recent-backdrop" role="dialog" aria-modal="true" aria-labelledby="recent-cases-title" onClick={onClose}>
      <div className="sheet recent-sheet" onClick={e => e.stopPropagation()}
        onTouchStart={e => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={e => {
          const from = swipe.current; swipe.current = null;
          if (!from) return;
          const dx = e.changedTouches[0].clientX - from.x, dy = e.changedTouches[0].clientY - from.y;
          if (dy > 90 && dy > Math.abs(dx) * 1.5) onClose();
        }}>
        <span className="recent-grab" aria-hidden="true" />
        <div className="sheet-heading">
          <h2 id="recent-cases-title">Recent cases</h2>
          <SheetClose onClose={onClose} buttonRef={closeButton} />
        </div>
        <p className="sheet-sub recent-note"><Lock size={13} strokeWidth={1.9} aria-hidden="true" />Hidden again when you close this or leave SmileCompose.</p>
        <ul className="recent-row" aria-label="Recent cases, newest first">
          {cases.map(entry => <li key={entry.id}>
            <button type="button" className="recent-card" onClick={() => onOpen(entry.id)}>
              {entry.thumb ? <img src={entry.thumb} alt="" decoding="async" onLoad={e => frameSmile(e.currentTarget)} /> : <span className="recent-card-placeholder" aria-hidden="true" />}
              <span className="recent-card-text">
                <strong>{entry.patientName || "Unnamed case"}</strong>
                {recentCaseTreatment(entry.summary) && <small className="recent-card-treatment">{recentCaseTreatment(entry.summary)}</small>}
                <small>{entry.draftOnly ? "Draft" : entry.testMode || entry.mode === "mock" ? "Demo concept" : "AI concept"} · {new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{entry.versions > 1 ? ` · ${entry.versions} versions` : ""}</small>
                {syncIndicators[entry.caseId ?? entry.id] && <small>{syncIndicators[entry.caseId ?? entry.id]}</small>}
              </span>
            </button>
          </li>)}
        </ul>
        <button type="button" className="secondary-button recent-all" onClick={onSeeAll}><CasesSymbol size={18} /> All cases</button>
      </div>
    </div>
  );
}
