import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let rpcResult: any;
let payments: any[] = [];

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => (typeof guardResult === "function" ? guardResult(opts) : guardResult) }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    rpc: async () => rpcResult,
    from: () => {
      const chain: any = { select: () => chain, in: () => chain, limit: async () => ({ data: payments }) };
      return chain;
    },
  },
}));

let GET: any;
beforeEach(async () => {
  ({ GET } = await import("../route"));
  guardResult = { ok: true, session: { id: "s", role: "viewer" } };
  rpcResult = { data: [], error: null };
  payments = [];
});

const body = async (res: any) => (typeof res.json === "function" ? res.json() : res.body);

describe("GET /api/debt", () => {
  it("requires payments.read", async () => {
    let asked: any;
    guardResult = (o: any) => { asked = o; return { ok: false, response: { status: 403 } }; };
    expect((await GET()).status).toBe(403);
    expect(asked).toEqual({ permission: "payments.read" });
  });

  it("uses the DB aggregate and coerces numerics", async () => {
    rpcResult = { data: [{ building_id: "b1", building_name: "השקד 104", open_count: "2", open_amount: "500.50", approval_count: 1, approval_amount: "100", external_count: 0, external_amount: 0, oldest_open: null }], error: null };
    const j = await body(await GET());
    expect(j.source).toBe("rpc");
    expect(j.data[0].open_amount).toBe(500.5);
    expect(j.data[0].open_count).toBe(2);
  });

  it("falls back (and flags partial) only when 125 is missing", async () => {
    rpcResult = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    payments = [
      { amount: 100, status: "pending", building_id: "b1", buildings: { name: "א" } },
      { amount: 50, status: "pending_approval", building_id: "b1", buildings: { name: "א" } },
      { amount: 70, status: "external_pending", building_id: "b1", buildings: { name: "א" } },
    ];
    const j = await body(await GET());
    expect(j.source).toBe("fallback");
    expect(j.data[0]).toMatchObject({ open_amount: 100, approval_amount: 50, external_amount: 70 });
    expect(j.partial).toBe(false);
  });

  it("other RPC errors → 500, not a silent partial number", async () => {
    rpcResult = { data: null, error: { code: "42501", message: "permission denied" } };
    expect((await GET()).status).toBe(500);
  });
});
