"use client";
import { useEffect, useState } from "react";
import { useAccount } from "./AccountProvider";
import { PrivacyNoticeSheet } from "./PrivacyNoticeSheet";
import { acceptConsentDocuments, ConsentError, fetchConsentDocuments, type ConsentDocuments } from "@/services/account/accountApi";

/**
 * Shown once per Terms/Privacy version for a signed-in account. Unchanged
 * documents are never presented again (versions are stored server-side).
 */
export function DocumentsSheet({ onAccepted }: { onAccepted: () => void }) {
  const { getAccessToken, signOut } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState<ConsentDocuments | null>(null);
  const [review, setReview] = useState<"terms" | "privacy" | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchConsentDocuments().then(next => {
      if (active) { setDocuments(next); setLoading(false); }
    }).catch(() => {
      if (active) { setError("The current documents couldn’t be loaded. Check your connection and retry."); setLoading(false); }
    });
    return () => { active = false; };
  }, [retry]);

  function reloadDocuments() {
    setDocuments(null); setReview(null); setLoading(true); setRetry(value => value + 1);
  }

  async function accept() {
    if (!documents || busy) return;
    setBusy(true);
    setError("");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Your sign-in has expired. Sign out and sign in again to continue.");
      await acceptConsentDocuments(token, documents);
      // A sign-out/account switch while saving must not dismiss the next user's sheet.
      await getAccessToken();
      onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your acceptance couldn’t be saved. Please try again.");
      if (e instanceof ConsentError && e.code === "documents_changed") reloadDocuments();
    } finally {
      setBusy(false);
    }
  }

  return (
    <><div className="sheet-backdrop account-backdrop" role="dialog" aria-modal="true" aria-labelledby="documents-title">
      <div className="sheet account-sheet">
        <p className="eyebrow">SmileCompose account</p>
        <h2 id="documents-title">Terms and privacy</h2>
        <p className="sheet-sub">Please review the <a href="/terms.html" onClick={e => { e.preventDefault(); if (documents) setReview("terms"); }}>Terms of Service</a> and the <a href="/privacy.html" onClick={e => { e.preventDefault(); if (documents) setReview("privacy"); }}>Privacy Policy</a> for your SmileCompose account. You’ll only be asked again if they change.</p>
        <div className="account-stack">
          {documents || loading
            ? <button className="primary-button" disabled={busy || loading || !documents} onClick={() => void accept()}>{busy ? "Saving…" : loading ? "Loading documents…" : "Agree and continue"}</button>
            : <button className="primary-button" onClick={() => { setError(""); reloadDocuments(); }}>Retry loading documents</button>}
          <button className="secondary-button" disabled={busy} onClick={() => void signOut()}>Sign out</button>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
      </div>
    </div>
    {review && documents && <PrivacyNoticeSheet document={review} html={documents[review].html} onClose={() => setReview(null)} />}</>
  );
}
