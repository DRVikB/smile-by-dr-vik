import { handlePatientCases } from "@/server/patientCaseHandlers";
import { accountServicesFromEnv } from "@/server/access";
import { readServerEnvironment } from "@/server/env";
import { preflight, withCors } from "@/lib/generation/cors";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function handle(request:Request) {
 const accounts=accountServicesFromEnv(readServerEnvironment());
 return withCors(request,await handlePatientCases(request,accounts?.patients?{accounts,patients:accounts.patients}:null));
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as PUT };
export function OPTIONS(request:Request){return preflight(request,"GET, POST, PATCH, DELETE, PUT");}
