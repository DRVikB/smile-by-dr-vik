"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, ImagePlus, Trash2, Upload, X } from "lucide-react";
import type { CaseMaterial, LibraryCase } from "@/lib/types";
import { caseMaterials } from "@/lib/types";
import {
  MAX_STYLE_REFERENCES,
  addLibraryCase,
  chooseLibraryCases,
  clearLibrary,
  deleteLibraryCase,
  exportLibrary,
  importLibrary,
  listLibrary,
} from "@/lib/caseLibrary";

/**
 * The clinician's own finished cases. These are sent to the image model as a
 * style reference, so the copy says so plainly rather than leaving it implied.
 */
export function CaseLibrary({
  onClose,
  pinned,
  onPinnedChange,
  onCountChange,
}: {
  onClose: () => void;
  pinned: string[];
  onPinnedChange: (ids: string[]) => void;
  onCountChange: (count: number) => void;
}) {
  const [cases, setCases] = useState<LibraryCase[] | null>(null);
  const [material, setMaterial] = useState<CaseMaterial>("Layered composite");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listLibrary()
      .then((all) => {
        setCases(all);
        onCountChange(all.length);
      })
      .catch(() => {
        setCases([]);
        setError("Your case library couldn’t be opened on this device.");
      });
  }, [onCountChange]);
  useEffect(() => refresh(), [refresh]);

  const all = cases ?? [];

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError("");
    setStatus("");
    let added = 0;
    try {
      const { preparePhoto } = await import("@/lib/photos");
      const { thumbnail } = await import("@/lib/thumb");
      for (const file of Array.from(files).slice(0, 20)) {
        try {
          const photo = await preparePhoto(file);
          const id = crypto.randomUUID();
          await addLibraryCase(
            {
              id,
              material,
              label: label.trim().slice(0, 80) || file.name.replace(/\.[^.]+$/, ""),
              addedAt: Date.now(),
            },
            {
              id,
              // Downscaled: the model needs contour and texture, not resolution.
              image: await thumbnail(photo.dataUrl, 1280, 0.86),
              thumb: await thumbnail(photo.dataUrl, 280, 0.7),
            },
          );
          added += 1;
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "That photo couldn’t be added.",
          );
        }
      }
      setLabel("");
      if (added > 0)
        setStatus(`${added} ${added === 1 ? "case" : "cases"} added.`);
      refresh();
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function togglePin(id: string) {
    if (pinned.includes(id)) onPinnedChange(pinned.filter((p) => p !== id));
    else onPinnedChange([...pinned, id].slice(-MAX_STYLE_REFERENCES));
  }

  async function remove(id: string) {
    await deleteLibraryCase(id).catch(() =>
      setError("That case couldn’t be deleted."),
    );
    onPinnedChange(pinned.filter((p) => p !== id));
    refresh();
  }

  async function saveFile() {
    try {
      const data = await exportLibrary();
      const blob = new Blob([JSON.stringify(data)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smile-case-library_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("The library couldn’t be exported.");
    }
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { added, skipped } = await importLibrary(
        JSON.parse(await file.text()),
      );
      setStatus(
        `${added} ${added === 1 ? "case" : "cases"} imported${skipped ? `, ${skipped} skipped` : ""}.`,
      );
      refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "That library file couldn’t be read.",
      );
    } finally {
      setBusy(false);
      if (importInput.current) importInput.current.value = "";
    }
  }

  const autoComposite = chooseLibraryCases(all, "Composite");
  const autoPorcelain = chooseLibraryCases(all, "Porcelain");

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Case library"
      onClick={onClose}
    >
      <div className="log-panel" onClick={(e) => e.stopPropagation()}>
        <div className="log-head">
          <div>
            <h2>Case library</h2>
            <p className="log-date">
              Your own finished work, used as the style reference for every
              preview.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <p className="library-tip">
          For the truest style match, add well-lit, straight-on close-ups —
          similar framing and lighting across cases works better than a
          single striking photo.
        </p>

        <fieldset disabled={busy} className="library-add">
          <div className="control-group">
            <div className="control-label">
              <span>Material</span>
              <span className="muted">Tag before adding</span>
            </div>
            <div className="segmented" role="group" aria-label="Material">
              {caseMaterials.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={material === m}
                  className={material === m ? "selected" : ""}
                  onClick={() => setMaterial(m)}
                >
                  {m === "Single-shade composite"
                    ? "Single shade"
                    : m === "Layered composite"
                      ? "Layered"
                      : "Porcelain"}
                </button>
              ))}
            </div>
          </div>
          <div className="control-group">
            <div className="control-label">
              <label htmlFor="library-label">Label</label>
              <span className="muted">Optional</span>
            </div>
            <input
              id="library-label"
              className="name-field"
              maxLength={80}
              placeholder="e.g. Upper 6, layered, 2025"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus size={16} strokeWidth={1.6} />
            {busy ? "Adding…" : "Add finished cases"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif"
            multiple
            hidden
            onChange={(e) => void addFiles(e.target.files)}
          />
        </fieldset>

        {error && (
          <p className="error-message" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss">
              <X size={14} />
            </button>
          </p>
        )}
        {status && !error && (
          <p className="library-status" role="status">
            {status}
          </p>
        )}

        {cases === null ? (
          <p className="log-empty">Opening your case library…</p>
        ) : all.length === 0 ? (
          <p className="log-empty">
            No cases yet. Add photographs of your own finished bonding and
            porcelain, and previews will follow their contour, texture and
            finish.
          </p>
        ) : (
          <>
            <p className="library-note">
              {pinned.length > 0
                ? `${pinned.length} pinned — ${pinned.length === 1 ? "this case is" : "these cases are"} used for every preview until you unpin ${pinned.length === 1 ? "it" : "them"}.`
                : `Matched automatically: ${autoComposite.length} for composite, ${autoPorcelain.length} for porcelain. Pin up to ${MAX_STYLE_REFERENCES} to override.`}
            </p>
            <ul className="library-grid">
              {all.map((c) => {
                const isPinned = pinned.includes(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`library-card${isPinned ? " pinned" : ""}`}
                      aria-pressed={isPinned}
                      onClick={() => togglePin(c.id)}
                    >
                      <LibraryThumb id={c.id} label={c.label} />
                      {isPinned && (
                        <span className="library-pin">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                      <span className="library-card-text">
                        <strong>{c.label || "Untitled case"}</strong>
                        <span>{c.material}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="text-button danger library-delete"
                      onClick={() => void remove(c.id)}
                      aria-label={`Delete ${c.label || "this case"}`}
                    >
                      <Trash2 size={14} strokeWidth={1.6} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="log-foot">
          <span>
            {all.length} {all.length === 1 ? "case" : "cases"}
          </span>
          <span className="library-foot-actions">
            <button
              className="text-button"
              onClick={() => importInput.current?.click()}
            >
              <Upload size={14} strokeWidth={1.6} /> Import
            </button>
            <input
              ref={importInput}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => void loadFile(e.target.files?.[0])}
            />
            {all.length > 0 && (
              <button className="text-button" onClick={() => void saveFile()}>
                <Download size={14} strokeWidth={1.6} /> Export
              </button>
            )}
            {all.length > 0 &&
              (confirmClear ? (
                <span className="log-confirm">
                  Delete all {all.length}?
                  <button
                    className="text-button danger"
                    onClick={async () => {
                      await clearLibrary().catch(() => {});
                      onPinnedChange([]);
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
                  Clear
                </button>
              ))}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Thumbnails live in the media store, so they load per card rather than up front. */
function LibraryThumb({ id, label }: { id: string; label: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    import("@/lib/caseLibrary")
      .then((m) => m.readLibraryMedia(id))
      .then((media) => {
        if (live && media) setSrc(media.thumb);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return src ? (
    <img className="library-thumb" src={src} alt={label || "Finished case"} />
  ) : (
    <span className="library-thumb placeholder" aria-hidden="true" />
  );
}
