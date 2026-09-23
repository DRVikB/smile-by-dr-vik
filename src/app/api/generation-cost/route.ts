import { handlePricingRequest } from "@/lib/generation/pricing";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() { return handlePricingRequest(); }
