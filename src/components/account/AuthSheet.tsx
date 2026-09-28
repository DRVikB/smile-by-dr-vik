"use client";
import { useState } from "react";
import { X } from "lucide-react";
import {
  AuthMessage, PASSWORD_MIN_LENGTH, requestPasswordReset, resendVerification, signInWithApple,
  signInWithEmail, signUpWithEmail, updatePassword,
} from "@/services/auth/authService";
import { AppleSignInButton } from "./AppleSignInButton";
import { PrivacyLink, TermsLink } from "./LegalLinks";

export type AuthMode = "signIn" | "signUp" | "forgot" | "checkEmail" | "setPassword";

const TITLES: Record<AuthMode, string> = {
  signIn: "Sign in",
  signUp: "Create your account",
  forgot: "Reset your password",
  checkEmail: "Check your email",
  setPassword: "Choose a new password",
};

export function AuthSheet({ initialMode, reason, onClose, onSignedIn }: {
  initialMode: AuthMode;
  reason?: string;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [sentFor, setSentFor] = useState<"signUp" | "forgot">("signUp");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof AuthMessage ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "signIn") void run(async () => { await signInWithEmail(email, password); onSignedIn(); });
    if (mode === "signUp") void run(async () => { await signUpWithEmail(email, password); setSentFor("signUp"); setMode("checkEmail"); });
    if (mode === "forgot") void run(async () => { await requestPasswordReset(email); setSentFor("forgot"); setMode("checkEmail"); });
    if (mode === "setPassword") void run(async () => { await updatePassword(password); setInfo("Your password has been updated."); onSignedIn(); });
  };

  const apple = () => void run(async () => { if (await signInWithApple()) onSignedIn(); });
  const showApple = mode === "signIn" || mode === "signUp";

  return (
    <div className="sheet-backdrop account-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={onClose}>
      <div className="sheet account-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">SMILECOMPOSE ACCOUNT</p>
            <h2 id="auth-title">{TITLES[mode]}</h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        {reason === "generate" && (mode === "signIn" || mode === "signUp") && (
          <p className="sheet-sub">Sign in to create AI smile visualisations. Test mode works without an account.</p>
        )}

        {mode === "checkEmail" ? (
          <div className="account-stack">
            <p className="sheet-sub">
              {sentFor === "signUp"
                ? `We’ve sent a confirmation link to ${email || "your email"}. Open it on this device to finish creating your account.`
                : `If an account exists for ${email || "that address"}, we’ve sent a link to reset your password. Open it on this device.`}
            </p>
            {sentFor === "signUp" && <button className="secondary-button" disabled={busy} onClick={() => void run(async () => { await resendVerification(email); setInfo("We’ve sent another email."); })}>Resend email</button>}
            <button className="text-button" onClick={() => setMode("signIn")}>Back to sign in</button>
          </div>
        ) : (
          <form className="account-stack" onSubmit={submit}>
            {showApple && (
              <>
                <AppleSignInButton onClick={apple} disabled={busy} label={mode === "signUp" ? "Sign up with Apple" : "Sign in with Apple"} />
                <p className="account-divider"><span>or use email</span></p>
              </>
            )}
            {mode !== "setPassword" && (
              <label className="account-field">
                <span>Email</span>
                <input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" required value={email} onChange={e => setEmail(e.target.value)} />
              </label>
            )}
            {mode !== "forgot" && (
              <label className="account-field">
                <span>{mode === "setPassword" ? "New password" : "Password"}</span>
                <input
                  type="password"
                  required
                  minLength={mode === "signIn" ? undefined : PASSWORD_MIN_LENGTH}
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                {mode !== "signIn" && <small>At least {PASSWORD_MIN_LENGTH} characters.</small>}
              </label>
            )}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "signIn" ? "Sign in" : mode === "signUp" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password"}
            </button>
            {mode === "signIn" && (
              <div className="account-links">
                <button type="button" className="text-button" onClick={() => setMode("forgot")}>Forgot password?</button>
                <button type="button" className="text-button" onClick={() => setMode("signUp")}>Create an account</button>
              </div>
            )}
            {(mode === "signUp" || mode === "forgot") && <button type="button" className="text-button" onClick={() => setMode("signIn")}>I already have an account</button>}
            {mode === "signUp" && (
              <p className="control-hint">
                By creating an account you agree to the <TermsLink /> and acknowledge the <PrivacyLink />.
              </p>
            )}
          </form>
        )}
        {error && <p className="error-message" role="alert">{error}</p>}
        {info && <p className="save-status" role="status">{info}</p>}
      </div>
    </div>
  );
}
