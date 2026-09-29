"use client";

import { useState } from "react";
import { AI_CONSENT_VERSION, type AiProcessingConsent } from "@/lib/aiConsent";

interface AiProcessingConsentDialogProps {
  photoFingerprint: string;
  onCancel: () => void;
  onConfirm: (consent: AiProcessingConsent) => void;
}

export function AiProcessingConsentDialog({ photoFingerprint, onCancel, onConfirm }: AiProcessingConsentDialogProps) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="sheet-backdrop ai-consent-backdrop" role="presentation">
      <section className="sheet ai-consent-sheet" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title" aria-describedby="ai-consent-description">
        <p className="eyebrow">Privacy before generation</p>
        <h2 id="ai-consent-title">Before using AI with this patient</h2>
        <div id="ai-consent-description" className="ai-consent-copy">
          <p>This image will be securely processed by SmileCompose’s AI service to generate the requested visualisation. The selected photo, any reference photo, and your design choices and notes are sent over an encrypted connection. If “Use my Case Library” is on, a few matching photos of your own finished cases (other patients) from your Case Library are also sent, as style references only. The case reference, your account details and billing information are not sent for AI processing.</p>
          <p>SmileCompose does not store the photo or result on its servers and never uses them to train AI models. The AI processing used by SmileCompose does not use this content to train or improve AI models; it may be retained briefly to detect misuse. Your case and generated result are stored on this device.</p>
          <p>This is an illustrative concept, not a guaranteed clinical outcome. You remain responsible for explaining this processing and establishing the appropriate lawful basis with the patient.</p>
        </div>
        <label className="ai-consent-check">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} />
          <span>I have explained this AI processing to the patient and confirmed that the practice has permission and a valid lawful basis to proceed, including for any reference photos used.</span>
        </label>
        <p className="control-hint">Only this clinician confirmation and a photo fingerprint are saved with the case on this device. They are not sent for AI processing.</p>
        <div className="ai-consent-actions">
          <button className="primary-button" type="button" disabled={!confirmed} onClick={() => onConfirm({ version: AI_CONSENT_VERSION, photoFingerprint, confirmedAt: Date.now() })}>Continue</button>
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </section>
    </div>
  );
}
