"use client";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, MoreHorizontal, Settings } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { recentCasePages, recentCaseTreatment, type RecentCase } from "@/lib/recentCases";
import { greeting } from "@/lib/profile";
import { UserAvatar } from "@/components/profile/UserAvatar";

/**
 * The Home headline: "Welcome, Dr Vik." once the clinician has a name,
 * otherwise the product line. The heading takes focus on arrival.
 */
export function HomeHeadline({ headingRef }: { headingRef: React.Ref<HTMLHeadingElement> }) {
  const { displayName } = useAccount();
  const named = Boolean(displayName);
  return (
    <>
      {named && <p className="start-greeting">{greeting(null)}</p>}
      <h1 ref={headingRef} tabIndex={-1} className="splash-heading">
        {/* The space keeps the words apart where a compact layout drops the line break. */}
        {named ? <>Welcome,<br />{" "}{displayName}.</> : <>Smile design,<br />{" "}visualised.</>}
      </h1>
      <p className="splash-sub">{named ? "Let’s plan your next smile." : "Digital smile design for clinicians."}</p>
    </>
  );
}

/** The only Home route to Profile / Settings: profile photo, initials, or a settings icon. */
export function ProfileButton({ className = "" }: { className?: string }) {
  const { initials, displayName, user, avatarUrl, openSettings } = useAccount();
  const label = user || displayName ? "Profile and settings" : "Settings";
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

/** Swipe through all local cases, three covers at a time. */
export function RecentCases({ refreshKey, onOpen, onSeeAll }: { refreshKey: unknown; onOpen: (id: string) => void; onSeeAll: () => void }) {
  const [pages, setPages] = useState<RecentCase[][]>([]);
  const [page, setPage] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const caseOrder = useRef("");
  const [syncIndicators, setSyncIndicators] = useState<Record<string, string>>({});
  function goToPage(index: number) {
    const target = scroller.current?.children.item(index) as HTMLElement | null;
    if (target) scroller.current?.scrollTo({ left: target.offsetLeft, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  useEffect(() => {
    let live = true;
    const repository = getCaseRepository();
    const load = () => { void repository.listActiveLog()
      .then(list => {
        if (live) {
          const next = recentCasePages(list);
          const order = next.flat().map(e => e.id).join(",");
          setPages(next);
          if (caseOrder.current !== order) {
            caseOrder.current = order;
            setPage(0);
            scroller.current?.scrollTo({ left: 0, behavior: "instant" });
          }
        }
      })
      .catch(() => { if (live) setPages([]); });
      void repository.caseSyncIndicators().then(next => { if (live) setSyncIndicators(next); }).catch(() => {});
    };
    load(); const off = repository.subscribe(load);
    return () => { live = false; off(); };
  }, [refreshKey]);

  if (!pages.length) return null;
  return (
    <section className="recent-cases" aria-labelledby="recent-cases-title">
      <div className="recent-cases-head">
        <h2 id="recent-cases-title">Recent Cases</h2>
        <button type="button" className="recent-cases-all" onClick={onSeeAll}>See all <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" /></button>
      </div>
      <div ref={scroller} className="recent-case-pages" role="region" aria-label="Recent case pages" tabIndex={0}
        onScroll={e => {
          const box = e.currentTarget;
          const children = [...box.children] as HTMLElement[];
          const nearest = children.reduce((best, child, i) => Math.abs(child.offsetLeft - box.scrollLeft) < Math.abs(children[best].offsetLeft - box.scrollLeft) ? i : best, 0);
          setPage(nearest);
        }}
        onKeyDown={e => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            goToPage(Math.max(0, Math.min(pages.length - 1, page + (e.key === "ArrowRight" ? 1 : -1))));
          }
        }}>
        {pages.map((entries, i) => <ul className="recent-case-page" key={entries[0].id} aria-label={`Page ${i + 1} of ${pages.length}`}>
          {entries.map(entry => <li key={entry.id}>
            <button type="button" className="recent-case" onClick={() => onOpen(entry.id)} onFocus={() => goToPage(i)}>
              {entry.thumb ? <img src={entry.thumb} alt="" loading="lazy" decoding="async" onLoad={e => frameSmile(e.currentTarget)} /> : <span className="recent-case-placeholder" aria-hidden="true" />}
              <span className="recent-case-text">
                {/* The whole card opens the case, where its options are. */}
                <span className="recent-case-title"><strong>{entry.patientName || "Unnamed case"}</strong><MoreHorizontal size={18} strokeWidth={1.8} aria-hidden="true" /></span>
                {recentCaseTreatment(entry.summary) && <small className="recent-case-treatment">{recentCaseTreatment(entry.summary)}</small>}
                <small>{entry.draftOnly ? "Draft" : entry.testMode || entry.mode === "mock" ? "Demo concept" : "AI concept"} · {new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{entry.versions > 1 ? ` · ${entry.versions} versions` : ""}</small>
                {syncIndicators[entry.caseId ?? entry.id] && <small>{syncIndicators[entry.caseId ?? entry.id]}</small>}
              </span>
            </button>
          </li>)}
        </ul>)}
      </div>
      {pages.length > 1 && <div className="recent-case-pagination">
        <span className="sr-only" aria-live="polite">Page {page + 1} of {pages.length}</span>
        {pages.map((entries, i) => <button key={entries[0].id} type="button" className="recent-case-dot"
          aria-label={`Recent cases, page ${i + 1} of ${pages.length}`} aria-current={i === page ? "true" : undefined} onClick={() => goToPage(i)} />)}
      </div>}
    </section>
  );
}
