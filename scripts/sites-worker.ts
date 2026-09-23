import { handlePricingRequest } from "../src/lib/generation/pricing";
import { handleGenerationRequest } from "../src/lib/generation/handler";
import type { ProviderEnvironment } from "../src/lib/generation/provider";
import html from "../.next/server/app/index.html";
interface Environment extends ProviderEnvironment {
  ASSETS?: { fetch(request: Request): Promise<Response> };
}
export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
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
      return handleGenerationRequest(request, env);
    }
    if (url.pathname === "/")
      return new Response(request.method === "HEAD" ? null : html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
