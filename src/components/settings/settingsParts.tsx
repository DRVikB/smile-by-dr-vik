"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { CaseState } from "@/lib/caseLog";
import { UserAvatar } from "@/components/profile/UserAvatar";

export type SettingsSection = "profile" | "subscription" | "cases" | "library" | "appearance" | "privacy" | "support" | "about";
export type SettingsPage = { kind: "editProfile" } | { kind: "cases"; filter: CaseState } | { kind: "help" };

export interface ConfirmRequest {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Return a string to show as a status message. Throw to show an error. */
  onConfirm(): Promise<void | string>;
}

export interface SettingsNav {
  openPage(page: SettingsPage): void;
  confirm(request: ConfirmRequest): void;
  say(message: string): void;
  online: boolean;
}

export const SettingsContext = createContext<SettingsNav | null>(null);

export function useSettingsNav(): SettingsNav {
  const nav = useContext(SettingsContext);
  if (!nav) throw new Error("useSettingsNav must be used inside SettingsView.");
  return nav;
}

/** A titled group of rows, iOS grouped-list style. */
export function Group({ id, title, footer, children }: { id?: string; title?: string; footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="settings-group" aria-labelledby={id && title ? id : undefined}>
      {title && <h3 id={id} className="settings-group-title">{title}</h3>}
      <div className="settings-list">{children}</div>
      {footer && <div className="settings-group-footer">{footer}</div>}
    </section>
  );
}

/** A label / value row. With onClick it becomes a button with a chevron. */
export function Row({ label, value, detail, onClick, destructive, disabled, trailing, icon }: {
  label: React.ReactNode;
  value?: React.ReactNode;
  detail?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const content = (
    <>
      {icon && <span className="settings-row-icon" aria-hidden="true">{icon}</span>}
      <span className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {detail && <span className="settings-row-detail">{detail}</span>}
      </span>
      {value !== undefined && <span className="settings-row-value">{value}</span>}
      {trailing}
      {onClick && !destructive && <ChevronRight className="settings-row-chevron" size={16} strokeWidth={1.8} aria-hidden="true" />}
    </>
  );
  const className = `settings-row${destructive ? " destructive" : ""}`;
  return onClick
    ? <button type="button" className={className} onClick={onClick} disabled={disabled}>{content}</button>
    : <div className={className}>{content}</div>;
}

/** Remaining-style usage bar. The text carries the meaning; the bar is decorative reinforcement. */
export function UsageBar({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span className="usage-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span style={{ width: `${ratio * 100}%` }} />
    </span>
  );
}

export function Avatar({ initials, url, size = "large" }: { initials: string; url?: string | null; size?: "large" | "small" }) {
  return <UserAvatar initials={initials} url={url} size={size === "large" ? "xlarge" : "small"} className="settings-avatar" />;
}

export function formatDate(iso: string | number | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** "1.8 GB", "240 MB", "under 1 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return "under 1 MB";
  if (bytes < 1_000_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

export function ConfirmDialog({ request, onDone }: { request: ConfirmRequest; onDone: (message?: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const result = await request.onConfirm();
      onDone(typeof result === "string" ? result : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }
  return (
    <div className="settings-confirm-backdrop" onClick={() => !busy && onDone()}>
      <div className="settings-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="settings-confirm-title" onClick={e => e.stopPropagation()}>
        <h3 id="settings-confirm-title">{request.title}</h3>
        <div className="settings-confirm-body">{request.body}</div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="settings-confirm-actions">
          <button className={`primary-button${request.destructive ? " danger-button" : ""}`} disabled={busy} onClick={() => void confirm()}>
            {busy ? "Working…" : request.confirmLabel}
          </button>
          <button className="secondary-button" disabled={busy} onClick={() => onDone()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
