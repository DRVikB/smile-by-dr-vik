"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, ChevronLeft, FolderOpen, Info, Palette, ShieldCheck, UserRound } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { CasesSection, ManageCasesPage } from "./CasesSettings";
import { DataPrivacyPage, ManageDataPage, PrivacySection } from "./PrivacySettings";
import { AccountSection, EditProfilePage, ProfileHeader, SignInMethodsPage, SignOutSection } from "./ProfileSettings";
import { PlanCard, PlanDetailsPage } from "./SubscriptionSettings";
import { AboutPage, HelpAboutSection, HelpPage } from "./SupportSettings";
import { AppearanceSection } from "./AppearanceSettings";
import {
  Avatar, ConfirmDialog, SettingsContext, useMediaQuery, useOnline,
  type ConfirmRequest, type SettingsNav, type SettingsPage, type SettingsSection,
} from "./settingsParts";

export type { SettingsSection } from "./settingsParts";

const SECTIONS: { key: SettingsSection; label: string; Icon: typeof UserRound }[] = [
  { key: "profile", label: "Account", Icon: UserRound },
  { key: "subscription", label: "Plan & Usage", Icon: BadgeCheck },
  { key: "cases", label: "Cases & Storage", Icon: FolderOpen },
  { key: "appearance", label: "Preferences", Icon: Palette },
  { key: "privacy", label: "Privacy & Data", Icon: ShieldCheck },
  { key: "about", label: "Help & About", Icon: Info },
];

const PAGE_TITLES = {
  editProfile: "Edit Profile", signIn: "Sign-in Methods", plan: "Plan & Usage", dataPrivacy: "Data & Privacy",
  manageData: "Manage Data", help: "Help", about: "About SmileCompose",
} as const;
const CASE_TITLES = { active: "Manage Cases", archived: "Archived Cases", deleted: "Recently Deleted" } as const;

function pageTitle(page: SettingsPage): string {
  return page.kind === "cases" ? CASE_TITLES[page.filter] : PAGE_TITLES[page.kind];
}

function SectionContent({ section, withHeader }: { section: SettingsSection; withHeader: boolean }) {
  switch (section) {
    case "profile": return <>{withHeader && <ProfileHeader />}<AccountSection />{withHeader && <SignOutSection />}</>;
    case "subscription": return <PlanCard />;
    case "cases": return <CasesSection />;
    case "appearance": return <AppearanceSection />;
    case "privacy": return <PrivacySection />;
    case "about": return <HelpAboutSection />;
  }
}

/** The main list answers who you are, your plan and usage, where your cases are, and key preferences; detail sits one level down. */
const STACK_ORDER: SettingsSection[] = ["subscription", "profile", "cases", "appearance", "privacy", "about"];

/**
 * Settings: Account, Plan & Usage, Cases & Storage (patient cases and the Case
 * Library), Preferences, Privacy & Data, and Help & About.
 * iPhone (narrow): an account summary, then grouped sections with pushed sub-pages.
 * iPad / desktop (≥ 768 px): a sidebar of sections and a detail pane.
 */
export function SettingsView({ initialSection, onClose, onSectionChange }: {
  initialSection?: SettingsSection;
  onClose: () => void;
  onSectionChange?: (section: SettingsSection) => void;
}) {
  const account = useAccount();
  const wide = useMediaQuery("(min-width: 768px)");
  const online = useOnline();
  const [section, setSection] = useState<SettingsSection>(initialSection ?? "profile");
  const [page, setPage] = useState<SettingsPage | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [message, setMessage] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4500);
    return () => window.clearTimeout(timer);
  }, [message]);

  // Narrow layout: bring the requested section into view.
  useEffect(() => {
    if (wide || page || !initialSection || initialSection === "profile") return;
    document.getElementById(`settings-${initialSection}`)?.scrollIntoView({ block: "start" });
  }, [wide, page, initialSection]);

  const select = useCallback((next: SettingsSection) => {
    setSection(next);
    setPage(null);
    onSectionChange?.(next);
  }, [onSectionChange]);

  const back = useCallback(() => setPage(null), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirm) setConfirm(null);
      else if (page) setPage(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, page, onClose]);

  const nav = useMemo<SettingsNav>(() => ({
    openPage: next => { setPage(next); scroller.current?.scrollTo({ top: 0 }); },
    confirm: setConfirm,
    say: setMessage,
    online,
  }), [online]);

  const pageBody = page && (
    page.kind === "editProfile" ? <EditProfilePage onDone={back} />
      : page.kind === "cases" ? <ManageCasesPage key={page.filter} initialFilter={page.filter} />
        : page.kind === "signIn" ? <SignInMethodsPage />
          : page.kind === "plan" ? <PlanDetailsPage />
            : page.kind === "dataPrivacy" ? <DataPrivacyPage />
              : page.kind === "manageData" ? <ManageDataPage />
                : page.kind === "about" ? <AboutPage />
                  : <HelpPage />
  );
  const detailTitle = page ? pageTitle(page) : SECTIONS.find(s => s.key === section)?.label ?? "Settings";
  const planLine = !account.user ? (account.configured ? "Not signed in" : "On this device") : account.hasProAccess ? "SmileCompose Pro" : "Free";

  return (
    <SettingsContext.Provider value={nav}>
      <div className="settings-backdrop" onClick={onClose}>
        <div className={`settings-panel ${wide ? "split" : "stack"}`} role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e => e.stopPropagation()}>
          {wide ? (
            <>
              <aside className="settings-sidebar">
                <h2 id="settings-title" ref={heading} tabIndex={-1} className="settings-sidebar-title">Settings</h2>
                <button type="button" className="settings-sidebar-profile" onClick={() => select("profile")} aria-label="Profile">
                  <Avatar initials={account.initials} url={account.avatarUrl} size="small" />
                  <span>
                    <strong>{account.displayName ?? (account.user ? "Your account" : "SmileCompose")}</strong>
                    <small>{planLine}</small>
                  </span>
                </button>
                <nav aria-label="Settings sections">
                  <ul className="settings-sidebar-list">
                    {SECTIONS.map(({ key, label, Icon }) => (
                      <li key={key}>
                        <button type="button" aria-current={section === key && !page ? "page" : section === key ? "true" : undefined} onClick={() => select(key)}>
                          <Icon size={18} strokeWidth={1.6} aria-hidden="true" />{label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              </aside>
              <section className="settings-detail" aria-label={detailTitle}>
                <header className="settings-detail-head">
                  {page ? <button type="button" className="settings-back" onClick={back} aria-label="Back"><ChevronLeft size={20} strokeWidth={1.8} /></button> : <span className="settings-back-spacer" />}
                  <h3 className="settings-detail-title">{detailTitle}</h3>
                  <button type="button" className="settings-done" onClick={onClose}>Done</button>
                </header>
                <div className="settings-detail-body" ref={scroller}>
                  {pageBody ?? <SectionContent section={section} withHeader />}
                </div>
              </section>
            </>
          ) : (
            <>
              <header className="settings-top">
                {page ? <button type="button" className="settings-back" onClick={back} aria-label="Back to Settings"><ChevronLeft size={20} strokeWidth={1.8} />Settings</button> : <span className="settings-back-spacer" />}
                <h2 id="settings-title" ref={heading} tabIndex={-1}>{page ? pageTitle(page) : "Settings"}</h2>
                <button type="button" className="settings-done" onClick={onClose}>Done</button>
              </header>
              <div className="settings-scroll" ref={scroller}>
                {pageBody ?? (
                  <>
                    <ProfileHeader />
                    {STACK_ORDER.map(key => <SectionContent key={key} section={key} withHeader={false} />)}
                    <SignOutSection />
                  </>
                )}
              </div>
            </>
          )}
          {message && <p className="settings-toast" role="status">{message}</p>}
          {confirm && <ConfirmDialog request={confirm} onDone={result => { setConfirm(null); if (result) setMessage(result); }} />}
        </div>
      </div>
    </SettingsContext.Provider>
  );
}
