// מתנת קרדיטים ל-AI לבניין (bloc AI-1): סופר-אדמין בלבד, דרך ai_topup_grant, ביומן.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let guardArgs: any[] = [];
const rpcCalls: Array<{ fn: string; args: any }> = [];
const audits: any[][] = [];
let building: any = { id: "b1", name: "השקד 104" };
let rpcResult: any = { data: "o1", error: null };

vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: building, error: null }),
      };
      return chain;
    },
    rpc: async (fn: string, args: any) => { rpcCalls.push({ fn, args }); return rpcResult; },
  },
}));

import { POST } from "../route";
const ID = "11111111-1111-1111-1111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const SESSION = { id: "a1", email: "tal@bloc.co.il", full_name: "טל", role: "superadmin", auth_level: "mfa" };

beforeEach(() => {
  guardResult = { ok: true, session: SESSION };
  guardArgs = []; rpcCalls.length = 0; audits.length = 0;
  building = { id: ID, name: "השקד 104" };
  rpcResult = { data: "o1", error: null };
});

describe("POST /api/buildings/[id]/ai-credits", () => {
  it("superadmin only — the guard asks for the role, and a refusal writes nothing", async () => {
    await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect(guardArgs[0]).toEqual({ role: "superadmin" });
    guardResult = { ok: false, response: { status: 403 } };
    rpcCalls.length = 0; audits.length = 0;
    const res: any = await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("grants through ai_topup_grant with who gave it and why, and logs it", async () => {
    const res: any = await POST(req({ units: 1500, months: 6, note: "פיצוי על תקלה" }), ctx);
    expect(res.status).toBe(200);
    expect(rpcCalls).toEqual([{ fn: "ai_topup_grant", args: { p_building: ID, p_units: 1500, p_by: "tal@bloc.co.il", p_note: "פיצוי על תקלה", p_months: 6 } }]);
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toBe("AI_CREDITS_GRANT");
    expect(audits[0][2]).toBe("building");
    expect(audits[0][3]).toBe(ID);
    expect(audits[0][4]).toMatchObject({ name: "השקד 104", units: 1500, months: 6, note: "פיצוי על תקלה", order_id: "o1" });
    expect(await res.json()).toEqual({ ok: true, id: "o1" });
  });

  it("months default to a year", async () => {
    await POST(req({ units: 10, note: "פיילוט" }), ctx);
    expect(rpcCalls[0].args.p_months).toBe(12);
  });

  it("no reason, no units, too many — 400 in Hebrew, nothing granted", async () => {
    for (const body of [{ units: 100 }, { units: 0, note: "פיילוט" }, { units: 200000, note: "פיילוט" }, { units: 100, note: "x" }]) {
      const res: any = await POST(req(body), ctx);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/[֐-׿]/);
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("an unknown building is 404, before the grant", async () => {
    building = null;
    const res: any = await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect(res.status).toBe(404);
    expect(rpcCalls).toHaveLength(0);
  });

  it("before SQL 173 — says so (503); another failure — 500; neither is logged as granted", async () => {
    rpcResult = { data: null, error: { code: "PGRST202", message: "Could not find the function public.ai_topup_grant" } };
    let res: any = await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("173");
    rpcResult = { data: null, error: { code: "22023", message: "ai_topup_grant: bad arguments" } };
    res = await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect(res.status).toBe(500);
    expect(audits).toHaveLength(0);
  });
});
