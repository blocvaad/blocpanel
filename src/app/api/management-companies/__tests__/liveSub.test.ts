// BILL-1b (decision 319/329): suspending a management company that has a live bloc subscription.
// 409 before the decision reaches bloc; 503 on a failed read; with the confirmation the decision runs as today (the confirm
// field is stripped from the body bloc sees), then open_stop_task; stop_task opened | already | none | failed.
import { describe, it, expect, beforeEach, vi } from "vitest";

const calls: any[] = [];
const audits: any[][] = [];
const events: string[] = [];
let blocAnswers: Record<string, any>;
let openStopThrows = false;
let subsAnswer: any;
const subsFilters: string[] = [];

// BILL-1b: confirming a paying company's suspension needs billing.manage (super-admin); the plain decisions stay with management.approve.
let sessionRole = "superadmin";
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "5b1f0a3c-8d2e-4f6a-9b7c-1e2d3f4a5b6c", email: "ops@bloc.co.il", role: sessionRole } }) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); events.push(`audit:${a[1]}`); } }));
vi.mock("@/lib/blocApi", () => ({
  callBloc: async (path: string, payload: any) => {
    const key = path === "/api/internal/billing" ? "billing" : "decision";
    events.push(`bloc:${key}`); calls.push({ path, payload });
    if (key === "billing" && openStopThrows) throw new Error("boom");
    return blocAnswers[key];
  },
}));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { if (table === "billing_subscriptions") subsFilters.push(`${c}=${v}`); return chain; },
        in: (c: string, v: string[]) => { if (table === "billing_subscriptions") subsFilters.push(`${c} in ${v.join("|")}`); return chain; },
        order: () => chain, limit: () => chain,
        update: () => { throw new Error("the panel must not write here"); },
        insert: () => { throw new Error("the panel must not write here"); },
        then: (resolve: any) => { events.push(`read:${table}`); return resolve(table === "billing_subscriptions" ? subsAnswer : { data: [], error: null }); },
      };
      return chain;
    },
    rpc: async () => ({ data: [], error: null }),
  },
}));

import { PATCH } from "../route";
const C = "11111111-1111-4111-8111-111111111111";
const LIVE = { status: "past_due", plan_id: "mgmt_start", provider_recurring_uid: "uid-xyz", current_period_end: null };
const DECISION_OK = { ok: true, status: 200, data: { ok: true, company_id: C, company_name: "נווה ניהול", previous_status: "active", status: "suspended", notified: true, email: "sent" } };
const REASON = "חוב פתוח של שלושה חודשים";
const suspend = (extra: Record<string, unknown> = {}) => ({ id: C, action: "suspend", expected_status: "active", reason: REASON, ...extra });
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });

beforeEach(() => {
  sessionRole = "superadmin";
  calls.length = 0; audits.length = 0; events.length = 0; subsFilters.length = 0; openStopThrows = false;
  subsAnswer = { data: [], error: null };
  blocAnswers = { decision: DECISION_OK, billing: { ok: true, status: 200, data: { ok: true, result: "opened", subscription_id: "s1", task_id: "t1" } } };
});

describe("PATCH action:suspend with a live subscription", () => {
  it("reads the company's paying subscription (owner_type management_company)", async () => {
    await PATCH(req(suspend()));
    expect(subsFilters).toEqual(["owner_type=management_company", `owner_id=${C}`, "status in trialing|active|past_due|cancel_pending"]);
  });
  it("live, no confirm → 409 (company wording); bloc is never called, nothing audited", async () => {
    subsAnswer = { data: [LIVE], error: null };
    const r: any = await PATCH(req(suspend()));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      error: "לחברה יש מנוי חי עם הוראת קבע. ההשעיה לא עוצרת את החיוב — אשרו כדי להמשיך ולפתוח משימת עצירה ידנית.",
      code: "LIVE_SUBSCRIPTION",
      subscription: { status: "past_due", plan_id: "mgmt_start", has_recurring: true, period_end: null },
      action: "suspend",
    });
    expect(calls).toEqual([]); expect(audits).toEqual([]);
  });
  it("read failure → 503, the decision never reaches bloc", async () => {
    subsAnswer = { data: null, error: { message: "x" } };
    const r: any = await PATCH(req(suspend()));
    expect(r.status).toBe(503);
    expect(calls).toEqual([]); expect(audits).toEqual([]);
  });
  it("confirmed: the decision first (confirm field stripped from what bloc sees), then open_stop_task (company_suspended)", async () => {
    subsAnswer = { data: [LIVE], error: null };
    const r: any = await PATCH(req(suspend({ confirm_live_subscription: true, note: "הוסכם" })));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, company_name: "נווה ניהול", status: "suspended", stop_task: "opened" });
    expect(calls).toHaveLength(2);
    expect(calls[0].path).toBe("/api/internal/management-companies");
    expect(JSON.stringify(calls[0].payload)).not.toContain("confirm_live_subscription");
    expect(calls[0].payload).toMatchObject({ action: "suspend", company_id: C, reason: REASON, panel_note: "הוסכם" });
    expect(calls[1]).toEqual({ path: "/api/internal/billing", payload: { action: "open_stop_task", owner_type: "management_company", owner_id: C, reason: "company_suspended", actor: "ops@bloc.co.il" } });
    expect(events.indexOf("bloc:decision")).toBeLessThan(events.indexOf("bloc:billing"));
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toBe("MANAGEMENT_SUSPEND");
    expect(audits[0][4]).toMatchObject({ action: "suspend", live_subscription: true, stop_task: "opened" });
  });
  it.each(["opened", "already", "none"])("open_stop_task result %s is passed through", async (result) => {
    subsAnswer = { data: [LIVE], error: null };
    blocAnswers.billing = { ok: true, status: 200, data: { ok: true, result } };
    expect((await ((await PATCH(req(suspend({ confirm_live_subscription: true })))) as any).json()).stop_task).toBe(result);
    expect(audits.map((a) => a[1])).toEqual(["MANAGEMENT_SUSPEND"]);
  });
  it.each([
    ["bloc error", { ok: false, status: 502, error: "x" }, false],
    ["callBloc throws", null, true],
  ])("%s → 200 stop_task failed, the decision stands, MANAGEMENT_SUSPEND_STOP_TASK_FAILED audited", async (_n, answer, throws) => {
    subsAnswer = { data: [LIVE], error: null };
    blocAnswers.billing = answer; openStopThrows = throws;
    const r: any = await PATCH(req(suspend({ confirm_live_subscription: true })));
    expect(r.status).toBe(200);
    expect((await r.json()).stop_task).toBe("failed");
    expect(audits.map((a) => a[1])).toEqual(["MANAGEMENT_SUSPEND", "MANAGEMENT_SUSPEND_STOP_TASK_FAILED"]);
  });
  it("the decision itself fails at bloc → its error as today; no stop task, no audit", async () => {
    subsAnswer = { data: [LIVE], error: null };
    blocAnswers.decision = { ok: false, status: 409, code: "CHANGED", error: "המצב השתנה" };
    const r: any = await PATCH(req(suspend({ confirm_live_subscription: true })));
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("CHANGED");
    expect(calls).toHaveLength(1); expect(audits).toEqual([]);
  });
  it("no live subscription → as today: the answer gains stop_task none, one bloc call", async () => {
    const r: any = await PATCH(req(suspend()));
    expect(r.status).toBe(200);
    expect((await r.json()).stop_task).toBe("none");
    expect(calls).toHaveLength(1);
    expect(audits[0][4]).not.toHaveProperty("live_subscription");
  });
  it("approve / reject / reactivate: no subscription read, no stop_task field, a stray confirm is rejected (strict)", async () => {
    subsAnswer = { data: [LIVE], error: null };
    blocAnswers.decision = { ...DECISION_OK, data: { ...DECISION_OK.data, status: "active" } };
    const r: any = await PATCH(req({ id: C, action: "reactivate", expected_status: "suspended" }));
    expect(r.status).toBe(200);
    expect(await r.json()).not.toHaveProperty("stop_task");
    expect(events).not.toContain("read:billing_subscriptions");
    const bad: any = await PATCH(req({ id: C, action: "reactivate", expected_status: "suspended", confirm_live_subscription: true }));
    expect(bad.status).toBe(400);
  });
  it("confirm must be the literal true", async () => {
    subsAnswer = { data: [LIVE], error: null };
    expect(((await PATCH(req(suspend({ confirm_live_subscription: 1 })))) as any).status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe("BILL-1b — only billing.manage may confirm a paying company's suspension", () => {
  it("an admin (management.approve, no billing.manage) confirming → 403 LIVE_SUBSCRIPTION_FORBIDDEN: no decision at bloc, no stop task, no audit", async () => {
    sessionRole = "admin";
    calls.length = 0; audits.length = 0;
    subsAnswer = { data: [{ id: "s1", status: "active", plan_id: "company", provider_recurring_uid: "U1", current_period_end: "2026-12-13T00:00:00Z", trial_ends_at: null }], error: null };
    const { PATCH } = await import("../route");
    const res = await PATCH(new Request("https://panel.test/api/management-companies", { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", action: "suspend", expected_status: "active", reason: "בדיקת השעיה של לקוח משלם", confirm_live_subscription: true }) }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "LIVE_SUBSCRIPTION_FORBIDDEN" });
    expect(calls).toEqual([]);
    expect(audits).toEqual([]);
  });
  it("the same admin without the confirmation still gets the 409 warning (the read is allowed, only the confirm is not)", async () => {
    sessionRole = "admin";
    calls.length = 0;
    subsAnswer = { data: [{ id: "s1", status: "active", plan_id: "company", provider_recurring_uid: null, current_period_end: "2026-12-13T00:00:00Z", trial_ends_at: null }], error: null };
    const { PATCH } = await import("../route");
    const res = await PATCH(new Request("https://panel.test/api/management-companies", { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", action: "suspend", expected_status: "active", reason: "בדיקת השעיה של לקוח משלם" }) }));
    expect(res.status).toBe(409);
    expect(calls).toEqual([]);
  });
});
