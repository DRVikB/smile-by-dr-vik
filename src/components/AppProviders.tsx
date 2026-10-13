"use client";
import { AccountProvider } from "@/components/account/AccountProvider";
import { CaseLibraryProvider } from "@/components/caseLibrary/CaseLibraryProvider";
import { AdminProvider } from "@/components/portal/AdminView";
import { SideRailProvider } from "@/components/sideRail/SideRail";
import { useEffect } from "react";

/** Everything that belongs to the signed-in account; it starts afresh when the account changes. */
function Workspace({ children }: { children: React.ReactNode }) {
  return <CaseLibraryProvider><AdminProvider>{children}</AdminProvider></CaseLibraryProvider>;
}

/** App-wide client providers. The Case Library needs the account; Settings needs the Case Library and, for administrators, the Admin page. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  // iOS shows a button's pressed look only while something is listening for touches.
  useEffect(() => {
    const listen = () => {};
    document.addEventListener("touchstart", listen, { passive: true });
    return () => document.removeEventListener("touchstart", listen);
  }, []);
  return <SideRailProvider><AccountProvider Inner={Workspace}>{children}</AccountProvider></SideRailProvider>;
}
