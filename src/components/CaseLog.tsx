"use client";
import { useCallback, useEffect, useState } from "react";
import { Archive, Download, Search, Sparkles, Trash2, X, ScanEye } from "lucide-react";
import { SavedCaseViewer } from "./SavedCaseViewer";
import type { CaseLogEntry, CaseLogMedia } from "@/lib/types";
import {
  formatLogDate,
  listActiveLog,
  logFileName,
  matchesQuery,
  moveAllToRecentlyDeleted,
  moveToRecentlyDeleted,
  purgeRecentlyDeleted,
  readLogMedia,
  setCaseArchived,
} from "@/lib/caseLog";
import { RECENTLY_DELETED_DAYS } from "@/config/cases";

export function CaseLog({ onClose, initialEntryId }: { onClose: () => void; initialEntryId?: string }) {
  const [entries, setEntries] = useState<CaseLogEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{
    entry: CaseLogEntry;
    media: CaseLogMedia | null;
  } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [notice, setNotice] = useState("");
  const [openedInitial, setOpenedInitial] = useState(false);

  const refresh = useCallback(() => {
    purgeRecentlyDeleted()
      .catch(() => 0)
      .then(() => listActiveLog())
      .then(setEntries)
      .catch(() => {
        setEntries([]);
        setError("Cases couldn’t be opened on this device.");
      });
  }, []);
  useEffect(() => refresh(), [refresh]);

  const all = entries ?? [];
  const shown = all.filter((entry) => matchesQuery(entry, query));

  async function openEntry(entry: CaseLogEntry) {
    setMediaError(false);
    setOpen({ entry, media: null });
    const media = await readLogMedia(entry.id).catch(() => null);
    setOpen((cur) =>
      cur && cur.entry.id === entry.id ? { entry, media } : cur,
    );
    if (!media) setMediaError(true);
  }

  // Opened from Home › Recent Cases.
  useEffect(() => {
    if (openedInitial || !initialEntryId || !entries) return;
    setOpenedInitial(true);
    const entry = entries.find(e => e.id === initialEntryId);
    if (entry) void openEntry(entry);
  }, [entries, initialEntryId, openedInitial]);

  async function remove(id: string) {
    try {
      await moveToRecentlyDeleted(id);
      setOpen(null);
      setNotice(`Moved to Recently Deleted. You can restore it from Settings › Case Library for ${RECENTLY_DELETED_DAYS} days.`);
      refresh();
    } catch {
      setError("That case couldn’t be deleted. Please try again.");
    }
  }

  async function archive(id: string) {
    try {
      await setCaseArchived(id, true);
      setOpen(null);
      setNotice("Case archived. Find it in Settings › Case Library › Archived Cases.");
      refresh();
    } catch {
      setError("That case couldn’t be archived. Please try again.");
    }
  }

  async function saveEntry(entry: CaseLogEntry, media: CaseLogMedia) {
    try {
      const [{ composeBeforeAfter }, { saveFile }] = await Promise.all([import("@/lib/compose"), import("@/lib/share")]);
      const blob = await composeBeforeAfter(
        media.originalImage,
        media.image,
        "split",
        { image: media.image, mode: entry.mode, variationId: entry.id, review: media.review, scaleFlag: media.scaleFlag },
        media.preferences,
        Boolean(entry.testMode),
      );
      await saveFile(blob, `smilecompose-${logFileName(entry)}.jpg`, "SmileCompose before and after");
    } catch {
      setError("That image couldn’t be saved.");
    }
  }

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Cases"
      onClick={onClose}
    >
      <div className="log-panel" onClick={(e) => e.stopPropagation()}>
        <div className="log-head">
          <h2>Cases</h2>
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
            aria-label="Search cases"
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
        {notice && <p className="save-status" role="status">{notice}</p>}

        {entries === null ? (
          <p className="log-empty">Opening your cases…</p>
        ) : shown.length === 0 ? (
          all.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon" aria-hidden="true"><Sparkles size={22} strokeWidth={1.5} /></span>
              <p className="empty-state-title">No smile designs yet</p>
              <p className="empty-state-body">Upload a patient photograph to begin visualising treatment possibilities. Your saved designs will appear here.</p>
            </div>
          ) : (
            <p className="log-empty">No cases match that search.</p>
          )
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
                Move all {all.length} to Recently Deleted?
                <button
                  className="text-button danger"
                  onClick={async () => {
                    try {
                      await moveAllToRecentlyDeleted();
                      setConfirmClear(false);
                      setNotice(`Moved to Recently Deleted for ${RECENTLY_DELETED_DAYS} days.`);
                      refresh();
                    } catch {
                      setError("The cases couldn’t be deleted. Please try again.");
                    }
                  }}
                >
                  Move
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
                Clear cases
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
            {error && <p className="error-message" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></p>}
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
                      : "SmileCompose preview"}
                  </figcaption>
                </figure>
              </div>
            ) : (
              <p className="log-empty">{mediaError ? "The saved images are unavailable on this device." : "Loading images…"}</p>
            )}
            <div className="log-detail-actions">
              <button className="primary-button" disabled={!open.media} onClick={() => setViewing(true)}>
                <ScanEye size={18} /> Reopen comparison
              </button>
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
              <button className="text-button" onClick={() => void archive(open.entry.id)}>
                <Archive size={15} strokeWidth={1.6} />
                Archive
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
      {viewing && open?.media && <SavedCaseViewer entry={open.entry} media={open.media} onClose={() => setViewing(false)} />}
    </div>
  );
}
