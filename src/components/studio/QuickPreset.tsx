"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, SlidersHorizontal, Zap } from "lucide-react";
import { SheetClose } from "@/components/sideRail/SideRail";
import { INTERNAL_ALIGNMENT } from "@/lib/generation/availability";
import {
  DEFAULT_PRESET, MOST_USED_MINIMUM, activePreset, mostUsedPreset, presetShortSummary, presetIsEmpty, presetSummary, readPresetChoice, savePresetChoice,
  type PresetChoice, type PresetRestoration, type PresetWhitening, type QuickPreset,
} from "@/lib/quickPreset";
import type { TeethCount } from "@/lib/types";

/** Straightening only where the app offers it. */
const allowed = (p: QuickPreset): QuickPreset => INTERNAL_ALIGNMENT ? p : { ...p, straighten: false };

/**
 * My preset on the photo step: one tap generates the clinician's usual design.
 * Before one is saved the tile reads "Set up my preset" and opens the sheet.
 */
export function QuickPresetTile({ busy, onGenerate }: { busy: boolean; onGenerate: (preset: QuickPreset) => void }) {
  const [choice, setChoice] = useState<PresetChoice | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setChoice(readPresetChoice()); }, []);
  const active = activePreset(choice);
  const preset = active && !presetIsEmpty(allowed(active)) ? allowed(active) : null;

  return (
    <>
      <div className={`quick-preset${preset ? "" : " is-new"}`}>
        <button type="button" className="quick-preset-main" disabled={busy}
          onClick={() => (preset ? onGenerate(preset) : setEditing(true))}>
          <span className="quick-preset-icon" aria-hidden="true"><Zap size={17} strokeWidth={1.9} /></span>
          <span className="quick-preset-text">
            <strong>{preset ? (choice?.source === "most-used" ? "My preset · most used" : "My preset") : "Set up my preset"}</strong>
            <small>{preset ? presetShortSummary(preset) : "Your usual design, generated in one tap"}</small>
          </span>
          {preset && <ArrowUpRight size={16} aria-hidden="true" />}
        </button>
        {preset && (
          <button type="button" className="quick-preset-edit" aria-label="Edit my preset" disabled={busy} onClick={() => setEditing(true)}>
            <SlidersHorizontal size={18} strokeWidth={1.8} />
          </button>
        )}
      </div>
      {/* Drawn at the top of the page so it sits above the app header, like the other sheets. */}
      {editing && createPortal(<QuickPresetSheet choice={choice} onClose={() => setEditing(false)}
        onSave={next => { savePresetChoice(next); setChoice(next); setEditing(false); }} />, document.body)}
    </>
  );
}

function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <div className="quick-preset-field">
      <span className="quick-preset-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" aria-pressed={value === v} className={value === v ? "selected" : ""} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

const WHITENING: [PresetWhitening, string][] = [["none", "None"], ["Whiten", "Whiten"], ["Bleach", "Bleach"]];
const RESTORATION: [PresetRestoration, string][] = [["none", "None"], ["Single-shade composite", "Bonding"], ["Layered composite", "Layered"], ["Porcelain", "Porcelain"]];
const TEETH: [TeethCount, string][] = [[4, "4"], [6, "6"], [8, "8"], [10, "10"]];

export function QuickPresetSheet({ choice, onClose, onSave }: { choice: PresetChoice | null; onClose: () => void; onSave: (c: PresetChoice) => void }) {
  const [mostUsed] = useState(() => mostUsedPreset());
  const [source, setSource] = useState<PresetChoice["source"]>(choice?.source === "most-used" && mostUsed ? "most-used" : "mine");
  const [mine, setMine] = useState<QuickPreset>(allowed(choice?.source === "mine" ? choice.preset : choice?.preset ?? DEFAULT_PRESET));
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  const set = (patch: Partial<QuickPreset>) => setMine(p => ({ ...p, ...patch }));
  const empty = presetIsEmpty(mine);
  const restorative = mine.restoration !== "none";

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="My preset" onClick={onClose}>
      <div className="sheet quick-preset-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-heading">
          <h2>My preset</h2>
          <SheetClose onClose={onClose} buttonRef={close} />
        </div>
        <p className="sheet-sub">Tap My preset after taking a photo and this design is generated straight away. Shape, texture and your style still come from your usual settings.</p>

        <div className="segmented quick-preset-source" role="group" aria-label="Preset source">
          <button type="button" aria-pressed={source === "mine"} className={source === "mine" ? "selected" : ""} onClick={() => setSource("mine")}>My choices</button>
          <button type="button" aria-pressed={source === "most-used"} className={source === "most-used" ? "selected" : ""} onClick={() => setSource("most-used")}>Most used</button>
        </div>

        {source === "most-used" ? (
          <div className="quick-preset-most">
            {mostUsed ? <>
              <strong>{presetSummary(allowed(mostUsed.preset))}</strong>
              <p className="control-hint">Your most common combination across {mostUsed.designs} designs on this device. It updates as you design.</p>
            </> : (
              <p className="control-hint">Most used appears after {MOST_USED_MINIMUM} designs on this device. Until then, set your own choices.</p>
            )}
          </div>
        ) : (
          <div className="quick-preset-fields">
            {INTERNAL_ALIGNMENT && (
              <label className="quick-preset-field quick-preset-switch">
                <span className="quick-preset-label">Straighten<small>Both arches</small></span>
                <input type="checkbox" role="switch" className="studio-switch" checked={mine.straighten} onChange={e => set({ straighten: e.target.checked })} />
              </label>
            )}
            <Segmented label="Whitening" value={mine.whitening} options={WHITENING} onChange={whitening => set({ whitening })} />
            <Segmented label="Bonding or veneers" value={mine.restoration} options={RESTORATION} onChange={restoration => set({ restoration })} />
            {restorative && <>
              <Segmented label="Arches" value={mine.arches} options={[["upper", "Upper"], ["both", "Upper and lower"]]} onChange={arches => set({ arches })} />
              <Segmented label="Teeth" value={mine.teeth} options={TEETH} onChange={teeth => set({ teeth })} />
            </>}
            <p className={`control-hint${empty ? " is-alert" : ""}`} role={empty ? "alert" : undefined}>
              {empty ? "Choose at least one treatment." : presetSummary(mine)}
            </p>
          </div>
        )}

        <button type="button" className="primary-button quick-preset-save"
          disabled={source === "mine" ? empty : !mostUsed}
          onClick={() => onSave(source === "most-used" && mostUsed ? { source, preset: mostUsed.preset } : { source: "mine", preset: mine })}>
          Save preset
        </button>
      </div>
    </div>
  );
}
