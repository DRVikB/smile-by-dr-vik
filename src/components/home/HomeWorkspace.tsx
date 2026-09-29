"use client";
import { useEffect, useState } from "react";
import { ChevronRight, Settings } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import type { CaseLogEntry } from "@/lib/types";
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

/** The three most recently updated patient cases on this device (a favourite version is the cover). */
export function RecentCases({ refreshKey, onOpen, onSeeAll }: { refreshKey: unknown; onOpen: (id: string) => void; onSeeAll: () => void }) {
  const [entries, setEntries] = useState<(CaseLogEntry & { versions: number })[]>([]);
  useEffect(() => {
    let live = true;
    void import("@/lib/caseLog")
      .then(log => log.listActiveLog())
      .then(list => {
        const cases = new Map<string, CaseLogEntry[]>();
        for (const e of list) cases.set(e.caseId ?? e.id, [...(cases.get(e.caseId ?? e.id) ?? []), e]);
        const recent = [...cases.values()]
          .map(group => {
            const newest = group[0]; // listActiveLog is newest first
            const cover = group.find(e => e.favourite) ?? newest;
            return { ...cover, createdAt: newest.createdAt, patientName: group.find(e => e.patientName)?.patientName ?? "", versions: group.length };
          })
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 3);
        if (live) setEntries(recent);
      })
      .catch(() => { if (live) setEntries([]); });
    return () => { live = false; };
  }, [refreshKey]);

  if (!entries.length) return null;
  return (
    <section className="recent-cases" aria-labelledby="recent-cases-title">
      <div className="recent-cases-head">
        <h2 id="recent-cases-title">Recent Cases</h2>
        <button type="button" className="recent-cases-all" onClick={onSeeAll}>See all <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" /></button>
      </div>
      <ul>
        {entries.map(entry => (
          <li key={entry.id}>
            <button type="button" className="recent-case" onClick={() => onOpen(entry.id)}>
              <img src={entry.thumb} alt="" />
              <span>
                <strong>{entry.patientName || "Unnamed case"}</strong>
                <small>{new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{entry.versions > 1 ? ` · ${entry.versions}` : ""}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
