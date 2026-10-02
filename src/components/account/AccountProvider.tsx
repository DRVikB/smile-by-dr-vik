"use client";
import { PatientSyncLifecycle } from "./PatientSyncLifecycle";
import { flushSync } from "react-dom";
import { activateWorkspace, captureWorkspace, onWorkspaceDetach } from "@/lib/workspace";
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { CustomerInfo } from "@revenuecat/purchases-capacitor";
import { NATIVE_AUTH_CALLBACK, accountsConfigured } from "@/config/accounts";
import { isNativeApp } from "@/native/platform";
import { supabase } from "@/services/auth/supabaseClient";
import { readOfflineUser } from "@/services/auth/offlineSession";
import { accessToken, completeAuthCallback, signOut as authSignOut, AuthMessage, type AuthFlow } from "@/services/auth/authService";
import {
  AccountApiError, fetchAccountStatus, recordConsents, requestAccountDeletion, saveAvatar, updateProfile as saveProfile,
  type AccountStatus, type ConsentRecordInput, type ProfileUpdate,
} from "@/services/account/accountApi";
import { displayName as nameToShow, initials as initialsOf } from "@/lib/profile";
import { readLocalOnboarding, writeLocalOnboarding } from "@/lib/onboarding";
import { customerHasPro, identifyPurchaser, onCustomerInfo, refreshCustomerInfo, resetPurchaser } from "@/services/purchases/purchases";
import { developmentEntitlements, setEntitlementProvider } from "@/services/entitlements/entitlements";
import { AuthSheet, type AuthMode } from "./AuthSheet";
import { Paywall } from "./Paywall";
import { SettingsView, type SettingsSection } from "@/components/settings/SettingsView";
import { PrivacyNoticeSheet, type LegalDocument } from "./PrivacyNoticeSheet";
import { DocumentsSheet } from "./DocumentsSheet";
import { MfaSheet, type MfaMode } from "./MfaSheet";
import { setDesignerName } from "@/lib/brand";
import { crossedAnnouncement, entitlementOf, widgetAllowance } from "@/lib/allowance";

type Sheet = { kind: "auth"; mode: AuthMode; reason?: string } | { kind: "paywall" } | { kind: "settings"; section?: SettingsSection }
  | { kind: "privacy"; back: Sheet; document: LegalDocument } | { kind: "documents" } | { kind: "mfa"; mode: MfaMode; back: Sheet } | null;

const NOTICE_KEY = "smilecompose.notice";
/** Last known names for the signed-in account, so greetings work offline. Cleared on sign-out. */
const PROFILE_CACHE_KEY = "smile.account-profile";

export type StatusState = "idle" | "loading" | "loaded" | "failed";

interface CachedNames { userId: string; fullName: string | null; preferredName: string | null }

function readCachedNames(): CachedNames | null {
  try { return JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) ?? "null") as CachedNames | null; } catch { return null; }
}
function writeCachedNames(names: CachedNames | null) {
  try { if (names) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(names)); else localStorage.removeItem(PROFILE_CACHE_KEY); } catch { /* optional */ }
}

export interface AccountContextValue {
  /** Accounts are configured for this build. When false, generation is not gated client-side. */
  configured: boolean;
  ready: boolean;
  user: User | null;
  status: AccountStatus | null;
  /** Whether the server status for the signed-in user has loaded (onboarding waits for it). */
  statusState: StatusState;
  customerInfo: CustomerInfo | null;
  /** Account name and preferred name: from the account when signed in, else from this device. */
  names: { fullName: string | null; preferredName: string | null };
  /** How SmileCompose addresses the user (preferred name → first name → null). */
  displayName: string | null;
  initials: string;
  /** Short-lived private link to the profile photo, or null (initials are shown instead). */
  avatarUrl: string | null;
  /** Set/replace (a 512 px JPEG data URL) or remove (null) the profile photo. Requires an account. */
  setAvatar(image: string | null): Promise<void>;
  /** Save names / onboarding completion to the account, or to this device when signed out. */
  updateProfile(update: ProfileUpdate): Promise<void>;
  /** RevenueCat "pro" entitlement OR a server-verified complimentary override. */
  hasProAccess: boolean;
  notice: string | null;
  clearNotice(): void;
  refresh(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  signOut(): Promise<void>;
  deleteAccount(options: { deleteLocalData: boolean }): Promise<void>;
  openAuth(mode?: AuthMode, reason?: string): void;
  openPaywall(): void;
  openSettings(section?: SettingsSection): void;
  openPrivacy(document?: LegalDocument): void;
  openMfa(mode: MfaMode): void;
  disableMfa(): Promise<void>;
  /** Versioned acceptance / per-case confirmation, recorded server-side when signed in. */
  recordConsent(record: ConsentRecordInput, options?: { strict?: boolean }): Promise<void>;
  closeSheet(): void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider.");
  return value;
}

/**
 * `Inner` wraps both the app and the account sheets (Settings included), so
 * providers that depend on the account (e.g. the Case Library) reach both.
 */
export function AccountProvider({ children, Inner = Fragment }: { children: React.ReactNode; Inner?: React.ComponentType<{ children: React.ReactNode }> }) {
  const configured = accountsConfigured();
  const [ready, setReady] = useState(!configured);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [statusState, setStatusState] = useState<StatusState>("idle");
  const [localName, setLocalName] = useState<string | null>(null);
  const [cachedNames, setCachedNames] = useState<CachedNames | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [workspaceKey, setWorkspaceKey] = useState(() => captureWorkspace().epoch);
  useEffect(() => onWorkspaceDetach(() => setWorkspaceKey(captureWorkspace().epoch)), []);
  const authRevision = useRef(0);
  const signingOut = useRef(false);
  const activeUserId = useRef<string | null>(null);
  const applyUser = useCallback((next: User | null) => {
    const changed = activeUserId.current !== (next?.id ?? null);
    if (changed) {
      authRevision.current++;
      activeUserId.current = next?.id ?? null;
      const lease = activateWorkspace(next ? { kind: "account", userId: next.id } : { kind: "unowned" });
      // Commit the empty incoming tree before any late operation can render.
      flushSync(() => {
        setUser(next); setWorkspaceKey(lease.epoch);
        setStatus(null); setStatusState("idle"); setCustomerInfo(null); setSheet(null);
      });
    } else setUser(next);
  }, []);
  const userId = user?.id ?? null;
  const sessionLease = useMemo(captureWorkspace, [workspaceKey]);
  const hasProAccess = customerHasPro(customerInfo) || Boolean(status?.pro);

  const refreshStatus = useCallback(async () => {
    const revision = authRevision.current;
    const token = await accessToken();
    if (revision !== authRevision.current) return;
    if (!token) { setStatus(null); setStatusState("idle"); return; }
    try {
      const next = await fetchAccountStatus(token);
      if (revision !== authRevision.current) return;
      setStatus(next);
      setStatusState("loaded");
      // Ask once per changed Terms/Privacy version.
      if (next.documents && (!next.documents.terms.accepted || !next.documents.privacy.accepted))
        setSheet(current => (current && current.kind !== "settings" ? current : { kind: "documents" }));
    } catch (error) {
      if (revision !== authRevision.current) return;
      if (error instanceof AccountApiError && error.code === "mfa_required")
        setSheet(current => (current?.kind === "mfa" ? current : { kind: "mfa", mode: "challenge", back: null }));
      /* otherwise keep the last known status */
      setStatusState(current => (current === "loaded" ? current : "failed"));
    }
  }, []);

  // Accounts with an authenticator must complete the second factor after sign-in.
  const checkAssurance = useCallback(async () => {
    const revision = authRevision.current;
    const { data } = await supabase()?.auth.mfa.getAuthenticatorAssuranceLevel() ?? { data: null };
    if (revision !== authRevision.current) return;
    if (data?.currentLevel === "aal1" && data.nextLevel === "aal2")
      setSheet(current => (current?.kind === "mfa" ? current : { kind: "mfa", mode: "challenge", back: null }));
  }, []);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(NOTICE_KEY);
      if (stored) { setNotice(stored); sessionStorage.removeItem(NOTICE_KEY); }
    } catch { /* no notice */ }
    setLocalName(readLocalOnboarding().preferredName ?? null);
    setCachedNames(readCachedNames());
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const revision = authRevision.current;
    const info = await refreshCustomerInfo().catch(() => null);
    if (revision !== authRevision.current) return;
    if (info) setCustomerInfo(info);
    await refreshStatus();
  }, [userId, refreshStatus]);

  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  const handleFlow = useCallback((flow: AuthFlow | null) => {
    if (flow === "recovery") setSheet({ kind: "auth", mode: "setPassword" });
    else if (flow === "verified") setNotice("Your email is confirmed. You’re signed in.");
  }, []);

  // Session: restore, follow changes, complete email-link and OAuth returns.
  useEffect(() => {
    const client = supabase();
    if (!client) return;
    let active = true;
    const restoreRevision = authRevision.current;
    // Only the already signed-in local workspace may reopen offline. API calls
    // still require a live server-verified JWT; no offline user is sent as proof.
    const offlineRestore = navigator.onLine === false ? readOfflineUser().then(cached => {
      if(active && restoreRevision === authRevision.current && !signingOut.current){applyUser(cached);setReady(true);}
      return cached;
    }) : Promise.resolve(null);
    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if(event === "INITIAL_SESSION" && !session && navigator.onLine === false){
        void offlineRestore.then(cached => {if(active&&!signingOut.current&&navigator.onLine===false&&activeUserId.current===cached?.id)applyUser(cached);});
        return;
      }
      if (!signingOut.current || !session) applyUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") setSheet({ kind: "auth", mode: "setPassword" });
      if (event === "SIGNED_IN") void checkAssurance();
    });
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (restoreRevision === authRevision.current && !signingOut.current) applyUser(data.session?.user ?? null);
      setReady(true);
      if (!isNativeApp()) {
        // detectSessionInUrl has exchanged any ?code= by now; tidy the address bar.
        const params = new URLSearchParams(window.location.search);
        const flow = params.get("flow") as AuthFlow | null;
        if (flow || params.get("code") || params.get("error_description")) {
          if (params.get("error_description")) setNotice("That link couldn’t be used. Please request a new one.");
          else handleFlow(flow);
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    });
    const reconnect=()=>{const revision=authRevision.current;void client.auth.getSession().then(({data})=>{if(active&&revision===authRevision.current&&!signingOut.current)applyUser(data.session?.user??null);});};
    window.addEventListener("online",reconnect);
    return () => { active = false; subscription.subscription.unsubscribe(); window.removeEventListener("online",reconnect); };
  }, [handleFlow, checkAssurance, applyUser]);

  // iOS: deep links from email, token refresh while foregrounded, refresh on return.
  useEffect(() => {
    if (!configured || !isNativeApp()) return;
    let cleanup: (() => void) | undefined;
    void import("@capacitor/app").then(async ({ App }) => {
      const open = async (url?: string) => {
        if (!url?.startsWith(NATIVE_AUTH_CALLBACK)) return;
        try { handleFlow(await completeAuthCallback(url)); }
        catch (error) { setNotice(error instanceof AuthMessage ? error.message : "That link couldn’t be used. Please request a new one."); }
      };
      const launch = await App.getLaunchUrl();
      await open(launch?.url);
      const urlListener = await App.addListener("appUrlOpen", ({ url }) => void open(url));
      const stateListener = await App.addListener("appStateChange", ({ isActive }) => {
        const auth = supabase()?.auth;
        if (isActive) { void auth?.startAutoRefresh(); void refreshRef.current(); }
        else void auth?.stopAutoRefresh();
      });
      cleanup = () => { void urlListener.remove(); void stateListener.remove(); };
    });
    return () => cleanup?.();
  }, [configured, handleFlow]);

  // RevenueCat follows the Supabase account: configure/logIn with user.id, logOut on sign-out.
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setCustomerInfo(null);
      setStatus(null);
      setStatusState("idle");
      void resetPurchaser();
      return;
    }
    setStatusState("loading");
    void (async () => {
      const info = await identifyPurchaser(userId).catch(() => null);
      if (!cancelled) setCustomerInfo(info);
      if (!cancelled) await refreshStatus();
    })();
    return () => { cancelled = true; };
  }, [userId, refreshStatus]);

  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let stop: (() => void) | undefined;
    const revision = authRevision.current;
    void onCustomerInfo(info => {
      if (stopped || revision !== authRevision.current) return;
      setCustomerInfo(info);
      void refreshStatus(); // the server establishes the new period's allowance
    }).then(unsubscribe => { if (stopped) unsubscribe(); else stop = unsubscribe; });
    return () => { stopped = true; stop?.(); };
  }, [userId, refreshStatus]);

  // The generation service reads entitlements through this provider.
  const statusRef = useRef<{ status: AccountStatus | null; pro: boolean }>({ status: null, pro: false });
  useEffect(() => { statusRef.current = { status, pro: hasProAccess }; }, [status, hasProAccess]);
  useEffect(() => {
    if (!configured) { setEntitlementProvider(developmentEntitlements); return; }
    setEntitlementProvider({
      async current() {
        const { status: s, pro } = statusRef.current;
        return {
          isPro: pro,
          plan: pro ? "pro" : "free",
          generationAllowance: s ? entitlementOf(s).allowance : null,
          generationBalance: s ? entitlementOf(s).balance : null,
        };
      },
      async recordGeneration() { await refreshStatus(); },
    });
  }, [configured, refreshStatus]);

  // Keep the last known names for offline greetings; offer a name chosen before signing in.
  const serverProfile = status?.profile;
  useEffect(() => {
    if (!userId || !serverProfile) return;
    const next = { userId, fullName: serverProfile.fullName, preferredName: serverProfile.preferredName };
    setCachedNames(next);
    writeCachedNames(next);
  }, [userId, serverProfile]);

  const updateProfile = useCallback(async (update: ProfileUpdate) => {
    if (!userId) {
      if (update.preferredName !== undefined) {
        const local = readLocalOnboarding();
        writeLocalOnboarding({ ...local, preferredName: update.preferredName ?? undefined });
        setLocalName(update.preferredName ?? null);
      }
      return;
    }
    const lease = sessionLease;
    lease.assert();
    if (activeUserId.current !== userId) return;
    const token = await accessToken();
    lease.assert();
    if (!token) throw new Error("Sign in again to update your profile.");
    const profile = await saveProfile(token, update);
    lease.assert();
    setStatus(current => (current ? { ...current, profile } : current));
  }, [userId, sessionLease]);

  useEffect(() => {
    if (!userId || !serverProfile || serverProfile.preferredName || !localName) return;
    void updateProfile({ preferredName: localName, onlyIfEmpty: true }).catch(() => {});
  }, [userId, serverProfile, localName, updateProfile]);

  const signOut = useCallback(async () => {
    signingOut.current = true;
    applyUser(null);
    try { await authSignOut(); await resetPurchaser(); } finally { signingOut.current = false; }
    writeCachedNames(null);
    setCachedNames(null);
    setSheet(null);
  }, [applyUser]);

  const deleteAccount = useCallback(async ({ deleteLocalData }: { deleteLocalData: boolean }) => {
    sessionLease.assert();
    const token = await accessToken();
    sessionLease.assert();
    if (!token) throw new Error("Sign in again to delete your account.");
    let appleCode: string | undefined;
    if (isNativeApp() && user?.identities?.some(identity => identity.provider === "apple")) {
      // Apple requires revoking Sign in with Apple tokens; confirm with Apple first.
      const { requestAppleCredential } = await import("@/native/appleSignIn");
      const credential = await requestAppleCredential();
      if (!credential) throw new Error("Confirm with Apple to delete an account that uses Sign in with Apple.");
      appleCode = credential.authorizationCode;
    }
    sessionLease.assert();
    const localData = deleteLocalData ? await import("@/lib/localData") : null;
    sessionLease.assert();
    await requestAccountDeletion(token, appleCode);
    sessionLease.assert();
    signingOut.current = true;
    const cleanup = localData ? localData.deleteWorkspaceData(sessionLease) : Promise.resolve();
    applyUser(null);
    try {
      await Promise.all([cleanup, (async () => { await supabase()?.auth.signOut({ scope: "local" }); await resetPurchaser(); })()]);
    } finally { signingOut.current = false; }
    writeCachedNames(null);
    try { sessionStorage.setItem(NOTICE_KEY, "Your SmileCompose account has been deleted."); } catch { /* notice is optional */ }
    window.location.reload();
  }, [user, applyUser, sessionLease]);

  const recordConsent = useCallback(async (record: ConsentRecordInput, options?: { strict?: boolean }) => {
    sessionLease.assert();
    const token = user ? await accessToken() : null;
    sessionLease.assert();
    if (!token) return; // not signed in: kept on the device only
    try { await recordConsents(token, [record]); }
    catch (error) { if (options?.strict) throw error; }
  }, [user, sessionLease]);

  const disableMfa = useCallback(async () => {
    const auth = supabase()?.auth;
    if (!auth) return;
    const { data } = await auth.mfa.listFactors();
    for (const factor of data?.all ?? []) {
      const { error } = await auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw new Error("Two-factor authentication couldn’t be turned off. Sign in again and retry.");
    }
    await auth.refreshSession();
    await refreshStatus();
  }, [refreshStatus]);

  const cached = cachedNames && cachedNames.userId === userId ? cachedNames : null;
  const metadataName = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
  const names = useMemo(() => (userId
    ? { fullName: serverProfile?.fullName ?? cached?.fullName ?? metadataName, preferredName: serverProfile?.preferredName ?? cached?.preferredName ?? null }
    : { fullName: null, preferredName: localName }), [userId, serverProfile, cached, metadataName, localName]);
  const shownName = nameToShow(names);
  // Patient-facing exports credit the clinician by the name they chose.
  useEffect(() => setDesignerName(names.preferredName || names.fullName), [names.preferredName, names.fullName]);
  // A one-off heads-up as generations take the balance down to 10, 5 and 0.
  const lastRemaining = useRef<number | null>(null);
  useEffect(() => {
    if (!status || !hasProAccess) { lastRemaining.current = null; return; }
    const entitlement = entitlementOf(status);
    const message = crossedAnnouncement(lastRemaining.current, entitlement.balance, entitlement.plan === "trial");
    lastRemaining.current = entitlement.balance;
    if (message) setNotice(message);
  }, [status, hasProAccess]);

  // The Home Screen widget greets the clinician by the same name the app uses (cleared on sign-out).
  useEffect(() => {
    if (!isNativeApp()) return;
    void import("@/native/shortcuts").then(({ setWidgetName }) => setWidgetName(shownName));
  }, [shownName]);
  // …and shows the same allowance the app does (cleared when signed out or without Pro).
  const widgetAllowanceJson = configured && status && hasProAccess ? JSON.stringify(widgetAllowance(entitlementOf(status))) : null;
  useEffect(() => {
    if (!isNativeApp()) return;
    void import("@/native/shortcuts").then(({ setWidgetAllowance }) =>
      setWidgetAllowance(widgetAllowanceJson ? JSON.parse(widgetAllowanceJson) : null));
  }, [widgetAllowanceJson]);
  // "Dr Vik" → DV; with no preferred name, the full account name ("Vikas Bajaj" → VB).
  const initials = initialsOf(names.preferredName || names.fullName || shownName);
  const avatarUrl = userId ? status?.avatarUrl ?? null : null;

  const setAvatar = useCallback(async (image: string | null) => {
    const lease = sessionLease;
    lease.assert();
    if (activeUserId.current !== userId) return;
    const token = userId ? await accessToken() : null;
    lease.assert();
    if (!token) throw new Error("Sign in to add a profile photo.");
    const url = await saveAvatar(token, image);
    lease.assert();
    setStatus(current => (current ? { ...current, avatarUrl: url } : current));
  }, [userId, sessionLease]);

  const lease = sessionLease;
  const sessionAccessToken = useCallback(async () => {
    lease.assert(); const token = await accessToken(); lease.assert(); return token;
  }, [lease]);
  const value = useMemo<AccountContextValue>(() => ({
    configured, ready, user, status, statusState, customerInfo, hasProAccess, notice,
    names, displayName: shownName, initials, avatarUrl, setAvatar, updateProfile,
    clearNotice: () => setNotice(null),
    refresh, getAccessToken: sessionAccessToken, signOut, deleteAccount,
    openAuth: (mode = "signIn", reason) => { if (lease.signal.aborted || signingOut.current) return; setSheet({ kind: "auth", mode, reason }); },
    openPaywall: () => { if (!lease.signal.aborted) setSheet({ kind: "paywall" }); },
    openSettings: (section?: SettingsSection) => setSheet({ kind: "settings", section }),
    // Returns to the sheet it was opened from (settings, paywall, sign-in).
    openPrivacy: (document: LegalDocument = "privacy") => setSheet(current => ({ kind: "privacy", document, back: current?.kind === "privacy" ? current.back : current })),
    openMfa: (mode: MfaMode) => setSheet(current => ({ kind: "mfa", mode, back: current })),
    disableMfa,
    recordConsent,
    closeSheet: () => setSheet(null),
  }), [configured, ready, user, status, statusState, customerInfo, hasProAccess, notice, names, shownName, initials, avatarUrl, setAvatar, updateProfile, refresh, signOut, deleteAccount, disableMfa, recordConsent, sessionAccessToken, lease]);

  return (
    <AccountContext.Provider value={value}>
      <Inner key={workspaceKey}>
      <PatientSyncLifecycle />
      {children}
      {sheet?.kind === "auth" && <AuthSheet initialMode={sheet.mode} reason={sheet.reason} onClose={() => setSheet(null)} onSignedIn={() => setSheet(null)} />}
      {sheet?.kind === "paywall" && <Paywall onClose={() => setSheet(null)} />}
      {sheet?.kind === "settings" && (
        <SettingsView initialSection={sheet.section} onClose={() => setSheet(null)}
          onSectionChange={section => setSheet(current => (current?.kind === "settings" ? { ...current, section } : current))} />
      )}
      {sheet?.kind === "privacy" && <PrivacyNoticeSheet document={sheet.document} onClose={() => setSheet(sheet.back)} />}
      {sheet?.kind === "documents" && <DocumentsSheet onAccepted={() => { setSheet(null); void refreshStatus(); }} />}
      {sheet?.kind === "mfa" && (
        <MfaSheet mode={sheet.mode} onClose={() => setSheet(sheet.back)} onDone={() => {
          setSheet(sheet.back);
          if (sheet.mode === "enroll") setNotice("Two-factor authentication is on.");
          void refreshStatus();
        }} />
      )}
      {notice && (
        <div className="global-error account-notice" role="status">
          {notice}
          <button onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      </Inner>
    </AccountContext.Provider>
  );
}
