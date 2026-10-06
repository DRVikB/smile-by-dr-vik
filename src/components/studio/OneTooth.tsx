"use client";
import type { SmileSettings } from "@/lib/types";
import { matchSummary, partnerOf, toothKind, toothLabel, withToothMatch, type MatchTooth, type ToothMatch } from "@/lib/smileDesign/toothMatch";

/** Upper front teeth as seen on the photo (patient's right on the left), with a size for the chart. */
const CHART: { tooth: MatchTooth; w: number; h: number }[] = [
  { tooth: 13, w: 30, h: 50 }, { tooth: 12, w: 30, h: 46 }, { tooth: 11, w: 38, h: 56 },
  { tooth: 21, w: 38, h: 56 }, { tooth: 22, w: 30, h: 46 }, { tooth: 23, w: 30, h: 50 },
];

/**
 * One-tooth matching on the Teeth step: choose the tooth (here or on the photo)
 * and whether it is chipped/worn or missing. It is rebuilt from its partner on
 * the other side, so the pair match.
 */
export function OneToothPlan({ settings, onChange, guideStatus, onAdjust }: {
  settings: SmileSettings;
  onChange: (s: SmileSettings) => void;
  guideStatus?: "fitting" | "ready" | "unavailable";
  onAdjust: () => void;
}) {
  const match = settings.toothMatch as ToothMatch;
  const set = (patch: Partial<ToothMatch>) => onChange(withToothMatch(settings, { ...match, ...patch }));
  const partner = partnerOf(match.tooth);
  return (
    <div className="one-tooth">
      <div className="one-tooth-chart" role="group" aria-label="Tooth to match">
        {CHART.map(({ tooth, w, h }, i) => {
          const on = tooth === match.tooth, source = tooth === partner;
          return (
            <button key={tooth} type="button" className={`one-tooth-key${on ? " on" : ""}${source ? " source" : ""}${i === 3 ? " after-midline" : ""}`}
              aria-pressed={on} aria-label={`${toothLabel(tooth)}, ${toothKind(tooth)}${on ? ", selected" : source ? `, copied for ${toothLabel(match.tooth)}` : ""}`}
              onClick={() => set({ tooth })}>
              <span className="one-tooth-shape" style={{ width: w, height: h }} aria-hidden="true" />
              <span className="one-tooth-name">{toothLabel(tooth)}</span>
            </button>
          );
        })}
      </div>
      <div className="segmented" role="group" aria-label={`${toothLabel(match.tooth)} condition`}>
        <button type="button" aria-pressed={!match.missing} className={!match.missing ? "selected" : ""} onClick={() => set({ missing: false })}>Chipped or worn</button>
        <button type="button" aria-pressed={match.missing} className={match.missing ? "selected" : ""} onClick={() => set({ missing: true })}>Missing</button>
      </div>
      <p className="studio-summary">
        <strong>{matchSummary(match)}</strong>
        <span>{match.missing
          ? `A new ${toothKind(match.tooth)} fills the space, designed as a mirror of ${toothLabel(partner)} to suit the teeth beside it.`
          : `${toothLabel(match.tooth)} is rebuilt with ${toothLabel(partner)}’s shape, length, edge and shade, so the two ${["centrals", "laterals", "canines"][(match.tooth % 10) - 1]} match.`}</span>
      </p>
      {guideStatus === "unavailable"
        ? <p className="scale-notice" role="status"><span>Teeth not found</span>The teeth couldn’t be found clearly in this photo, so they can’t be matched. Try a clearer, front-facing smile.</p>
        : <p className="control-hint">Tap a tooth on the photo to choose it. Only {toothLabel(match.tooth)}’s outlined area can change: every other tooth, the gums and lips stay as photographed. If the outlines don’t sit on the teeth, <button type="button" className="text-button" onClick={onAdjust}>adjust them</button>.</p>}
    </div>
  );
}
