"use client";
import { useEffect, useState } from "react";
import { CircleHelp, FileText, Info, Mail, MessageCircleWarning } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { LEGAL_LINKS } from "@/config/accounts";
import { RECENTLY_DELETED_DAYS } from "@/config/cases";
import { HELP_URL, SUPPORT_EMAIL } from "@/config/support";
import { appInfo, problemReportUrl, versionLabel, type AppInfo } from "@/lib/appInfo";
import { isNativeApp } from "@/native/platform";
import { HowItWorksSteps } from "@/components/onboarding/HowItWorks";
import { Group, Row, useSettingsNav } from "./settingsParts";

function openExternal(url: string) {
  if (isNativeApp() || url.startsWith("mailto:")) window.location.assign(url);
  else window.open(url, "_blank", "noopener");
}

function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => { void appInfo().then(setInfo); }, []);
  return info;
}

/**
 * Help & About. Report a Problem and Contact Support appear only once a support
 * address is configured, rather than as unavailable rows.
 */
export function HelpAboutSection() {
  const account = useAccount();
  const nav = useSettingsNav();
  const info = useAppInfo();
  return (
    <Group id="settings-about" title="Help & About"
      footer={SUPPORT_EMAIL ? "Problem reports include the app version, platform and OS version only — never patient photos or case details." : undefined}>
      <Row icon={<CircleHelp size={17} strokeWidth={1.6} />} label="Help" onClick={() => (HELP_URL ? openExternal(HELP_URL) : nav.openPage({ kind: "help" }))} />
      {SUPPORT_EMAIL && <Row icon={<MessageCircleWarning size={17} strokeWidth={1.6} />} label="Report a Problem" disabled={!info} onClick={() => info && openExternal(problemReportUrl(SUPPORT_EMAIL, info))} />}
      {SUPPORT_EMAIL && <Row icon={<Mail size={17} strokeWidth={1.6} />} label="Contact Support" onClick={() => openExternal(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("SmileCompose support")}`)} />}
      <Row icon={<Info size={17} strokeWidth={1.6} />} label="About SmileCompose" onClick={() => nav.openPage({ kind: "about" })} />
      <Row icon={<FileText size={17} strokeWidth={1.6} />} label="Privacy Policy" onClick={() => account.openPrivacy("privacy")} />
      <Row icon={<FileText size={17} strokeWidth={1.6} />} label="Terms of Service" onClick={() => account.openPrivacy("terms")} />
    </Group>
  );
}

/** Settings › About SmileCompose. */
export function AboutPage() {
  const info = useAppInfo();
  return (
    <Group>
      <div className="settings-about">
        <p className="settings-about-name">SmileCompose</p>
        <p className="settings-about-tagline">Smile design, visualised.</p>
        <p className="settings-about-meta">Version {versionLabel(info)}</p>
        {process.env.NEXT_PUBLIC_DISTRIBUTION === "internal-testflight" && <p className="settings-about-meta">Internal TestFlight build · legal pages are drafts</p>}
        <p className="settings-about-meta">Designed by Dr Vik</p>
      </div>
      <Row label="Apple Licensed Application EULA" onClick={() => openExternal(LEGAL_LINKS.appleEula)} />
    </Group>
  );
}

/** Built-in help (used when no help centre URL is configured). */
export function HelpPage() {
  return (
    <div className="settings-help">
      <Group title="How SmileCompose works">
        <div className="settings-help-steps"><HowItWorksSteps /></div>
      </Group>
      <Group title="Questions">
        <Row label="Where are my cases stored?" detail="Cases save locally first and sync privately to your signed-in account. Cached cases can reopen offline; AI generation needs a connection. Unassigned older cases require explicit import." />
        <Row label="How are generations counted?" detail="Each completed smile visualisation uses one generation from your plan. A generation that fails isn’t counted." />
        <Row label="What is test mode?" detail="A demonstration with sample images that uses no generations and no account." />
        <Row label="Can I undo deleting a case?" detail={`Yes, for ${RECENTLY_DELETED_DAYS} days: open Settings › Cases & Storage › Manage Cases › Recently Deleted.`} />
      </Group>
    </div>
  );
}
