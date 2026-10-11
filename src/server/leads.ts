import { createClient } from "@supabase/supabase-js";
import { safeLog } from "./redact";

/**
 * Website enquiries (Book a demo / Early access) from the public landing page. No account needed,
 * so it's guarded by a hidden honeypot field and per-address and per-email limits.
 */
export interface LeadInput { name: string; email: string; practice: string | null; role: "dentist" | "coordinator" | "lab" | "other"; interest: "demo" | "early_access"; message: string | null }
export interface LeadStore {
  recentCount(ipHash: string, email: string): Promise<{ byIp: number; byEmail: number }>;
  add(lead: LeadInput, ipHash: string): Promise<void>;
}

const headers = { "Cache-Control": "no-store" };
const ROLES = ["dentist", "coordinator", "lab", "other"] as const;
const INTERESTS = ["demo", "early_access"] as const;
const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const clean = value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
};

export function parseLead(body: Record<string, unknown>): LeadInput | null {
  const name = text(body.name, 120);
  const email = text(body.email, 254)?.toLowerCase() ?? null;
  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  if (!ROLES.includes(body.role as LeadInput["role"]) || !INTERESTS.includes(body.interest as LeadInput["interest"])) return null;
  return { name, email, practice: text(body.practice, 160), role: body.role as LeadInput["role"], interest: body.interest as LeadInput["interest"], message: text(body.message, 1000) };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function handleLead(request: Request, store: LeadStore | null): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!store) return Response.json({ error: "Enquiries aren’t available right now. Please try again later." }, { status: 503, headers });
  let body: Record<string, unknown>;
  try { const value = await request.json(); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); body = value as Record<string, unknown>; }
  catch { return Response.json({ error: "That request wasn’t valid." }, { status: 400, headers }); }
  // A filled honeypot is a bot: answer as if it worked and store nothing.
  if (typeof body.website === "string" && body.website.trim()) return Response.json({ ok: true }, { headers });
  if (body.privacy !== true) return Response.json({ error: "Please confirm you’ve read how we’ll use your details." }, { status: 400, headers });
  const lead = parseLead(body);
  if (!lead) return Response.json({ error: "Add your name and a valid email address." }, { status: 400, headers });
  try {
    const ipHash = await sha256Hex(request.headers.get("CF-Connecting-IP") ?? "unknown");
    const { byIp, byEmail } = await store.recentCount(ipHash, lead.email);
    if (byIp >= 5 || byEmail >= 2) return Response.json({ error: "Thanks, we already have your request and will be in touch." }, { status: 429, headers });
    await store.add(lead, ipHash);
    return Response.json({ ok: true }, { status: 201, headers });
  } catch {
    safeLog("error", "lead_failed", {});
    return Response.json({ error: "Your request couldn’t be sent. Please try again." }, { status: 503, headers });
  }
}

export function createSupabaseLeadStore(url: string, serviceRoleKey: string): LeadStore {
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return {
    async recentCount(ipHash, email) {
      const hour = new Date(Date.now() - 3600000).toISOString(), day = new Date(Date.now() - 86400000).toISOString();
      const [ip, mail] = await Promise.all([
        db.from("website_leads").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hour),
        db.from("website_leads").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", day),
      ]);
      if (ip.error || mail.error) throw new Error("lead_count_failed");
      return { byIp: ip.count ?? 0, byEmail: mail.count ?? 0 };
    },
    async add(lead, ipHash) {
      const { error } = await db.from("website_leads").insert({ ...lead, ip_hash: ipHash });
      if (error) throw new Error("lead_insert_failed");
    },
  };
}
