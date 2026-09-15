"use client";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
export function GenerationState({ onCancel }: { onCancel: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(2, s + 1)), 2200);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="generation-overlay">
      <div className="generation-card" role="status" aria-live="polite">
        <div className="generation-icon">
          <Sparkles size={23} strokeWidth={1.4} />
        </div>
        <h3>Imagining your smile</h3>
        <p>
          {
            [
              "Preparing your photograph…",
              "Considering your selections…",
              "Creating your preview…",
            ][step]
          }
        </p>
        <div className="loading-track">
          <span />
        </div>
        <button className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
