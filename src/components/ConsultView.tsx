"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Sparkles, X } from "lucide-react";
import { ZoomPan } from "./ZoomPan";

export type RevealPhase = "before" | "after" | "done";

/** Milliseconds each phase holds before the next begins. */
export const REVEAL_TIMING: Record<Exclude<RevealPhase, "done">, number> = {
  before: 1600,
  after: 2000,
};

export function nextPhase(phase: RevealPhase): RevealPhase {
  return phase === "before" ? "after" : "done";
}

/**
 * The patient-facing screen. It opens on their own face, draws the proposed
 * edges over it, then brings the preview up — so they watch the change arrive
 * rather than being shown a different picture of themselves.
 */
export function ConsultView({
  original,
  preview,
  isMock,
  variants,
  onPresent,
  onClose,
}: {
  original: string;
  preview: string;
  isMock: boolean;
  variants: React.ReactNode;
  onPresent: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<RevealPhase>("before");
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase === "done") return;
    timer.current = setTimeout(
      () => setPhase((p) => nextPhase(p)),
      REVEAL_TIMING[phase],
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [phase]);

  const revealing = phase !== "done";
  // Their own face first, then the preview rising through it.
  const showPreview = !holding && (phase === "after" || phase === "done");

  function skip() {
    if (timer.current) clearTimeout(timer.current);
    setPhase("done");
  }

  return (
    <div
      className="consult"
      onPointerDown={() => !revealing && setHolding(true)}
      onPointerUp={() => setHolding(false)}
      onPointerCancel={() => setHolding(false)}
      onPointerLeave={() => setHolding(false)}
    >
      <img className="photo-backdrop" src={original} alt="" aria-hidden="true" />
      <div className="consult-frame">
        <ZoomPan className="consult-media" label="">
          <img src={original} alt="Your smile today" />
          <img
            className={`consult-layer${showPreview ? " shown" : ""}`}
            src={preview}
            alt="Smile preview"
          />
        </ZoomPan>
      </div>
      <div className="consult-vignette" aria-hidden="true" />

      <div className="consult-top">
        <div className="product-lockup product-lockup-inverse">
          <span className="wordmark">Smile</span>
          <span className="brand-divider" aria-hidden="true" />
          <img className="dr-vik-mark" src="/dr-vik-logo.png" alt="Dr Vik" />
        </div>
        <div className="consult-top-actions" onPointerDown={(e) => e.stopPropagation()}>
          {revealing ? (
            <button className="consult-close" onClick={skip}>
              Skip
            </button>
          ) : (
            <>
              <button className="consult-close" onClick={() => setPhase("before")}>
                <Play size={13} fill="currentColor" strokeWidth={1.7} /> Replay
              </button>
              <button className="consult-close" onClick={onPresent}>
                <Sparkles size={14} strokeWidth={1.7} /> Before &amp; after
              </button>
            </>
          )}
          <button className="consult-close" onClick={onClose}>
            <X size={15} /> Close
          </button>
        </div>
      </div>

      <p className={`consult-serif${revealing ? " consult-serif-quiet" : ""}`}>
        A more
        <br />
        confident you
      </p>
      {!revealing && <div className="consult-variants">{variants}</div>}

      <div className="consult-foot">
        <span className="consult-practice">Dr Vik · London</span>
        <span className="consult-hint">
          {phase === "before"
            ? "Your smile today"
            : phase === "after"
              ? "Your preview"
              : "Tap and hold to see original"}
        </span>
        <span className="consult-meta">
          {isMock ? "Demo preview" : "AI illustration"}
          <small>for discussion purposes only</small>
        </span>
      </div>
    </div>
  );
}
