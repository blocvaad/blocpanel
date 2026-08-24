import { describe, it, expect, beforeEach, vi } from "vitest";

// Capture the filters applied to the notifications update, so we can
// assert whether the panel scopes its writes or hits every tenant.
let currentSession: any = { id: "a1", email: "a@x.co", role: "superadmin" };
const updateChains: Array<{ table: string; eqs: Array<[string, any]> }> = [];

vi.mock("@/lib/auth", () => ({ getSession: async () => currentSession }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const record = { table, eqs: [] as Array<[string, any]> };
      const chain: any = {
        update: () => chain,
        eq: (col: string, val: any) => { record.eqs.push([col, val]); return chain; },
        then: (res: any) => { updateChains.push(record); return res({ error: null }); },
      };
      return chain;
    },
  },
}));

import { POST } from "../../notifications/read-all/route";

beforeEach(() => { updateChains.length = 0; });

describe("panel notifications/read-all", () => {
  it("requires a session", async () => {
    currentSession = null;
    const res = await POST();
    expect(res.status).toBe(401);
    currentSession = { id: "a1", email: "a@x.co", role: "superadmin" };
  });

  it("current behaviour: updates the shared product notifications table", async () => {
    await POST();
    const call = updateChains.find(c => c.table === "notifications");
    expect(call).toBeTruthy();
  });

  // ── KNOWN GAP (audit P0.9): the read-all update is scoped only by
  // is_read=false, with NO panel/building/tenant filter — so it marks
  // residents' notifications across every building as read. This should
  // target a panel-owned table (panel_notifications) or be scoped.
  it.fails("should NOT mutate product notifications without a tenant/panel scope", async () => {
    await POST();
    const call = updateChains.find(c => c.table === "notifications");
    const cols = (call?.eqs ?? []).map(([c]) => c);
    // Intended contract: never an unscoped global product-notification write.
    const onlyReadFilter = cols.length === 1 && cols[0] === "is_read";
    expect(onlyReadFilter).toBe(false);
  });
});
