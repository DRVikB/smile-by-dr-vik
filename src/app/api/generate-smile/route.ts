import { handleGenerationRequest } from "@/lib/generation/handler";
import { claimHostedRequest } from "@/lib/generation/netlifyRequestGuard";
import { preflight, withCors } from "@/lib/generation/cors";
import { readServerEnvironment } from "@/server/env";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  return withCors(request, await handleGenerationRequest(request, readServerEnvironment(), claimHostedRequest));
}
export function OPTIONS(request: Request) {
  return preflight(request, "POST");
}
