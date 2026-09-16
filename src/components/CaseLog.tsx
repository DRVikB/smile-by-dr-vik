"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, Search, Trash2, X } from "lucide-react";
import type { CaseLogEntry, CaseLogMedia } from "@/lib/types";
import {
  clearLog,
  deleteLogEntry,
  formatLogDate,
  listLog,
  logFileName,
  matchesQuery,
  readLogMedia,
} from "@/lib/caseLog";

export function CaseLog({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<CaseLogEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{
    entry: CaseLogEntry;
    media: CaseLogMedia | null;
  } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    listLog()
      .then(setEntries)
      .catch(() => {
        setEntries([]);
        setError("The case log couldn’t be opened on this device.");
      });
  }, []);
  useEffect(() => refresh(), [refresh]);

  const all = entries ?? [];
  const shown = all.filter((entry) => matchesQuery(entry, query));

  async function openEntry(entry: CaseLogEntry) {
    setOpen({ entry, media: null });
    const media = await readLogMedia(entry.id).catch(() => null);
    setOpen((cur) =>
      cur && cur.entry.id === entry.id ? { entry, media } : cur,
    );
  }

  async function remove(id: string) {
    await deleteLogEntry(id).catch(() =>
      setError("That case couldn’t be deleted."),
    );
    setOpen(null);
    refresh();
  }

  async function saveEntry(entry: CaseLogEntry, media: CaseLogMedia) {
    try {
      const { composeBeforeAfter, downloadBlob } = await import("@/lib/compose");
      const blob = await composeBeforeAfter(
        media.originalImage,
        media.image,
        "split",
        { image: media.image, mode: entry.mode, variationId: entry.id },
      );
      downloadBlob(blob, `${logFileName(entry)}.jpg`);
    } catch {
      setError("That image couldn’t be saved.");
    }
  }

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Case log"
      onClick={onClose}
    >
      <div className="log-panel" onClick={(e) => e.stopPropagation()}>
        <div className="log-head">
          <h2>Case log</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="log-search">
          <Search size={16} strokeWidth={1.7} aria-hidden="true" />
          <input
            id="log-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by patient, date or treatment"
            aria-label="Search the case log"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        {error && (
          <p className="error-message" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss">
              <X size={14} />
            </button>
          </p>
        )}

        {entries === null ? (
          <p className="log-empty">Opening your case log…</p>
        ) : shown.length === 0 ? (
          <p className="log-empty">
            {all.length === 0
              ? "No previews logged yet. Every preview you create is saved here."
              : "No cases match that search."}
          </p>
        ) : (
          <ul className="log-list">
            {shown.map((entry) => (
              <li key={entry.id}>
                <button
                  className="log-row"
                  onClick={() => void openEntry(entry)}
                >
                  <img src={entry.thumb} alt="" />
                  <span className="log-row-text">
                    <strong>{entry.patientName || "Unnamed"}</strong>
                    <span className="log-date">
                      {formatLogDate(entry.createdAt)}
                    </span>
                    <span className="log-summary">{entry.summary}</span>
                  </span>
                  {(entry.testMode || entry.mode === "mock") && (
                    <span className="log-pill">Test</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="log-foot">
          <span>
            {shown.length === all.length
              ? `${all.length} ${all.length === 1 ? "case" : "cases"}`
              : `${shown.length} of ${all.length} cases`}
          </span>
          {all.length > 0 &&
            (confirmClear ? (
              <span className="log-confirm">
                Delete all {all.length}?
                <button
                  className="text-button danger"
                  onClick={async () => {
                    await clearLog().catch(() => {});
                    setConfirmClear(false);
                    refresh();
                  }}
                >
                  Delete
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                className="text-button"
                onClick={() => setConfirmClear(true)}
              >
                Clear log
              </button>
            ))}
        </div>
      </div>

      {open && (
        <div
          className="log-detail-backdrop"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${open.entry.patientName || "Unnamed"} preview`}
        >
          <div className="log-detail" onClick={(e) => e.stopPropagation()}>
            <div className="log-head">
              <div>
                <h2>{open.entry.patientName || "Unnamed"}</h2>
                <p className="log-date">
                  {formatLogDate(open.entry.createdAt)} · {open.entry.summary}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setOpen(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            {open.media ? (
              <div className="log-pair">
                <figure>
                  <img src={open.media.originalImage} alt="Before" />
                  <figcaption>Before</figcaption>
                </figure>
                <figure>
                  <img src={open.media.image} alt="Smile preview" />
                  <figcaption>
                    {open.entry.testMode || open.entry.mode === "mock"
                      ? "Demo preview"
                      : "Dr Vik preview"}
                  </figcaption>
                </figure>
              </div>
            ) : (
              <p className="log-empty">Loading images…</p>
            )}
            <div className="log-detail-actions">
              <button
                className="secondary-button"
                disabled={!open.media}
                onClick={() =>
                  open.media && void saveEntry(open.entry, open.media)
                }
              >
                <Download size={16} strokeWidth={1.6} />
                Save before &amp; after
              </button>
              <button
                className="text-button danger"
                onClick={() => void remove(open.entry.id)}
              >
                <Trash2 size={15} strokeWidth={1.6} />
                Delete this case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
