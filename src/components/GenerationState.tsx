"use client";

import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "./Brand";
import { SMILECOMPOSE } from "@/lib/brand";
import { Check, X } from "lucide-react";

const LIVE_STEPS = [
  "Analysing your smile…",
  "Composing the design…",
  "Creating your visualisation…",
  "Finishing the details…",
];

const DEMO_STEPS = [
  "Opening the demo",
  "Preparing smile examples",
  "Aligning comparisons",
  "Finalising preview",
];

export function GenerationState({
  onCancel,
  testMode,
  photo,
}: {
  onCancel: () => void;
  testMode: boolean;
  photo: string;
}) {
  const [stage, setStage] = useState(0);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButton.current?.focus();
    const timings = testMode ? [350, 800, 1300] : [2500, 6500, 12000];
    const timers = timings.map((delay, index) =>
      window.setTimeout(() => setStage(index + 1), delay),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [testMode]);

  const steps = testMode ? DEMO_STEPS : LIVE_STEPS;

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
      <header className="generation-splash-header">
        <BrandLockup inverse />
        <div className="generation-splash-actions">
          <button ref={cancelButton} type="button" onClick={onCancel}>
            <X size={17} strokeWidth={1.8} />
            <span>Cancel</span>
          </button>
        </div>
      </header>

      <div className="generation-splash-content">
        <div className="generation-splash-copy">
          <img className="sc-composing-symbol" src="/brand/smilecompose-symbol.svg" alt="" aria-hidden="true" />
          <span className="generation-splash-eyebrow">Digital smile design</span>
          <h2 id="generation-title">Composing<br />your smile…</h2>
          <p>
            {testMode
              ? "Creating your visualisation. Demo examples use no AI credits."
              : "Creating your visualisation from your photograph and design choices."}
          </p>

          <ol className="generation-splash-steps">
            {steps.map((label, index) => (
              <li
                key={label}
                className={index < stage ? "is-done" : index === stage ? "is-current" : ""}
              >
                <span className="generation-splash-step-mark" aria-hidden="true">
                  {index < stage ? <Check size={16} strokeWidth={1.8} /> : null}
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ol>

          <div
            className="generation-splash-progress"
            role="progressbar"
            aria-label="Preview preparation stage"
            aria-valuemin={1}
            aria-valuemax={4}
            aria-valuenow={stage + 1}
            aria-valuetext={`Stage ${stage + 1} of 4: ${steps[stage]}`}
          >
            <span className="generation-splash-progress-track">
              <span style={{ width: `${[14, 38, 65, 87][stage]}%` }} />
            </span>
            <span className="generation-splash-progress-count">{stage + 1} / 4</span>
          </div>
        </div>
      </div>

      <footer className="generation-splash-footer">
        <span>{SMILECOMPOSE.supportingLine}</span>
      </footer>
    </section>
  );
}
