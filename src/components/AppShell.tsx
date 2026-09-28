import { BrandLockup } from "./Brand";
import { ChevronLeft, Ellipsis } from "lucide-react";
import type { Screen } from "@/lib/types";
export function AppShell({
  screen,
  testMode = false,
  onBack,
  action,
  step,
  children,
}: {
  screen: Screen;
  testMode?: boolean;
  onBack?: () => void;
  action?: React.ReactNode;
  /** Where the clinician is in the flow. Only ever counts screens that exist. */
  step?: { current: number; total: number };
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell" data-screen={screen}>
      {screen !== "start" && <header className="app-header">
        <div className="nav-group">
          {onBack && (
            <button className="nav-back" onClick={onBack} aria-label="Back">
              <ChevronLeft size={21} strokeWidth={1.7} />
            </button>
          )}
          <BrandLockup inverse={screen === "design" || screen === "preview"} />
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
        {testMode && <span className="test-mode-pill">Test mode</span>}
        {screen === "photo" ? <>
          <div className="photo-desktop-actions">{action}</div>
          <details className="app-menu photo-mobile-menu">
            <summary aria-label="More options"><Ellipsis size={22} /></summary>
            {action}
          </details>
        </> : screen === "design" || screen === "preview" ? <details className="app-menu" key={screen}>
          <summary aria-label="More options"><Ellipsis size={22} /></summary>
          {action}
        </details> : action}
      </header>}
      <main>{children}</main>
    </div>
  );
}
