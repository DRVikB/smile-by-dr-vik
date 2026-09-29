"use client";
import { useEffect, useState } from "react";
import { Share2, X } from "lucide-react";
import { shareFile } from "@/lib/share";

/**
 * The smile analysis sheet as its own image, built on the device from facial
 * landmarks — no AI call. Opened from the result screen's Smile analysis button.
 */
export function SmileAnalysisPanel({
  before,
  after,
  isDemo,
  patientName,
  onClose,
}: {
  before: string;
  after: string;
  isDemo: boolean;
  patientName?: string;
  onClose?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let live = true;
    let made = "";
    setUrl(null);
    setBlob(null);
    setError("");
    setNote("");
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
    if (!blob || sharing) return;
    setSharing(true);
    setNote("");
    setError("");
    const stem = patientName?.trim() ? `-${patientName.trim().replace(/[^\p{L}\p{N}]+/gu, "-")}` : "";
    try {
      const outcome = await shareFile(blob, `smilecompose-analysis${stem}.jpg`, "Smile analysis");
      if (outcome === "downloaded") setNote("Saved to your downloads.");
    } catch {
      setError("That couldn’t be shared.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="analysis-panel" aria-label="Smile analysis">
      <div className="analysis-head">
        <h2>Smile analysis</h2>
        {onClose && <button type="button" className="icon-button" aria-label="Close smile analysis" onClick={onClose}><X size={16} /></button>}
      </div>
      <p className="analysis-sub">Relative facial reference lines, built on this device from the photograph. A communication aid, not a measurement.</p>
      {url ? (
        <img className="analysis-image" src={url} alt="Smile analysis with facial reference lines" />
      ) : (
        <p className="analysis-status" role="status">
          {error || "Reading the face…"}
        </p>
      )}
      {url && error && <p className="analysis-status" role="alert">{error}</p>}
      {note && <p className="analysis-status" role="status">{note}</p>}
      <button className="secondary-button analysis-share" onClick={() => void share()} disabled={!blob || sharing}>
        <Share2 size={16} strokeWidth={1.6} /> {sharing ? "Preparing…" : "Save or send"}
      </button>
    </section>
  );
}
