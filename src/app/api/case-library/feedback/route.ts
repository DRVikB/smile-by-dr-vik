import { handleStyleFeedback } from "@/server/caseLibraryHandlers";
import { accountServicesFromEnv } from "@/server/access";
import { readServerEnvironment } from "@/server/env";
import { preflight, withCors } from "@/lib/generation/cors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return withCors(request, await handleStyleFeedback(request, accountServicesFromEnv(readServerEnvironment())));
}
export function OPTIONS(request: Request) { return preflight(request, "POST"); }
