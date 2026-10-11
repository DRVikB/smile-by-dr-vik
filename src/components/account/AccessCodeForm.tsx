"use client";
import { useState } from "react";
import { useAccount } from "./AccountProvider";
import { apiUrl } from "@/services/api/client";
import { isNativeApp } from "@/native/platform";

/**
 * Tester access codes are entered on the website and in internal test builds only. An App Store
 * release never shows this field: the App Store doesn't allow apps to unlock features with their own codes.
 */
export const ACCESS_CODES_ENABLED = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DISTRIBUTION === "internal-testflight";
export const accessCodesShown = () => ACCESS_CODES_ENABLED || !isNativeApp();

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** "Have a tester access code?": a single-use code from SmileCompose that gives this account complimentary access. */
export function AccessCodeForm({ onRedeemed }: { onRedeemed?: () => void }) {
  const { user, getAccessToken, refresh, openAuth } = useAccount();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (!accessCodesShown()) return null;

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true); setMessage(null);
    try {
      const token = await getAccessToken();
      if (!token) { setMessage({ ok: false, text: "Sign in first, then enter your code." }); return; }
      const response = await fetch(apiUrl("/api/account/redeem-code"), {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(15000),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; expiresAt?: string; monthlyGenerations?: number };
      if (!response.ok) { setMessage({ ok: false, text: body.error ?? "That code couldn’t be used. Please try again." }); return; }
      await refresh();
      setCode("");
      setMessage({ ok: true, text: `You’re in. ${body.monthlyGenerations ?? "Your"} smile generations a month${body.expiresAt ? ` until ${date(body.expiresAt)}` : ""}.` });
      onRedeemed?.();
    } catch {
      setMessage({ ok: false, text: "We couldn’t reach SmileCompose. Check your connection and try again." });
    } finally { setBusy(false); }
  }

  if (!open) return <p className="paywall-offer">Have a tester access code? <button type="button" className="text-button" onClick={() => setOpen(true)}>Enter Code</button></p>;
  if (!user) return <p className="paywall-offer">Sign in to use your access code. <button type="button" className="text-button" onClick={() => openAuth("signIn")}>Sign In</button></p>;
  return (
    <form className="access-code" onSubmit={redeem}>
      <label htmlFor="access-code-input">Tester access code</label>
      <div className="access-code-row">
        <input id="access-code-input" value={code} onChange={e => setCode(e.target.value)} placeholder="SC-XXXXX-XXXXX" maxLength={24}
          autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="done" disabled={busy} />
        <button type="submit" className="secondary-button" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Use Code"}</button>
      </div>
      {message && <p className={message.ok ? "save-status" : "error-message"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
    </form>
  );
}
