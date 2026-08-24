import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mockable session ──────────────────────────────────────────────
let currentSession: any = null;
const auditCalls: any[] = [];
vi.mock("@/lib/auth", () => ({
  getSession: async () => currentSession,
  auditLog: async (...args: any[]) => { auditCalls.push(args); },
}));

// ── Mock Supabase: records announcement inserts, returns buildings ─
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
    // buildings.select() must be awaitable → resolve to a list
    if (table === "buildings") {
      chain.select = () => Promise.resolve({ data: [{ id: "b1" }, { id: "b2" }], error: null });
    }
    if (table === "profiles") {
      // residents lookup: .select().eq().eq() → awaitable list
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

function reqWith(body: any): any {
  return {
    json: async () => body,
    headers: { get: () => null },
  };
}

beforeEach(() => {
  currentSession = null;
  announcementInserts.length = 0;
  auditCalls.length = 0;
});

describe("POST /api/broadcast — auth gate", () => {
  it("401 when unauthenticated", async () => {
    currentSession = null;
    const res = await POST(reqWith({ title: "t", content: "c" }));
    expect(res.status).toBe(401);
  });

  it("403 when a viewer tries to broadcast (RBAC)", async () => {
    currentSession = { id: "v1", email: "v@x.co", role: "viewer" };
    const res = await POST(reqWith({ title: "t", content: "c" }));
    expect(res.status).toBe(403);
    expect(announcementInserts).toHaveLength(0);
  });

  it("admin is allowed through the gate", async () => {
    currentSession = { id: "a1", email: "a@x.co", role: "admin" };
    const res = await POST(reqWith({ title: "t", content: "c" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/broadcast — validation", () => {
  beforeEach(() => { currentSession = { id: "a1", email: "a@x.co", role: "admin" }; });

  it("400 when title or content missing", async () => {
    expect((await POST(reqWith({ title: "", content: "c" }))).status).toBe(400);
    expect((await POST(reqWith({ title: "t" }))).status).toBe(400);
  });
});

describe("POST /api/broadcast — expiry wiring", () => {
  beforeEach(() => { currentSession = { id: "a1", email: "a@x.co", role: "admin" }; });

  it("permanent (expires_in_days=0) inserts null expires_at", async () => {
    await POST(reqWith({ title: "t", content: "c", expires_in_days: 0 }));
    expect(announcementInserts.length).toBeGreaterThan(0);
    for (const row of announcementInserts) expect(row.expires_at).toBeNull();
  });

  it("7-day expiry inserts a future expires_at matching the helper", async () => {
    const before = Date.now();
    await POST(reqWith({ title: "t", content: "c", expires_in_days: 7 }));
    const row = announcementInserts[0];
    expect(row.expires_at).not.toBeNull();
    const ms = new Date(row.expires_at).getTime();
    // within a few seconds of a fresh 7-day resolve
    expect(Math.abs(ms - new Date(resolveExpiresAt(7, before)!).getTime())).toBeLessThan(5000);
  });

  it("fractional-hours expiry produces a sub-day expires_at", async () => {
    await POST(reqWith({ title: "t", content: "c", expires_in_days: 6 / 24 }));
    const row = announcementInserts[0];
    const deltaH = (new Date(row.expires_at).getTime() - Date.now()) / 3_600_000;
    expect(deltaH).toBeGreaterThan(5.9);
    expect(deltaH).toBeLessThan(6.1);
  });

  it("marks broadcasts as is_system so committees can't edit them", async () => {
    await POST(reqWith({ title: "t", content: "c" }));
    expect(announcementInserts[0].is_system).toBe(true);
  });
});

describe("POST /api/broadcast — audit", () => {
  it("records a BROADCAST audit entry on success", async () => {
    currentSession = { id: "a1", email: "a@x.co", role: "admin" };
    await POST(reqWith({ title: "hello", content: "c", priority: "urgent" }));
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0][1]).toBe("BROADCAST");
  });
});
