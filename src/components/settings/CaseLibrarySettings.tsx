"use client";
import { useAccount } from "@/components/account/AccountProvider";
import { useCaseLibrary } from "@/components/caseLibrary/caseLibraryContext";
import { formatBytes } from "@/components/caseLibrary/CaseLibraryView";
import { Group, Row } from "./settingsParts";

/** Case Library: the clinician's finished work used as style references. Not patient Cases. */
export function CaseLibrarySection() {
  const lib = useCaseLibrary();
  const { status, openAuth } = useAccount();
  const count = lib.cases?.length;
  const limit = status?.storage?.limitBytes;

  if (lib.mode === "signedOut") {
    return (
      <Group id="settings-library" title="Case Library" footer="Your finished bonding and porcelain cases, used as private style references for new designs.">
        <Row label="Sign in to use Case Library" onClick={() => openAuth("signIn")} />
      </Group>
    );
  }

  return (
    <Group id="settings-library" title="Case Library"
      footer={lib.mode === "device"
        ? "Case Library photos are stored only on this device."
        : "Stored privately in your SmileCompose account. When “Use my Case Library” is on, a few matching references are sent with that design for AI processing. SmileCompose doesn’t use them to train AI models."}>
      <Row label="Style references" value={count === undefined ? "…" : `${count} ${count === 1 ? "case" : "cases"}`} />
      <Row label="Storage" value={lib.cases === null ? "…" : lib.bytes === 0 ? "None" : limit ? `${formatBytes(lib.bytes)} of ${formatBytes(limit)}` : formatBytes(lib.bytes)} />
      <Row label="Manage Case Library" onClick={() => lib.open()} />
      <Row label="Add Finished Case" onClick={() => lib.open({ add: true })} />
    </Group>
  );
}
