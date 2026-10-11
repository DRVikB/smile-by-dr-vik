import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLead, parseLead, type LeadInput, type LeadStore } from "../src/server/leads";

function memory() {
  const rows: (LeadInput & { ipHash: string; at: number })[] = [];
  const store: LeadStore = {
    recentCount: async (ipHash, email) => ({ byIp: rows.filter(r => r.ipHash === ipHash).length, byEmail: rows.filter(r => r.email === email).length }),
    add: async (lead, ipHash) => { rows.push({ ...lead, ipHash, at: Date.now() }); },
  };
  return { rows, store };
}
const send = (store: LeadStore | null, body: unknown, ip = "203.0.113.7") =>
  handleLead(new Request("https://smile.test/api/leads", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip } }), store);
const good = { name: " Dr  Patel ", email: "Dr.Patel@Practice.example", practice: "Smile Studio", role: "dentist", interest: "demo", message: "Thursdays", privacy: true };

test("an enquiry needs a name, a valid email, a known role and interest", () => {
  assert.equal(parseLead({ ...good, email: "nope" }), null);
  assert.equal(parseLead({ ...good, role: "patient" }), null);
  assert.deepEqual(parseLead(good), { name: "Dr Patel", email: "dr.patel@practice.example", practice: "Smile Studio", role: "dentist", interest: "demo", message: "Thursdays" });
});

test("enquiries are stored with a hashed address, limited per email, and bots are ignored", async () => {
  const m = memory();
  assert.equal((await send(m.store, { ...good, privacy: false })).status, 400);
  assert.equal((await send(m.store, good)).status, 201);
  assert.match(m.rows[0].ipHash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(m.rows).includes("203.0.113.7"), "the raw IP is never stored");
  assert.equal((await send(m.store, good)).status, 201);
  assert.equal((await send(m.store, good)).status, 429, "two requests per email a day");
  assert.equal((await send(m.store, { ...good, email: "bot@spam.example", website: "http://spam" })).status, 200);
  assert.equal(m.rows.length, 2, "the honeypot stores nothing");
  assert.equal((await send(null, good)).status, 503);
});
