"use client";
import { useEffect, useState } from "react";
import { Share2, X } from "lucide-react";
import { shareFile } from "@/lib/share";

/**
 * Records the reveal video on the device, then lets the clinician watch it
 * before sending. Sending is its own tap: the share sheet needs a fresh tap,
 * and a few seconds of recording would otherwise use that up.
 */
export function RevealVideoSheet({
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
  onClose: () => void;
}) {
  const [video, setVideo] = useState<{ blob: Blob; url: string; extension: string } | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    let url = "";
    (async () => {
      const [{ recordReveal }, { detectFace }] = await Promise.all([
        import("@/lib/revealVideo"),
        import("@/lib/face/landmarks"),
      ]);
      const [pts, size] = await Promise.all([
        detectFace(before),
        new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = reject;
          img.src = before;
        }),
      ]);
      const focus = pts
        ? { x: (pts[61][0] + pts[291][0]) / 2 / size.w, y: (pts[61][1] + pts[291][1]) / 2 / size.h }
        : undefined;
      const { blob, extension } = await recordReveal(before, after, { isDemo, focus });
      if (!live) return;
      url = URL.createObjectURL(blob);
      setVideo({ blob, url, extension });
    })().catch((e: unknown) => {
      if (live) setError(e instanceof Error ? e.message : "The video couldn’t be made on this device.");
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [before, after, isDemo]);

  async function send() {
    if (!video) return;
    setNote("");
    const stem = patientName?.trim() ? `-${patientName.trim().replace(/[^\p{L}\p{N}]+/gu, "-")}` : "";
    try {
      const outcome = await shareFile(video.blob, `smile-reveal${stem}.${video.extension}`, "Your smile preview");
      if (outcome === "downloaded") setNote("Saved to your downloads.");
    } catch {
      setError("That couldn’t be shared.");
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Reveal video" onClick={onClose}>
      <div className="sheet video-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-heading">
          <h2>Reveal Video</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <p className="sheet-sub">Their smile today, with the illustration fading in. Made on this device — no AI credits.</p>
        {video ? (
          <video className="reveal-video" src={video.url} autoPlay muted loop playsInline controls />
        ) : (
          <p className="analysis-status" role="status">{error || "Making the video…"}</p>
        )}
        <div className="video-actions">
          <button className="video-send" onClick={() => void send()} disabled={!video}>
            <Share2 size={16} strokeWidth={1.7} /> Send or save
          </button>
        </div>
        {note && <p className="analysis-status" role="status">{note}</p>}
      </div>
    </div>
  );
}
