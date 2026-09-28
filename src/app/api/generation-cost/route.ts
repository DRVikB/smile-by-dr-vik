import { handlePricingRequest } from "@/lib/generation/pricing";
import { preflight, withCors } from "@/lib/generation/cors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return withCors(request, handlePricingRequest()); }
export function OPTIONS(request: Request) { return preflight(request, "GET"); }
