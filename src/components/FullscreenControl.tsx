"use client";
import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { currentFullscreen, enterFullscreen, leaveFullscreen } from "@/lib/fullscreen";

export function FullscreenControl() {
  const [native, setNative] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const sync = () => setNative(Boolean(currentFullscreen(document)));
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);
  // In the Fullscreen API there is no safe-area inset on iPad, but the status
  // bar still draws over the page, so the top bars need the room explicitly.
  useEffect(() => {
    document.documentElement.classList.toggle("fullscreen-view", native || expanded);
  }, [native, expanded]);
  useEffect(() => {
    document.documentElement.classList.toggle("expanded-view", expanded);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.documentElement.classList.remove("expanded-view");
      document.documentElement.classList.remove("fullscreen-view");
      document.removeEventListener("keydown", escape);
    };
  }, [expanded]);
  async function toggle() {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      if (currentFullscreen(document)) await leaveFullscreen(document);
      else if (expanded) setExpanded(false);
      else if (!(await enterFullscreen(document.documentElement))) setExpanded(true);
    } catch {
      setMessage("Use your browser’s fullscreen control to exit.");
    } finally {
      setNative(Boolean(currentFullscreen(document)));
      setPending(false);
    }
  }
  const active = native || expanded;
  return (
    <div className="display-toolbar">
      <span className="display-status" role="status">
        {message || (expanded ? "Expanded view · browser bars may remain" : "")}
      </span>
      <button type="button" className="display-toggle" onClick={() => void toggle()}
        aria-pressed={active} disabled={pending}>
        {active ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        {native ? "Exit full screen" : expanded ? "Exit expanded view" : "Full screen"}
      </button>
    </div>
  );
}
