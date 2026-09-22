"use client";
import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { shareFile } from "@/lib/share";

/**
 * The smile analysis sheet as its own image, built on the device from facial
 * landmarks — no AI call. Shown only when the clinician turns it on.
 */
export function SmileAnalysisPanel({
  before,
  after,
  isDemo,
  patientName,
}: {
  before: string;
  after: string;
  isDemo: boolean;
  patientName?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    let made = "";
    setUrl(null);
    setError("");
    import("@/lib/face/analysisImage")
      .then(({ composeAnalysis }) => composeAnalysis(before, after, { isDemo }))
      .then((b) => {
        if (!live) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setUrl(made);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setError(
          e instanceof Error && e.message.startsWith("Smile analysis")
            ? e.message
            : "The smile analysis couldn’t be built on this device.",
        );
      });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [before, after, isDemo]);

  async function share() {
    if (!blob) return;
    setNote("");
    const stem = patientName?.trim() ? `-${patientName.trim().replace(/[^\p{L}\p{N}]+/gu, "-")}` : "";
    try {
      const outcome = await shareFile(blob, `smile-analysis${stem}.jpg`, "Smile analysis");
      if (outcome === "downloaded") setNote("Saved to your downloads.");
    } catch {
      setError("That couldn’t be shared.");
    }
  }

  return (
    <section className="analysis-panel" aria-label="Smile analysis">
      <div className="analysis-head">
        <h2>Smile analysis</h2>
        <button className="text-button" onClick={() => void share()} disabled={!blob}>
          <Share2 size={15} strokeWidth={1.6} /> Save or send
        </button>
      </div>
      {url ? (
        <img className="analysis-image" src={url} alt="Smile analysis with facial reference lines" />
      ) : (
        <p className="analysis-status" role="status">
          {error || "Reading the face…"}
        </p>
      )}
      {note && <p className="analysis-status" role="status">{note}</p>}
    </section>
  );
}
