"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/services/auth/supabaseClient";

export type MfaMode = "challenge" | "enroll";

/**
 * Two-factor authentication with an authenticator app (TOTP, Supabase Auth).
 * "challenge": raise this session to aal2 after sign-in.
 * "enroll":    add an authenticator from Settings.
 */
export function MfaSheet({ mode, onDone, onClose }: { mode: MfaMode; onDone: () => void; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const auth = supabase()?.auth;
    if (!auth) return;
    let live = true;
    void (async () => {
      if (mode === "challenge") {
        const { data } = await auth.mfa.listFactors();
        if (live) setFactorId(data?.totp?.[0]?.id ?? null);
        return;
      }
      // Remove an abandoned, unverified enrolment before starting a new one.
      const { data: factors } = await auth.mfa.listFactors();
      for (const factor of factors?.all ?? []) if (factor.status === "unverified") await auth.mfa.unenroll({ factorId: factor.id });
      const { data, error: enrollError } = await auth.mfa.enroll({ factorType: "totp", friendlyName: "SmileCompose" });
      if (!live) return;
      if (enrollError || !data) { setError("Two-factor setup couldn’t start. Please try again."); return; }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    })();
    return () => { live = false; };
  }, [mode]);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    const auth = supabase()?.auth;
    if (!auth || !factorId) return;
    setBusy(true);
    setError("");
    const { error: verifyError } = await auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s+/g, "") });
    setBusy(false);
    if (verifyError) { setError("That code didn’t work. Check your authenticator app and try again."); return; }
    onDone();
  }

  return (
    <div className="sheet-backdrop account-backdrop" role="dialog" aria-modal="true" aria-labelledby="mfa-title">
      <div className="sheet account-sheet">
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">ACCOUNT SECURITY</p>
            <h2 id="mfa-title">{mode === "enroll" ? "Set up two-factor authentication" : "Two-factor code"}</h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        {mode === "enroll" ? (
          <>
            <p className="sheet-sub">Scan this code with an authenticator app (such as Apple Passwords or Google Authenticator), then enter the 6-digit code it shows.</p>
            {qr && <img className="mfa-qr" src={qr} alt="Two-factor setup QR code" />}
            {secret && <p className="control-hint">Or enter this key manually: <code className="mfa-secret">{secret}</code></p>}
          </>
        ) : (
          <p className="sheet-sub">Enter the 6-digit code from your authenticator app.</p>
        )}
        <form className="account-stack" onSubmit={verify}>
          <label className="account-field">
            <span>Code</span>
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required value={code} onChange={e => setCode(e.target.value)} />
          </label>
          <button className="primary-button" type="submit" disabled={busy || !factorId}>{busy ? "Checking…" : "Verify"}</button>
        </form>
        {error && <p className="error-message" role="alert">{error}</p>}
      </div>
    </div>
  );
}
