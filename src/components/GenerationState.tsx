"use client";

import { SideRailLayer, useSideRail } from "@/components/sideRail/SideRail";
import { useEffect, useRef, useState } from "react";
import { ComposingMark } from "./ComposingMark";
import { CenteredBrandHeader } from "./ui/Surface";
import { FocusedPhoto } from "./ui/FocusedPhoto";
import type { FocusSource } from "@/lib/photoFocus";
import { X } from "lucide-react";
import { DEMO_STEP_DELAYS, GENERATION_STEP_DELAYS, visibleGenerationStep } from "@/lib/generation/progress";
import type { GenerationStage } from "@/services/ai/generationDiagnostics";

const LIVE_STEPS = ["Preparing your photograph…", "Creating your concept…", "Aligning and protecting…", "Checking your preview…"];
const DEMO_STEPS = ["Opening the demo…", "Preparing smile examples…", "Aligning comparisons…", "Finalising preview…"];
/** How often the line under the heading changes. */
const NOTE_INTERVAL = 3600;

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

/** iPhone Duo: everything sits on the screen's centre line in both poses, so the face does too, with the smile between the two text blocks. */
function centredLayout(width: number, height: number) {
  return { anchor: { x: 0.5, y: height >= width ? 0.53 : 0.64 }, maxZoom: 1.3 };
}

export function GenerationState({
  onCancel,
  testMode,
  photo,
  focus,
  stage = "preflight",
  design,
  leaving = false,
}: {
  onCancel: () => void;
  testMode: boolean;
  photo: string;
  /** What the photo carries about where the smile is, to keep it in view. */
  focus?: FocusSource;
  stage?: GenerationStage;
  /** The design being made, in a few words ("Composite bonding · 8 upper teeth"). */
  design?: string;
  /** The smile is made: one last light crosses the mark and the screen clears over the result beneath. */
  leaving?: boolean;
}) {
  const [takingLonger, setTakingLonger] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState(0);
  const centred = useSideRail();
  const line = useRef<HTMLSpanElement>(null);
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
  // The line under the heading: what is being made, what is protected, and what it is for.
  const notes = [
    testMode ? "Creating your visualisation. Demo examples use no AI credits." : "Creating your visualisation from your photograph and design choices.",
    ...(testMode ? [] : ["The face around the smile stays exactly as photographed."]),
    ...(design ? [design] : []),
    "A visual guide for your conversation with the patient.",
  ];
  useEffect(() => {
    const timer = window.setInterval(() => setNote(n => n + 1), NOTE_INTERVAL);
    return () => window.clearInterval(timer);
  }, []);

  // The fine progress line never sits still: within a stage it keeps easing towards the next
  // quarter without reaching it, and only a stage that has really begun moves it past.
  useEffect(() => {
    const bar = line.current;
    if (!bar) return;
    if (leaving) { bar.style.width = "100%"; return; }
    const base = current * 25;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { bar.style.width = `${base + 25}%`; return; }
    const since = performance.now();
    const draw = () => { bar.style.width = `${(base + 23 * (1 - Math.exp(-(performance.now() - since) / 2600))).toFixed(1)}%`; };
    draw();
    const timer = window.setInterval(draw, 250);
    return () => window.clearInterval(timer);
  }, [current, leaving]);

  return (
    <section
      className={`generation-splash${leaving ? " is-leaving" : ""}`}
      role="dialog"
      aria-modal={!leaving}
      aria-hidden={leaving || undefined}
      inert={leaving || undefined}
      aria-labelledby="generation-title"
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          cancelButton.current?.focus();
        }
      }}
    >
      <SideRailLayer />
      <img className="photo-backdrop generation-backdrop" src={photo} alt="" aria-hidden="true" />
      <FocusedPhoto className="generation-splash-image" src={photo} focus={focus} layout={centred ? centredLayout : composingLayout} />
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
            <ComposingMark step={leaving ? steps.length : current} />
            {/* The space keeps the words apart where a wide layout drops the line break. */}
            <h2 id="generation-title">Composing<br />{" "}your smile…</h2>
            <p key={note} className="composing-note">{notes[note % notes.length]}</p>
          </div>

          <div className="generation-splash-status">
            <div className="composing-progress">
              <div className="composing-dots" aria-hidden="true">
                {steps.map((label, index) => <span key={label} className={leaving || index < current ? "is-past" : index === current ? "is-current" : ""} />)}
              </div>
              <p key={leaving ? "ready" : current} className="composing-stage" aria-hidden="true">{leaving ? "Your smile is ready" : steps[current]}</p>
              <span className="composing-line" aria-hidden="true"><span ref={line} /></span>
              <span className="sr-only" role="status" aria-live="polite">{`Stage ${current + 1} of 4: ${steps[current]}`}</span>
            </div>
            {takingLonger && <p role="status">Still working. Keep SmileCompose open, or cancel to return to your design.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
