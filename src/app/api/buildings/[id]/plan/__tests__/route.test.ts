// PANEL-PAY א1 (החלטות 362–364, C1): מסלול לבניין בלי חיוב — סופר-אדמין, קוד אישור, דרך bloc (/api/internal/plans).
// הפאנל לא כותב ל-buildings; כל תוצאה של bloc בעברית; יומן הפאנל רושם כל ניסיון עם התשובה של bloc.
import { describe, it, expect, beforeEach, vi } from "vitest";

const SUPER = { id: "11111111-1111-4111-8111-111111111111", email: "tal@bloc.co.il", full_name: "טל", role: "superadmin", auth_level: "mfa" };
let guardArgs: any[] = [];
let guardResult: any;
let stepUpOk = true;
let stepUpCalls = 0;
const calls: Array<{ path: string; payload: any }> = [];
const audits: any[][] = [];
let blocAnswer: any;

vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/stepUp", () => ({
  requireStepUp: () => {
    stepUpCalls++;
    return stepUpOk ? { ok: true } : { ok: false, reason: "missing", response: Response.json({ error: "פעולת כסף — צריך לאשר", code: "stepup_required" }, { status: 403 }) };
  },
}));
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("the panel must not touch buildings for a plan"); }, rpc: () => { throw new Error("no rpc"); } } }));

import { POST } from "../route";
const BID = "22222222-2222-4222-8222-222222222222";
const ctx = (id = BID) => ({ params: Promise.resolve({ id }) });
const req = (body: any): any => ({ json: async () => body, headers: { get: (n: string) => (n === "x-forwarded-for" ? "1.2.3.4, 10.0.0.1" : null) } });
const GRANT = { action: "grant", plan: "tower", comp_reason: "בניין בדיקות של הצוות", expected_plan: "free" };
const ROW = { id: BID, plan: "tower", plan_expires: null, comp_reason: "בניין בדיקות של הצוות" };

beforeEach(() => {
  guardArgs = []; guardResult = { ok: true, session: SUPER };
  stepUpOk = true; stepUpCalls = 0; calls.length = 0; audits.length = 0;
  blocAnswer = { ok: true, status: 200, data: { ok: true, building: { ...ROW, extra: "not forwarded" } } };
});

describe("who may", () => {
  it("superadmin only (decision 363) — the guard asks for the exact role; a refusal reaches neither bloc nor the log", async () => {
    await POST(req(GRANT), ctx());
    expect(guardArgs[0]).toEqual({ role: "superadmin" });
    guardResult = { ok: false, response: new Response(null, { status: 403 }) };
    calls.length = 0; audits.length = 0;
    expect((await POST(req(GRANT), ctx())).status).toBe(403);
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("without a fresh step-up: 403 stepup_required, before bloc, nothing logged", async () => {
    stepUpOk = false;
    const res = await POST(req(GRANT), ctx());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("stepup_required");
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("the body is checked before the step-up: a bad body is 400 without asking for a code", async () => {
    for (const body of [
      { action: "grant", plan: "free", comp_reason: "פיילוט" },             // free is not a grant
      { action: "grant", plan: "tower" },                                   // no reason
      { action: "grant", plan: "tower", comp_reason: "  x " },              // too short after trim
      { action: "grant", plan: "gold", comp_reason: "פיילוט" },             // unknown plan
      { action: "grant", plan: "tower", comp_reason: "פיילוט", building_id: BID },   // strict
      { action: "end_grant", plan: "tower" },
      { action: "delete" },
    ]) {
      const res = await POST(req(body), ctx());
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error).toMatch(/[א-ת]/);
    }
    expect(stepUpCalls).toBe(0);
    expect(calls).toHaveLength(0);
  });
  it("a building id that is not a uuid → 400 before anything", async () => {
    expect((await POST(req(GRANT), ctx("x"))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("to bloc", () => {
  it("grant: the actor from the session (with its role), building_grant, plan, reason, expected_plan — and only the plan columns come back", async () => {
    const res = await POST(req({ ...GRANT, comp_reason: "  בניין בדיקות של הצוות  " }), ctx());
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ path: "/api/internal/plans", payload: {
      actor: { id: SUPER.id, email: SUPER.email, role: "superadmin" },
      action: "building_grant", building_id: BID, plan: "tower", comp_reason: "בניין בדיקות של הצוות", expected_plan: "free",
    } }]);
    expect(await res.json()).toEqual({ ok: true, building: ROW });
    expect(audits).toHaveLength(1);
    expect(audits[0].slice(1, 4)).toEqual(["BUILDING_PLAN_GRANTED", "building", BID]);
    expect(audits[0][4]).toEqual({ plan: "tower", comp_reason: "בניין בדיקות של הצוות", expected_plan: "free", result: ROW });
    expect(audits[0][5]).toBe("1.2.3.4");
  });
  it("end_grant: building_end_grant (no plan, no reason); expected_plan only when given", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, building: { id: BID, plan: "free", plan_expires: null, comp_reason: null } } };
    await POST(req({ action: "end_grant", expected_plan: "tower" }), ctx());
    await POST(req({ action: "end_grant" }), ctx());
    expect(calls[0].payload).toEqual({ actor: { id: SUPER.id, email: SUPER.email, role: "superadmin" }, action: "building_end_grant", building_id: BID, expected_plan: "tower" });
    expect(calls[1].payload).not.toHaveProperty("expected_plan");
    expect(audits[0][1]).toBe("BUILDING_PLAN_GRANT_ENDED");
    expect(audits[0][4].result).toEqual({ id: BID, plan: "free", plan_expires: null, comp_reason: null });
  });
  it("bloc found the same grant (unchanged) — said so, logged with unchanged", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, building: ROW, unchanged: true } };
    const j = await (await POST(req(GRANT), ctx())).json();
    expect(j).toEqual({ ok: true, building: ROW, unchanged: true });
    expect(audits[0][4].unchanged).toBe(true);
  });
});

describe("bloc's answers in Hebrew (and the log keeps the result)", () => {
  const cases: Array<[number, string, RegExp]> = [
    [409, "paying_subscription", /מנוי משלם/],
    [409, "company_covered", /חברת הניהול/],
    [409, "no_grant", /אין מסלול מוענק/],
    [409, "changed", /השתנה מאז שהדף נטען/],
    [404, "not_found", /לא נמצא/],
    [403, "forbidden", /לסופר-אדמין בלבד/],
    [400, "invalid", /לא תקינה/],
    [503, "write_failed", /השמירה ב-bloc נכשלה/],
  ];
  for (const [status, code, text] of cases) {
    it(`${status} ${code}`, async () => {
      blocAnswer = { ok: false, status, code, error: code };
      const res = await POST(req(GRANT), ctx());
      expect(res.status).toBe(status);
      const j = await res.json();
      expect(j.code).toBe(code);
      expect(j.error).toMatch(text);
      expect(audits).toHaveLength(1);
      expect(audits[0][1]).toBe("MONEY_ACTION_FAILED");
      expect(audits[0][4]).toMatchObject({ action: "BUILDING_PLAN_GRANTED", outcome: "failed", code, status, plan: "tower" });
    });
  }
  it("503 read_failed: 'nothing changed, try again' — never 'nothing found'", async () => {
    blocAnswer = { ok: false, status: 503, code: "read_failed", error: "read_failed" };
    const res = await POST(req(GRANT), ctx());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "לא הצלחנו לבדוק — שום דבר לא השתנה. נסו שוב.", code: "read_failed" });
  });
  it("bloc did not answer in time: callBloc's message ('may have happened — refresh'), logged as MONEY_ACTION_UNKNOWN", async () => {
    blocAnswer = { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב." };
    const res = await POST(req({ action: "end_grant", expected_plan: "tower" }), ctx());
    expect(res.status).toBe(504);
    expect((await res.json()).error).toContain("ייתכן שהפעולה בוצעה");
    expect(audits[0][1]).toBe("MONEY_ACTION_UNKNOWN");
    expect(audits[0][4]).toMatchObject({ action: "BUILDING_PLAN_GRANT_ENDED", outcome: "unknown", code: "TIMEOUT" });
  });
  it("not configured / signature refused: the connection sentence passes through, logged as failed", async () => {
    blocAnswer = { ok: false, status: 503, code: "NOT_CONFIGURED", error: "החיבור ל-bloc לא מוגדר (BLOC_APP_URL / PANEL_ACTION_SECRET ב-Vercel של הפאנל)" };
    const res = await POST(req(GRANT), ctx());
    expect((await res.json()).error).toContain("BLOC_APP_URL");
    expect(audits[0][1]).toBe("MONEY_ACTION_FAILED");
  });
  it("a 500 from bloc without a known code is 'unknown' (it may have written before failing)", async () => {
    blocAnswer = { ok: false, status: 500, code: "failed", error: "failed" };
    const res = await POST(req(GRANT), ctx());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/[א-ת]/);
    expect(audits[0][1]).toBe("MONEY_ACTION_UNKNOWN");
  });
});

describe("review #6: a 2xx is success only with ok === true and the building row", () => {
  for (const [name, data] of [["no ok", { building: ROW }], ["ok false", { ok: false, building: ROW }], ["no row", { ok: true }], ["bad row", { ok: true, building: { plan: "tower" } }], ["empty (non-JSON)", {}]] as const) {
    it(name, async () => {
      blocAnswer = { ok: true, status: 200, data };
      const res = await POST(req(GRANT), ctx());
      expect(res.status).toBe(502);
      const j = await res.json();
      expect(j.code).toBe("bad_shape");
      expect(j.error).toContain("ייתכן שהפעולה בוצעה");
      expect(audits.map((a) => a[1])).toEqual(["MONEY_ACTION_UNKNOWN"]);
      expect(audits[0][4]).toMatchObject({ action: "BUILDING_PLAN_GRANTED", outcome: "unknown", code: "bad_shape", plan: "tower" });
    });
  }
});

