"use client";

/** Sign in with Apple button following Apple's Human Interface Guidelines (black style). */
export function AppleSignInButton({ onClick, disabled, label = "Sign in with Apple" }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" className="apple-signin-button" onClick={onClick} disabled={disabled} aria-label={label}>
      <svg viewBox="0 0 17 20" width="15" height="18" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M14.06 10.62c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.3-.88-2.32-3.5zM11.87 4.14c.61-.74 1.02-1.76.91-2.79-.88.04-1.94.59-2.57 1.33-.56.65-1.06 1.7-.93 2.71.98.08 1.98-.5 2.59-1.25z" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
