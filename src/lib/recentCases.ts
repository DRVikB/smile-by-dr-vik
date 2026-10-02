import type { CaseLogEntry } from "./types";

export type RecentCase = CaseLogEntry & { versions: number };

/** One cover per case, newest activity first, with every case reachable. */
export function recentCasePages(entries: CaseLogEntry[]): RecentCase[][] {
  const groups = new Map<string, CaseLogEntry[]>();
  for (const entry of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
    const key = entry.caseId ?? entry.id;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const cases = [...groups.values()].map(group => ({
    ...(group.find(entry => entry.favourite) ?? group[0]),
    createdAt: group[0].createdAt,
    patientName: group.find(entry => entry.patientName)?.patientName ?? "",
    versions: group.length,
  }));
  return Array.from({ length: Math.ceil(cases.length / 3) }, (_, i) => cases.slice(i * 3, i * 3 + 3));
}
