import { describe, it, expect, beforeEach, vi } from "vitest";

// requireFullSession is the new gate; make it programmable per-test.
let authResult: any = { ok: false, reason: "unauthenticated" };
const auditCalls: any[] = [];
vi.mock("@/lib/auth", () => ({
  requireFullSession: async () => authResult,
  auditLog: async (...args: any[]) => { auditCalls.push(args); },
}));

const announcementInserts: any[] = [];
vi.mock("@/lib/supabase", () => {
  const makeChain = (table: string) => {
    const chain: any = {
      _table: table,
      select: () => chain,
      eq: () => chain,
      limit: () => chain,
      single: async () => ({ data: { id: "author-1" }, error: null }),
      insert: async (row: any) => {
        if (table === "announcements") announcementInserts.push(row);
        return { error: null };
      },
    };
    if (table === "buildings") chain.select = () => Promise.resolve({ data: [{ id: "b1" }, { id: "b2" }], error: null });
    if (table === "profiles") {
      chain.eq = () => chain;
      chain.select = () => chain;
      chain.then = (res: any) => res({ data: [{ id: "r1" }], error: null });
    }
    return chain;
  };
  return { adminClient: { from: (t: string) => makeChain(t) } };
});

import { POST } from "../route";
import { resolveExpiresAt } from "@/lib/expiry";

const reqWith = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const fullAdmin = { ok: true, session: { id: "a1", email: "a@x.co", full_name: "A", role: "admin", auth_level: "mfa" } };

beforeEach(() => {
  authResult = { ok: false, reason: "unauthenticated" };
  announcementInserts.length = 0; auditCalls.length = 0;
});

describe("POST /api/broadcast — auth gate", () => {
  it("401 when unauthenticated", async () => {
    authResult = { ok: false, reason: "unauthenticated" };
    expect((await POST(reqWith({ title: "t", content: "c" }))).status).toBe(401);
  });
  it("401 when only pre-MFA (MFA not completed)", async () => {
    authResult = { ok: false, reason: "mfa_required" };
    const res = await POST(reqWith({ title: "t", content: "c" }));
    expect(res.status).toBe(401);
    expect(announcementInserts).toHaveLength(0);
  });
  it("401 when the session was revoked", async () => {
    authResult = { ok: false, reason: "revoked" };
    expect((await POST(reqWith({ title: "t", content: "c" }))).status).toBe(401);
  });
  it("403 when a viewer (full session) tries to broadcast", async () => {
    authResult = { ok: true, session: { id: "v1", email: "v@x.co", full_name: "V", role: "viewer", auth_level: "mfa" } };
    const res = await POST(reqWith({ title: "t", content: "c" }));
    expect(res.status).toBe(403);
    expect(announcementInserts).toHaveLength(0);
  });
  it("admin with full session passes the gate", async () => {
    authResult = fullAdmin;
    expect((await POST(reqWith({ title: "t", content: "c" }))).status).toBe(200);
  });
});

describe("POST /api/broadcast — validation", () => {
  beforeEach(() => { authResult = fullAdmin; });
  it("400 when title or content missing", async () => {
    expect((await POST(reqWith({ title: "", content: "c" }))).status).toBe(400);
    expect((await POST(reqWith({ title: "t" }))).status).toBe(400);
  });
});

describe("POST /api/broadcast — expiry wiring", () => {
  beforeEach(() => { authResult = fullAdmin; });
  it("permanent (0) → null expires_at", async () => {
    await POST(reqWith({ title: "t", content: "c", expires_in_days: 0 }));
    for (const row of announcementInserts) expect(row.expires_at).toBeNull();
  });
  it("7-day → future expires_at matching the helper", async () => {
    const before = Date.now();
    await POST(reqWith({ title: "t", content: "c", expires_in_days: 7 }));
    const ms = new Date(announcementInserts[0].expires_at).getTime();
    expect(Math.abs(ms - new Date(resolveExpiresAt(7, before)!).getTime())).toBeLessThan(5000);
  });
  it("fractional hours → sub-day expires_at", async () => {
    await POST(reqWith({ title: "t", content: "c", expires_in_days: 6 / 24 }));
    const deltaH = (new Date(announcementInserts[0].expires_at).getTime() - Date.now()) / 3_600_000;
    expect(deltaH).toBeGreaterThan(5.9);
    expect(deltaH).toBeLessThan(6.1);
  });
  it("marks broadcasts is_system", async () => {
    await POST(reqWith({ title: "t", content: "c" }));
    expect(announcementInserts[0].is_system).toBe(true);
  });
});

describe("POST /api/broadcast — audit", () => {
  it("records a BROADCAST audit entry on success", async () => {
    authResult = fullAdmin;
    await POST(reqWith({ title: "hello", content: "c", priority: "urgent" }));
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0][1]).toBe("BROADCAST");
  });
});
