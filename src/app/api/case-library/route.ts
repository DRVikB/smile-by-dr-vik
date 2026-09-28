import { handleCaseLibraryCreate, handleCaseLibraryList } from "@/server/caseLibraryHandlers";
import { accountServicesFromEnv } from "@/server/access";
import { readServerEnvironment } from "@/server/env";
import { preflight, withCors } from "@/lib/generation/cors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withCors(request, await handleCaseLibraryList(request, accountServicesFromEnv(readServerEnvironment())));
}
export async function POST(request: Request) {
  return withCors(request, await handleCaseLibraryCreate(request, accountServicesFromEnv(readServerEnvironment())));
}
export function OPTIONS(request: Request) { return preflight(request, "GET, POST"); }
