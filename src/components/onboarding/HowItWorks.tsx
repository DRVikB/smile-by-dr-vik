"use client";
import { Camera, Share2, SlidersHorizontal, Sparkles } from "lucide-react";

export const HOW_IT_WORKS = [
  { title: "Capture", body: "Add a patient smile photo", Icon: Camera },
  { title: "Compose", body: "Choose treatment, shape and shade", Icon: SlidersHorizontal },
  { title: "Visualise", body: "Create and compare the smile", Icon: Sparkles },
  { title: "Share", body: "Save or share your preferred design", Icon: Share2 },
] as const;

/** The four-step workflow, used in onboarding and in Settings › Help. */
export function HowItWorksSteps() {
  return (
    <ol className="how-steps">
      {HOW_IT_WORKS.map(({ title, body, Icon }, index) => (
        <li key={title} className="how-step" style={{ "--how-index": index } as React.CSSProperties}>
          <span className="how-step-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.6} /></span>
          <span className="how-step-text">
            <strong>{title}</strong>
            <span>{body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
