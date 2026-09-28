"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { RECENTLY_DELETED_DAYS } from "@/config/cases";
import type { CaseLogEntry } from "@/lib/types";
import type { CaseCounts, CaseState } from "@/lib/caseLog";
import { Group, Row, formatDate, useSettingsNav } from "./settingsParts";

const loadCaseLog = () => import("@/lib/caseLog");

/** Patient Cases: summary and routes only; the full case browser stays in Cases. Not the Case Library. */
export function CasesSection() {
  const nav = useSettingsNav();
  const [counts, setCounts] = useState<CaseCounts | null>(null);

  useEffect(() => {
    void loadCaseLog().then(async log => { await log.purgeRecentlyDeleted(); setCounts(await log.caseCounts()); }).catch(() => setCounts(null));
  }, []);

  const count = (n: number | undefined) => (n === undefined ? "…" : String(n));
  return (
    <Group id="settings-cases" title="Cases" footer="Patient cases, photos and results are stored only on this device.">
      <Row label="Active cases" value={count(counts?.active)} />
      <Row label="Archived cases" value={count(counts?.archived)} />
      <Row label="Manage Cases" onClick={() => nav.openPage({ kind: "cases", filter: "active" })} />
      <Row label="Archived Cases" onClick={() => nav.openPage({ kind: "cases", filter: "archived" })} />
      <Row label="Recently Deleted" value={counts?.deleted ? String(counts.deleted) : undefined} onClick={() => nav.openPage({ kind: "cases", filter: "deleted" })} />
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
  useEffect(() => { setEntries(null); void refresh(); }, [refresh]);

  const shown = useMemo(() => {
    if (!entries) return [];
    return entries
      .filter(entry => [entry.patientName, entry.summary, entry.label ?? ""].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => sort === "oldest" ? a.createdAt - b.createdAt
        : sort === "name" ? (a.patientName || "~").localeCompare(b.patientName || "~", "en-GB")
          : b.createdAt - a.createdAt);
  }, [entries, query, sort]);

  async function run(action: (log: Awaited<ReturnType<typeof loadCaseLog>>) => Promise<unknown>, message: string) {
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
        <p className="control-hint">Deleted cases stay on this device for {RECENTLY_DELETED_DAYS} days so you can restore them, then they’re permanently removed with their photos.</p>
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
                    body: <p className="control-hint">The case, its patient photos and results are removed from this device. This can’t be undone.</p>,
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
