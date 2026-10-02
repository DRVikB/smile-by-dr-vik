"use client";

import { useEffect, useRef, useState } from "react";
import { SmileMark } from "./Brand";
import { CenteredBrandHeader } from "./ui/Surface";
import { SMILECOMPOSE } from "@/lib/brand";
import { X } from "lucide-react";

export function GenerationState({
  onCancel,
  testMode,
  photo,
}: {
  onCancel: () => void;
  testMode: boolean;
  photo: string;
}) {
  const [takingLonger, setTakingLonger] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButton.current?.focus();
    const timer = window.setTimeout(() => setTakingLonger(true), 20000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section
      className="generation-splash"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-title"
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          cancelButton.current?.focus();
        }
      }}
    >
      <img className="photo-backdrop generation-backdrop" src={photo} alt="" aria-hidden="true" />
      <img className="generation-splash-image" src={photo} alt="" aria-hidden="true" />
      <CenteredBrandHeader
        className="generation-splash-header"
        inverse
        right={
          <div className="generation-splash-actions">
            <button ref={cancelButton} type="button" onClick={onCancel} aria-label="Cancel generation">
              <X size={17} strokeWidth={1.8} />
              <span>Cancel</span>
            </button>
          </div>
        }
      />

      <div className="generation-splash-content">
        <div className="generation-splash-copy">
          <SmileMark className="sc-composing-symbol" onDark />
          <span className="generation-splash-eyebrow">Digital smile design</span>
          <h2 id="generation-title">Composing<br />your smile…</h2>
          <p>
            {testMode
              ? "Creating your visualisation. Demo examples use no AI credits."
              : "Creating your visualisation from your photograph and design choices."}
          </p>

          <p role="status" aria-live="polite">{takingLonger
            ? "Still preparing your concept. Keep SmileCompose open, or cancel to return to your design."
            : testMode ? "Preparing the sample preview…" : "Preparing your concept… Keep SmileCompose open."}</p>
        </div>
      </div>

      <footer className="generation-splash-footer">
        <span>{SMILECOMPOSE.supportingLine}</span>
      </footer>
    </section>
  );
}
