// מסלול לחברת ניהול בלי חיוב — סופר-אדמין בלבד. PANEL-PAY א1 (C1): דרך bloc (/api/internal/plans: company_grant /
// company_end_grant), עם קוד אישור. הפאנל לא כותב ל-management_companies ולא שולח את ההודעה לבעלים (bloc שולח).
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let stepUpOk = true;
const calls: any[] = [];
const audits: any[] = [];
const notices: any[] = [];
let blocAnswer: any;

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => (typeof guardResult === "function" ? guardResult(opts) : guardResult) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/notify", () => ({ notifyUser: async (to: string, n: any) => { notices.push({ to, ...n }); return true; } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/stepUp", () => ({
  requireStepUp: () => (stepUpOk ? { ok: true } : { ok: false, reason: "missing", response: Response.json({ error: "x", code: "stepup_required" }, { status: 403 }) }),
}));
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("the panel must not read or write management_companies here"); } } }));

let POST: any;
const ID = "22222222-2222-4222-8222-222222222222";
const SUPER = { id: "33333333-3333-4333-8333-333333333333", email: "tal@bloc.co.il", role: "superadmin" };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const COMPANY = { id: ID, plan: "mgmt_growth", plan_expires: null, comp_reason: "שותפות אסטרטגית" };

beforeEach(async () => {
  ({ POST } = await import("../route"));
  guardResult = { ok: true, session: SUPER };
  stepUpOk = true;
  blocAnswer = { ok: true, status: 200, data: { ok: true, company: COMPANY, notified: true } };
  calls.length = 0; audits.length = 0; notices.length = 0;
});

describe("management-companies/billing — comp grants (superadmin only, through bloc)", () => {
  it("asks guard for exact superadmin role", async () => {
    let asked: any;
    guardResult = (o: any) => { asked = o; return { ok: false, response: { status: 403 } }; };
    const res = await POST(req({ id: ID, action: "grant", plan: "mgmt_start", reason: "פיילוט" }));
    expect(res.status).toBe(403);
    expect(asked).toEqual({ role: "superadmin" });
    expect(calls).toHaveLength(0);
  });

  it("without a fresh step-up: 403 stepup_required, bloc is not called", async () => {
    stepUpOk = false;
    const res = await POST(req({ id: ID, action: "grant", plan: "mgmt_start", reason: "פיילוט" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("stepup_required");
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("grant: company_grant to bloc with the session's actor; bloc notifies the owner (not the panel); audited with the result", async () => {
    const res = await POST(req({ id: ID, action: "grant", plan: "mgmt_growth", reason: "שותפות אסטרטגית" }));
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ path: "/api/internal/plans", payload: {
      actor: { id: SUPER.id, email: SUPER.email, role: "superadmin" }, action: "company_grant", company_id: ID, plan: "mgmt_growth", reason: "שותפות אסטרטגית",
    } }]);
    expect(notices).toHaveLength(0);
    expect(await res.json()).toEqual({ ok: true, company: COMPANY, notified: true });
    expect(audits[0][1]).toBe("MANAGEMENT_PLAN_GRANTED");
    expect(audits[0][4]).toEqual({ plan: "mgmt_growth", reason: "שותפות אסטרטגית", result: COMPANY, notified: true });
  });

  it("grant refused while a paid subscription is live (bloc 409) — Hebrew, logged as failed", async () => {
    blocAnswer = { ok: false, status: 409, code: "paying_subscription", error: "paying_subscription" };
    const res = await POST(req({ id: ID, action: "grant", plan: "mgmt_start", reason: "פיילוט" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("לחברה מנוי משלם פעיל — אין צורך בהענקה.");
    expect(audits[0][1]).toBe("MONEY_ACTION_FAILED");
    expect(audits[0][4]).toMatchObject({ action: "MANAGEMENT_PLAN_GRANTED", code: "paying_subscription" });
  });

  it("grant refused for a company that is not approved (bloc 409 company_not_active)", async () => {
    blocAnswer = { ok: false, status: 409, code: "company_not_active", error: "company_not_active" };
    const res = await POST(req({ id: ID, action: "grant", plan: "mgmt_start", reason: "פיילוט" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("אפשר להעניק מסלול רק לחברה מאושרת.");
  });

  it("free plan cannot be granted; reason is required — 400 before the step-up and before bloc", async () => {
    expect((await POST(req({ id: ID, action: "grant", plan: "mgmt_free", reason: "פיילוט" }))).status).toBe(400);
    expect((await POST(req({ id: ID, action: "grant", plan: "mgmt_start" }))).status).toBe(400);
    expect((await POST(req({ id: "x", action: "end_grant" }))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("end_grant: company_end_grant (bloc clears the reason and starts the grace) — audited with bloc's row", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, company: { id: ID, plan: "mgmt_start", plan_expires: "2026-11-15T10:00:00.000Z", comp_reason: null }, notified: true } };
    const res = await POST(req({ id: ID, action: "end_grant" }));
    expect(res.status).toBe(200);
    expect(calls[0].payload).toEqual({ actor: { id: SUPER.id, email: SUPER.email, role: "superadmin" }, action: "company_end_grant", company_id: ID });
    expect(audits[0][1]).toBe("MANAGEMENT_PLAN_GRANT_ENDED");
    expect(audits[0][4].result.plan_expires).toBe("2026-11-15T10:00:00.000Z");
  });

  it("end_grant without an active grant → 409 no_grant in Hebrew; a failed read → 503 'nothing changed'", async () => {
    blocAnswer = { ok: false, status: 409, code: "no_grant", error: "no_grant" };
    let res = await POST(req({ id: ID, action: "end_grant" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("לחברה אין מסלול מוענק לסיים.");
    blocAnswer = { ok: false, status: 503, code: "read_failed", error: "read_failed" };
    res = await POST(req({ id: ID, action: "end_grant" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("לא הצלחנו לבדוק — שום דבר לא השתנה. נסו שוב.");
  });

  it("an unknown company (404) and a timeout (unknown outcome, logged) keep a clear path", async () => {
    blocAnswer = { ok: false, status: 404, code: "not_found", error: "not_found" };
    expect((await (await POST(req({ id: ID, action: "end_grant" }))).json()).error).toBe("החברה לא נמצאה.");
    blocAnswer = { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב." };
    const res = await POST(req({ id: ID, action: "end_grant" }));
    expect(res.status).toBe(504);
    expect(audits[audits.length - 1][1]).toBe("MONEY_ACTION_UNKNOWN");
  });

  it("review #6: a 2xx without ok === true or without the company row is 'may have happened' (502), logged as unknown", async () => {
    for (const data of [{ company: COMPANY }, { ok: true }, {}]) {
      blocAnswer = { ok: true, status: 200, data };
      const res = await POST(req({ id: ID, action: "end_grant" }));
      expect(res.status).toBe(502);
      expect((await res.json()).code).toBe("bad_shape");
    }
    expect(audits.map((a: any[]) => a[1])).toEqual(["MONEY_ACTION_UNKNOWN", "MONEY_ACTION_UNKNOWN", "MONEY_ACTION_UNKNOWN"]);
    expect(audits[0][4]).toMatchObject({ action: "MANAGEMENT_PLAN_GRANT_ENDED", code: "bad_shape" });
  });
});

