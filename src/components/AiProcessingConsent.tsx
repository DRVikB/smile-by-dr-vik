"use client";

import { SideRailLayer } from "@/components/sideRail/SideRail";
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
    <div className="sheet-backdrop ai-consent-backdrop" role="presentation"><SideRailLayer />
      <section className="sheet ai-consent-sheet" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title" aria-describedby="ai-consent-description">
        <p className="eyebrow">Privacy before generation</p>
        <h2 id="ai-consent-title">Before using AI with this patient</h2>
        <div id="ai-consent-description" className="ai-consent-copy">
          <p>To create the visualisation, SmileCompose sends the selected photo, any reference photo, and your design choices and notes over an encrypted connection to a <strong>third-party AI image-generation provider</strong> that SmileCompose uses. If “Use my Case Library” is on, a few matching photos of your own finished cases (other patients) from your Case Library are also sent, as style references only. The case reference, your account details and billing information are not sent for AI processing.</p>
          <p>The provider’s terms don’t allow it to use this content to train or improve its AI models; it may keep requests for a limited period to detect misuse. SmileCompose never uses patient photos to train AI, and its generation service doesn’t keep the photo or the result. The case and result are saved on this device and, when you’re signed in, synced privately to your SmileCompose account.</p>
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
