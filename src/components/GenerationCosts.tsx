"use client";
import { useAccount } from "@/components/account/AccountProvider";
import { entitlementOf } from "@/lib/allowance";
import type { CaseCosts, GenerationPricing, ImageResolution } from "@/lib/generation/cost";

/**
 * What an action takes from the clinician's generation allowance. Every AI
 * request uses one generation, whatever its detail level; requests that fail
 * are returned to the allowance by the server. Test mode uses none.
 */
export function allowanceLabel(count: number, testMode: boolean): string {
  if (testMode) return "No allowance used";
  return `${count} generation${count === 1 ? "" : "s"}`;
}

export interface GenerationCostsProps {
  pricing: GenerationPricing | null;
  resolution: ImageResolution;
  onResolution: (value: ImageResolution) => void;
  costs: CaseCosts;
  testMode: boolean;
  busy: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  requestLimit?: number;
  onRequestLimit?: (limit: number) => void;
}

/** "Allowance": what each action uses, what this case has used, and what's left this period. */
export function GenerationCosts({ pricing, resolution, onResolution, costs, testMode, busy, open, onOpen, requestLimit, onRequestLimit }: GenerationCostsProps) {
  const { status } = useAccount();
  const entitlement = status ? entitlementOf(status) : null;
  const used = testMode ? 0 : costs.completed;
  return <div className="generation-costs">
    <button type="button" className="cost-toggle" aria-expanded={open} onClick={() => onOpen(!open)}>
      <span>Allowance</span><span>{open ? "Hide" : "Show"}</span>
    </button>
    {open && <div className="cost-content">
      <dl className="cost-lines">
        <div><dt>One preview or adjustment</dt><dd>{allowanceLabel(1, testMode)}</dd></div>
        <div><dt>Three options</dt><dd>{allowanceLabel(3, testMode)}</dd></div>
        <div><dt>Used in this case</dt><dd>{used} generation{used === 1 ? "" : "s"}</dd></div>
        {entitlement && entitlement.subscriptionStatus !== "none" && <div><dt>Generations remaining</dt><dd>{entitlement.balance}</dd></div>}
      </dl>
      {!testMode && pricing?.supportsDraft && <div className="segmented" role="group" aria-label="Generation detail">
        <button type="button" disabled={busy} aria-pressed={resolution === "1K"} className={resolution === "1K" ? "selected" : ""} onClick={() => onResolution("1K")}>Standard detail</button>
        <button type="button" disabled={busy} aria-pressed={resolution === "512"} className={resolution === "512" ? "selected" : ""} onClick={() => onResolution("512")}>Draft · faster</button>
      </div>}
      {!testMode && resolution === "512" && <p className="control-hint">Lower detail for exploring ideas. Both detail levels use one generation; a standard version is a new generation, not an upscale of the draft.</p>}
      {onRequestLimit && <label className="control-hint">Case limit<select className="design-select" disabled={busy} value={requestLimit ?? 0} onChange={e => onRequestLimit(Number(e.target.value))}>{[0,3,5,10,20].map(n => <option key={n} value={n}>{n ? `${n} generations per case` : "No limit"}</option>)}</select></label>}
      <p className="control-hint">{testMode ? "Test mode uses prepared examples, so nothing is taken from your allowance." : "A design that fails is returned to your allowance automatically. Switching between options, comparing, analysis, video and saving never use one."}</p>
      <p className="control-hint">For your planning. Not shown in patient views or exports.</p>
    </div>}
  </div>;
}
