"use client";
import { useState } from "react";
import { useAccount } from "@/components/account/AccountProvider";
import { captureWorkspace } from "@/lib/workspace";
import { listLegacyCases, importLegacyCases, type LegacyCaseChoice } from "@/services/cases/legacyImport";
import { Row } from "./settingsParts";

export function LegacyCaseImport() {
  const account = useAccount();
  const [choices, setChoices] = useState<LegacyCaseChoice[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scope] = useState(captureWorkspace);
  if (!account.user) return null;
  async function inspect() {
    setBusy(true); setMessage("");
    try { setChoices(await listLegacyCases(scope)); } catch { if (!scope.signal.aborted) setMessage("Existing cases couldn’t be opened. Your data is kept."); }
    finally { setBusy(false); }
  }
  async function run() {
    setBusy(true); setMessage("");
    try {
      const count = await importLegacyCases(selected, scope);
      setMessage(`${count} ${count === 1 ? "case imported" : "cases imported"}. Reopen Cases to view them. Reload to reopen an imported current draft. Originals remain on this device.`);
      setSelected([]);
    } catch (e) { if (!scope.signal.aborted) setMessage(e instanceof Error ? e.message : "Import interrupted. Retry to resume. Originals are kept."); }
    finally { setBusy(false); }
  }
  return <>
    <Row label="Cases saved on this device" value={busy ? "…" : undefined} onClick={() => { if (!busy) void inspect(); }} />
    {choices && <div className="settings-note">
      <p>These unowned cases are not in any account. Only import cases you are authorised to access. Select which ones belong in this account; sample cases are excluded.</p>
      {choices.filter(c => !c.sample).map(choice => <label className="ai-consent-check" key={choice.key}>
        <input type="checkbox" disabled={busy} checked={selected.includes(choice.key)} onChange={e => setSelected(current => e.target.checked ? [...current, choice.key] : current.filter(key => key !== choice.key))} />
        <span>{choice.name} · {choice.versions} versions{choice.draft ? " · current draft" : ""}</span>
      </label>)}
      {!choices.some(c => !c.sample) && <p>No existing patient cases to import.</p>}
      <button type="button" className="text-button" disabled={busy || !selected.length} onClick={() => void run()}>Import existing cases into this account</button>
    </div>}
    {message && <p className="settings-note" role="status">{message}</p>}
  </>;
}
