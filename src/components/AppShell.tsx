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
  if (screen === "start") return <div className="app-shell">{children}</div>;
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="nav-group">
          {onBack && (
            <button className="nav-back" onClick={onBack} aria-label="Back">
              <ChevronLeft size={21} strokeWidth={1.7} />
            </button>
          )}
          <span className="wordmark">Smile</span>
        </div>
        {action}
      </header>
      <main>{children}</main>
    </div>
  );
}
