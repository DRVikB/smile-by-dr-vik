import type { Session, User } from "@supabase/supabase-js";
import { NATIVE_AUTH_CALLBACK } from "@/config/accounts";
import { isNativeApp } from "@/native/platform";
import { supabase } from "./supabaseClient";

/** A sign-in failure safe to show; raw provider errors are never displayed. */
export class AuthMessage extends Error {
  constructor(message: string, readonly code = "auth_failed", options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthMessage";
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don’t match. Please try again.",
  email_not_confirmed: "This account still needs email confirmation. Use the link from your signup email, or request a new one below.",
  weak_password: "Choose a stronger password: at least 10 characters, mixing letters and numbers.",
  same_password: "Choose a password you haven’t used for this account before.",
  over_email_send_rate_limit: "Too many emails were requested. Please wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Please wait a moment and try again.",
  email_address_invalid: "Enter a valid email address.",
  validation_failed: "Check the email address and password, then try again.",
  session_expired: "Your sign-in link has expired. Please request a new one.",
  flow_state_expired: "That link has expired. Please request a new one.",
  flow_state_not_found: "Open the link on the device where you requested it, or request a new one.",
};

function friendly(error: { code?: string; message?: string; name?: string; status?: number } | null | undefined, fallback = "We couldn’t sign you in. Please try again."): AuthMessage {
  if (error?.name === "AuthRetryableFetchError" || error?.status === 0)
    return new AuthMessage("We couldn’t reach SmileCompose. Check your connection and try again.", "network");
  const code = error?.code ?? "";
  return new AuthMessage(MESSAGES[code] ?? fallback, code || "auth_failed");
}

function client() {
  const instance = supabase();
  if (!instance) throw new AuthMessage("Accounts aren’t available in this version of SmileCompose.", "accounts_unavailable");
  return instance;
}

export type AuthFlow = "verified" | "recovery" | "signin";

/** Where Supabase sends the user back after an email link or web OAuth. */
export function authRedirect(flow: AuthFlow): string {
  return isNativeApp() ? `${NATIVE_AUTH_CALLBACK}?flow=${flow}` : `${window.location.origin}/?flow=${flow}`;
}

export const PASSWORD_MIN_LENGTH = 10; // keep in step with Supabase Auth → minimum password length

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  if (password.length < PASSWORD_MIN_LENGTH) throw new AuthMessage(MESSAGES.weak_password, "weak_password");
  const { error } = await client().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: authRedirect("verified") } });
  // An existing address also lands on "check your email", so accounts can't be enumerated.
  if (error) throw friendly(error, "We couldn’t create your account. Please try again.");
}

export async function resendVerification(email: string): Promise<void> {
  const { error } = await client().auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: authRedirect("verified") } });
  if (error) throw friendly(error, "We couldn’t resend the email. Please try again.");
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw friendly(error);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect("recovery") });
  if (error) throw friendly(error, "We couldn’t send the reset email. Please try again.");
}

export async function updatePassword(password: string): Promise<void> {
  if (password.length < PASSWORD_MIN_LENGTH) throw new AuthMessage(MESSAGES.weak_password, "weak_password");
  const { error } = await client().auth.updateUser({ password });
  if (error) throw friendly(error, "We couldn’t update your password. Please try again.");
}

/** Complete an email-link or OAuth return that carries a PKCE code. */
export async function completeAuthCallback(url: string): Promise<AuthFlow | null> {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search || parsed.hash.replace(/^#/, ""));
  const flow = (params.get("flow") as AuthFlow | null) ?? null;
  if (params.get("error_description") || params.get("error"))
    throw friendly({ code: params.get("error_code") ?? undefined }, "That link couldn’t be used. Please request a new one.");
  const code = params.get("code");
  if (code) {
    const { error } = await client().auth.exchangeCodeForSession(code);
    if (error) throw friendly(error, "That link couldn’t be used. Please request a new one.");
  }
  return flow;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sign in with Apple. In the iOS app this uses Apple's native sheet and hands
 * the identity token to Supabase; on the web it uses Supabase's Apple OAuth.
 * Returns false when the user cancels.
 */
export async function signInWithApple(): Promise<boolean> {
  const auth = client().auth;
  if (!isNativeApp()) {
    const { error } = await auth.signInWithOAuth({ provider: "apple", options: { redirectTo: authRedirect("signin") } });
    if (error) throw friendly(error, "Sign in with Apple couldn’t start. Please try again.");
    return true; // the browser navigates to Apple
  }
  const { requestAppleCredential } = await import("@/native/appleSignIn");
  const rawNonce = randomNonce();
  const credential = await requestAppleCredential(await sha256Hex(rawNonce));
  if (!credential) return false;
  const { data, error } = await auth.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce: rawNonce });
  if (error || !data.user) throw friendly(error, "Sign in with Apple didn’t complete. Please try again.");
  // Apple shares the name only on the first authorisation. Save it as the account
  // name straight away, but never over a name the user has already set.
  const name = [credential.givenName, credential.familyName].filter(Boolean).join(" ").trim();
  if (name && data.session) {
    // Metadata is the fallback: the server fills an empty account name from it.
    if (!data.user.user_metadata?.full_name) await auth.updateUser({ data: { full_name: name } }).catch(() => {});
    const { updateProfile } = await import("@/services/account/accountApi");
    await updateProfile(data.session.access_token, { fullName: name.slice(0, 80), onlyIfEmpty: true }).catch(() => {});
  }
  return true;
}

export async function signOut(): Promise<void> {
  await client().auth.signOut({ scope: "local" });
}

export async function currentSession(): Promise<Session | null> {
  const instance = supabase();
  if (!instance) return null;
  const { data } = await instance.auth.getSession();
  return data.session;
}

export async function accessToken(): Promise<string | null> {
  return (await currentSession())?.access_token ?? null;
}

export function signInMethods(user: User | null): string[] {
  const providers = new Set((user?.identities ?? []).map(identity => identity.provider));
  return [...providers].map(p => (p === "email" ? "Email and password" : p === "apple" ? "Sign in with Apple" : p));
}
