"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, FolderOpen, HardDrive, ListChecks, Search, Trash2, X } from "lucide-react";
import { RECENTLY_DELETED_DAYS } from "@/config/cases";
import type { CaseLogEntry } from "@/lib/types";
import type { CaseCounts, CaseState } from "@/lib/caseLog";
import { Group, Row, StatTile, formatBytes, formatDate, useSettingsNav } from "./settingsParts";
import { CaseLibraryRow } from "./CaseLibrarySettings";

import { getCaseRepository } from "@/services/cases/caseRepository";
import { LegacyCaseImport } from "./LegacyCaseImport";

/**
 * Cases & Storage: patient cases on this device, the Case Library of finished
 * work, and how much space they take. Summary and routes only; the full case
 * browser stays in Cases.
 */
export function CasesSection() {
  const [repository] = useState(getCaseRepository);
  const nav = useSettingsNav();
  const [counts, setCounts] = useState<CaseCounts | null>(null);
  const [deviceBytes, setDeviceBytes] = useState<number | null>(null);

  useEffect(() => {
    const load = () => { void repository.caseCounts().then(setCounts).catch(() => setCounts(null)); };
    load(); return repository.subscribe(load);
  }, [repository]);
  useEffect(() => {
    void import("@/lib/dataExport").then(m => m.deviceStorageUsed()).then(setDeviceBytes).catch(() => setDeviceBytes(null));
  }, []);

  const count = (n: number | undefined) => (n === undefined ? "…" : String(n));
  return (
    <Group id="settings-cases" title="Cases & Storage"
      footer={<>Cases save on this device first and sync privately to your account. Case Library references are stored privately in your account. <button type="button" className="inline-link" onClick={() => nav.openPage({ kind: "dataPrivacy" })}>Learn more</button></>}>
      <div className="settings-stats">
        <StatTile icon={<FolderOpen size={18} strokeWidth={1.6} />} value={count(counts?.active)} label="Active cases" onClick={() => nav.openPage({ kind: "cases", filter: "active" })} />
        <StatTile icon={<Archive size={18} strokeWidth={1.6} />} value={count(counts?.archived)} label="Archived" onClick={() => nav.openPage({ kind: "cases", filter: "archived" })} />
        <StatTile icon={<HardDrive size={18} strokeWidth={1.6} />} value={deviceBytes === null ? "…" : formatBytes(deviceBytes).replace("under 1 MB", "< 1 MB")} label="On this device" />
      </div>
      <Row icon={<ListChecks size={17} strokeWidth={1.6} />} label="Manage Cases" onClick={() => nav.openPage({ kind: "cases", filter: "active" })} />
      {Boolean(counts?.deleted) && <Row icon={<Trash2 size={17} strokeWidth={1.6} />} label="Recently Deleted" value={String(counts?.deleted)} onClick={() => nav.openPage({ kind: "cases", filter: "deleted" })} />}
      <CaseLibraryRow />
      <LegacyCaseImport />
    </Group>
  );
}

type Sort = "newest" | "oldest" | "name";
const FILTERS: { key: CaseState; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "deleted", label: "Recently Deleted" },
];

export function ManageCasesPage({ initialFilter }: { initialFilter: CaseState }) {
  const [repository] = useState(getCaseRepository);
  const loadCaseLog = () => Promise.resolve(repository);
  const nav = useSettingsNav();
  const [filter, setFilter] = useState<CaseState>(initialFilter);
  const [entries, setEntries] = useState<CaseLogEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const log = await loadCaseLog();
      await log.purgeRecentlyDeleted();
      setEntries(await log.listLog([filter]));
    } catch {
      setEntries([]);
      setError("Cases couldn’t be opened on this device.");
    }
  }, [filter]);
  useEffect(() => { setEntries(null); void refresh(); return repository.subscribe(() => { void refresh(); }); }, [refresh, repository]);

  const shown = useMemo(() => {
    if (!entries) return [];
    return entries
      .filter(entry => [entry.patientName, entry.summary, entry.label ?? ""].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => sort === "oldest" ? a.createdAt - b.createdAt
        : sort === "name" ? (a.patientName || "~").localeCompare(b.patientName || "~", "en-GB")
          : b.createdAt - a.createdAt);
  }, [entries, query, sort]);

  async function run(action: (log: ReturnType<typeof getCaseRepository>) => Promise<unknown>, message: string) {
    setError("");
    try {
      await action(await loadCaseLog());
      nav.say(message);
      await refresh();
    } catch {
      setError("That couldn’t be completed. Please try again.");
    }
  }

  const name = (entry: CaseLogEntry) => entry.patientName || "Unnamed case";

  return (
    <div className="manage-cases">
      <div className="settings-segment" role="tablist" aria-label="Case list">
        {FILTERS.map(option => (
          <button key={option.key} type="button" role="tab" aria-selected={filter === option.key} onClick={() => setFilter(option.key)}>{option.label}</button>
        ))}
      </div>

      <div className="manage-cases-tools">
        <label className="log-search manage-search">
          <Search size={16} strokeWidth={1.7} aria-hidden="true" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by case reference or treatment" aria-label="Search cases" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
        </label>
        <label className="manage-sort">
          <span className="sr-only">Sort</span>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort cases">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Case reference A–Z</option>
          </select>
        </label>
      </div>

      {filter === "deleted" && (
        <p className="control-hint">Deleted cases stay in Recently Deleted for {RECENTLY_DELETED_DAYS} days so you can restore them, then they’re permanently removed with their photos.</p>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}

      {entries === null ? (
        <p className="log-empty">Opening your cases…</p>
      ) : shown.length === 0 ? (
        <p className="log-empty">{entries.length ? "No cases match that search." : filter === "active" ? "No cases yet. Your saved designs will appear here." : filter === "archived" ? "No archived cases." : "Recently Deleted is empty."}</p>
      ) : (
        <ul className="manage-list">
          {shown.map(entry => (
            <li key={entry.id} className="manage-row">
              <img src={entry.thumb} alt="" />
              <span className="manage-row-text">
                <strong>{name(entry)}</strong>
                <span>{formatDate(entry.createdAt)}{entry.summary ? ` · ${entry.summary}` : ""}</span>
                {entry.deletedAt && <span>Deleted {formatDate(entry.deletedAt)}</span>}
              </span>
              <span className="manage-row-actions">
                {filter === "active" && <>
                  <button type="button" className="text-button" onClick={() => void run(log => log.setCaseArchived(entry.id, true), "Case archived.")} aria-label={`Archive ${name(entry)}`}>Archive</button>
                  <button type="button" className="text-button danger-text" onClick={() => void run(log => log.moveToRecentlyDeleted(entry.id), "Moved to Recently Deleted.")} aria-label={`Delete ${name(entry)}`}>Delete</button>
                </>}
                {filter === "archived" && <>
                  <button type="button" className="text-button" onClick={() => void run(log => log.setCaseArchived(entry.id, false), "Case restored to active.")} aria-label={`Unarchive ${name(entry)}`}>Unarchive</button>
                  <button type="button" className="text-button danger-text" onClick={() => void run(log => log.moveToRecentlyDeleted(entry.id), "Moved to Recently Deleted.")} aria-label={`Delete ${name(entry)}`}>Delete</button>
                </>}
                {filter === "deleted" && <>
                  <button type="button" className="text-button" onClick={() => void run(log => log.restoreCase(entry.id), "Case restored.")} aria-label={`Restore ${name(entry)}`}>Restore</button>
                  <button type="button" className="text-button danger-text" aria-label={`Delete ${name(entry)} permanently`} onClick={() => nav.confirm({
                    title: "Delete this case permanently?",
                    body: <p className="control-hint">The case, its patient photos and results are removed from your account and signed-in devices after sync. This can’t be undone.</p>,
                    confirmLabel: "Delete permanently",
                    destructive: true,
                    onConfirm: async () => { await (await loadCaseLog()).deleteLogEntry(entry.id); await refresh(); return "Case permanently deleted."; },
                  })}>Delete now</button>
                </>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {filter === "deleted" && entries && entries.length > 0 && (
        <button type="button" className="text-button danger-text" onClick={() => nav.confirm({
          title: `Permanently delete ${entries.length} ${entries.length === 1 ? "case" : "cases"}?`,
          body: <p className="control-hint">Everything in Recently Deleted, including patient photos and results, is removed from this device. This can’t be undone.</p>,
          confirmLabel: "Delete permanently",
          destructive: true,
          onConfirm: async () => { await (await loadCaseLog()).emptyRecentlyDeleted(); await refresh(); return "Recently Deleted emptied."; },
        })}>Delete all permanently</button>
      )}
    </div>
  );
}
