/**
 * Website only: the worker serves the landing page at "/" to signed-out visitors and the app to
 * browsers that are signed in. This cookie is that hint and nothing more: it holds no identity,
 * and the app still checks the real session.
 */
export const WEB_ACCOUNT_COOKIE = "sc_account";

export function rememberWebAccount(signedIn: boolean): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = signedIn
    ? `${WEB_ACCOUNT_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    : `${WEB_ACCOUNT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/** Whether a request to "/" should open the app rather than the landing page. */
export function opensApp(url: URL, cookieHeader: string | null): boolean {
  // Any query is an app address: sign-in (?signin), email links (?flow=, ?code=), "Open the app" (?app).
  if (url.search.length > 1) return true;
  return (cookieHeader ?? "").split(";").some(part => part.trim() === `${WEB_ACCOUNT_COOKIE}=1`);
}
