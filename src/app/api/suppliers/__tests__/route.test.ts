import { describe, it, expect, beforeEach, vi } from "vitest";

// ── mock DB: supplier_profiles row + recorded writes ──
let guardResult: any;
let supplier: any;
let updateMatches = true;
const updates: any[] = [];
const notices: any[] = [];
const audits: any[] = [];

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => (typeof guardResult === "function" ? guardResult(opts) : guardResult) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/notify", () => ({ notifyUser: async (to: string, n: any) => { notices.push({ to, ...n }); return true; } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const filters: Record<string, any> = {};
      let patch: any = null;
      const chain: any = {
        select: () => chain,
        order: () => chain,
        limit: async () => ({ data: [] }),
        eq: (k: string, v: any) => { filters[k] = v; return chain; },
        maybeSingle: async () => ({ data: table === "supplier_profiles" ? supplier : null }),
        update: (p: any) => { patch = p; return chain; },
        then: undefined,
      };
      // .update(...).eq(...).eq(...).select("id") → resolves
      chain.select = (cols?: string) => {
        if (patch) {
          updates.push({ table, patch, filters: { ...filters } });
          const ok = updateMatches && filters.verification_status === supplier?.verification_status;
          return Promise.resolve({ data: ok ? [{ id: filters.id }] : [], error: null });
        }
        return chain;
      };
      return chain;
    },
  },
}));

let PATCH: any;
beforeEach(async () => {
  ({ PATCH } = await import("../route"));
  guardResult = { ok: true, session: { id: "adm-1", email: "a@x.co", role: "admin" } };
  supplier = { id: "11111111-1111-1111-1111-111111111111", user_id: "u-sup", business_name: "אינסטלציה בע״מ", verification_status: "pending" };
  updateMatches = true;
  updates.length = 0; notices.length = 0; audits.length = 0;
});

const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const ID = "11111111-1111-1111-1111-111111111111";

describe("suppliers PATCH — verification queue", () => {
  it("requires suppliers.verify", async () => {
    let asked: any;
    guardResult = (opts: any) => { asked = opts; return { ok: false, response: { status: 403 } }; };
    const res = await PATCH(req({ id: ID, action: "verify" }));
    expect(res.status).toBe(403);
    expect(asked).toEqual({ permission: "suppliers.verify" });
    expect(updates).toHaveLength(0);
  });

  it("verify: pending → verified, stamps admin, clears reason, notifies supplier, audits", async () => {
    const res = await PATCH(req({ id: ID, action: "verify" }));
    expect(res.status ?? 200).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ verification_status: "verified", verified_by: "adm-1", verification_rejection_reason: null });
    expect(updates[0].filters.verification_status).toBe("pending"); // conditional on current state
    expect(notices[0].to).toBe("u-sup");
    expect(audits[0][1]).toBe("SUPPLIER_VERIFY");
  });

  it("reject requires a reason (400) and never writes", async () => {
    const res = await PATCH(req({ id: ID, action: "reject" }));
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("reject with reason stores it", async () => {
    await PATCH(req({ id: ID, action: "reject", reason: "תעודה לא קריאה" }));
    expect(updates[0].patch).toMatchObject({ verification_status: "rejected", verification_rejection_reason: "תעודה לא קריאה" });
  });

  it("invalid transition → 409 (cannot revoke a pending supplier)", async () => {
    const res = await PATCH(req({ id: ID, action: "revoke", reason: "בדיקה" }));
    expect(res.status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  it("revoke a verified supplier", async () => {
    supplier.verification_status = "verified";
    await PATCH(req({ id: ID, action: "revoke", reason: "רישיון פג" }));
    expect(updates[0].patch.verification_status).toBe("rejected");
  });

  it("concurrent change → 409 and no notification", async () => {
    updateMatches = false;
    const res = await PATCH(req({ id: ID, action: "verify" }));
    expect(res.status).toBe(409);
    expect(notices).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("unknown supplier → 404", async () => {
    supplier = null;
    const res = await PATCH(req({ id: ID, action: "verify" }));
    expect(res.status).toBe(404);
  });
});
