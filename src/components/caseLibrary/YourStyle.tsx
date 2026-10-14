"use client";
import { BookMarked } from "lucide-react";
import { CaseFeatures } from "@/components/CaseFeatures";
import { useAccount } from "@/components/account/AccountProvider";
import { DEFAULT_STYLE_REFERENCE_LIMIT, findMatchingStyleReferences } from "@/lib/styleMatching";
import type { SmileSettings } from "@/lib/types";
import { useContext } from "react";
import { CaseLibraryContext, useCaseLibrary } from "./caseLibraryContext";

/** Optional starting conditions that sharpen Case Library matching (kept under More). */
export function StartingConditions({ settings, onChange }: { settings: SmileSettings; onChange: (s: SmileSettings) => void }) {
  return (
    <div className="control-group">
      <div className="control-label style-conditions-label"><span>Starting conditions</span><span className="muted">Optional</span></div>
      <CaseFeatures value={settings.caseFeatures ?? []} onChange={v => onChange({ ...settings, caseFeatures: v })} />
      <p className="control-hint">Starting conditions help match your Case Library; they do not authorise treatment or diagnose the photograph.</p>
    </div>
  );
}

/**
 * The photo step: one line saying whether designs will follow the clinician's own
 * finished cases, with the switch, or an invitation to add some.
 */
export function StyleLine({ settings, onChange }: { settings: SmileSettings; onChange: (s: SmileSettings) => void }) {
  const lib = useCaseLibrary();
  const account = useAccount();
  const cases = lib.cases;
  if (cases === null && lib.mode !== "signedOut") return null;
  const empty = lib.mode === "signedOut" || !cases?.length;
  return (
    <div className={`style-line${!empty && settings.libraryStyle ? " is-on" : ""}`}>
      <span className="style-line-icon" aria-hidden="true"><BookMarked size={16} strokeWidth={1.8} /></span>
      {empty ? <>
        <span className="style-line-text"><strong>Design in your style</strong><span>Add your finished cases so results follow your work.</span></span>
        <button type="button" className="text-button" onClick={() => (lib.mode === "signedOut" ? account.openAuth("signIn") : lib.open({ add: true }))}>{lib.mode === "signedOut" ? "Sign in" : "Add"}</button>
      </> : <>
        <span className="style-line-text">
          <strong>{settings.libraryStyle ? "In your style" : "Your style is off"}</strong>
          <span>{settings.libraryStyle ? `Guided by your ${cases!.length} finished ${cases!.length === 1 ? "case" : "cases"}` : "Designs won’t use your Case Library"}</span>
        </span>
        <input type="checkbox" role="switch" className="studio-switch" aria-label="Design in your style" checked={settings.libraryStyle}
          onChange={e => onChange({ ...settings, libraryStyle: e.target.checked })} />
      </>}
    </div>
  );
}

/** Whether a design can follow the clinician's Case Library at all (not whitening, alignment only or one-tooth matching). */
export function styleApplies(settings: SmileSettings): boolean {
  return settings.treatment !== "Whitening" && !settings.toothMatch && !(settings.alignment?.only && settings.treatmentMode !== "full_arch");
}

/**
 * Review: the one switch for designing in the clinician's own style, right above Generate, so it is
 * decided before anything is made. On, it shows the cases that will guide the design; with none to
 * match it says so; signed out or with an empty library it offers to add cases.
 */
export function StyleSwitch({ settings, onChange }: { settings: SmileSettings; onChange: (s: SmileSettings) => void }) {
  const lib = useContext(CaseLibraryContext);
  const account = useAccount();
  const cases = lib?.cases ?? null;
  if (!lib || !styleApplies(settings) || (cases === null && lib.mode !== "signedOut")) return null;
  if (lib.mode === "signedOut" || !cases?.length) {
    return (
      <div className="style-switch is-empty">
        <span className="style-switch-text"><strong>Design in my style</strong><span>Add your finished cases so results follow your own work.</span></span>
        <button type="button" className="text-button" onClick={() => (lib.mode === "signedOut" ? account.openAuth("signIn") : lib.open({ add: true }))}>{lib.mode === "signedOut" ? "Sign in" : "Add cases"}</button>
      </div>
    );
  }
  const matches = findMatchingStyleReferences(lib.candidates, settings, DEFAULT_STYLE_REFERENCE_LIMIT);
  const on = settings.libraryStyle;
  const thumbs = matches.map(m => cases.find(c => c.id === m.id)).filter(c => c?.thumbnailUrl);
  return (
    <label className={`style-switch${on ? " is-on" : ""}`}>
      <span className="style-switch-text">
        <strong>In my style</strong>
        <span>{!on ? "Off. Your Case Library is not used" : matches.length ? `${matches.length} of your cases guide this design` : "None of your cases match this design yet"}</span>
        {on && thumbs.length > 0 && <span className="style-switch-thumbs" aria-hidden="true">{thumbs.map(c => <img key={c!.id} src={c!.thumbnailUrl!} alt="" />)}</span>}
      </span>
      <input type="checkbox" role="switch" className="studio-switch" aria-label="Design in my style" checked={on}
        onChange={e => onChange({ ...settings, libraryStyle: e.target.checked })} />
    </label>
  );
}

/** Whether Generate will actually send style references for this design (the button's label says so). */
export function useStyleInUse(settings: SmileSettings): boolean {
  // The studio also renders on its own (previews and checks), where there is no Case Library.
  const lib = useContext(CaseLibraryContext);
  if (!lib || !settings.libraryStyle || !styleApplies(settings) || !lib.cases?.length) return false;
  return findMatchingStyleReferences(lib.candidates, settings, DEFAULT_STYLE_REFERENCE_LIMIT).length > 0;
}

