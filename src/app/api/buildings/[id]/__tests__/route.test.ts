// PANEL-PAY א2 (החלטות 367, 369, C1): עריכה, השעיה / הפעלה וארכוב של בניין — דרך bloc (/api/internal/buildings), עם השחקן
// מהסשן. הפאנל לא כותב ל-buildings ולא מריץ admin_archive_building. ארכוב והשעיה / הפעלה — עם קוד אישור (step-up), לפני bloc;
// עריכה — בלי. כל קוד של bloc בעברית; תשובה לא ברורה — "ייתכן שבוצע", אף פעם לא הצלחה.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FORBIDDEN_TEXT, CONFLICT_TEXT, NOT_FOUND_TEXT } from "@/lib/blocActions";
import { READ_FAILED_TEXT, WRITE_FAILED_TEXT, UNEXPECTED_TEXT, BAD_SHAPE_TEXT } from "@/lib/moneyActions";

const SUPER = { id: "5b1f0a3c-8d2e-4f6a-9b7c-1e2d3f4a5b6c", email: "tal@bloc.co.il", full_name: "T", role: "superadmin", auth_level: "mfa" };
let guardResult: any;
let guardAsked: any;
const calls: Array<{ path: string; payload: any }> = [];
const audits: any[][] = [];
let blocAnswer: any;
let stepUpOk = true;
let stepUpCalls = 0;
const touched: string[] = [];

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => { guardAsked = opts; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/stepUp", () => ({
  requireStepUp: () => {
    stepUpCalls++;
    return stepUpOk ? { ok: true } : { ok: false, reason: "missing", response: Response.json({ error: "פעולה רגישה — צריך לאשר", code: "stepup_required" }, { status: 403 }) };
  },
}));
// PATCH / DELETE לא נוגעים ב-DB של bloc בכלל: לא update, לא rpc, לא billing_subscriptions.
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => { touched.push(table); throw new Error(`the panel must not touch ${table} here`); },
    rpc: (fn: string) => { touched.push(`rpc:${fn}`); throw new Error("the panel must not run rpcs here"); },
  },
}));

import { PATCH, DELETE } from "../route";
const ID = "11111111-1111-1111-1111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const rawReq = (json: () => Promise<unknown>): any => ({ json, headers: { get: () => null } });
const ok = (data: any) => ({ ok: true, status: 200, data });
const fail = (status: number, code?: string, error = code ?? "x") => ({ ok: false, status, code, error });
const ROW = { id: ID, name: "בניין א", address: "הרצל 1", max_tenants: 40, invite_code: "B-1A2B3C", is_active: true, is_archived: false, plan: "free", created_at: null };
const OUT = { id: ID, name: "בניין א", address: "הרצל 1", max_tenants: 40, is_active: true, invite_code: "B-1A2B3C" };

beforeEach(() => {
  guardResult = { ok: true, session: SUPER }; guardAsked = undefined;
  calls.length = 0; audits.length = 0; touched.length = 0;
  stepUpOk = true; stepUpCalls = 0;
  blocAnswer = ok({ ok: true, archived: true, blocked: 5, stop_task: "none" });
});

describe("DELETE — archive through bloc (atomic there: admin_archive_building)", () => {
  it("super-admin only (the panel's guard) — a refused session never reaches bloc", async () => {
    guardResult = { ok: false, response: Response.json({ error: "x" }, { status: 403 }) };
    const res: any = await DELETE(req({}), ctx);
    expect(res.status).toBe(403);
    expect(guardAsked).toEqual({ role: "superadmin" });
    expect(calls).toHaveLength(0);
  });
  it("decision 369: no fresh step-up → 403 stepup_required, nothing sent, nothing logged", async () => {
    stepUpOk = false;
    const res: any = await DELETE(req({ reason: "אי-תשלום" }), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("stepup_required");
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("sends archive with the session's actor and the reason; the panel writes nothing and runs no rpc", async () => {
    const res: any = await DELETE(req({ reason: "אי-תשלום" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, archived: true, stop_task: "none" });
    expect(stepUpCalls).toBe(1);
    expect(calls).toEqual([{ path: "/api/internal/buildings", payload: {
      actor: { id: SUPER.id, email: SUPER.email, role: "superadmin" }, action: "archive", building_id: ID, reason: "אי-תשלום",
    } }]);
    expect(touched).toEqual([]);
    expect(audits[0].slice(1, 4)).toEqual(["ARCHIVE_BUILDING", "building", ID]);
    expect(audits[0][4]).toMatchObject({ blocked: 5, reason: "אי-תשלום", note: "נתונים שמורים לפי GDPR — לא נמחקו" });
    expect(audits[0][4]).not.toHaveProperty("live_subscription");
  });
  it("no body (the building page sent none) — archives with the default reason", async () => {
    const res: any = await DELETE(rawReq(async () => { throw new SyntaxError("Unexpected end of JSON input"); }), ctx);
    expect(res.status).toBe(200);
    expect(calls[0].payload.reason).toBe("הועבר לארכיון על ידי צוות bloc");
  });
  it("a bad id → 400 before bloc; an unknown field → 400", async () => {
    expect((await DELETE(req({}), { params: Promise.resolve({ id: "x" }) }) as any).status).toBe(400);
    expect((await DELETE(req({ reason: "x", is_archived: true }), ctx) as any).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  const cases: Array<[string, any, number, string, string, string]> = [
    ["404 not_found", fail(404, "not_found"), 404, "not_found", NOT_FOUND_TEXT.building_archive, "BLOC_ACTION_FAILED"],
    ["403 forbidden", fail(403, "forbidden"), 403, "forbidden", FORBIDDEN_TEXT.building_archive, "BLOC_ACTION_FAILED"],
    ["503 read_failed", fail(503, "read_failed"), 503, "read_failed", READ_FAILED_TEXT, "BLOC_ACTION_FAILED"],
    ["503 write_failed", fail(503, "write_failed"), 503, "write_failed", WRITE_FAILED_TEXT, "BLOC_ACTION_FAILED"],
    ["500 failed", fail(500, "failed"), 500, "failed", UNEXPECTED_TEXT, "BLOC_ACTION_UNKNOWN"],
  ];
  for (const [name, answer, status, code, text, audit] of cases) {
    it(`${name} → ${status} in Hebrew, logged ${audit}, never ARCHIVE_BUILDING`, async () => {
      blocAnswer = answer;
      const res: any = await DELETE(req({ reason: "x" }), ctx);
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: text, code });
      expect(audits.map((a) => a[1])).toEqual([audit]);
      expect(audits[0][4]).toMatchObject({ action: "ARCHIVE_BUILDING", code, status });
    });
  }
  it("timeout → 'maybe it happened — refresh', BLOC_ACTION_UNKNOWN", async () => {
    blocAnswer = fail(504, "TIMEOUT", "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב.");
    const res: any = await DELETE(req({}), ctx);
    expect(res.status).toBe(504);
    expect((await res.json()).error).toContain("ייתכן שהפעולה בוצעה");
    expect(audits[0][1]).toBe("BLOC_ACTION_UNKNOWN");
  });
  it("an unclear 2xx (not archived, unknown stop_task, ok missing, {}) → 502 bad_shape — never 'archived'", async () => {
    for (const data of [{}, { ok: true }, { ok: true, archived: false, stop_task: "none" }, { ok: true, archived: true }, { ok: true, archived: true, stop_task: "maybe" }, { archived: true, stop_task: "none" }]) {
      audits.length = 0;
      blocAnswer = ok(data);
      const res: any = await DELETE(req({}), ctx);
      expect(res.status, JSON.stringify(data)).toBe(502);
      expect(await res.json()).toEqual({ error: BAD_SHAPE_TEXT, code: "bad_shape" });
      expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_UNKNOWN"]);
    }
  });
});

describe("PATCH — edit through bloc, no code", () => {
  beforeEach(() => { blocAnswer = ok({ ok: true, building: ROW }); });
  it("buildings.modify (the panel's guard); a refused session never reaches bloc", async () => {
    guardResult = { ok: false, response: Response.json({ error: "x" }, { status: 403 }) };
    expect((await PATCH(req({ name: "x" }), ctx) as any).status).toBe(403);
    expect(guardAsked).toEqual({ permission: "buildings.modify" });
    expect(calls).toHaveLength(0);
  });
  it("decision 369: a plain edit asks no code (even without a step-up) and sends update with the patch and what the screen showed", async () => {
    stepUpOk = false;
    const res: any = await PATCH(req({ name: "שם חדש", address: "הרצל 1", max_tenants: 40, expected: { name: "בניין א", address: null, max_tenants: 50 } }), ctx);
    expect(res.status).toBe(200);
    expect(stepUpCalls).toBe(0);
    expect(calls).toEqual([{ path: "/api/internal/buildings", payload: {
      actor: { id: SUPER.id, email: SUPER.email, role: "superadmin" }, action: "update", building_id: ID,
      patch: { name: "שם חדש", address: "הרצל 1", max_tenants: 40 }, expected: { name: "בניין א", address: null, max_tenants: 50 },
    } }]);
    expect(await res.json()).toEqual({ data: OUT });
    expect(audits[0].slice(1, 4)).toEqual(["UPDATE_BUILDING", "building", ID]);
    expect(audits[0][4]).toEqual({ changes: { name: "שם חדש", address: "הרצל 1", max_tenants: 40 }, result: OUT });
    expect(touched).toEqual([]);
  });
  it("without expected — none is sent; bloc's unchanged is passed on and logged", async () => {
    blocAnswer = ok({ ok: true, building: ROW, unchanged: true });
    const res: any = await PATCH(req({ name: "בניין א" }), ctx);
    expect(calls[0].payload).not.toHaveProperty("expected");
    expect(await res.json()).toEqual({ data: OUT, unchanged: true });
    expect(audits[0][4]).toMatchObject({ unchanged: true });
  });
  it("mass-assignment / garbage / empty edit / not JSON → 400, nothing sent", async () => {
    expect((await PATCH(req({ is_archived: false, invite_code: "HACK" }), ctx) as any).status).toBe(400);
    expect((await PATCH(req({ name: "x", expected: { plan: "tower" } }), ctx) as any).status).toBe(400);
    expect((await PATCH(req({}), ctx) as any).status).toBe(400);
    expect((await PATCH(req({ expected: { name: "x" } }), ctx) as any).status).toBe(400);
    expect((await PATCH(rawReq(async () => { throw new Error("x"); }), ctx) as any).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("PANEL-PAY א1 (decision 363): plan / comp_reason / plan_expires → 400 plan_moved in Hebrew, nothing sent", async () => {
    for (const body of [{ plan: "tower", comp_reason: "פיילוט" }, { name: "x", plan: "free" }, { comp_reason: "x" }, { plan_expires: null }]) {
      const res: any = await PATCH(req(body), ctx);
      expect(res.status, JSON.stringify(body)).toBe(400);
      const j = await res.json();
      expect(j.code).toBe("plan_moved");
      expect(j.error).toContain("מסלול בלי חיוב");
    }
    expect(calls).toHaveLength(0);
  });
  it("409 changed (someone edited it meanwhile) / archived / 404 → Hebrew, BLOC_ACTION_FAILED", async () => {
    for (const [answer, status, text] of [
      [fail(409, "changed"), 409, CONFLICT_TEXT.building_update.changed],
      [fail(409, "archived"), 409, CONFLICT_TEXT.building_update.archived],
      [fail(404, "not_found"), 404, NOT_FOUND_TEXT.building_update],
      [fail(403, "forbidden"), 403, FORBIDDEN_TEXT.building_update],
    ] as Array<[any, number, string]>) {
      audits.length = 0;
      blocAnswer = answer;
      const res: any = await PATCH(req({ name: "x" }), ctx);
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(text);
      expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_FAILED"]);
      expect(audits[0][4]).toMatchObject({ action: "UPDATE_BUILDING", changes: { name: "x" } });
    }
  });
  it("an unclear 2xx (no row, another building's row, ok missing) → 502 bad_shape, unknown", async () => {
    for (const data of [{ ok: true }, { ok: true, building: { ...ROW, id: "22222222-2222-2222-2222-222222222222" } }, { building: ROW }, {}]) {
      audits.length = 0;
      blocAnswer = ok(data);
      const res: any = await PATCH(req({ name: "x" }), ctx);
      expect(res.status, JSON.stringify(data)).toBe(502);
      expect((await res.json()).code).toBe("bad_shape");
      expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_UNKNOWN"]);
    }
  });
});

describe("PATCH — suspend / activate through bloc, with a code (decision 369)", () => {
  beforeEach(() => { blocAnswer = ok({ ok: true, building: { id: ID, name: "בניין א", is_active: false }, stop_task: "none" }); });
  it("no fresh step-up → 403 stepup_required before bloc (suspend and activate alike)", async () => {
    stepUpOk = false;
    for (const body of [{ is_active: false }, { is_active: true }]) {
      const res: any = await PATCH(req(body), ctx);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("stepup_required");
    }
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("{ is_active: false } → set_active with the reason; SUSPEND_BUILDING with bloc's row", async () => {
    const res: any = await PATCH(req({ is_active: false, reason: "חוב" }), ctx);
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ path: "/api/internal/buildings", payload: {
      actor: { id: SUPER.id, email: SUPER.email, role: "superadmin" }, action: "set_active", building_id: ID, is_active: false, reason: "חוב",
    } }]);
    expect(await res.json()).toEqual({ data: { id: ID, name: "בניין א", is_active: false }, stop_task: "none" });
    expect(audits[0].slice(1, 4)).toEqual(["SUSPEND_BUILDING", "building", ID]);
    expect(audits[0][4]).toMatchObject({ name: "בניין א", reason: "חוב" });
    expect(touched).toEqual([]);
  });
  it("{ is_active: true } → ACTIVATE_BUILDING", async () => {
    blocAnswer = ok({ ok: true, building: { id: ID, name: "בניין א", is_active: true }, stop_task: "none" });
    const res: any = await PATCH(req({ is_active: true }), ctx);
    expect(res.status).toBe(200);
    expect(calls[0].payload).toEqual({ actor: { id: SUPER.id, email: SUPER.email, role: "superadmin" }, action: "set_active", building_id: ID, is_active: true });
    expect(audits[0][1]).toBe("ACTIVATE_BUILDING");
  });
  it("an archived building → 409 archived in Hebrew; missing → 404 in Hebrew; a failed write → 503 in Hebrew", async () => {
    blocAnswer = fail(409, "archived");
    expect((await (await PATCH(req({ is_active: false }), ctx) as any).json()).error).toBe(CONFLICT_TEXT.building_active.archived);
    blocAnswer = fail(404, "not_found");
    const nf: any = await PATCH(req({ is_active: false }), ctx);
    expect(nf.status).toBe(404);
    expect((await nf.json()).error).toBe("הבניין לא נמצא, או שהוא בארכיון.");
    blocAnswer = fail(503, "write_failed");
    expect((await (await PATCH(req({ is_active: true }), ctx) as any).json()).error).toBe(WRITE_FAILED_TEXT);
    expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_FAILED", "BLOC_ACTION_FAILED", "BLOC_ACTION_FAILED"]);
    expect(audits.map((a) => a[4].action)).toEqual(["SUSPEND_BUILDING", "SUSPEND_BUILDING", "ACTIVATE_BUILDING"]);
  });
  it("bloc returned the other state, or no row → 502 bad_shape (never 'suspended')", async () => {
    for (const data of [{ ok: true, building: { id: ID, name: "בניין א", is_active: true }, stop_task: "none" }, { ok: true, stop_task: "none" }, { ok: true, building: { id: ID, name: "בניין א", is_active: false } }]) {
      audits.length = 0;
      blocAnswer = ok(data);
      const res: any = await PATCH(req({ is_active: false }), ctx);
      expect(res.status, JSON.stringify(data)).toBe(502);
      expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_UNKNOWN"]);
    }
  });
  it("is_active cannot ride along with other fields; garbage — 400; nothing sent", async () => {
    expect((await PATCH(req({ is_active: false, name: "x" }), ctx) as any).status).toBe(400);
    expect((await PATCH(req({ is_active: "no" }), ctx) as any).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
