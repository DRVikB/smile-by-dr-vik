"use client";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/account/AccountProvider";
import { PRIVACY_CONTACT_EMAIL } from "@/config/legal";
import { isNativeApp } from "@/native/platform";
import { accessToken } from "@/services/auth/authService";
import { fetchAccountExport } from "@/services/account/accountApi";
import { openManageSubscriptions } from "@/services/purchases/purchases";
import { Group, Row, formatBytes, useSettingsNav } from "./settingsParts";

function DeleteAccountBody({ options, showSubscriptionNotice, onManage }: {
  options: { deleteLocal: boolean };
  showSubscriptionNotice: boolean;
  onManage: () => void;
}) {
  const [deleteLocal, setDeleteLocal] = useState(options.deleteLocal);
  return (
    <>
      <p className="control-hint">This permanently deletes your account, profile photo, Case Library (every reference photo and its tags), subscription status, generation history and sign-in details from SmileCompose, and signs you out everywhere. It can’t be undone.</p>
      <p className="control-hint"><strong>Deleting your account doesn’t cancel your App Store subscription.</strong>{" "}
        {showSubscriptionNotice
          ? <>Cancel it first in <button type="button" className="inline-link" onClick={onManage}>Manage Subscription</button> to stop future charges.</>
          : "If you subscribed, cancel it in your Apple ID subscription settings to stop future charges."}
      </p>
      <label className="ai-consent-check">
        <input type="checkbox" checked={deleteLocal} onChange={e => { setDeleteLocal(e.target.checked); options.deleteLocal = e.target.checked; }} />
        <span>Also delete all cases, photos and results stored on this device.</span>
      </label>
    </>
  );
}

export function PrivacySection() {
  const account = useAccount();
  const { configured, user, status, hasProAccess, customerInfo } = account;
  const nav = useSettingsNav();
  const [storageUsed, setStorageUsed] = useState<number | null>(null);

  useEffect(() => {
    void import("@/lib/dataExport").then(m => m.deviceStorageUsed()).then(setStorageUsed);
  }, []);

  async function exportData(): Promise<string> {
    const token = user ? await accessToken() : null;
    const accountData = token ? await fetchAccountExport(token) : null;
    const { buildDataExport } = await import("@/lib/dataExport");
    const data = await buildDataExport(accountData);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const { saveFile } = await import("@/lib/share");
    const outcome = await saveFile(blob, `smilecompose-data-export-${new Date().toISOString().slice(0, 10)}.json`, "SmileCompose data export");
    return outcome === "cancelled" ? "" : "Your data export is ready. It contains patient photographs; store it securely.";
  }

  function deleteAccount() {
    const options = { deleteLocal: true };
    nav.confirm({
      title: "Delete your SmileCompose account?",
      body: <DeleteAccountBody options={options} onManage={() => void openManageSubscriptions(customerInfo)}
        showSubscriptionNotice={isNativeApp() && hasProAccess && status?.source === "subscription"} />,
      confirmLabel: "Delete account permanently",
      destructive: true,
      onConfirm: () => account.deleteAccount({ deleteLocalData: options.deleteLocal }),
    });
  }

  return (
    <Group id="settings-privacy" title="Privacy & data"
      footer={PRIVACY_CONTACT_EMAIL
        ? <>Privacy questions or requests: <a className="inline-link" href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a></>
        : "Privacy contact: to be published before release."}>
      <p className="settings-note">Patient cases, photos and results are stored only on this device and are excluded from iCloud backups. A patient photo leaves the device only when you choose Generate Smile and confirm, to be processed by SmileCompose’s AI service. Finished cases you add to your Case Library are stored privately in your SmileCompose account, and a few matching ones are sent with a design as style references when “Use my Case Library” is on. SmileCompose does not use patient data to train AI models.</p>
      <Row label="Storage used on this device" value={storageUsed === null ? "…" : formatBytes(storageUsed)} />
      <Row label="Privacy Policy" onClick={() => account.openPrivacy("privacy")} />
      <Row label="Data Processing Information" onClick={() => account.openPrivacy("processing")} />
      <Row label="Export My Data" onClick={() => void exportData().then(message => message && nav.say(message)).catch(() => nav.say("Your data couldn’t be exported. Please try again."))} />
      <Row label="Delete all cases" destructive onClick={() => nav.confirm({
        title: "Delete all cases?",
        body: <p className="control-hint">Permanently removes the current case, every saved case and everything in Recently Deleted — patient photos, generated visualisations, case references and notes — from this device. Your reference library, account and subscription are kept. This can’t be undone.</p>,
        confirmLabel: "Delete all cases",
        destructive: true,
        onConfirm: async () => { await (await import("@/lib/localData")).deleteAllCases(); window.location.reload(); },
      })} />
      <Row label="Delete all data on this device" destructive onClick={() => nav.confirm({
        title: "Delete all data on this device?",
        body: <p className="control-hint">Removes every case, patient photo, generated result and preference stored by SmileCompose on this device, including any library cases kept on this device. Your account (including your Case Library and profile photo) and subscription are not affected. This can’t be undone.</p>,
        confirmLabel: "Delete device data",
        destructive: true,
        onConfirm: async () => { await (await import("@/lib/localData")).deleteAllLocalData(); window.location.reload(); },
      })} />
      {configured && user && <Row label="Delete Account" destructive onClick={deleteAccount} />}
    </Group>
  );
}
