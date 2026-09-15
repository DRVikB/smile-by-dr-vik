"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
const STEPS = [
  "Analysing smile",
  "Adjusting tooth shape",
  "Balancing shade",
  "Finishing preview",
];
export function GenerationState({ onCancel }: { onCancel: () => void }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 3500),
      setTimeout(() => setStage(2), 9000),
      setTimeout(() => setStage(3), 16000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div className="generation-overlay">
      <div className="generation-card" role="status" aria-live="polite">
        <div className="generation-icon" aria-hidden="true" />
        <h3>Creating your smile…</h3>
        <div className="gen-steps">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`gen-step ${i < stage ? "done" : i === stage ? "active" : ""}`}
            >
              <span className="gen-mark" aria-hidden="true">
                {i < stage ? (
                  <Check size={14} strokeWidth={2} />
                ) : i === stage ? (
                  "●"
                ) : (
                  "○"
                )}
              </span>
              {label}
            </div>
          ))}
        </div>
        <p className="gen-note">
          Keeping your unique features and natural look.
        </p>
        <button className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
