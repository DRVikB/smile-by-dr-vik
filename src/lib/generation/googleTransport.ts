/**
 * How the Gemini image adapter reaches Google. The request body is identical;
 * only the endpoint and credentials differ:
 *   - "developer": Gemini Developer API (paid tier), API key header.
 *   - "vertex":    Google Cloud Vertex AI, service-account OAuth token, with a
 *                  chosen project and location (data residency options,
 *                  enterprise data-processing terms).
 * Selected by SMILE_PROVIDER=gemini or SMILE_PROVIDER=vertex; no app rewrite.
 */
export interface GoogleTransport {
  kind: "developer" | "vertex";
  url(model: string): string;
  headers(fetcher: typeof fetch): Promise<Record<string, string>>;
  configured: boolean;
}

export function developerTransport(apiKey: string): GoogleTransport {
  return {
    kind: "developer",
    configured: Boolean(apiKey.trim()),
    url: model => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: async () => ({ "x-goog-api-key": apiKey }),
  };
}

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function parseServiceAccount(json: string | undefined): ServiceAccount | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as Partial<ServiceAccount>;
    return parsed.client_email && parsed.private_key ? { client_email: parsed.client_email, private_key: parsed.private_key, token_uri: parsed.token_uri } : null;
  } catch {
    return null;
  }
}

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** RS256-signed JWT for Google's OAuth "jwt-bearer" grant (WebCrypto; runs in Workers). */
export async function serviceAccountAssertion(account: ServiceAccount, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const pem = account.private_key.replace(/\\n/g, "\n").replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const encode = (value: object) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: account.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(signature)}`;
}

export function vertexTransport(options: { projectId: string; location: string; account: ServiceAccount | null }): GoogleTransport {
  let cached: { token: string; expiresAt: number } | null = null;
  const { projectId, location, account } = options;
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  return {
    kind: "vertex",
    configured: Boolean(projectId && location && account),
    url: model =>
      `https://${host}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`,
    async headers(fetcher) {
      if (!account) throw new Error("Vertex AI service account is not configured.");
      if (!cached || cached.expiresAt < Date.now() + 60_000) {
        const response = await fetcher(account.token_uri ?? "https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: await serviceAccountAssertion(account) }).toString(),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("Vertex AI authentication failed.");
        const body = await response.json() as { access_token?: string; expires_in?: number };
        if (!body.access_token) throw new Error("Vertex AI authentication failed.");
        cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
      }
      return { Authorization: `Bearer ${cached.token}` };
    },
  };
}
