import { ClipboardList } from "lucide-react";
import { treatmentImplications } from "@/lib/implications";
import type { GenerationResult, SmileSettings } from "@/lib/types";

/** What getting to this preview would involve — worked out locally, no AI. */
export function Implications({
  settings,
  result,
}: {
  settings: SmileSettings;
  result: Pick<GenerationResult, "scaleFlag">;
}) {
  const { items, confirm } = treatmentImplications(settings, result);
  return (
    <details className="implications">
      <summary>
        <ClipboardList size={16} strokeWidth={1.6} />
        What this would take
      </summary>
      <ul className="implications-list">
        {items.map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </li>
        ))}
      </ul>
      <p className="implications-confirm-title">To confirm at assessment</p>
      <ul className="implications-confirm">
        {confirm.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </details>
  );
}
