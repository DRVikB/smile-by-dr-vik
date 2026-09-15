import { Check, LockKeyhole } from "lucide-react";
import type { Screen } from "@/lib/types";
export function AppShell({
  screen,
  children,
}: {
  screen: Screen;
  children: React.ReactNode;
}) {
  const step = { start: 0, design: 1, preview: 2 }[screen];
  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="wordmark" aria-label="Smile home">
          SMILE<span className="wordmark-period">.</span>
        </a>
        <nav aria-label="Your progress">
          <ol className="steps">
            {["Photo", "Design", "Preview"].map((label, i) => (
              <li
                key={label}
                className={i === step ? "current" : i < step ? "complete" : ""}
                aria-current={i === step ? "step" : undefined}
              >
                <span className="step-number">
                  {i < step ? <Check size={12} /> : i + 1}
                </span>
                <span>{label}</span>
                {i < 2 && <span className="step-line" />}
              </li>
            ))}
          </ol>
        </nav>
        <div className="header-note">A new perspective.</div>
      </header>
      <main>{children}</main>
      <footer className="app-footer">
        <span>Made for your smile.</span>
        <span className="privacy-note">
          <LockKeyhole size={12} /> Case stored on this device
        </span>
        <span>SMILE · VISUALISATION</span>
      </footer>
    </div>
  );
}
