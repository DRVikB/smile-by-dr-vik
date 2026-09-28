"use client";
import { useEffect, useState } from "react";
import { ChevronRight, Settings } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import type { CaseLogEntry } from "@/lib/types";
import { greeting } from "@/lib/profile";
import { UserAvatar } from "@/components/profile/UserAvatar";

/** "Good morning, Dr Vik" — only once the user has an account or a chosen name. */
export function HomeGreeting() {
  const { user, displayName } = useAccount();
  if (!user && !displayName) return null;
  return <p className="start-greeting">{greeting(displayName)}</p>;
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

/** The three most recent active cases on this device. */
export function RecentCases({ refreshKey, onOpen, onSeeAll }: { refreshKey: unknown; onOpen: (id: string) => void; onSeeAll: () => void }) {
  const [entries, setEntries] = useState<CaseLogEntry[]>([]);
  useEffect(() => {
    let live = true;
    void import("@/lib/caseLog")
      .then(log => log.listActiveLog())
      .then(list => { if (live) setEntries(list.slice(0, 3)); })
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
                <small>{new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
