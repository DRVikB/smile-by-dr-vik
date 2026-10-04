import { readProviderEnvironment, type ProviderEnvironment } from "@/lib/generation/provider";

/**
 * Server-only configuration. None of these values may be referenced from
 * client code: service-role, RevenueCat secret and Apple keys stay in Worker
 * secrets / host environment variables.
 */
export interface ServerEnvironment extends ProviderEnvironment {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  REVENUECAT_SECRET_API_KEY?: string;
  REVENUECAT_WEBHOOK_AUTH?: string;
  /** "true" (default) accepts App Store sandbox purchases: TestFlight and App Review use sandbox. */
  REVENUECAT_ALLOW_SANDBOX?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  /** Native bundle ID, used to revoke Sign in with Apple tokens on account deletion. */
  APPLE_CLIENT_ID?: string;
  /** Case Library references attached to one generation (1–5, default 3). */
  STYLE_REFERENCE_LIMIT?: string;
  /** Server-controlled internal testing only; never accepted from a request. Default off. */
  SMILE_INTERNAL_SINGLE_TOOTH?: string;
  SMILE_INTERNAL_ALIGNMENT?: string;
  SMILE_INTERNAL_FULL_ARCH?: string;
  /** Private staging diagnostic pins. All are required; never accepted from a client. */
  SMILE_QA_CAPTURE_ENABLED?: string;
  SMILE_QA_CAPTURE_RUN_ID?: string;
  SMILE_QA_CAPTURE_REQUEST_ID?: string;
  SMILE_QA_CAPTURE_USER_ID?: string;
  SMILE_QA_CAPTURE_SOURCE_SHA256?: string;
  SMILE_QA_CAPTURE_SETTINGS_SHA256?: string;
}

const SERVER_KEYS = [
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REVENUECAT_SECRET_API_KEY", "REVENUECAT_WEBHOOK_AUTH",
  "REVENUECAT_ALLOW_SANDBOX", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_CLIENT_ID",
  "STYLE_REFERENCE_LIMIT",
  "SMILE_INTERNAL_SINGLE_TOOTH", "SMILE_INTERNAL_ALIGNMENT", "SMILE_INTERNAL_FULL_ARCH",
  "SMILE_QA_CAPTURE_ENABLED", "SMILE_QA_CAPTURE_RUN_ID", "SMILE_QA_CAPTURE_REQUEST_ID",
  "SMILE_QA_CAPTURE_USER_ID", "SMILE_QA_CAPTURE_SOURCE_SHA256", "SMILE_QA_CAPTURE_SETTINGS_SHA256",
] as const;

export function readServerEnvironment(): ServerEnvironment {
  const netlify = (globalThis as typeof globalThis & { Netlify?: { env: { get(name: string): string | undefined } } }).Netlify;
  const read = (key: string) => (netlify ? netlify.env.get(key) : process.env[key]);
  const env: ServerEnvironment = { ...readProviderEnvironment() };
  for (const key of SERVER_KEYS) env[key] = read(key);
  return env;
}

export type AccountsMode = "required" | "misconfigured";

/**
 * Every real AI generation is attached to a signed-in account, so accounts are
 * always required; there is no switch to turn them off (use the mock provider
 * for local development without accounts).
 */
export function accountsMode(env: ServerEnvironment): AccountsMode {
  return env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.REVENUECAT_SECRET_API_KEY ? "required" : "misconfigured";
}

export function allowSandbox(env: ServerEnvironment): boolean {
  return env.REVENUECAT_ALLOW_SANDBOX !== "false";
}
