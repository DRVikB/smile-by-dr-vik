"use client";
import { AccountProvider } from "@/components/account/AccountProvider";
import { CaseLibraryProvider } from "@/components/caseLibrary/CaseLibraryProvider";

/** App-wide client providers. The Case Library needs the account, and Settings needs the Case Library. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AccountProvider Inner={CaseLibraryProvider}>{children}</AccountProvider>;
}
