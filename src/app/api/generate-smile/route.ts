import { handleGenerationRequest } from "@/lib/generation/handler";
import { claimHostedRequest } from "@/lib/generation/netlifyRequestGuard";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  return handleGenerationRequest(request, undefined, claimHostedRequest);
}
