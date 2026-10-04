"use client";

import { useEffect, useRef, useState } from "react";
import { SmileMark } from "./Brand";
import { CenteredBrandHeader } from "./ui/Surface";
import { FocusedPhoto } from "./ui/FocusedPhoto";
import { SMILECOMPOSE } from "@/lib/brand";
import type { FocusSource } from "@/lib/photoFocus";
import { Check, X } from "lucide-react";
import { DEMO_STEP_DELAYS, GENERATION_STEP_DELAYS, visibleGenerationStep } from "@/lib/generation/progress";
import type { GenerationStage } from "@/services/ai/generationDiagnostics";

const LIVE_STEPS = ["Preparing your photograph…", "Creating your concept…", "Aligning and protecting…", "Checking your preview…"];
const DEMO_STEPS = ["Opening the demo…", "Preparing smile examples…", "Aligning comparisons…", "Finalising preview…"];

/**
 * Where the smile sits on each screen shape. Tall screens put it between the
 * title and the steps, filling the screen. Wide screens put the whole face to
 * the right of the text column; where that means stopping short of the left
 * edge, the blurred copy carries the photograph on behind the text.
 */
function composingLayout(width: number, height: number) {
  if (height >= width) return { anchor: { x: 0.5, y: 0.53 }, maxZoom: 1.3 };
  return { anchor: { x: 0.68, y: 0.5 }, maxCrop: height < 500 ? 0.5 : 0.42 };
}

export function GenerationState({
  onCancel,
  testMode,
  photo,
  focus,
  stage = "preflight",
}: {
  onCancel: () => void;
  testMode: boolean;
  photo: string;
  /** What the photo carries about where the smile is, to keep it in view. */
  focus?: FocusSource;
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
      <FocusedPhoto className="generation-splash-image" src={photo} focus={focus} layout={composingLayout} />
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
          <div className="generation-splash-intro">
          <SmileMark className="sc-composing-symbol" onDark />
          <span className="generation-splash-eyebrow">Digital smile design</span>
          <h2 id="generation-title">Composing<br />your smile…</h2>
          <p>
            {testMode
              ? "Creating your visualisation. Demo examples use no AI credits."
              : "Creating your visualisation from your photograph and design choices."}
          </p>
          </div>

          <div className="generation-splash-status">
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
      </div>

      <footer className="generation-splash-footer">
        <span>{SMILECOMPOSE.supportingLine}</span>
      </footer>
    </section>
  );
}
