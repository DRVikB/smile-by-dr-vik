"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Check, ChevronLeft, FolderOpen, Info, LayoutDashboard, Palette, PlayCircle, ShieldCheck, UserRound } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { CasesSection, ManageCasesPage } from "./CasesSettings";
import { DataPrivacyPage, PermissionsPage, ManageDataPage, PrivacySection } from "./PrivacySettings";
import { AccountSection, EditProfilePage, ProfileHeader, SettingsCredit, SignInMethodsPage, SignOutSection } from "./ProfileSettings";
import { PlanCard, PlanDetailsPage } from "./SubscriptionSettings";
import { AboutPage, HelpAboutSection, HelpPage } from "./SupportSettings";
import { AppearanceSection } from "./AppearanceSettings";
import { AdminView, useAdmin } from "@/components/portal/AdminView";
import { replayOnboarding } from "@/lib/onboarding";
import { RailButton, RailItems, SideRailLayer, useSideRail } from "@/components/sideRail/SideRail";
import {
  Avatar, ConfirmDialog, Group, Row, SettingsContext, useMediaQuery, useOnline, useSettingsNav,
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
/** Shown only to SmileCompose administrators. */
const ADMIN_SECTION = { key: "admin" as const, label: "Admin", Icon: LayoutDashboard };

const PAGE_TITLES = {
  editProfile: "Edit Profile", signIn: "Sign-in Methods", plan: "Plan & Usage", dataPrivacy: "Data & Privacy", permissions: "App Permissions",
  manageData: "Manage Data", help: "Help", about: "About SmileCompose", admin: "Admin",
} as const;
const CASE_TITLES = { active: "Manage Cases", archived: "Archived Cases", deleted: "Recently Deleted" } as const;

function pageTitle(page: SettingsPage): string {
  return page.kind === "cases" ? CASE_TITLES[page.filter] : PAGE_TITLES[page.kind];
}

/**
 * Rows only administrators see. On iPhone the dashboard opens as its own page; on wider screens it sits
 * below these rows, so only the tools are listed.
 */
function AdminSection({ withDashboard }: { withDashboard: boolean }) {
  const nav = useSettingsNav();
  const account = useAccount();
  const { unseen } = useAdmin();
  return (
    <Group id="settings-admin" title={withDashboard ? "Admin" : "Admin tools"}>
      {withDashboard && <Row icon={<LayoutDashboard size={18} strokeWidth={1.6} />} label="Admin dashboard" detail="Usage, accounts, tester codes and enquiries"
        value={unseen ? `${unseen} new` : undefined} onClick={() => nav.openPage({ kind: "admin" })} />}
      <Row icon={<PlayCircle size={18} strokeWidth={1.6} />} label="Replay onboarding" detail="See the welcome screens as a new user does. Your account isn’t changed."
        onClick={() => { account.closeSheet(); replayOnboarding(); }} />
    </Group>
  );
}

function SectionContent({ section, withHeader }: { section: SettingsSection; withHeader: boolean }) {
  switch (section) {
    case "profile": return <>{withHeader && <ProfileHeader />}<AccountSection />{withHeader && <><SignOutSection /><SettingsCredit /></>}</>;
    case "subscription": return <PlanCard />;
    case "cases": return <CasesSection />;
    case "appearance": return <AppearanceSection detailed={withHeader} />;
    case "privacy": return <PrivacySection />;
    case "about": return <HelpAboutSection />;
    case "admin": return withHeader ? <><AdminSection withDashboard={false} /><AdminView embedded /></> : <AdminSection withDashboard />;
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
  const admin = useAdmin();
  // iPhone Duo: Back and Done sit in the side bar; the bar across the top keeps the title.
  const rail = useSideRail();
  const wide = useMediaQuery("(min-width: 600px)");
  const online = useOnline();
  const [chosen, setSection] = useState<SettingsSection>(initialSection ?? "profile");
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // The Admin section exists only for administrators; anyone else lands on Account.
  const section = chosen === "admin" && !admin.isAdmin ? "profile" : chosen;
  const sections = admin.isAdmin ? [...SECTIONS, ADMIN_SECTION] : SECTIONS;
  const stackOrder = admin.isAdmin ? [...STACK_ORDER, ADMIN_SECTION.key] : STACK_ORDER;
  const [page, setPageNow] = useState<SettingsPage | null>(null);
  // Pages slide in from the side they lead to (iOS push and pop); the list comes back where it was left.
  const [motion, setMotion] = useState<"push" | "pop" | "swap" | null>(null);
  const listScroll = useRef(0);
  const shownPage = useRef(page);
  shownPage.current = page;
  const setPage = useCallback((next: SettingsPage | null) => {
    const current = shownPage.current;
    if (next && !current) listScroll.current = scroller.current?.scrollTop ?? 0;
    setMotion(next && !current ? "push" : !next && current ? "pop" : "swap");
    setPageNow(next);
  }, []);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [message, setMessage] = useState("");

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
    setPageNow(null);
    setMotion("swap");
    onSectionChange?.(next);
  }, [onSectionChange]);
  useLayoutEffect(() => {
    if (motion === "pop" && !page && scroller.current) scroller.current.scrollTop = listScroll.current;
  }, [motion, page]);

  const back = useCallback(() => setPage(null), [setPage]);

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
  }), [online, setPage]);

  const pageBody = page && (
    page.kind === "editProfile" ? <EditProfilePage onDone={back} />
      : page.kind === "cases" ? <ManageCasesPage key={page.filter} initialFilter={page.filter} />
        : page.kind === "signIn" ? <SignInMethodsPage />
          : page.kind === "plan" ? <PlanDetailsPage />
            : page.kind === "dataPrivacy" ? <DataPrivacyPage />
              : page.kind === "permissions" ? <PermissionsPage />
              : page.kind === "manageData" ? <ManageDataPage />
                : page.kind === "about" ? <AboutPage />
                  : page.kind === "admin" ? (admin.isAdmin ? <AdminView embedded /> : null)
                    : <HelpPage />
  );
  const detailTitle = page ? pageTitle(page) : sections.find(s => s.key === section)?.label ?? "Settings";
  const pageKey = page ? `${page.kind}:${"filter" in page ? page.filter : ""}` : `list:${wide ? section : ""}`;
  const showsAdmin = page ? page.kind === "admin" : wide && section === "admin";
  const planLine = !account.user ? (account.configured ? "Not signed in" : "On this device") : account.hasProAccess ? "SmileCompose Pro" : "Free";

  return (
    <SettingsContext.Provider value={nav}>
      <SideRailLayer>
      {page && <RailItems order={0}><RailButton label={wide ? "Back" : "Back to Settings"} onClick={back}><ChevronLeft size={22} strokeWidth={1.8} /></RailButton></RailItems>}
      <RailItems order={1}><RailButton label="Done" prominent onClick={onClose}><Check size={21} strokeWidth={2} /></RailButton></RailItems>
      <div className="settings-backdrop" onClick={onClose}>
        <div className={`settings-panel ${wide ? "split" : "stack"}${showsAdmin ? " admin" : ""}`} role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e => e.stopPropagation()}>
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
                    {sections.map(({ key, label, Icon }) => (
                      <li key={key}>
                        <button type="button" aria-current={section === key && !page ? "page" : section === key ? "true" : undefined} onClick={() => select(key)}>
                          <Icon size={18} strokeWidth={1.6} aria-hidden="true" />{label}
                          {key === "admin" && admin.unseen > 0 && <span className="settings-sidebar-count" aria-label={`${admin.unseen} new`}>{admin.unseen}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              </aside>
              <section className="settings-detail" aria-label={detailTitle}>
                <header className="settings-detail-head">
                  {!rail && (page ? <button type="button" className="settings-back" onClick={back} aria-label="Back"><ChevronLeft size={20} strokeWidth={1.8} /></button> : <span className="settings-back-spacer" />)}
                  <h3 className="settings-detail-title">{detailTitle}</h3>
                  {!rail && <button type="button" className="settings-done" onClick={onClose}>Done</button>}
                </header>
                <div className="settings-detail-body" ref={scroller}>
                  <div key={pageKey} className={`settings-page${motion ? ` is-${motion}` : ""}`}>
                    {pageBody ?? <SectionContent section={section} withHeader />}
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              <header className="settings-top">
                {!rail && (page ? <button type="button" className="settings-back" onClick={back} aria-label="Back to Settings"><ChevronLeft size={20} strokeWidth={1.8} />Settings</button> : <span className="settings-back-spacer" />)}
                <h2 id="settings-title" ref={heading} tabIndex={-1}>{page ? pageTitle(page) : "Settings"}</h2>
                {!rail && <button type="button" className="settings-done" onClick={onClose}>Done</button>}
              </header>
              <div className="settings-scroll" ref={scroller}>
                <div key={pageKey} className={`settings-page${motion ? ` is-${motion}` : ""}`}>
                  {pageBody ?? (
                    <>
                      <ProfileHeader />
                      {stackOrder.map(key => <SectionContent key={key} section={key} withHeader={false} />)}
                      <SignOutSection />
                      <SettingsCredit />
                    </>
                  )}
                </div>
              </div>
            </>
          )}
          {message && <p className="settings-toast" role="status">{message}</p>}
          {confirm && <ConfirmDialog request={confirm} onDone={result => { setConfirm(null); if (result) setMessage(result); }} />}
        </div>
      </div>
      </SideRailLayer>
    </SettingsContext.Provider>
  );
}
