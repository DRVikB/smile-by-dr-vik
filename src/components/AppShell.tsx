import { FullscreenControl } from "./FullscreenControl";
import { ChevronLeft } from "lucide-react";
import type { Screen } from "@/lib/types";
export function AppShell({
  screen,
  onBack,
  action,
  children,
}: {
  screen: Screen;
  onBack?: () => void;
  action?: React.ReactNode;
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
        {action}
      </header>}
      <main>{children}</main>
      <FullscreenControl />
    </div>
  );
}
