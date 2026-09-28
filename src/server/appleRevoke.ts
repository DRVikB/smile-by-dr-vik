/**
 * Revoke Sign in with Apple tokens when an account is deleted, as Apple
 * requires. The app obtains a fresh authorization code from Apple at deletion
 * time; the server exchanges it for a refresh token and revokes it.
 * Requires APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (.p8) and APPLE_CLIENT_ID.
 */
export interface AppleCredentials {
  teamId: string;
  keyId: string;
  privateKey: string;
  clientId: string;
}

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function clientSecret(credentials: AppleCredentials, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const pem = credentials.privateKey.replace(/\\n/g, "\n").replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const encode = (value: object) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: "ES256", kid: credentials.keyId })}.${encode({
    iss: credentials.teamId, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: credentials.clientId,
  })}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(signature)}`;
}

export async function revokeAppleAuthorization(
  authorizationCode: string,
  credentials: AppleCredentials,
  fetcher: typeof fetch = (i, init) => globalThis.fetch(i, init),
): Promise<boolean> {
  const secret = await clientSecret(credentials);
  const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
  const formHeaders = { "Content-Type": "application/x-www-form-urlencoded" };
  const token = await fetcher("https://appleid.apple.com/auth/token", {
    method: "POST", headers: formHeaders, signal: AbortSignal.timeout(8000),
    body: form({ client_id: credentials.clientId, client_secret: secret, code: authorizationCode, grant_type: "authorization_code" }),
  });
  if (!token.ok) return false;
  const { refresh_token: refreshToken } = await token.json() as { refresh_token?: string };
  if (!refreshToken) return false;
  const revoke = await fetcher("https://appleid.apple.com/auth/revoke", {
    method: "POST", headers: formHeaders, signal: AbortSignal.timeout(8000),
    body: form({ client_id: credentials.clientId, client_secret: secret, token: refreshToken, token_type_hint: "refresh_token" }),
  });
  return revoke.ok;
}
