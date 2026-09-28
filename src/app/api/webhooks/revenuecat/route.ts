import { handleRevenueCatWebhook } from "@/server/revenuecatWebhook";
import { accountServicesFromEnv } from "@/server/access";
import { allowSandbox, readServerEnvironment } from "@/server/env";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const env = readServerEnvironment();
  return handleRevenueCatWebhook(request, {
    store: accountServicesFromEnv(env)?.store ?? null,
    authorization: env.REVENUECAT_WEBHOOK_AUTH,
    allowSandbox: allowSandbox(env),
  });
}
