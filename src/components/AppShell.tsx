"use client";
import { useEffect, useRef } from "react";
import { CenteredBrandHeader } from "./ui/Surface";
import { ChevronLeft, Ellipsis } from "lucide-react";
import type { Screen } from "@/lib/types";
export function AppShell({
  screen,
  testMode = false,
  onBack,
  action,
  tools,
  step,
  children,
}: {
  screen: Screen;
  testMode?: boolean;
  onBack?: () => void;
  action?: React.ReactNode;
  /** Screen tools shown in the bar before the menu (the Studio's undo / redo). */
  tools?: React.ReactNode;
  /** Where the clinician is in the flow. Only ever counts screens that exist. */
  step?: { current: number; total: number };
  children: React.ReactNode;
}) {
  const menu=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(menu.current?.open&&!menu.current.contains(event.target as Node))menu.current.open=false;};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&menu.current?.open){menu.current.open=false;menu.current.querySelector("summary")?.focus();}};
    document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape);};
  },[screen]);
  return (
    <div className="app-shell" data-screen={screen}>
      {screen !== "start" && <CenteredBrandHeader
        className="app-header"
        inverse={screen === "preview"}
        left={<>
          {onBack && (
            <button className="nav-back" onClick={onBack} aria-label="Back">
              <ChevronLeft size={21} strokeWidth={1.7} />
            </button>
          )}
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
        </>}
        below={testMode && <span className="test-mode-pill">Test mode</span>}
        right={<>
          {tools}
          {screen === "photo" ? <>
            <div className="photo-desktop-actions">{action}</div>
            <details ref={menu} className="app-menu photo-mobile-menu">
              <summary aria-label="More options"><Ellipsis size={22} /></summary>
              {action}
            </details>
          </> : screen === "design" || screen === "preview" ? <details ref={menu} className="app-menu" key={screen}>
            <summary aria-label="More options"><Ellipsis size={22} /></summary>
            {action}
          </details> : action}
        </>}
      />}
      <main>{children}</main>
    </div>
  );
}
