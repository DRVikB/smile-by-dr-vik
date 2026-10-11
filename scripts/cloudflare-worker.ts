import type { DurableObjectNamespace, DurableObjectState } from "@cloudflare/workers-types";
import { serveRequest, type Environment } from "./sites-worker";
import { accountServicesFromEnv } from "../src/server/access";
import { purgeExpiredLabShares } from "../src/server/labHandlers";

interface CloudflareEnvironment extends Environment {
  REQUEST_GUARD: DurableObjectNamespace;
}

/** One object per random request ID. Only a timestamp is stored, never photos. */
export class SmileRequestGuard {
  constructor(private state: DurableObjectState) {}

  async fetch(): Promise<Response> {
    const claimed = await this.state.storage.transaction(async storage => {
      if (await storage.get("claimed")) return false;
      const now = Date.now();
      await storage.put("claimed", now);
      await storage.setAlarm(now + 24 * 60 * 60 * 1000);
      return true;
    });
    return new Response(null, { status: claimed ? 201 : 409 });
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }
}

export default {
  /** Daily: remove the copied files of expired or withdrawn lab links. */
  async scheduled(_event: unknown, env: CloudflareEnvironment): Promise<void> {
    const accounts = accountServicesFromEnv(env);
    await purgeExpiredLabShares(accounts?.labs ? { accounts, labs: accounts.labs } : null);
  },
  fetch(request: Request, env: CloudflareEnvironment): Promise<Response> {
    return serveRequest(request, env, async id => {
      // No memory fallback: if protection fails, the shared handler blocks AI spend.
      const object = env.REQUEST_GUARD.get(env.REQUEST_GUARD.idFromName(id));
      const response = await object.fetch("https://request-guard.internal/claim", { method: "POST" });
      if (response.status === 201) return true;
      if (response.status === 409) return false;
      throw new Error("Request protection unavailable.");
    });
  },
};
