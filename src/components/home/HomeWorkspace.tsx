"use client";
import { getCaseRepository } from "@/services/cases/caseRepository";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { recentCasePages, type RecentCase } from "@/lib/recentCases";
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
        {named ? <>Welcome,<br />{displayName}.</> : <>Smile design,<br />visualised.</>}
      </h1>
      <p className="splash-sub">{named ? "Ready to design your next smile?" : "Digital smile design for clinicians."}</p>
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
              {entry.thumb ? <img src={entry.thumb} alt="" loading="lazy" decoding="async" /> : <span className="recent-case-placeholder" aria-hidden="true" />}
              <span>
                <strong>{entry.patientName || "Unnamed case"}</strong>
                <small>{new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{entry.versions > 1 ? ` · ${entry.versions}` : ""}</small>
                <small>{entry.testMode || entry.mode === "mock" ? "Demo concept" : "AI concept"}</small>
                {syncIndicators[entry.caseId ?? entry.id] && <small>{syncIndicators[entry.caseId ?? entry.id]}</small>}
              </span>
            </button>
          </li>)}
        </ul>)}
      </div>
      {pages.length > 1 && <div className="recent-case-pagination">
        <span aria-live="polite">Page {page + 1} of {pages.length} · Swipe for more</span>
        <div>
          <button type="button" aria-label="Previous recent cases" disabled={page === 0} onClick={() => goToPage(page - 1)}><ChevronLeft size={17} /></button>
          <button type="button" aria-label="Next recent cases" disabled={page === pages.length - 1} onClick={() => goToPage(page + 1)}><ChevronRight size={17} /></button>
        </div>
      </div>}
    </section>
  );
}
