"use client";
import { BookMarked, Plus } from "lucide-react";
import { CaseFeatures } from "@/components/CaseFeatures";
import { useAccount } from "@/components/account/AccountProvider";
import { DEFAULT_STYLE_REFERENCE_LIMIT, findMatchingStyleReferences } from "@/lib/styleMatching";
import type { SmileSettings } from "@/lib/types";
import { useCaseLibrary } from "./caseLibraryContext";

/**
 * Compose: which of the clinician's Case Library references suit this design.
 * The count is a preview; the server makes the same match for the actual request.
 */
export function YourStyle({ settings, onChange }: { settings: SmileSettings; onChange: (s: SmileSettings) => void }) {
  const lib = useCaseLibrary();
  const account = useAccount();
  const cases = lib.cases;
  const matches = cases ? findMatchingStyleReferences(lib.candidates, settings, DEFAULT_STYLE_REFERENCE_LIMIT) : [];
  const on = settings.libraryStyle;

  let body: React.ReactNode;
  if (lib.mode === "signedOut") {
    body = (
      <div className="style-invite">
        <strong>Make results more like your own work</strong>
        <span>Sign in to add your finished cases as private style references.</span>
        <button type="button" className="secondary-button" onClick={() => account.openAuth("signIn")}>Sign In</button>
      </div>
    );
  } else if (cases === null) {
    body = <p className="control-hint">Checking your Case Library…</p>;
  } else if (cases.length === 0) {
    body = (
      <div className="style-invite">
        <strong>Make results more like your own work</strong>
        <span>Add your finished bonding and porcelain cases, and SmileCompose can use them as style references for designs like this.</span>
        <button type="button" className="secondary-button" onClick={() => lib.open({ add: true })}><Plus size={15} strokeWidth={2} aria-hidden="true" />Add Cases</button>
      </div>
    );
  } else {
    body = (
      <div className="style-card">
        <div className="style-card-head">
          <span className="style-card-icon" aria-hidden="true"><BookMarked size={16} strokeWidth={1.8} /></span>
          <span className="style-card-text">
            <strong>{on && matches.length ? "Designing in your style" : "Case Library"}</strong>
            <span>{matches.length ? `${matches.length} matching ${matches.length === 1 ? "reference" : "references"}` : "No close style match found"}</span>
          </span>
          <button type="button" className="text-button" onClick={() => lib.open()}>View</button>
        </div>
        <label className="style-toggle ios-switch-row">
          <span>Design in my style</span>
          <input type="checkbox" role="switch" checked={on} onChange={e => onChange({ ...settings, libraryStyle: e.target.checked })} />
        </label>
        <p className="control-hint">
          {!on
            ? "No Case Library references will be sent with this design."
            : matches.length
              ? `Your closest ${settings.treatment === "Porcelain" ? "porcelain" : "composite"} ${matches.length === 1 ? "case is" : "cases are"} sent with this photo as style guidance for contour, texture and finish. ${lib.mode === "device" ? "" : "The patient’s own anatomy always comes from this photo."}`.trim()
              : `None of your ${cases.length} ${cases.length === 1 ? "case matches" : "cases match"} this treatment and these teeth, so none will be sent. Add a matching case to use your style here.`}
        </p>
      </div>
    );
  }

  return (
    <div className="control-group your-style">
      <div className="control-label"><span>Your style</span><span className="muted">Your Case Library</span></div>
      {body}
    </div>
  );
}

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
