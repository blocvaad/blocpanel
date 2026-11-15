// PANEL-PAY א2 (החלטות 368–369, C2): אימות / דחייה / הסרת אימות של ספק — דרך bloc (/api/internal/suppliers), עם השחקן מהסשן
// ועם קוד אישור. הפאנל לא כותב ל-supplier_profiles ולא ל-notifications (bloc שולח את ההודעה); כל קוד של bloc בעברית; תשובה
// לא ברורה — "ייתכן שבוצע".
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CONFLICT_TEXT, FORBIDDEN_TEXT, NOT_FOUND_TEXT } from "@/lib/blocActions";
import { READ_FAILED_TEXT, WRITE_FAILED_TEXT, INVALID_TEXT, UNEXPECTED_TEXT, BAD_SHAPE_TEXT } from "@/lib/moneyActions";

let guardResult: any;
let guardAsked: any;
const calls: Array<{ path: string; payload: any }> = [];
const audits: any[] = [];
let blocAnswer: any;
let stepUpOk = true;
let stepUpCalls = 0;
const touched: string[] = [];

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => { guardAsked = opts; return typeof guardResult === "function" ? guardResult(opts) : guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/stepUp", () => ({
  requireStepUp: () => {
    stepUpCalls++;
    return stepUpOk ? { ok: true } : { ok: false, reason: "missing", response: Response.json({ error: "פעולה רגישה — צריך לאשר", code: "stepup_required" }, { status: 403 }) };
  },
}));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => { touched.push(table); throw new Error(`the panel must not touch ${table} in PATCH`); },
    storage: { from: () => { throw new Error("no storage in PATCH"); } },
  },
}));

let PATCH: any;
const ADMIN = { id: "5b1f0a3c-8d2e-4f6a-9b7c-1e2d3f4a5b6c", email: "a@bloc.co.il", role: "admin" };
const ID = "11111111-1111-1111-1111-111111111111";
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const ok = (data: any) => ({ ok: true, status: 200, data });
const fail = (status: number, code?: string, error = code ?? "x") => ({ ok: false, status, code, error });
// bloc's answer as built (lib/panelOps/suppliers SupplierView, with business_name since the א2 review) — the panel log keeps it.
const VERIFIED = { id: ID, business_name: "אינסטלציה כהן", verification_status: "verified", verified_at: "2026-11-15T10:00:00Z", verification_rejection_reason: null };
const REJECTED = { id: ID, business_name: "אינסטלציה כהן", verification_status: "rejected", verified_at: null, verification_rejection_reason: "תעודה לא קריאה" };

beforeEach(async () => {
  ({ PATCH } = await import("../route"));
  guardResult = { ok: true, session: ADMIN }; guardAsked = undefined;
  calls.length = 0; audits.length = 0; touched.length = 0;
  stepUpOk = true; stepUpCalls = 0;
  blocAnswer = ok({ ok: true, supplier: VERIFIED, notified: true });
});

describe("suppliers PATCH — through bloc", () => {
  it("requires suppliers.verify (the panel's guard); a refused session never reaches bloc", async () => {
    guardResult = { ok: false, response: Response.json({ error: "x" }, { status: 403 }) };
    const res = await PATCH(req({ id: ID, action: "verify" }));
    expect(res.status).toBe(403);
    expect(guardAsked).toEqual({ permission: "suppliers.verify" });
    expect(calls).toHaveLength(0);
  });
  it("decision 369: no fresh step-up → 403 stepup_required, nothing sent, nothing logged (verify, reject, revoke)", async () => {
    stepUpOk = false;
    for (const body of [{ id: ID, action: "verify" }, { id: ID, action: "reject", reason: "תעודה לא קריאה" }, { id: ID, action: "revoke", reason: "רישיון פג" }]) {
      const res = await PATCH(req(body));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("stepup_required");
    }
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("verify: one signed request with the session's actor; bloc's row and notice result go on; the panel writes nothing", async () => {
    const res = await PATCH(req({ id: ID, action: "verify" }));
    expect(res.status).toBe(200);
    expect(stepUpCalls).toBe(1);
    expect(calls).toEqual([{ path: "/api/internal/suppliers", payload: { actor: ADMIN, action: "verify", supplier_id: ID } }]);
    expect(await res.json()).toEqual({ ok: true, verification_status: "verified", supplier: VERIFIED, notified: true });
    expect(touched).toEqual([]);
    expect(audits[0].slice(1, 4)).toEqual(["SUPPLIER_VERIFY", "supplier", ID]);
    expect(audits[0][4]).toEqual({ reason: null, result: VERIFIED, notified: true });
  });
  it("reject / revoke carry the reason; bloc said the notice was not saved → notified false goes on", async () => {
    blocAnswer = ok({ ok: true, supplier: REJECTED, notified: false });
    const r1 = await PATCH(req({ id: ID, action: "reject", reason: "תעודה לא קריאה" }));
    expect(calls[0].payload).toEqual({ actor: ADMIN, action: "reject", supplier_id: ID, reason: "תעודה לא קריאה" });
    expect((await r1.json()).notified).toBe(false);
    expect(audits[0][1]).toBe("SUPPLIER_REJECT");
    await PATCH(req({ id: ID, action: "revoke", reason: "רישיון פג" }));
    expect(calls[1].payload).toEqual({ actor: ADMIN, action: "revoke", supplier_id: ID, reason: "רישיון פג" });
    expect(audits[1][1]).toBe("SUPPLIER_REVOKE");
  });
  it("reject / revoke without a reason, verify with one, a bad id → 400 before bloc", async () => {
    for (const body of [{ id: ID, action: "reject" }, { id: ID, action: "revoke", reason: "x" }, { id: ID, action: "verify", reason: "סיבה" }, { id: "nope", action: "verify" }]) {
      expect((await PATCH(req(body))).status, JSON.stringify(body)).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("bloc's codes — Hebrew, logged, never shown as done", () => {
  const cases: Array<[string, any, number, string, string, string]> = [
    ["409 changed (someone else acted first)", fail(409, "changed"), 409, "changed", CONFLICT_TEXT.supplier.changed, "BLOC_ACTION_FAILED"],
    ["404 not_found", fail(404, "not_found"), 404, "not_found", NOT_FOUND_TEXT.supplier, "BLOC_ACTION_FAILED"],
    ["403 forbidden", fail(403, "forbidden"), 403, "forbidden", FORBIDDEN_TEXT.supplier, "BLOC_ACTION_FAILED"],
    ["400 invalid", fail(400, "invalid"), 400, "invalid", INVALID_TEXT, "BLOC_ACTION_FAILED"],
    ["503 read_failed", fail(503, "read_failed"), 503, "read_failed", READ_FAILED_TEXT, "BLOC_ACTION_FAILED"],
    ["503 write_failed", fail(503, "write_failed"), 503, "write_failed", WRITE_FAILED_TEXT, "BLOC_ACTION_FAILED"],
    ["500 failed", fail(500, "failed"), 500, "failed", UNEXPECTED_TEXT, "BLOC_ACTION_UNKNOWN"],
  ];
  for (const [name, answer, status, code, text, audit] of cases) {
    it(`${name} → ${status}, ${audit}`, async () => {
      blocAnswer = answer;
      const res = await PATCH(req({ id: ID, action: "verify" }));
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: text, code });
      expect(audits.map((a) => a[1])).toEqual([audit]);
      expect(audits[0][4]).toMatchObject({ action: "SUPPLIER_VERIFY", code, status, reason: null });
    });
  }
  it("timeout → 'maybe it happened — refresh', BLOC_ACTION_UNKNOWN", async () => {
    blocAnswer = fail(504, "TIMEOUT", "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב.");
    const res = await PATCH(req({ id: ID, action: "revoke", reason: "רישיון פג" }));
    expect(res.status).toBe(504);
    expect((await res.json()).error).toContain("ייתכן שהפעולה בוצעה");
    expect(audits[0][1]).toBe("BLOC_ACTION_UNKNOWN");
    expect(audits[0][4]).toMatchObject({ action: "SUPPLIER_REVOKE", reason: "רישיון פג" });
  });
  it("an unclear 2xx — no row, the wrong state for the action, another supplier, ok missing → 502 bad_shape", async () => {
    for (const data of [{}, { ok: true }, { ok: true, supplier: REJECTED }, { ok: true, supplier: { ...VERIFIED, id: "22222222-2222-2222-2222-222222222222" } }, { supplier: VERIFIED }]) {
      audits.length = 0;
      blocAnswer = ok(data);
      const res = await PATCH(req({ id: ID, action: "verify" }));
      expect(res.status, JSON.stringify(data)).toBe(502);
      expect(await res.json()).toEqual({ error: BAD_SHAPE_TEXT, code: "bad_shape" });
      expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_UNKNOWN"]);
    }
  });
});
