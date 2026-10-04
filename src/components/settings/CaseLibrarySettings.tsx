"use client";
import { BookOpen } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { useCaseLibrary } from "@/components/caseLibrary/caseLibraryContext";
import { formatBytes } from "@/components/caseLibrary/CaseLibraryView";
import { Row } from "./settingsParts";

/** Case Library: the clinician's finished work used as style references. Not patient Cases. */
export function CaseLibraryRow() {
  const lib = useCaseLibrary();
  const { openAuth } = useAccount();
  const icon = <BookOpen size={17} strokeWidth={1.6} />;
  if (lib.mode === "signedOut") return <Row icon={icon} label="Case Library" detail="Sign in to keep finished cases as style references" onClick={() => openAuth("signIn")} />;
  const count = lib.cases?.length;
  const value = count === undefined ? "…" : `${count} ${count === 1 ? "case" : "cases"}${lib.bytes ? ` · ${formatBytes(lib.bytes)}` : ""}`;
  return <Row icon={icon} label="Case Library" value={value} onClick={() => lib.open()} />;
}
