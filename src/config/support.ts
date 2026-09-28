import { PRIVACY_CONTACT_EMAIL } from "./legal";

/**
 * Support contacts (OWNER DECISIONS, public). Set at build time:
 *   NEXT_PUBLIC_SUPPORT_EMAIL  support mailbox (falls back to the privacy contact)
 *   NEXT_PUBLIC_HELP_URL       optional help centre; the app has built-in help otherwise
 */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || PRIVACY_CONTACT_EMAIL;
export const HELP_URL = process.env.NEXT_PUBLIC_HELP_URL?.trim() || "";
