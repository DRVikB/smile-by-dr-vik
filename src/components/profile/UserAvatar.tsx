"use client";
import { useEffect, useState } from "react";

/**
 * The clinician's avatar: their profile photo when there is one, otherwise
 * initials. A photo that fails to load falls back to initials — never a
 * broken image. The photo is never tinted; only the ring adapts to the theme.
 */
export function UserAvatar({ initials, url, size = "large", className = "" }: {
  initials: string;
  url?: string | null;
  size?: "xlarge" | "large" | "medium" | "small" | "tiny";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const photo = url && !failed;
  return (
    <span className={`user-avatar ${size}${photo ? " has-photo" : ""} ${className}`} aria-hidden="true">
      {photo ? <img src={url} alt="" draggable={false} onError={() => setFailed(true)} /> : (initials || "SC")}
    </span>
  );
}
