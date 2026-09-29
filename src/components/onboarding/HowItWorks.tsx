"use client";
import { CaptureSymbol, ComposeSymbol, IconTile, ShareSymbol, VisualiseSymbol } from "@/components/icons/SmileIcons";

export const HOW_IT_WORKS = [
  { title: "Capture", body: "Add a patient smile photo", Icon: CaptureSymbol },
  { title: "Compose", body: "Choose treatment, shape and shade", Icon: ComposeSymbol },
  { title: "Visualise", body: "Create and compare the smile", Icon: VisualiseSymbol },
  { title: "Share", body: "Save or share your preferred design", Icon: ShareSymbol },
] as const;

/** The four-step workflow, used in onboarding and in Settings › Help. */
export function HowItWorksSteps() {
  return (
    <ol className="how-steps">
      {HOW_IT_WORKS.map(({ title, body, Icon }, index) => (
        <li key={title} className="how-step" style={{ "--how-index": index } as React.CSSProperties}>
          <IconTile icon={Icon} className="how-step-icon" />
          <span className="how-step-text">
            <strong>{title}</strong>
            <span>{body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
