"use client";
import { X } from "lucide-react";
import { legalPath } from "@/config/accounts";

export type LegalDocument = "privacy" | "terms" | "processing";

/** The bundled legal pages (generated /privacy and /terms), readable offline in the app. */
export function PrivacyNoticeSheet({ document = "privacy", html, onClose }: { document?: LegalDocument; html?: string; onClose: () => void }) {
  const title = document === "terms" ? "Terms of Service" : document === "processing" ? "Data processing" : "Privacy Policy";
  // "processing" opens the privacy policy at its patient-data section.
  const src = document === "terms" ? legalPath("terms") : `${legalPath("privacy")}${document === "processing" ? "#patient-data" : ""}`;
  return (
    <div className="sheet-backdrop account-backdrop privacy-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="sheet privacy-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <iframe className="privacy-frame" src={html ? undefined : src} srcDoc={html} sandbox="allow-popups" title={`SmileCompose ${title}`} />
      </div>
    </div>
  );
}
