"use client";
import { formatUsd, PRICING_URL, type CaseCosts, type GenerationPricing, type ImageResolution } from "@/lib/generation/cost";

export function generationCostLabel(pricing: GenerationPricing | null, resolution: ImageResolution, count: number, testMode: boolean): string {
  if (testMode || pricing?.free) return "No AI charge";
  if (!pricing?.outputUsd) return "Cost estimate unavailable";
  return `From ${formatUsd(pricing.outputUsd[resolution] * count)} + tokens`;
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

export function GenerationCosts({ pricing, resolution, onResolution, costs, testMode, busy, open, onOpen, requestLimit, onRequestLimit }: GenerationCostsProps) {
  const free = testMode || pricing?.free;
  const unresolved = costs.requested - costs.completed;
  return <div className="generation-costs">
    <button type="button" className="cost-toggle" aria-expanded={open} onClick={() => onOpen(!open)}>
      <span>Clinician costs</span><span>{open ? "Hide" : "Show"}</span>
    </button>
    {open && <div className="cost-content">
      <p className="control-hint">For your planning. Not included in patient views or exports.</p>
      {!free && pricing?.supportsDraft && <div className="segmented" role="group" aria-label="Generation detail">
        <button type="button" disabled={busy} aria-pressed={resolution === "1K"} className={resolution === "1K" ? "selected" : ""} onClick={() => onResolution("1K")}>Standard · 1K</button>
        <button type="button" disabled={busy} aria-pressed={resolution === "512"} className={resolution === "512" ? "selected" : ""} onClick={() => onResolution("512")}>Draft · 512px</button>
      </div>}
      {!free && resolution === "512" && <p className="control-hint">Lower detail for exploring ideas. A new 1K generation costs extra and may vary; it is not an upscale of this draft.</p>}
      {onRequestLimit && <label className="control-hint">Case request limit<select className="design-select" disabled={busy} value={requestLimit ?? 0} onChange={e => onRequestLimit(Number(e.target.value))}>{[0,3,5,10,20].map(n => <option key={n} value={n}>{n ? `${n} requests per case` : "No limit"}</option>)}</select></label>}
      <p className="control-hint">A device-local request allowance, not a hard dollar cap. Failed requests count because they may be charged. New Smile / Reset starts a new allowance.</p>
      <dl className="cost-lines">
        <div><dt>One preview / adjustment</dt><dd>{generationCostLabel(pricing, resolution, 1, testMode)}</dd></div>
        <div><dt>Three options</dt><dd>{generationCostLabel(pricing, resolution, 3, testMode)}</dd></div>
        <div><dt>Recorded estimate this case</dt><dd>{formatUsd(costs.estimatedUsd)}{(costs.imageOnly > 0 || costs.unpriced > 0 || unresolved > 0) && " + unknown charges"}</dd></div>
      </dl>
      <p className="control-hint">{costs.requested} requests sent · {costs.completed} responses received. </p>
      {unresolved > 0 && <p className="control-hint">{unresolved} pending, failed or cancelled requests have unconfirmed cost. Cancelling or losing connection may not prevent a provider charge.</p>}
      {(costs.imageOnly > 0 || costs.unpriced > 0) && <p className="control-hint">Some responses have incomplete pricing data. The recorded subtotal does not include all charges.</p>}
      <p className="control-hint">{free ? "Test previews have no AI charge." : "Image-output estimates; input/reference and thinking tokens cost extra. USD, excluding tax and hosting."}</p>
      <details className="cost-explainer"><summary>How costs work</summary>
      <p className="control-hint">Recorded estimates use returned usage where available, not invoice data. Tracking starts with this update. Replacing the photo keeps the case total; New Smile / Reset clears it.</p>
      <p className="control-hint">Choose your settings first, then create one preview. Three options send three requests. Switching existing options, comparison, analysis, video and saving need no extra AI generation.</p>
      {!free && <p className="control-hint">{pricing?.model ?? "Pricing could not be loaded"} · <a href={PRICING_URL} target="_blank" rel="noreferrer">Google pricing</a>{pricing && ` · checked ${pricing.checkedAt}`}</p>}
      </details>
    </div>}
  </div>;
}
