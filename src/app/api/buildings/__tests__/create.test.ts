// PANEL-PAY א2 (החלטה 367, C1): בניין חדש — דרך bloc (/api/internal/buildings, create), עם ראש הוועד באותה בקשה. הפאנל לא
// כותב ל-buildings ולא שולח בקשה שנייה ל-members; כשל במינוי משאיר את הבניין ונאמר במסך. (bloc UI-R5c-1: אף פרופיל לא נדרס.)
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FOUNDER_TEXT, FOUNDER_FAILED_TEXT, FOUNDER_UNKNOWN_TEXT, FORBIDDEN_TEXT } from "@/lib/blocActions";
import { READ_FAILED_TEXT, WRITE_FAILED_TEXT, INVALID_TEXT, UNEXPECTED_TEXT, BAD_SHAPE_TEXT } from "@/lib/moneyActions";

let guardResult: any;
let guardAsked: any;
const calls: any[] = [];
const audits: any[] = [];
const external: any[] = [];
let blocAnswer: any;

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => { guardAsked = opts; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/externalNotify", () => ({ notifyExternal: async (e: string, d: any) => { external.push({ e, d }); } }));
// PANEL-PAY א1 (החלטה 364): מינוי ראש ועד ביצירה (admin_email → founder) דורש אישור בקוד. כאן — נשלט מהבדיקה.
let stepUpOk = true;
let stepUpCalls = 0;
vi.mock("@/lib/stepUp", () => ({
  requireStepUp: () => {
    stepUpCalls++;
    return stepUpOk ? { ok: true } : { ok: false, reason: "missing", response: Response.json({ error: "פעולה רגישה — צריך לאשר", code: "stepup_required" }, { status: 403 }) };
  },
}));
// הפאנל לא נוגע ב-DB כאן בכלל — לא קוד הצטרפות, לא insert, לא פרופילים.
const touched: string[] = [];
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => { touched.push(table); throw new Error(`the panel must not touch ${table} here`); },
    rpc: (fn: string) => { touched.push(`rpc:${fn}`); throw new Error("no rpc"); },
    auth: { admin: { listUsers: async () => { touched.push("auth.listUsers"); return { data: { users: [] } }; } } },
  },
}));

let POST: any;
const ADMIN = { id: "5b1f0a3c-8d2e-4f6a-9b7c-1e2d3f4a5b6c", email: "ops@bloc.co.il", role: "admin" };
const ROW = { id: "b-new", name: "השקד 104", address: null, max_tenants: 50, invite_code: "B-4K2Q9X", is_active: true, is_archived: false, plan: "free", created_at: "2026-11-15T10:00:00Z" };
const OUT = { id: "b-new", name: "השקד 104", address: null, max_tenants: 50, is_active: true, invite_code: "B-4K2Q9X" };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const ok = (data: any) => ({ ok: true, status: 200, data });
const fail = (status: number, code?: string, error = code ?? "x") => ({ ok: false, status, code, error });

beforeEach(async () => {
  ({ POST } = await import("../route"));
  guardResult = { ok: true, session: ADMIN }; guardAsked = undefined;
  blocAnswer = ok({ ok: true, building: ROW, founder: "ok" });
  calls.length = 0; audits.length = 0; touched.length = 0; external.length = 0;
  stepUpOk = true; stepUpCalls = 0;
});

describe("buildings POST — one signed request to bloc", () => {
  it("REGRESSION: the panel writes nothing — no insert, no invite-code read, no profile, no user scan; ONE call creates the building and appoints the head", async () => {
    const r = await POST(req({ name: "השקד 104", admin_email: "dana@example.com", admin_name: "שם אחר" }));
    expect(r.status).toBe(200);
    expect(touched).toEqual([]);
    expect(calls).toEqual([{ path: "/api/internal/buildings", payload: {
      actor: ADMIN, action: "create", building: { name: "השקד 104", max_tenants: 50 }, founder: { email: "dana@example.com" },
    } }]);
    const j = await r.json();
    expect(j).toEqual({ data: OUT, founder: { ok: true } });
  });
  it("the panel's own guard first: buildings.modify; a refused session never reaches bloc", async () => {
    guardResult = { ok: false, response: Response.json({ error: "אין הרשאה" }, { status: 403 }) };
    const r = await POST(req({ name: "השקד 104" }));
    expect(r.status).toBe(403);
    expect(guardAsked).toEqual({ permission: "buildings.modify" });
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("address and max tenants as sent (coerced); without max tenants — 50 like before", async () => {
    await POST(req({ name: "השקד 104", address: "השקד 104, חולון", max_tenants: "30" }));
    expect(calls[0].payload.building).toEqual({ name: "השקד 104", address: "השקד 104, חולון", max_tenants: 30 });
  });
  it("audit CREATE_BUILDING with bloc's row and the head's result; the external channel gets the row's name and id", async () => {
    await POST(req({ name: "השקד 104", admin_email: "dana@example.com" }));
    expect(audits).toHaveLength(1);
    expect(audits[0].slice(1, 4)).toEqual(["CREATE_BUILDING", "building", "b-new"]);
    expect(audits[0][4]).toEqual({ name: "השקד 104", founder: { email: "dana@example.com", assigned: true, code: null }, result: OUT });
    expect(external).toEqual([{ e: "building.created", d: { name: "השקד 104", plan: "free", id: "b-new" } }]);
  });
});

describe("the committee head — in the same request (founder 'ok' | 'failed' | 'skipped')", () => {
  it("failed with bloc's code → the building stays; the screen is told why (Hebrew) and what to do", async () => {
    blocAnswer = ok({ ok: true, building: ROW, founder: "failed", founder_code: "NO_USER" });
    const r = await POST(req({ name: "השקד 104", admin_email: "nobody@example.com" }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.data).toEqual(OUT);
    expect(j.founder).toEqual({ ok: false, code: "NO_USER", message: FOUNDER_TEXT.NO_USER });
    expect(audits[0][4].founder).toEqual({ email: "nobody@example.com", assigned: false, code: "NO_USER" });
  });
  it("failed without a known code → the general sentence", async () => {
    blocAnswer = ok({ ok: true, building: ROW, founder: "failed", founder_code: "failed" });
    expect((await (await POST(req({ name: "א", admin_email: "a@b.co" }))).json()).founder).toEqual({ ok: false, code: "failed", message: FOUNDER_FAILED_TEXT });
  });
  it("an email was sent and bloc said nothing about the head → unknown, never 'appointed'", async () => {
    blocAnswer = ok({ ok: true, building: ROW });
    const j = await (await POST(req({ name: "א", admin_email: "a@b.co" }))).json();
    expect(j.founder).toEqual({ ok: false, code: "unknown", message: FOUNDER_UNKNOWN_TEXT });
    expect(audits[0][4].founder.assigned).toBe(false);
  });
  it("without an email — no founder in the request, none in the answer (even if bloc says 'skipped'), audit founder null", async () => {
    blocAnswer = ok({ ok: true, building: ROW, founder: "skipped" });
    const r = await POST(req({ name: "השקד 104" }));
    expect(calls[0].payload).not.toHaveProperty("founder");
    const j = await r.json();
    expect(j).toEqual({ data: OUT });
    expect(audits[0][4].founder).toBeNull();
  });
});

describe("bloc's codes — Hebrew, and a failure is never shown as created", () => {
  const cases: Array<[string, any, number, string, string]> = [
    ["400 invalid", fail(400, "invalid"), 400, "invalid", INVALID_TEXT],
    ["403 forbidden", fail(403, "forbidden"), 403, "forbidden", FORBIDDEN_TEXT.building_create],
    ["503 read_failed", fail(503, "read_failed"), 503, "read_failed", READ_FAILED_TEXT],
    ["503 write_failed", fail(503, "write_failed"), 503, "write_failed", WRITE_FAILED_TEXT],
    ["500 failed", fail(500, "failed"), 500, "failed", UNEXPECTED_TEXT],
  ];
  for (const [name, answer, status, code, text] of cases) {
    it(`${name} → ${status} ${code}, logged BLOC_ACTION_FAILED / _UNKNOWN, no CREATE_BUILDING, no external message`, async () => {
      blocAnswer = answer;
      const r = await POST(req({ name: "השקד 104" }));
      expect(r.status).toBe(status);
      expect(await r.json()).toEqual({ error: text, code });
      expect(audits).toHaveLength(1);
      expect(audits[0][1]).toBe(status >= 500 && code === "failed" ? "BLOC_ACTION_UNKNOWN" : "BLOC_ACTION_FAILED");
      expect(audits[0][4]).toMatchObject({ action: "CREATE_BUILDING", code, status, name: "השקד 104" });
      expect(external).toEqual([]);
    });
  }
  it("timeout → callBloc's 'maybe it happened — refresh' and BLOC_ACTION_UNKNOWN (a retry could open a second building)", async () => {
    blocAnswer = fail(504, "TIMEOUT", "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב.");
    const r = await POST(req({ name: "השקד 104", admin_email: "dana@example.com" }));
    expect(r.status).toBe(504);
    expect((await r.json()).error).toContain("ייתכן שהפעולה בוצעה");
    expect(audits[0][1]).toBe("BLOC_ACTION_UNKNOWN");
    expect(audits[0][4]).toMatchObject({ outcome: "unknown", founder_email: "dana@example.com" });
  });
  it("an unclear 2xx ({} from a non-JSON body, ok:false, no row, a row without id) → 502 bad_shape, 'maybe it happened', unknown", async () => {
    for (const data of [{}, { ok: false, building: ROW }, { ok: true }, { ok: true, building: { name: "x" } }, { ok: "true", building: ROW }]) {
      audits.length = 0; external.length = 0;
      blocAnswer = ok(data);
      const r = await POST(req({ name: "השקד 104" }));
      expect(r.status, JSON.stringify(data)).toBe(502);
      expect(await r.json()).toEqual({ error: BAD_SHAPE_TEXT, code: "bad_shape" });
      expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_UNKNOWN"]);
      expect(external).toEqual([]);
    }
  });
});

describe("PANEL-PAY א1 (decision 363): a new building opens on the default plan", () => {
  it("the request carries no plan / comp_reason / plan_expires; the audit has no plan", async () => {
    await POST(req({ name: "השקד 104", address: "השקד 104, חולון", max_tenants: 30 }));
    expect(Object.keys(calls[0].payload.building).sort()).toEqual(["address", "max_tenants", "name"]);
    expect(calls[0].payload).not.toHaveProperty("plan");
    expect(audits[0][4]).not.toHaveProperty("plan");
  });
  it("a plan in the body (even free) → 400 plan_moved, nothing sent", async () => {
    for (const body of [{ name: "בניין", plan: "tower", comp_reason: "פיילוט" }, { name: "בניין", plan: "free" }, { name: "בניין", comp_reason: "x" }]) {
      const r = await POST(req(body));
      expect(r.status).toBe(400);
      expect((await r.json()).code).toBe("plan_moved");
    }
    expect(calls).toHaveLength(0);
  });
  it("a body that is not JSON, an unknown field, an empty name → 400, nothing sent", async () => {
    expect((await POST({ json: async () => { throw new Error("x"); }, headers: { get: () => null } })).status).toBe(400);
    expect((await POST(req({ name: "א", invite_code: "HACK" }))).status).toBe(400);
    expect((await POST(req({ name: "" }))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("a name of spaces only → 400 'שם חובה' here (bloc trims and would refuse it as invalid)", async () => {
    const r = await POST(req({ name: "   " }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("שם חובה");
    expect(calls).toHaveLength(0);
  });
});

describe("PANEL-PAY א1 (decision 364): appointing the committee head at creation needs a fresh step-up", () => {
  it("admin_email without a step-up: 403 stepup_required before anything — no bloc call, no log", async () => {
    stepUpOk = false;
    const r = await POST(req({ name: "השקד 104", admin_email: "dana@example.com" }));
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe("stepup_required");
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("admin_email with a fresh step-up: one bloc call creates the building and appoints the head", async () => {
    const r = await POST(req({ name: "השקד 104", admin_email: "dana@example.com" }));
    expect(r.status).toBe(200);
    expect(stepUpCalls).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toMatchObject({ action: "create", founder: { email: "dana@example.com" } });
  });
  it("decision 369: a plain create (no head) asks no code, even when there is no step-up", async () => {
    stepUpOk = false;
    const r = await POST(req({ name: "השקד 104" }));
    expect(r.status).toBe(200);
    expect(stepUpCalls).toBe(0);
    expect(calls).toHaveLength(1);
  });
});
