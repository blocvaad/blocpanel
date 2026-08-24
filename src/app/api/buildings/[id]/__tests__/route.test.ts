import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any = { ok: true, session: { id: "a1", email: "a@x.co", full_name: "A", role: "superadmin", auth_level: "mfa" } };
const rpcCalls: Array<{ fn: string; args: any }> = [];
const directWrites: Array<{ table: string; op: string; payload?: any }> = [];
let rpcError: any = null;

vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/auth", () => ({ auditLog: async () => {} }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: { name: "בניין א" } }),
        update: (payload: any) => { directWrites.push({ table, op: "update", payload }); return chain; },
        insert: () => { directWrites.push({ table, op: "insert" }); return Promise.resolve({ error: null }); },
      };
      return chain;
    },
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return { data: rpcError ? null : [{ building_name: "בניין א", blocked_count: 5 }], error: rpcError };
    },
  },
}));

import { PATCH, DELETE } from "../route";
const VALID_ID = "11111111-1111-1111-1111-111111111111";
const ctx = { params: Promise.resolve({ id: VALID_ID }) };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });

beforeEach(() => {
  guardResult = { ok: true, session: { id: "a1", email: "a@x.co", full_name: "A", role: "superadmin", auth_level: "mfa" } };
  rpcCalls.length = 0; directWrites.length = 0; rpcError = null;
});

describe("buildings DELETE — atomic archive (P0.6)", () => {
  it("blocks non-superadmin", async () => {
    guardResult = { ok: false, response: { status: 403 } };
    const res: any = await DELETE(req({}), ctx);
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it("archives via the atomic RPC (not two separate writes)", async () => {
    await DELETE(req({ reason: "אי-תשלום" }), ctx);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("admin_archive_building");
    expect(rpcCalls[0].args.p_building_id).toBe(VALID_ID);
    expect(rpcCalls[0].args.p_reason).toBe("אי-תשלום");
  });

  it("NEVER writes buildings/profiles directly during archive (no bypass)", async () => {
    await DELETE(req({}), ctx);
    const bypass = directWrites.filter(w =>
      (w.table === "buildings" || w.table === "profiles") && w.op === "update"
    );
    expect(bypass).toHaveLength(0);
  });

  it("maps building_not_found to 404", async () => {
    rpcError = { message: "building_not_found" };
    const res: any = await DELETE(req({}), ctx);
    expect(res.status).toBe(404);
  });
});

describe("buildings PATCH — validation (P0.8)", () => {
  it("blocks non-admins without buildings.modify", async () => {
    guardResult = { ok: false, response: { status: 403 } };
    const res: any = await PATCH(req({ name: "x" }), ctx);
    expect(res.status).toBe(403);
  });

  it("rejects a forbidden field (mass-assignment) with 400", async () => {
    const res: any = await PATCH(req({ is_archived: false, invite_code: "HACK" }), ctx);
    expect(res.status).toBe(400);
  });
});
