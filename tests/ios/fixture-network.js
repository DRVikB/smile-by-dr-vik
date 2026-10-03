// Installed only into an isolated simulator QA bundle, never dist/native or the physical app.
// No external request is permitted in this deterministic path.
(() => {
  const originalFetch = window.fetch.bind(window);
  const user = { id: "66666666-6666-4666-8666-666666666666", aud: "authenticated", role: "authenticated", email: "simulator@example.invalid", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [], created_at: "2026-10-03T00:00:00Z" };
  const encode = value => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = encode({ alg: "none", typ: "JWT" }) + "." + encode({ sub: user.id, exp: 4102444800, role: "authenticated" }) + ".Zml4dHVyZQ";
  const profile = { fullName: "Simulator QA", preferredName: "QA", onboardingCompletedAt: "2026-10-03T00:00:00Z", createdAt: "2026-10-03T00:00:00Z", hasGenerationHistory: true };
  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));
  localStorage.setItem("smile.onboarding", JSON.stringify({ completedAt: Date.now() }));
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    if (["data:", "blob:"].includes(url.protocol)) return originalFetch(input, init);
    if (url.origin === location.origin) return originalFetch(input, init);
    if (url.hostname === "wukcqlpuzkzwxmdkotfg.supabase.co") {
      if (url.pathname.endsWith("/token")) return json({ access_token: jwt, refresh_token: "non-secret-fixture-refresh", token_type: "bearer", expires_in: 315360000, expires_at: 4102444800, user });
      if (url.pathname.endsWith("/user")) return json(user);
      if (url.pathname.endsWith("/logout")) return json({});
      return json({ error: "Fixture route unsupported" }, 503);
    }
    if (url.hostname !== "smile-by-dr-vik-staging.drvik.workers.dev") throw new Error("External network blocked in deterministic QA");
    if (url.pathname === "/api/account/status") return json({ userId: user.id, email: user.email, providers: ["email"], pro: true, source: "override", verifiedWith: "cache", subscription: null, generations: { included: 1000, used: 0, remaining: 1000, purchased: 0, periodEnd: null }, profile, documents: { terms: { current: "fixture", accepted: true }, privacy: { current: "fixture", accepted: true } } });
    if (url.pathname === "/api/account/profile") return json({ profile });
    if (url.pathname === "/api/account/consents" && init?.method === "POST") return json({ saved: true });
    if (url.pathname === "/api/generate-smile") {
      const blob = await (await originalFetch("/qa/result.jpg")).blob();
      const image = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
      return json({ image, mode: "live", variationId: crypto.randomUUID(), generation: { provider: "google", model: "fixture-only", promptVersion: "2026-10-03-treatment-contract-v6", generatedAt: new Date().toISOString(), mode: "standard" }, styleReferencesUsed: { count: 0, caseIds: [] }, usage: { remaining: 1000 } });
    }
    if (url.pathname === "/api/case-library") return json({ cases: [] });
    // A fixture must never falsely acknowledge cloud persistence.
    return json({ code: "account_service_unavailable", error: "Offline fixture: local work remains available" }, 503);
  };
})();
