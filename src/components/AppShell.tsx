import { FullscreenControl } from "./FullscreenControl";
import { ChevronLeft } from "lucide-react";
import type { Screen } from "@/lib/types";
export function AppShell({
  screen,
  onBack,
  action,
  step,
  children,
}: {
  screen: Screen;
  onBack?: () => void;
  action?: React.ReactNode;
  /** Where the clinician is in the flow. Only ever counts screens that exist. */
  step?: { current: number; total: number };
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      {screen !== "start" && <header className="app-header">
        <div className="nav-group">
          {onBack && (
            <button className="nav-back" onClick={onBack} aria-label="Back">
              <ChevronLeft size={21} strokeWidth={1.7} />
            </button>
          )}
          <div className="product-lockup">
            <span className="wordmark">Smile</span>
            <span className="brand-divider" aria-hidden="true" />
            <img className="dr-vik-mark" src="/dr-vik-logo.png" alt="Dr Vik" />
          </div>
        </div>
        {step ? (
          <div className="nav-step">
            <span>
              Step {step.current} of {step.total}
            </span>
            <span
              className="nav-step-bar"
              role="progressbar"
              aria-valuenow={step.current}
              aria-valuemin={1}
              aria-valuemax={step.total}
              aria-label={`Step ${step.current} of ${step.total}`}
            >
              <span style={{ width: `${(step.current / step.total) * 100}%` }} />
            </span>
          </div>
        ) : null}
        {action}
      </header>}
      <main>{children}</main>
      <FullscreenControl />
    </div>
  );
}
