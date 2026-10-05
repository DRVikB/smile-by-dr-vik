"use client";
import { useEffect, useState } from "react";
import { getCaseRepository } from "@/services/cases/caseRepository";
import type { CaseConsultation } from "@/lib/caseConsultation";

export interface CaseRecord { consultation?: CaseConsultation; preferredDesignId: string | null }

/** A saved case's consultation record and the patient's preferred version, kept current as the case changes. */
export function useCaseRecord(caseId: string | undefined): CaseRecord {
  const [record, setRecord] = useState<CaseRecord>({ preferredDesignId: null });
  useEffect(() => {
    if (!caseId) { setRecord({ preferredDesignId: null }); return; }
    const repository = getCaseRepository();
    let live = true;
    const load = () => { void repository.caseRecord(caseId).then(next => { if (live) setRecord(next); }).catch(() => {}); };
    load();
    const off = repository.subscribe(load);
    return () => { live = false; off(); };
  }, [caseId]);
  return record;
}
