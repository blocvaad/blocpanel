import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any = { ok: true, session: { id: "a1", email: "a@x.co", full_name: "A", role: "superadmin", auth_level: "mfa" } };
const updates: Array<{ table: string; set: any; eqs: Array<[string, any]> }> = [];

vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const rec = { table, set: null as any, eqs: [] as Array<[string, any]> };
      const chain: any = {
        update: (v: any) => { rec.set = v; return chain; },
        eq: (c: string, val: any) => { rec.eqs.push([c, val]); return chain; },
        then: (res: any) => { updates.push(rec); return res({ error: null }); },
      };
      return chain;
    },
  },
}));

import { POST } from "../../notifications/read-all/route";

beforeEach(() => {
  updates.length = 0;
  guardResult = { ok: true, session: { id: "a1", email: "a@x.co", full_name: "A", role: "superadmin", auth_level: "mfa" } };
});

describe("panel notifications/read-all — isolation (P0.9)", () => {
  it("returns the guard response when rejected", async () => {
    guardResult = { ok: false, response: { status: 401 } };
    const res: any = await POST();
    expect(res.status).toBe(401);
    expect(updates).toHaveLength(0);
  });

  it("updates panel_notifications, NOT the product notifications table", async () => {
    await POST();
    const touched = updates.map(u => u.table);
    expect(touched).toContain("panel_notifications");
    expect(touched).not.toContain("notifications");
  });

  it("only flips is_read=false → true (no destructive global write)", async () => {
    await POST();
    const call = updates.find(u => u.table === "panel_notifications");
    expect(call?.set).toEqual({ is_read: true });
    expect(call?.eqs).toContainEqual(["is_read", false]);
  });
});
