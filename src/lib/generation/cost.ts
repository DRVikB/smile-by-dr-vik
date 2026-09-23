/** Public list prices, not billing credentials. USD; excludes tax and hosting.
 * Checked 2026-09-22: https://ai.google.dev/gemini-api/docs/pricing
 * Keep unknown models unpriced rather than applying another model's tariff.
 */
export const PRICING_DATE = "2026-09-22";
export const PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing";
export type ImageResolution = "512" | "1K";
export const PRICED_GEMINI_MODEL = "gemini-3.1-flash-image";
export const OUTPUT_TOKENS = { "512": 747, "1K": 1120 } as const;
export interface GenerationPricing {
  model: string;
  free: boolean;
  supportsDraft: boolean;
  outputUsd: Record<ImageResolution, number> | null;
  checkedAt: string;
}
export interface CostReceipt {
  usd: number;
  basis: "usage" | "image-only";
  model: string;
  resolution: ImageResolution;
}
export interface CaseCosts {
  requested: number;
  completed: number;
  estimatedUsd: number;
  imageOnly: number;
  unpriced: number;
}
export const emptyCaseCosts = (): CaseCosts => ({ requested: 0, completed: 0, estimatedUsd: 0, imageOnly: 0, unpriced: 0 });
export function completeCost(costs: CaseCosts, receipt?: CostReceipt): CaseCosts {
  return { ...costs, completed: costs.completed + 1,
    estimatedUsd: costs.estimatedUsd + (receipt?.usd ?? 0),
    imageOnly: costs.imageOnly + (receipt?.basis === "image-only" ? 1 : 0),
    unpriced: costs.unpriced + (receipt ? 0 : 1) };
}
export function validCaseCosts(value: unknown): value is CaseCosts {
  if (!value || typeof value !== "object") return false;
  const c = value as CaseCosts;
  return [c.requested, c.completed, c.imageOnly, c.unpriced].every((n) => Number.isSafeInteger(n) && n >= 0)
    && Number.isFinite(c.estimatedUsd) && c.estimatedUsd >= 0
    && c.completed <= c.requested && c.imageOnly + c.unpriced <= c.completed;
}
export function formatUsd(value: number): string {
  return `US$${value.toFixed(3)}`;
}
export function imageOutputCost(resolution: ImageResolution): number {
  return OUTPUT_TOKENS[resolution] * 60 / 1_000_000;
}
/** Calculate from Google's token breakdown when available. No invoice claims.
 * Without a usable breakdown, report only the known image-output component.
 */
export function geminiCostReceipt(model: string, resolution: ImageResolution, usage: unknown): CostReceipt | undefined {
  if (model !== PRICED_GEMINI_MODEL) return undefined;
  const fallback: CostReceipt = { usd: imageOutputCost(resolution), basis: "image-only", model, resolution };
  if (!usage || typeof usage !== "object") return fallback;
  const u = usage as { promptTokenCount?: number; thoughtsTokenCount?: number; candidatesTokensDetails?: { modality: string; tokenCount: number }[] };
  const count = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!count(u.promptTokenCount) || (u.thoughtsTokenCount !== undefined && !count(u.thoughtsTokenCount)) || !Array.isArray(u.candidatesTokensDetails)) return fallback;
  if (!u.candidatesTokensDetails.every((d) => d && ["TEXT", "IMAGE"].includes(d.modality) && count(d.tokenCount))) return fallback;
  const images = u.candidatesTokensDetails.filter((d) => d.modality === "IMAGE").reduce((n, d) => n + d.tokenCount, 0);
  const text = u.candidatesTokensDetails.filter((d) => d.modality === "TEXT").reduce((n, d) => n + d.tokenCount, 0);
  if (!images) return fallback;
  return { ...fallback, basis: "usage", usd: (u.promptTokenCount * 0.5 + images * 60 + (text + (u.thoughtsTokenCount ?? 0)) * 3) / 1_000_000 };
}
