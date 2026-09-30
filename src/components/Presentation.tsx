"use client";
import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { composePresentation, presentationPdf } from "@/lib/presentation";
import { shareFile } from "@/lib/share";

/**
 * The branded before/after, full screen, for showing in the room. With
 * `onShare`, sending goes through Share with patient (Smile Preview or
 * Consultation Report); without it, this artwork itself is shared.
 */
export function Presentation({
  before,
  after,
  patientName,
  isDemo,
  onShare,
  onClose,
}: {
  before: string;
  after: string;
  patientName?: string;
  isDemo: boolean;
  onShare?: () => void;
  onClose: () => void;
}) {
  const [artwork, setArtwork] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"share" | "pdf" | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    let url = "";
    composePresentation(before, after, { patientName, isDemo })
      .then((blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setArtwork(url);
      })
      .catch(() =>
        live && setError("The presentation couldn’t be built on this device."),
      );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [before, after, patientName, isDemo]);

  const fileStem = `smilecompose-preview${patientName?.trim() ? `-${patientName.trim().replace(/[^\p{L}\p{N}]+/gu, "-")}` : ""}`;

  async function share() {
    if (busy) return;
    setBusy("share");
    setError("");
    setNote("");
    try {
      const blob = await composePresentation(before, after, { patientName, isDemo });
      const outcome = await shareFile(
        blob,
        `${fileStem}.jpg`,
        "Your SmileCompose preview",
      );
      if (outcome === "downloaded")
        setNote("This browser can’t open the share sheet, so it downloaded instead.");
    } catch {
      setError("That couldn’t be shared.");
    } finally {
      setBusy(null);
    }
  }

  async function savePdf() {
    if (busy) return;
    setBusy("pdf");
    setError("");
    setNote("");
    try {
      const blob = await presentationPdf(before, after, { patientName, isDemo });
      const outcome = await shareFile(
        blob,
        `${fileStem}.pdf`,
        "Your SmileCompose preview",
      );
      if (outcome === "downloaded") setNote("Saved to your downloads.");
    } catch {
      setError("The PDF couldn’t be made.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="present" role="dialog" aria-modal="true" aria-label="Before and after presentation">
      {artwork ? (
        <img className="present-art" src={artwork} alt="Before and after smile presentation" />
      ) : (
        <p className="present-status" role="status">
          {error || "Preparing the presentation…"}
        </p>
      )}
      <div className="present-actions">
        {onShare ? (
          <button className="present-button" onClick={onShare}>
            <Share2 size={16} strokeWidth={1.7} />
            Share with patient
          </button>
        ) : <>
          <button className="present-button" onClick={() => void share()} disabled={!artwork || busy !== null}>
            <Share2 size={16} strokeWidth={1.7} />
            {busy === "share" ? "Preparing…" : "Send to patient"}
          </button>
          <button className="present-button" onClick={() => void savePdf()} disabled={!artwork || busy !== null}>
            <Download size={16} strokeWidth={1.7} />
            {busy === "pdf" ? "Making PDF…" : "PDF"}
          </button>
        </>}
        <button className="present-button present-close" onClick={onClose}>
          <X size={16} strokeWidth={1.7} />
          Close
        </button>
      </div>
      {(note || (error && artwork)) && (
        <p className="present-note" role="status">
          {error || note}
        </p>
      )}
    </div>
  );
}
