import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any = { ok: true, session: { id: "a1", email: "a@x.co", full_name: "A", role: "superadmin", auth_level: "mfa" } };
const rpcCalls: Array<{ fn: string; args: any }> = [];
const directWrites: Array<{ table: string; op: string; payload?: any }> = [];
let rpcError: any = null;
let suspendRow: any = { id: "x", name: "בניין א", is_active: false };
let suspendError: any = null;
const filters: Array<[string, ...any[]]> = [];
const audits: any[][] = [];

vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: (...a: any[]) => { filters.push(["eq", ...a]); return chain; },
        not: (...a: any[]) => { filters.push(["not", ...a]); return chain; },
        single: async () => ({ data: { name: "בניין א" } }),
        maybeSingle: async () => ({ data: suspendError ? null : suspendRow, error: suspendError }),
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
/** בקשה שהגוף שלה אינו JSON (json() זורק) — כמו req, בטיפוס any (NextRequest אמיתי אינו נדרש כאן). */
const rawReq = (json: () => Promise<unknown>): any => ({ json, headers: { get: () => null } });

beforeEach(() => {
  guardResult = { ok: true, session: { id: "a1", email: "a@x.co", full_name: "A", role: "superadmin", auth_level: "mfa" } };
  rpcCalls.length = 0; directWrites.length = 0; rpcError = null;
  suspendRow = { id: VALID_ID, name: "בניין א", is_active: false }; suspendError = null; filters.length = 0; audits.length = 0;
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

describe("buildings PATCH — suspend / activate (bloc UI-R5a P1: it was rejected and nothing said so)", () => {
  it("{ is_active: false } writes only is_active, never on an archived building, and audits SUSPEND_BUILDING", async () => {
    const res: any = await PATCH(req({ is_active: false, reason: "חוב" }), ctx);
    expect(res.status).toBe(200);
    expect(directWrites).toEqual([{ table: "buildings", op: "update", payload: { is_active: false } }]);
    expect(filters).toContainEqual(["eq", "id", VALID_ID]);
    expect(filters).toContainEqual(["not", "is_archived", "is", true]);
    expect(audits[0].slice(1, 4)).toEqual(["SUSPEND_BUILDING", "building", VALID_ID]);
    expect(audits[0][4]).toMatchObject({ reason: "חוב" });
  });
  it("{ is_active: true } — ACTIVATE_BUILDING", async () => {
    suspendRow = { id: VALID_ID, name: "בניין א", is_active: true };
    await PATCH(req({ is_active: true }), ctx);
    expect(audits[0][1]).toBe("ACTIVATE_BUILDING");
  });
  it("no such (or archived) building — 404 in Hebrew; a failed write — 500 in Hebrew", async () => {
    suspendRow = null;
    const nf: any = await PATCH(req({ is_active: false }), ctx);
    expect(nf.status).toBe(404);
    expect((await nf.json()).error).toMatch(/[א-ת]/);
    suspendError = { message: "boom" };
    const err: any = await PATCH(req({ is_active: false }), ctx);
    expect(err.status).toBe(500);
    expect((await err.json()).error).toContain("ההשעיה נכשלה");
  });
  it("is_active cannot ride along with other fields; garbage — 400", async () => {
    expect((await PATCH(req({ is_active: false, name: "x" }), ctx)).status).toBe(400);
    expect((await PATCH(req({ is_active: "no" }), ctx)).status).toBe(400);
    expect(directWrites).toHaveLength(0);
  });
  it("the edit path is unchanged (name) and a body that is not JSON — 400", async () => {
    expect((await PATCH(req({ name: "שם חדש" }), ctx)).status).toBe(200);
    const bad: any = await PATCH(rawReq(async () => { throw new Error("x"); }), ctx);
    expect(bad.status).toBe(400);
  });
});

describe("buildings DELETE — the building page sent no body (400)", () => {
  it("no body — archives with the default reason", async () => {
    const res: any = await DELETE(rawReq(async () => { throw new SyntaxError("Unexpected end of JSON input"); }), ctx);
    expect(res.status).toBe(200);
    expect(rpcCalls[0].args.p_reason).toBe("הועבר לארכיון על ידי צוות bloc");
  });
});
