"use client";
import { useState } from "react";
import { useAccount } from "@/components/account/AccountProvider";
import { NAME_LIMITS, isPrivateRelayEmail, maskEmail, normaliseName, providerLabel } from "@/lib/profile";
import { AccountApiError } from "@/services/account/accountApi";
import { ProfilePhotoEditor } from "@/components/profile/ProfilePhotoEditor";
import { Avatar, Group, Row, useSettingsNav } from "./settingsParts";

function planBadge(hasPro: boolean, expired: boolean): string {
  return hasPro ? "SmileCompose Pro" : expired ? "Pro expired" : "Free";
}

/** Account card at the top of Settings. Signed in, tapping the avatar adds, changes or removes the profile photo. */
export function ProfileHeader() {
  const { configured, user, status, hasProAccess, names, displayName, initials, avatarUrl, openAuth } = useAccount();
  const nav = useSettingsNav();
  const [editingPhoto, setEditingPhoto] = useState(false);
  const providers = new Set((user?.identities ?? []).map(identity => identity.provider));
  const method = providers.has("apple") ? "Apple Account" : providers.has("email") ? "Email account" : null;
  const expired = Boolean(status?.subscription && !status.subscription.active && status.subscription.expiresAt);
  const title = displayName ?? (user ? "Your account" : "SmileCompose");
  const accountName = names.fullName && names.fullName !== title ? names.fullName : null;

  return (
    <div className="profile-card">
      {user ? (
        <button type="button" className="profile-avatar-button" onClick={() => setEditingPhoto(true)} aria-label={avatarUrl ? "Change or remove profile photo" : "Add profile photo"}>
          <Avatar initials={initials} url={avatarUrl} />
          <span className="profile-avatar-edit" aria-hidden="true">{avatarUrl ? "Edit" : "Add Photo"}</span>
        </button>
      ) : <Avatar initials={initials} />}
      <div className="profile-card-text">
        <p className="profile-card-name">{title}</p>
        {user ? (
          <>
            {accountName && <p className="profile-card-sub">{accountName}</p>}
            {method && <p className="profile-card-sub">{method}</p>}
            <p className={`profile-badge${hasProAccess ? " pro" : ""}`}>{planBadge(hasProAccess, expired)}</p>
          </>
        ) : configured ? (
          <>
            <p className="profile-card-sub">Not signed in</p>
            <button className="primary-button profile-card-action" onClick={() => openAuth("signIn")}>Sign in or create account</button>
          </>
        ) : (
          <p className="profile-card-sub">Profile stored on this device</p>
        )}
      </div>
      {editingPhoto && <ProfilePhotoEditor onClose={() => setEditingPhoto(false)} onSaved={nav.say} />}
    </div>
  );
}

export function ProfileSection() {
  const account = useAccount();
  const { configured, user, status, names } = account;
  const nav = useSettingsNav();
  const [showEmail, setShowEmail] = useState(false);
  const providers = new Set((user?.identities ?? []).map(identity => identity.provider));
  const email = user?.email ?? status?.email ?? null;
  const relay = isPrivateRelayEmail(email);

  return (
    <>
      <Group id="settings-profile" title="Profile">
        <Row label="Preferred name" value={names.preferredName ?? "Not set"} onClick={() => nav.openPage({ kind: "editProfile" })} />
        {user && <Row label="Account name" value={names.fullName ?? "Not set"} onClick={() => nav.openPage({ kind: "editProfile" })} />}
        {user && (
          <Row label="Email" value={email ? undefined : "Not shared"}
            detail={email ? `${showEmail ? email : maskEmail(email)}${relay ? " · Hide My Email relay" : ""}` : undefined}
            trailing={email ? (
              <button type="button" className="text-button settings-inline-action" onClick={() => setShowEmail(v => !v)} aria-label={showEmail ? "Hide email address" : "Show email address"}>
                {showEmail ? "Hide" : "Show"}
              </button>
            ) : undefined} />
        )}
      </Group>

      {configured && user && (
        <Group id="settings-signin" title="Sign-in methods" footer="Sign-in methods are linked to this SmileCompose account only.">
          {(["apple", "email"] as const).map(provider => (
            <Row key={provider} label={providerLabel(provider)} value={providers.has(provider) ? "Connected" : "Not set up"} />
          ))}
        </Group>
      )}

      {configured && user && (
        <Group id="settings-security" title="Security">
          <Row label="Two-factor authentication" value={status?.mfaEnrolled ? "On" : "Off"}
            onClick={() => status?.mfaEnrolled
              ? nav.confirm({
                title: "Turn off two-factor authentication?",
                body: <p className="control-hint">Your account will be protected by your password or Sign in with Apple only.</p>,
                confirmLabel: "Turn off",
                destructive: true,
                onConfirm: async () => { await account.disableMfa(); return "Two-factor authentication is off."; },
              })
              : account.openMfa("enroll")} />
          <Row label="Sign out" onClick={() => void account.signOut()} />
        </Group>
      )}
    </>
  );
}

/** Edit account name and preferred name. */
export function EditProfilePage({ onDone }: { onDone: () => void }) {
  const { user, names, updateProfile } = useAccount();
  const nav = useSettingsNav();
  const [fullName, setFullName] = useState(names.fullName ?? "");
  const [preferredName, setPreferredName] = useState(names.preferredName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const preferred = normaliseName(preferredName, NAME_LIMITS.preferredName);
    const full = normaliseName(fullName, NAME_LIMITS.fullName);
    if (preferred === undefined || (user && full === undefined)) {
      setError("That name is too long.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateProfile(user ? { preferredName: preferred, fullName: full } : { preferredName: preferred });
      nav.say("Profile saved.");
      onDone();
    } catch (e) {
      setError(e instanceof AccountApiError && e.code === "invalid_profile"
        ? "Check the names and try again."
        : "Your profile couldn’t be saved. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={save}>
      {user && (
        <label className="account-field">
          <span>Account name</span>
          <input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" maxLength={NAME_LIMITS.fullName} placeholder="Your full name" />
          <small>The account holder’s name.</small>
        </label>
      )}
      <label className="account-field">
        <span>Preferred name</span>
        <input value={preferredName} onChange={e => setPreferredName(e.target.value)} autoComplete="nickname" maxLength={NAME_LIMITS.preferredName} placeholder="Dr Vik" />
        <small>Used for greetings and your SmileCompose profile.</small>
      </label>
      {error && <p className="error-message" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy || !nav.online && Boolean(user)}>{busy ? "Saving…" : "Save"}</button>
      {!nav.online && user && <p className="control-hint">Connect to the internet to save changes to your account.</p>}
    </form>
  );
}
