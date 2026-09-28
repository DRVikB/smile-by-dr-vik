import { handlePricingRequest } from "../src/lib/generation/pricing";
import { handleGenerationRequest } from "../src/lib/generation/handler";
import type { ServerEnvironment } from "../src/server/env";
import { allowSandbox } from "../src/server/env";
import { accountServicesFromEnv } from "../src/server/access";
import { appleCredentialsFromEnv, handleAccountDelete, handleAccountExport, handleAccountStatus, handleConsents, handleProfileUpdate, handleAvatar } from "../src/server/accountHandlers";
import { handleCaseLibraryCreate, handleCaseLibraryDelete, handleCaseLibraryList, handleCaseLibraryUpdate, handleStyleFeedback } from "../src/server/caseLibraryHandlers";
import { handleRevenueCatWebhook } from "../src/server/revenuecatWebhook";
import type { RequestClaim } from "../src/lib/generation/requestGuard";
import { preflight, withCors } from "../src/lib/generation/cors";
import html from "../.next/server/app/index.html";
import { BASE_SECURITY_HEADERS, pageSecurityHeaders } from "../src/server/securityHeaders";
import { safeLog } from "../src/server/redact";
export interface Environment extends ServerEnvironment {
  ASSETS?: { fetch(request: Request): Promise<Response> };
}
function withHeaders(response: Response, extra: Record<string, string>): Response {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
export async function serveRequest(request: Request, env: Environment, claim?: RequestClaim): Promise<Response> {
    const url = new URL(request.url);
    // The packaged iOS app (capacitor://localhost) is the only cross-origin API caller.
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS")
        return preflight(request, url.pathname === "/api/case-library" ? "GET, POST"
          : ["/api/generation-cost", "/api/account/status", "/api/account/export"].includes(url.pathname) ? "GET" : "POST");
      try {
        return withHeaders(withCors(request, await serveApi(request, url, env, claim)), BASE_SECURITY_HEADERS);
      } catch (error) {
        // Category only: request bodies, images and tokens are never logged.
        safeLog("error", "api_unhandled", { path: url.pathname, name: error instanceof Error ? error.name : "unknown" });
        return withCors(request, Response.json({ error: "Something went wrong. Please try again." }, { status: 500, headers: { "Cache-Control": "no-store", ...BASE_SECURITY_HEADERS } }));
      }
    }
    if (url.pathname === "/privacy" || url.pathname === "/terms")
      return Response.redirect(new URL(`${url.pathname}.html`, url).toString(), 308);
    if (url.pathname === "/") {
      if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
      return new Response(request.method === "HEAD" ? null : html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
          ...pageSecurityHeaders(env.SUPABASE_URL),
        },
      });
    }
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (url.pathname !== "/sw.js") return response;
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-cache");
      headers.set("Service-Worker-Allowed", "/");
      return new Response(response.body, { status: response.status, headers });
    }
    return new Response("Not found", { status: 404 });
}
async function serveApi(request: Request, url: URL, env: Environment, claim?: RequestClaim): Promise<Response> {
    if (url.pathname === "/api/generation-cost") {
      if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
      return handlePricingRequest(env);
    }
    if (url.pathname === "/api/generate-smile") {
      if (request.method !== "POST")
        return Response.json(
          { error: "Use POST to generate a smile." },
          { status: 405, headers: { Allow: "POST" } },
        );
      return handleGenerationRequest(request, env, claim);
    }
    if (url.pathname === "/api/account/status") {
      if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
      return handleAccountStatus(request, accountServicesFromEnv(env));
    }
    if (url.pathname === "/api/account/export") {
      if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
      return handleAccountExport(request, accountServicesFromEnv(env));
    }
    if (url.pathname === "/api/account/consents")
      return handleConsents(request, accountServicesFromEnv(env));
    if (url.pathname === "/api/account/profile")
      return handleProfileUpdate(request, accountServicesFromEnv(env));
    if (url.pathname === "/api/account/avatar")
      return handleAvatar(request, accountServicesFromEnv(env));
    if (url.pathname === "/api/case-library")
      return request.method === "GET" ? handleCaseLibraryList(request, accountServicesFromEnv(env))
        : request.method === "POST" ? handleCaseLibraryCreate(request, accountServicesFromEnv(env))
          : new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
    if (url.pathname === "/api/case-library/update")
      return handleCaseLibraryUpdate(request, accountServicesFromEnv(env));
    if (url.pathname === "/api/case-library/delete")
      return handleCaseLibraryDelete(request, accountServicesFromEnv(env));
    if (url.pathname === "/api/case-library/feedback")
      return handleStyleFeedback(request, accountServicesFromEnv(env));
    if (url.pathname === "/api/account/delete")
      return handleAccountDelete(request, accountServicesFromEnv(env), appleCredentialsFromEnv(env));
    if (url.pathname === "/api/webhooks/revenuecat")
      return handleRevenueCatWebhook(request, {
        store: accountServicesFromEnv(env)?.store ?? null,
        authorization: env.REVENUECAT_WEBHOOK_AUTH,
        allowSandbox: allowSandbox(env),
      });
    return new Response("Not found", { status: 404 });
}
export default { fetch: (request: Request, env: Environment) => serveRequest(request, env) };
