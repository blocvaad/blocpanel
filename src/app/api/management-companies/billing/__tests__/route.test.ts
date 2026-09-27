import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let company: any;
let liveSubs: any[] = [];
const updates: any[] = [];
const notices: any[] = [];
const audits: any[] = [];

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => (typeof guardResult === "function" ? guardResult(opts) : guardResult) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/notify", () => ({ notifyUser: async (to: string, n: any) => { notices.push({ to, ...n }); return true; } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        limit: async () => ({ data: table === "billing_subscriptions" ? liveSubs : [] }),
        maybeSingle: async () => ({ data: company }),
        update: (patch: any) => { updates.push({ table, patch }); return { eq: async () => ({ error: null }) }; },
      };
      return chain;
    },
  },
}));

let POST: any;
const ID = "22222222-2222-2222-2222-222222222222";
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });

beforeEach(async () => {
  ({ POST } = await import("../route"));
  guardResult = { ok: true, session: { id: "s1", role: "superadmin" } };
  company = { id: ID, name: "יהואלה נכסים", owner_id: "own-1", status: "active", plan: "mgmt_free", plan_expires: null, comp_reason: null };
  liveSubs = [];
  updates.length = 0; notices.length = 0; audits.length = 0;
});

describe("management-companies/billing — comp grants (superadmin only)", () => {
  it("asks guard for exact superadmin role", async () => {
    let asked: any;
    guardResult = (o: any) => { asked = o; return { ok: false, response: { status: 403 } }; };
    const res = await POST(req({ id: ID, action: "grant", plan: "mgmt_start", reason: "פיילוט" }));
    expect(res.status).toBe(403);
    expect(asked).toEqual({ role: "superadmin" });
  });

  it("grant: sets plan, no expiry, reason; notifies owner; audits", async () => {
    const res = await POST(req({ id: ID, action: "grant", plan: "mgmt_growth", reason: "שותפות אסטרטגית" }));
    expect(res.status ?? 200).toBe(200);
    expect(updates[0]).toEqual({ table: "management_companies", patch: { plan: "mgmt_growth", plan_expires: null, comp_reason: "שותפות אסטרטגית" } });
    expect(notices[0].to).toBe("own-1");
    expect(audits[0][1]).toBe("MANAGEMENT_PLAN_GRANTED");
  });

  it("grant refused while a paid subscription is live (no double entitlement)", async () => {
    liveSubs = [{ id: "sub", status: "active" }];
    const res = await POST(req({ id: ID, action: "grant", plan: "mgmt_start", reason: "פיילוט" }));
    expect(res.status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  it("grant refused for a company that is not approved", async () => {
    company.status = "pending";
    const res = await POST(req({ id: ID, action: "grant", plan: "mgmt_start", reason: "פיילוט" }));
    expect(res.status).toBe(409);
  });

  it("free plan cannot be granted; reason is required", async () => {
    expect((await POST(req({ id: ID, action: "grant", plan: "mgmt_free", reason: "פיילוט" }))).status).toBe(400);
    expect((await POST(req({ id: ID, action: "grant", plan: "mgmt_start" }))).status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("end_grant: clears reason and expires now (grace path, not a hard cut)", async () => {
    company.comp_reason = "פיילוט";
    company.plan = "mgmt_start";
    const before = Date.now();
    await POST(req({ id: ID, action: "end_grant" }));
    expect(updates[0].patch.comp_reason).toBeNull();
    expect(updates[0].patch.plan).toBeUndefined();          // plan kept → buildings go through grace
    expect(Date.parse(updates[0].patch.plan_expires)).toBeGreaterThanOrEqual(before - 1000);
    expect(audits[0][1]).toBe("MANAGEMENT_PLAN_GRANT_ENDED");
  });

  it("end_grant without an active grant → 409", async () => {
    const res = await POST(req({ id: ID, action: "end_grant" }));
    expect(res.status).toBe(409);
    expect(updates).toHaveLength(0);
  });
});
