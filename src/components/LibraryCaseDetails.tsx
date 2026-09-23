"use client";
import { useState } from "react";
import { CaseFeatures } from "./CaseFeatures";
import { readLibraryMedia, updateLibraryContext } from "@/lib/caseLibrary";
import { supportedTeeth } from "@/lib/teeth";
import { adjunctTreatments, type CaseContext, type LibraryCase } from "@/lib/types";
export function LibraryCaseDetails({ entry, onSaved, onValidate }: { entry: LibraryCase; onSaved: () => void; onValidate: (entry: LibraryCase) => void }) {
  const [context, setContext] = useState<CaseContext>(entry.context ?? { features: [], teeth: [], adjuncts: [] });
  const [teeth, setTeeth] = useState(context.teeth.join(", "));
  const [holdout, setHoldout] = useState(Boolean(entry.validationOnly));
  const [before, setBefore] = useState<string>();
  const [savedBefore, setSavedBefore] = useState<string>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(validate = false) {
    setBusy(true); setStatus("");
    try {
      const ids = teeth.trim() ? teeth.split(/[\s,]+/).map(Number) : [];
      if (ids.some(id => !supportedTeeth.includes(id)) || new Set(ids).size !== ids.length) throw new Error("Enter unique FDI tooth numbers, for example 13, 12, 11, 21, 22, 23.");
      const next = { ...context, teeth: ids };
      if (validate && !(before || (await readLibraryMedia(entry.id))?.beforeImage)) throw new Error("Add this case’s before photograph first.");
      if (validate && !ids.length) throw new Error("Record the teeth treated before starting validation.");
      await updateLibraryContext(entry.id, { context: next, validationOnly: validate || holdout }, before);
      setHoldout(validate || holdout); setStatus("Saved on this device."); onSaved();
      if (validate) onValidate({ ...entry, context: next, validationOnly: true });
    } catch (e) { setStatus(e instanceof Error ? e.message : "Could not save this case."); }
    finally { setBusy(false); }
  }
  return <details className="clinical-details" onToggle={e => { if (e.currentTarget.open) void readLibraryMedia(entry.id).then(m => setSavedBefore(m?.beforeImage)).catch(() => setStatus("Could not load the before photo.")); }}><summary>Case details & validation</summary>
    {(before || savedBefore) && <img className="library-thumb" src={before ?? savedBefore} alt="Stored before photograph" />}
    <fieldset className="clinical-form" disabled={busy}>
      <span>Starting conditions</span><CaseFeatures value={context.features} onChange={features => setContext({ ...context, features })} />
      <label>Teeth treated (FDI)<input className="name-field" value={teeth} onChange={e => setTeeth(e.target.value)} placeholder="13, 12, 11, 21, 22, 23" /></label>
      <span>Other treatment in this result</span>
      {adjunctTreatments.map(a => <label className="style-toggle" key={a}><input type="checkbox" checked={context.adjuncts.includes(a)} onChange={e => setContext({ ...context, adjuncts: e.target.checked ? [...context.adjuncts, a] : context.adjuncts.filter(v => v !== a) })} />{a}</label>)}
      <label>After photograph: weeks after treatment (optional)<input className="name-field" type="number" min={0} max={1040} step={1} value={context.followUpWeeks ?? ""} onChange={e => setContext({ ...context, followUpWeeks: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
      <label>Add / replace before photograph<input type="file" accept="image/jpeg,image/png,image/heic,image/heif" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); try { const { preparePhoto } = await import("@/lib/photos"); const p = await preparePhoto(file); setBefore(p.dataUrl); setStatus("Before photo ready. Press Save details to keep it with this case."); } catch { setStatus("Could not open the before photo."); } finally { setBusy(false); } }} /></label>
      <label className="style-toggle"><input type="checkbox" checked={holdout} onChange={e => setHoldout(e.target.checked)} />Hold out from AI references for validation</label>
      <p className="control-hint">Library photos stay on this device until you export them or use a finished case as an AI reference. Before photos are only sent when you explicitly generate a validation preview.</p>
      <button type="button" className="secondary-button" onClick={() => void save()}>Save details</button>
      <button type="button" className="secondary-button" onClick={() => void save(true)}>Validate from this before photo</button>
      <p className="control-hint">Opens the before photo in design and excludes this finished case from references. No AI request until you create a preview. Confirm the actual treatment goal and shade before generating.</p>
    </fieldset>
    {status && <p className="control-hint" role="status">{status}</p>}
  </details>;
}
