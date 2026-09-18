"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { buildChangeOutline } from "@/lib/overlay";

/**
 * The patient's own photograph with the proposed result's edges drawn over it,
 * so they can see what moves without the picture changing underneath them.
 */
export function OutlineOverlay({
  original,
  preview,
  isMock,
}: {
  original: string;
  preview: string;
  isMock: boolean;
}) {
  const [outline, setOutline] = useState<string | null>(null);
  const [state, setState] = useState<"working" | "ready" | "none" | "error">(
    "working",
  );
  const [shown, setShown] = useState(true);

  useEffect(() => {
    let live = true;
    setState("working");
    setOutline(null);
    buildChangeOutline(original, preview)
      .then((result) => {
        if (!live) return;
        setOutline(result);
        setState(result ? "ready" : "none");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [original, preview]);

  return (
    <div className="comparison outline-view">
      <img className="compare-image" src={original} alt="Current smile" />
      {outline && shown && (
        <img
          className="compare-image outline-line"
          src={outline}
          alt="Outline of the proposed change over the current smile"
        />
      )}
      <span className="compare-label original-label">
        {shown ? "Current smile · proposed outline" : "Current smile"}
      </span>
      {state === "ready" && (
        <button
          type="button"
          className="outline-toggle"
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? "Hide outline" : "Show outline"}
        </button>
      )}
      {state === "working" && (
        <span className="outline-status" role="status">
          Tracing the proposed edges…
        </span>
      )}
      {state === "none" && (
        <span className="outline-status" role="status">
          <X size={13} /> This preview barely changes the photograph, so there
          is nothing to outline.
        </span>
      )}
      {state === "error" && (
        <span className="outline-status" role="status">
          The outline couldn’t be drawn on this device.
        </span>
      )}
      {isMock && (
        <div className="demo-image-label">DEMO · ORIGINAL PHOTO UNCHANGED</div>
      )}
    </div>
  );
}
