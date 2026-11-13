// BILL-1b (decision 319/329): PATCH is_active:false and DELETE (archive) of a building with a live subscription.
// 409 LIVE_SUBSCRIPTION before any write; 503 when the read fails; with confirm_live_subscription the action runs as today,
// then open_stop_task goes through callBloc only; stop_task opened | already | none | failed; audit rows.
import { describe, it, expect, beforeEach, vi } from "vitest";

const events: string[] = [];
const audits: any[][] = [];
const blocCalls: any[] = [];
let subsAnswer: any;
let blocAnswer: any;
let blocThrows = false;
let rpcAnswer: any;
let updateAnswer: any;
const subsFilters: string[] = [];

// BILL-1b: confirming a paying building's suspension needs billing.manage (super-admin); buildings.modify alone gets the 409 and a 403 on confirm.
let sessionRole = "superadmin";
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "a1", email: "tal@bloc.test", role: sessionRole } }) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); events.push(`audit:${a[1]}`); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { events.push(`bloc:${payload.action}`); blocCalls.push({ path, payload }); if (blocThrows) throw new Error("boom"); return blocAnswer; } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { if (table === "billing_subscriptions") subsFilters.push(`${c}=${v}`); return chain; },
        in: (c: string, v: string[]) => { if (table === "billing_subscriptions") subsFilters.push(`${c} in ${v.join("|")}`); return chain; },
        not: () => chain,
        limit: () => chain,
        update: () => { events.push(`update:${table}`); return chain; },
        insert: () => { events.push(`insert:${table}`); return Promise.resolve({ error: null }); },
        delete: () => { events.push(`delete:${table}`); return chain; },
        single: async () => ({ data: { name: "בניין א" } }),
        maybeSingle: async () => updateAnswer,
        then: (resolve: any) => { events.push(`read:${table}`); return resolve(table === "billing_subscriptions" ? subsAnswer : { data: [], error: null }); },
      };
      return chain;
    },
    rpc: async (fn: string) => { events.push(`rpc:${fn}`); return rpcAnswer; },
  },
}));

import { PATCH, DELETE } from "../route";
const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const LIVE = { status: "active", plan_id: "building_pro", provider_recurring_uid: "secret-uid", current_period_end: "2026-12-01T00:00:00Z" };

beforeEach(() => {
  events.length = 0; audits.length = 0; blocCalls.length = 0; subsFilters.length = 0; blocThrows = false; sessionRole = "superadmin";
  subsAnswer = { data: [], error: null };
  blocAnswer = { ok: true, status: 200, data: { ok: true, result: "opened", subscription_id: "s1", task_id: "t1" } };
  rpcAnswer = { data: [{ building_name: "בניין א", blocked_count: 3 }], error: null };
  updateAnswer = { data: { id: ID, name: "בניין א", is_active: false }, error: null };
});

describe("PATCH is_active:false — suspend", () => {
  it("no live subscription → as today: no 409, no bloc call, stop_task none", async () => {
    const res: any = await PATCH(req({ is_active: false }), ctx);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.is_active).toBe(false);
    expect(j.stop_task).toBe("none");
    expect(blocCalls).toEqual([]);
    expect(audits[0][1]).toBe("SUSPEND_BUILDING");
    expect(audits[0][4]).not.toHaveProperty("live_subscription");
  });
  it("reads the building's paying subscription (owner filter + PAYING_STATUSES), read only", async () => {
    await PATCH(req({ is_active: false }), ctx);
    expect(subsFilters).toEqual(["owner_type=building", `owner_id=${ID}`, "status in trialing|active|past_due|cancel_pending"]);
  });
  it("live subscription, no confirm → 409 LIVE_SUBSCRIPTION with the contract shape; NOTHING written, no bloc call, no audit", async () => {
    subsAnswer = { data: [LIVE], error: null };
    const res: any = await PATCH(req({ is_active: false }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "לבניין יש מנוי חי עם הוראת קבע. ההשעיה לא עוצרת את החיוב — אשרו כדי להמשיך ולפתוח משימת עצירה ידנית.",
      code: "LIVE_SUBSCRIPTION",
      subscription: { status: "active", plan_id: "building_pro", has_recurring: true, period_end: "2026-12-01T00:00:00Z" },
      action: "suspend",
    });
    expect(events.filter((e) => /^(update|insert|delete|rpc|bloc|audit)/.test(e))).toEqual([]);
  });
  it("the recurring uid never leaves (only the boolean)", async () => {
    subsAnswer = { data: [LIVE], error: null };
    const res: any = await PATCH(req({ is_active: false }), ctx);
    expect(JSON.stringify(await res.json())).not.toContain("secret-uid");
  });
  it("has_recurring is false when the subscription has no recurring uid", async () => {
    subsAnswer = { data: [{ ...LIVE, provider_recurring_uid: null }], error: null };
    const j = await ((await PATCH(req({ is_active: false }), ctx)) as any).json();
    expect(j.subscription.has_recurring).toBe(false);
  });
  it("read failure → 503, nothing written, never 'no subscription'", async () => {
    subsAnswer = { data: null, error: { message: "db down" } };
    const res: any = await PATCH(req({ is_active: false }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("LIVE_READ_FAILED");
    expect(events.filter((e) => /^(update|rpc|bloc|audit)/.test(e))).toEqual([]);
  });
  it("read throws → 503 too", async () => {
    subsAnswer = { then: () => { throw new Error("x"); } };
    const res: any = await PATCH(req({ is_active: false }), ctx);
    expect(res.status).toBe(503);
  });
  it("confirmed: the action runs, THEN open_stop_task via callBloc (billing, building_suspended, actor email); stop_task + audit live_subscription", async () => {
    subsAnswer = { data: [LIVE], error: null };
    const res: any = await PATCH(req({ is_active: false, reason: "חוב", confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.stop_task).toBe("opened");
    expect(j.data.is_active).toBe(false);
    expect(events.indexOf("update:buildings")).toBeLessThan(events.indexOf("bloc:open_stop_task"));
    expect(blocCalls).toEqual([{ path: "/api/internal/billing", payload: { action: "open_stop_task", owner_type: "building", owner_id: ID, reason: "building_suspended", actor: "tal@bloc.test" } }]);
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toBe("SUSPEND_BUILDING");
    expect(audits[0][4]).toMatchObject({ name: "בניין א", reason: "חוב", live_subscription: true, stop_task: "opened" });
  });
  it.each(["opened", "already", "none"])("bloc result %s is passed through", async (result) => {
    subsAnswer = { data: [LIVE], error: null };
    blocAnswer = { ok: true, status: 200, data: { ok: true, result } };
    const j = await ((await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx)) as any).json();
    expect(j.stop_task).toBe(result);
    expect(audits.map((a) => a[1])).toEqual(["SUSPEND_BUILDING"]);
  });
  it.each([
    ["bloc error", { ok: false, status: 502, error: "x" }, false],
    ["bloc timeout", { ok: false, status: 504, code: "TIMEOUT", error: "x" }, false],
    ["unknown result", { ok: true, status: 200, data: { ok: true, result: "weird" } }, false],
    ["callBloc throws", null, true],
  ])("%s → 200 with stop_task failed (the suspension happened) + a STOP_TASK_FAILED audit", async (_n, answer, throws) => {
    subsAnswer = { data: [LIVE], error: null };
    blocAnswer = answer; blocThrows = throws;
    const res: any = await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).stop_task).toBe("failed");
    expect(audits.map((a) => a[1])).toEqual(["SUSPEND_BUILDING", "SUSPEND_BUILDING_STOP_TASK_FAILED"]);
    expect(audits[0][4]).toMatchObject({ live_subscription: true, stop_task: "failed" });
  });
  it("confirm with no live subscription → no bloc call (nothing to stop), stop_task none", async () => {
    const j = await ((await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx)) as any).json();
    expect(j.stop_task).toBe("none");
    expect(blocCalls).toEqual([]);
  });
  it("the building is missing/archived (update returns nothing) → 404, and no stop task is opened", async () => {
    subsAnswer = { data: [LIVE], error: null };
    updateAnswer = { data: null, error: null };
    const res: any = await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(404);
    expect(blocCalls).toEqual([]);
  });
  it("the write fails (500) → no stop task, no audit", async () => {
    subsAnswer = { data: [LIVE], error: null };
    updateAnswer = { data: null, error: { message: "x" } };
    const res: any = await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(500);
    expect(blocCalls).toEqual([]); expect(audits).toEqual([]);
  });
  it("reactivation (is_active:true) is not checked: no subscription read, no bloc call", async () => {
    subsAnswer = { data: [LIVE], error: null };
    updateAnswer = { data: { id: ID, name: "בניין א", is_active: true }, error: null };
    const res: any = await PATCH(req({ is_active: true }), ctx);
    expect(res.status).toBe(200);
    expect(events).not.toContain("read:billing_subscriptions");
    expect(blocCalls).toEqual([]);
    expect(audits[0][1]).toBe("ACTIVATE_BUILDING");
  });
  it("the confirmation is accepted by the schema (strict) but only the literal true", async () => {
    subsAnswer = { data: [LIVE], error: null };
    expect(((await PATCH(req({ is_active: false, confirm_live_subscription: "yes" }), ctx)) as any).status).toBe(400);
    expect(((await PATCH(req({ is_active: false, confirm_live_subscription: false }), ctx)) as any).status).toBe(400);
    expect(((await PATCH(req({ is_active: false, nonsense: 1 }), ctx)) as any).status).toBe(400);
    expect(events.filter((e) => /^(update|bloc)/.test(e))).toEqual([]);
  });
});

describe("DELETE — archive", () => {
  it("no live subscription → as today (archived:true, stop_task none, no bloc call)", async () => {
    const res: any = await DELETE(req({ reason: "אי-תשלום" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, archived: true, stop_task: "none" });
    expect(blocCalls).toEqual([]);
  });
  it("live, no confirm → 409 (action archive), the RPC never runs", async () => {
    subsAnswer = { data: [LIVE], error: null };
    const res: any = await DELETE(req({ reason: "x" }), ctx);
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j).toMatchObject({ code: "LIVE_SUBSCRIPTION", action: "archive", subscription: { status: "active", plan_id: "building_pro", has_recurring: true } });
    expect(j.error).toContain("לבניין יש מנוי חי עם הוראת קבע");
    expect(events.filter((e) => /^(rpc|bloc|audit|update)/.test(e))).toEqual([]);
  });
  it("no body at all + live → still 409 (the building page sends none) — before anything else", async () => {
    subsAnswer = { data: [LIVE], error: null };
    const res: any = await DELETE({ json: async () => { throw new Error("empty"); }, headers: { get: () => null } } as any, ctx);
    expect(res.status).toBe(409);
  });
  it("read failure → 503 and no archive", async () => {
    subsAnswer = { data: null, error: { message: "x" } };
    const res: any = await DELETE(req({}), ctx);
    expect(res.status).toBe(503);
    expect(events.filter((e) => /^(rpc|bloc|audit)/.test(e))).toEqual([]);
  });
  it("confirmed: RPC, then open_stop_task (building_archived), audit live_subscription + stop_task", async () => {
    subsAnswer = { data: [LIVE], error: null };
    const res: any = await DELETE(req({ reason: "אי-תשלום", confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, archived: true, stop_task: "opened" });
    expect(events.indexOf("rpc:admin_archive_building")).toBeLessThan(events.indexOf("bloc:open_stop_task"));
    expect(blocCalls[0].payload).toEqual({ action: "open_stop_task", owner_type: "building", owner_id: ID, reason: "building_archived", actor: "tal@bloc.test" });
    expect(audits[0][1]).toBe("ARCHIVE_BUILDING");
    expect(audits[0][4]).toMatchObject({ reason: "אי-תשלום", live_subscription: true, stop_task: "opened" });
  });
  it("bloc fails after the archive → 200 stop_task failed + ARCHIVE_BUILDING_STOP_TASK_FAILED audit", async () => {
    subsAnswer = { data: [LIVE], error: null };
    blocAnswer = { ok: false, status: 502, error: "x" };
    const res: any = await DELETE(req({ confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).stop_task).toBe("failed");
    expect(audits.map((a) => a[1])).toEqual(["ARCHIVE_BUILDING", "ARCHIVE_BUILDING_STOP_TASK_FAILED"]);
  });
  it("the archive RPC fails → no stop task", async () => {
    subsAnswer = { data: [LIVE], error: null };
    rpcAnswer = { data: null, error: { message: "boom" } };
    const res: any = await DELETE(req({ confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(500);
    expect(blocCalls).toEqual([]);
  });
  it("idempotent retry with the same confirmation: bloc says already → stop_task already", async () => {
    subsAnswer = { data: [LIVE], error: null };
    blocAnswer = { ok: true, status: 200, data: { ok: true, result: "already" } };
    const j = await ((await DELETE(req({ confirm_live_subscription: true }), ctx)) as any).json();
    expect(j.stop_task).toBe("already");
  });
});

describe("BILL-1b — only billing.manage may confirm a paying building's suspension", () => {
  it("an admin (buildings.modify, no billing.manage) confirming → 403 LIVE_SUBSCRIPTION_FORBIDDEN before any write; no bloc call, no audit", async () => {
    sessionRole = "admin";
    subsAnswer = { data: [LIVE], error: null };
    const res: any = await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("LIVE_SUBSCRIPTION_FORBIDDEN");
    expect(events.filter((e) => e.startsWith("update:") || e.startsWith("bloc:") || e.startsWith("audit:"))).toEqual([]);
  });
  it("the same admin without the confirmation gets the 409 warning; reactivation is never checked", async () => {
    sessionRole = "admin";
    subsAnswer = { data: [LIVE], error: null };
    expect((await PATCH(req({ is_active: false }), ctx)).status).toBe(409);
    events.length = 0;
    updateAnswer = { data: { id: ID, name: "בניין א", is_active: true }, error: null };
    expect((await PATCH(req({ is_active: true }), ctx)).status).toBe(200);
    expect(events.some((e) => e === "read:billing_subscriptions")).toBe(false);
  });
  it("a building without a live subscription: an admin suspends as today (no 403)", async () => {
    sessionRole = "admin";
    subsAnswer = { data: [], error: null };
    const res: any = await PATCH(req({ is_active: false }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).stop_task).toBe("none");
  });
});
