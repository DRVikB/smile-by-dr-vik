import { handlePatientCases } from "../src/server/patientCaseHandlers";
import { handlePricingRequest } from "../src/lib/generation/pricing";
import { handleGenerationRequest } from "../src/lib/generation/handler";
import type { ServerEnvironment } from "../src/server/env";
import { allowSandbox } from "../src/server/env";
import { accountServicesFromEnv } from "../src/server/access";
import { appleCredentialsFromEnv, handleAccountDelete, handleAccountExport, handleAccountStatus, handleConsents, handleProfileUpdate, handleAvatar } from "../src/server/accountHandlers";
import { handleCaseLibraryCreate, handleCaseLibraryDelete, handleCaseLibraryList, handleCaseLibraryUpdate, handleStyleFeedback } from "../src/server/caseLibraryHandlers";
import { handleRevenueCatWebhook } from "../src/server/revenuecatWebhook";
import { handleLabReplyFile, handleLabShareCreate, handleLabShareRevoke, handleLabWrite, handleLabsList, handlePortal, type LabServices } from "../src/server/labHandlers";
import labPortal from "../public/portal.html";
import { createSupabaseLeadStore, handleLead } from "../src/server/leads";
import { createSupabaseAdminStore, handleAdmin, handleAdminMe, type AdminServices } from "../src/server/adminHandlers";
import { createSupabaseAccessCodeStore, handleRedeemCode } from "../src/server/accessCodes";
import type { RequestClaim } from "../src/lib/generation/requestGuard";
import { preflight, withCors } from "../src/lib/generation/cors";
import html from "../.next/server/app/index.html";
import landing from "../public/welcome.html";
import { opensApp } from "../src/lib/webEntry";
import { BASE_SECURITY_HEADERS, landingSecurityHeaders, pageSecurityHeaders,inlineScriptHashes } from "../src/server/securityHeaders";
const scriptHashes=inlineScriptHashes(html);
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
        return preflight(request, url.pathname.startsWith("/api/patient-cases") ? "GET, POST, PATCH, DELETE, PUT" : url.pathname === "/api/case-library" ? "GET, POST"
          : url.pathname === "/api/account/consents" || url.pathname === "/api/labs" ? "GET, POST"
          : url.pathname.startsWith("/api/portal/") ? "GET, POST"
          : url.pathname.startsWith("/api/admin/") ? "GET, POST"
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
    // The website: signed-out visitors get the landing page at "/"; /signin opens the app's sign-in page.
    if (url.pathname === "/signin" || url.pathname === "/signup" || url.pathname === "/app")
      return Response.redirect(new URL(`/?${url.pathname.slice(1)}`, url).toString(), 302);
    // A lab opening a shared lab pack: no account, its own strict page.
    if (/^\/portal\/[A-Za-z0-9_-]{20,64}$/.test(url.pathname)) {
      if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
      return new Response(request.method === "HEAD" ? null : labPortal, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", ...landingSecurityHeaders(), "Referrer-Policy": "no-referrer" },
      });
    }
    if (url.pathname === "/welcome.html") return Response.redirect(new URL("/welcome", url).toString(), 308);
    if (url.pathname === "/welcome" || (url.pathname === "/" && !opensApp(url, request.headers.get("Cookie")))) {
      if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
      return new Response(request.method === "HEAD" ? null : landing, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", Vary: "Cookie", ...landingSecurityHeaders() },
      });
    }
    if (url.pathname === "/" || url.pathname === "/offline-shell.html") {
      if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
      return new Response(request.method === "HEAD" ? null : html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
          Vary: "Cookie",
          ...pageSecurityHeaders(env.SUPABASE_URL,await scriptHashes),
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
function adminServices(env: Environment): AdminServices | null {
    const accounts = accountServicesFromEnv(env);
    return accounts ? { accounts, admin: createSupabaseAdminStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!), codes: createSupabaseAccessCodeStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!) } : null;
}
function labServices(env: Environment): LabServices | null {
    const accounts = accountServicesFromEnv(env);
    return accounts?.labs ? { accounts, labs: accounts.labs } : null;
}
async function serveApi(request: Request, url: URL, env: Environment, claim?: RequestClaim): Promise<Response> {
    if (url.pathname === "/api/leads")
      return handleLead(request, env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createSupabaseLeadStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) : null);
    if (url.pathname === "/api/account/redeem-code") {
      const accounts = accountServicesFromEnv(env);
      return handleRedeemCode(request, accounts ? { ...accounts, codes: createSupabaseAccessCodeStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!) } : null);
    }
    if (url.pathname === "/api/admin/me") return handleAdminMe(request, adminServices(env));
    if (url.pathname.startsWith("/api/admin/")) return handleAdmin(request, adminServices(env), url.pathname.slice("/api/admin/".length), url.searchParams);
    if (url.pathname === "/api/labs")
      return request.method === "GET" ? handleLabsList(request, labServices(env)) : handleLabWrite(request, labServices(env), "create");
    if (url.pathname === "/api/labs/update") return handleLabWrite(request, labServices(env), "update");
    if (url.pathname === "/api/labs/delete") return handleLabWrite(request, labServices(env), "delete");
    if (url.pathname === "/api/lab-shares") return handleLabShareCreate(request, labServices(env), url.origin);
    if (url.pathname === "/api/lab-shares/revoke") return handleLabShareRevoke(request, labServices(env));
    if (url.pathname.startsWith("/api/lab-shares/")) return handleLabReplyFile(request, labServices(env), url.pathname.slice("/api/lab-shares/".length));
    if (url.pathname.startsWith("/api/portal/")) return handlePortal(request, labServices(env), url.pathname.slice("/api/portal/".length));
    if (url.pathname === "/api/patient-cases" || url.pathname.startsWith("/api/patient-cases/")) {
      const accounts=accountServicesFromEnv(env);
      return handlePatientCases(request,accounts?.patients?{accounts,patients:accounts.patients}:null);
    }
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
