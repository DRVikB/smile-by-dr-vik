"use client";
import { useState } from "react";
import { DOCUMENT_VERSIONS } from "@/config/legal";
import { useAccount } from "./AccountProvider";
import { PrivacyLink, TermsLink } from "./LegalLinks";

/**
 * Shown once per Terms/Privacy version for a signed-in account. Unchanged
 * documents are never presented again (versions are stored server-side).
 */
export function DocumentsSheet({ onAccepted }: { onAccepted: () => void }) {
  const { recordConsent, signOut } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setError("");
    try {
      await recordConsent({ type: "terms", version: DOCUMENT_VERSIONS.terms }, { strict: true });
      await recordConsent({ type: "privacy", version: DOCUMENT_VERSIONS.privacy }, { strict: true });
      onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your acceptance couldn’t be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop account-backdrop" role="dialog" aria-modal="true" aria-labelledby="documents-title">
      <div className="sheet account-sheet">
        <p className="eyebrow">SmileCompose account</p>
        <h2 id="documents-title">Terms and privacy</h2>
        <p className="sheet-sub">Please review the <TermsLink /> and the <PrivacyLink /> for your SmileCompose account. You’ll only be asked again if they change.</p>
        <div className="account-stack">
          <button className="primary-button" disabled={busy} onClick={() => void accept()}>{busy ? "Saving…" : "Agree and continue"}</button>
          <button className="secondary-button" disabled={busy} onClick={() => void signOut()}>Sign out</button>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
      </div>
    </div>
  );
}
