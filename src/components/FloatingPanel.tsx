"use client";
import { useEffect, useId, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

/** Controls can be tucked away without leaving the patient's photograph. */
export function FloatingPanel({ title, subtitle, children, className = "", desktopOpen = false, defaultOpen = false, open: controlledOpen, onOpenChange }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  desktopOpen?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? localOpen;
  const id = useId();
  useEffect(() => {
    if (!desktopOpen || controlledOpen !== undefined) return;
    const desktop = window.matchMedia("(min-width: 960px) and (orientation: landscape) and (hover: hover) and (pointer: fine)");
    const update = () => setLocalOpen(desktop.matches || defaultOpen);
    update();
    desktop.addEventListener("change", update);
    return () => desktop.removeEventListener("change", update);
  }, [desktopOpen, defaultOpen, controlledOpen]);
  return <aside className={`floating-panel ${className} ${open ? "is-open" : ""} ${desktopOpen ? "desktop-open" : ""}`}>
    <button type="button" className="floating-panel-toggle" aria-expanded={open} aria-controls={id} onClick={() => { setLocalOpen(!open); onOpenChange?.(!open); }}>
      <SlidersHorizontal size={17} strokeWidth={1.5} />
      <span><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
      <ChevronDown size={17} className="panel-chevron" />
    </button>
    <div id={id} className="floating-panel-body">{children}</div>
  </aside>;
}
