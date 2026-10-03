"use client";

import { useEffect, useRef, useState } from "react";
import { SmileMark } from "./Brand";
import { CenteredBrandHeader } from "./ui/Surface";
import { SMILECOMPOSE } from "@/lib/brand";
import { Check, X } from "lucide-react";
import { DEMO_STEP_DELAYS, GENERATION_STEP_DELAYS, visibleGenerationStep } from "@/lib/generation/progress";
import type { GenerationStage } from "@/services/ai/generationDiagnostics";

const LIVE_STEPS = ["Preparing your photograph…", "Creating your concept…", "Aligning and protecting…", "Checking your preview…"];
const DEMO_STEPS = ["Opening the demo…", "Preparing smile examples…", "Aligning comparisons…", "Finalising preview…"];

export function GenerationState({
  onCancel,
  testMode,
  photo,
  stage = "preflight",
}: {
  onCancel: () => void;
  testMode: boolean;
  photo: string;
  stage?: GenerationStage;
}) {
  const [takingLonger, setTakingLonger] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButton.current?.focus();
    const timer = window.setTimeout(() => setTakingLonger(true), 20000);
    const delays = testMode ? DEMO_STEP_DELAYS : GENERATION_STEP_DELAYS;
    const timers = delays.map(delay => window.setTimeout(() => setElapsed(delay), delay));
    return () => { window.clearTimeout(timer); timers.forEach(window.clearTimeout); };
  }, [testMode]);

  const current = visibleGenerationStep(elapsed, stage, testMode);
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

          <ol className="generation-splash-steps" aria-label="Concept preparation">
            {steps.map((label, index) => (
              <li key={label} className={index < current ? "is-done" : index === current ? "is-current" : ""}
                aria-current={index === current ? "step" : undefined}>
                <span className="generation-splash-step-mark" aria-hidden="true">
                  {index < current ? <Check size={16} strokeWidth={1.8} /> : null}
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
          <div className="generation-splash-progress">
            <span className="generation-splash-progress-track" aria-hidden="true">
              <span style={{ width: `${(current + 1) * 25}%` }} />
            </span>
            <span className="generation-splash-progress-count" role="status" aria-live="polite"
              aria-label={`Stage ${current + 1} of 4: ${steps[current]}`}>{current + 1} / 4</span>
          </div>
          {takingLonger && <p role="status">Still working. Keep SmileCompose open, or cancel to return to your design.</p>}
        </div>
      </div>

      <footer className="generation-splash-footer">
        <span>{SMILECOMPOSE.supportingLine}</span>
      </footer>
    </section>
  );
}
