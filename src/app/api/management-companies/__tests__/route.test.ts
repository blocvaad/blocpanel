import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any = { ok: true, session: { id: "a1", email: "a@x.co", full_name: "A", role: "superadmin", auth_level: "mfa" } };
const rpcCalls: Array<{ fn: string; args: any }> = [];
const directWrites: Array<{ table: string; op: string }> = [];
let rpcError: any = null;
let companyRow: any = { id: "c1", name: "חברת בדיקה", owner_id: "o1" };

vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/auth", () => ({ auditLog: async () => {} }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: companyRow }),
        // Any .update()/.insert() here is a DIRECT write — we track it to prove
        // the status change does NOT bypass the atomic RPC.
        update: () => { directWrites.push({ table, op: "update" }); return chain; },
        insert: () => { directWrites.push({ table, op: "insert" }); return Promise.resolve({ error: null }); },
      };
      return chain;
    },
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return { data: rpcError ? null : [{ owner_id: "o1", company_name: "חברת בדיקה" }], error: rpcError };
    },
  },
}));

import { PATCH } from "../route";
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });

beforeEach(() => {
  guardResult = { ok: true, session: { id: "a1", email: "a@x.co", full_name: "A", role: "superadmin", auth_level: "mfa" } };
  rpcCalls.length = 0; directWrites.length = 0; rpcError = null;
  companyRow = { id: "c1", name: "חברת בדיקה", owner_id: "o1" };
});

describe("management-companies PATCH — atomic status change (P0.6)", () => {
  it("403 when guard denies (viewer)", async () => {
    guardResult = { ok: false, response: { status: 403 } };
    const res: any = await PATCH(req({ id: "11111111-1111-1111-1111-111111111111", action: "approve" }));
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it("approve → calls the atomic RPC with active + management", async () => {
    await PATCH(req({ id: "11111111-1111-1111-1111-111111111111", action: "approve" }));
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("admin_set_management_status");
    expect(rpcCalls[0].args.p_new_status).toBe("active");
    expect(rpcCalls[0].args.p_new_role).toBe("management");
  });

  it("suspend → status suspended + role tenant", async () => {
    await PATCH(req({ id: "11111111-1111-1111-1111-111111111111", action: "suspend" }));
    expect(rpcCalls[0].args.p_new_status).toBe("suspended");
    expect(rpcCalls[0].args.p_new_role).toBe("tenant");
  });

  it("NEVER writes management_companies / profiles directly (no bypass)", async () => {
    await PATCH(req({ id: "11111111-1111-1111-1111-111111111111", action: "approve" }));
    const bypass = directWrites.filter(w =>
      (w.table === "management_companies" || w.table === "profiles") && w.op === "update"
    );
    expect(bypass).toHaveLength(0);
  });

  it("404 when the company does not exist", async () => {
    companyRow = null;
    const res: any = await PATCH(req({ id: "22222222-2222-2222-2222-222222222222", action: "approve" }));
    expect(res.status).toBe(404);
    expect(rpcCalls).toHaveLength(0);
  });

  it("maps an RPC company_not_found error to 404", async () => {
    rpcError = { message: "company_not_found" };
    const res: any = await PATCH(req({ id: "11111111-1111-1111-1111-111111111111", action: "approve" }));
    expect(res.status).toBe(404);
  });

  it("rejects an invalid action via schema (400)", async () => {
    const res: any = await PATCH(req({ id: "11111111-1111-1111-1111-111111111111", action: "delete" }));
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it("still sends the owner a notification after a successful change", async () => {
    await PATCH(req({ id: "11111111-1111-1111-1111-111111111111", action: "approve" }));
    const notif = directWrites.find(w => w.table === "notifications" && w.op === "insert");
    expect(notif).toBeTruthy();
  });
});
