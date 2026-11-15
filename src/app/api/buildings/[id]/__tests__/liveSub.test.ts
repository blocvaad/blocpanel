// BILL-1b (decision 319/329), PANEL-PAY א2 (decision 367): suspending / archiving a building with a live subscription. bloc now
// decides — it reads the subscription, answers 409 live_subscription (with what the panel shows) before any write, allows the
// confirmation to a super-admin only (403 live_subscription_forbidden), writes, opens the stop task and returns stop_task. The
// panel keeps the same dialog: bloc's 409 becomes the panel's 409 LIVE_SUBSCRIPTION (same shape as before), the confirmation is
// forwarded, stop_task is passed through, and a failed stop task is logged loudly.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { LIVE_FORBIDDEN_TEXT } from "@/lib/blocActions";
import { READ_FAILED_TEXT } from "@/lib/moneyActions";

const audits: any[][] = [];
const calls: Array<{ path: string; payload: any }> = [];
let blocAnswer: any;
let sessionRole = "superadmin";
const touched: string[] = [];

vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "5b1f0a3c-8d2e-4f6a-9b7c-1e2d3f4a5b6c", email: "tal@bloc.test", role: sessionRole } }) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/stepUp", () => ({ requireStepUp: () => ({ ok: true }) }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => { touched.push(table); throw new Error(`the panel must not read ${table} here`); },
    rpc: (fn: string) => { touched.push(`rpc:${fn}`); throw new Error("no rpc"); },
  },
}));

import { PATCH, DELETE } from "../route";
const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const SUB = { status: "active", plan_id: "building_pro", has_recurring: true, period_end: "2026-12-01T00:00:00Z" };
/** bloc's 409 as callBloc hands it over (failReply: { error, code, subscription, action }). */
const live409 = (action: "suspend" | "archive", sub: any = SUB) => ({
  ok: false, status: 409, code: "live_subscription", error: "live_subscription",
  data: { error: "live_subscription", code: "live_subscription", subscription: sub, action },
});
const suspended = (stop: string) => ({ ok: true, status: 200, data: { ok: true, building: { id: ID, name: "בניין א", is_active: false }, stop_task: stop } });
const archived = (stop: string) => ({ ok: true, status: 200, data: { ok: true, archived: true, blocked: 3, stop_task: stop } });

beforeEach(() => {
  audits.length = 0; calls.length = 0; touched.length = 0; sessionRole = "superadmin";
  blocAnswer = suspended("none");
});

describe("PATCH is_active:false — suspend", () => {
  it("no live subscription → as before: 200, stop_task none, no live_subscription in the log; the panel reads nothing itself", async () => {
    const res: any = await PATCH(req({ is_active: false }), ctx);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data.is_active).toBe(false);
    expect(j.stop_task).toBe("none");
    expect(audits[0][1]).toBe("SUSPEND_BUILDING");
    expect(audits[0][4]).not.toHaveProperty("live_subscription");
    expect(touched).toEqual([]);
  });
  it("bloc's 409 live_subscription → the panel's 409 LIVE_SUBSCRIPTION with the contract shape (Hebrew), nothing logged", async () => {
    blocAnswer = live409("suspend");
    const res: any = await PATCH(req({ is_active: false }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "לבניין יש מנוי חי עם הוראת קבע. ההשעיה לא עוצרת את החיוב — אשרו כדי להמשיך ולפתוח משימת עצירה ידנית.",
      code: "LIVE_SUBSCRIPTION",
      subscription: SUB,
      action: "suspend",
    });
    expect(audits).toEqual([]);
  });
  it("only the four subscription fields reach the browser, whatever bloc adds", async () => {
    blocAnswer = live409("suspend", { ...SUB, provider_recurring_uid: "secret-uid", id: "sub-1" });
    const j = await ((await PATCH(req({ is_active: false }), ctx)) as any).json();
    expect(JSON.stringify(j)).not.toContain("secret-uid");
    expect(Object.keys(j.subscription).sort()).toEqual(["has_recurring", "period_end", "plan_id", "status"]);
  });
  it("the first request carries no confirmation; the confirmed retry forwards confirm_live_subscription to bloc", async () => {
    blocAnswer = live409("suspend");
    await PATCH(req({ is_active: false, reason: "חוב" }), ctx);
    expect(calls[0].payload).not.toHaveProperty("confirm_live_subscription");
    blocAnswer = suspended("opened");
    const res: any = await PATCH(req({ is_active: false, reason: "חוב", confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(200);
    expect(calls[1].payload).toEqual({
      actor: { id: "5b1f0a3c-8d2e-4f6a-9b7c-1e2d3f4a5b6c", email: "tal@bloc.test", role: "superadmin" },
      action: "set_active", building_id: ID, is_active: false, reason: "חוב", confirm_live_subscription: true,
    });
    const j = await res.json();
    expect(j.stop_task).toBe("opened");
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toBe("SUSPEND_BUILDING");
    expect(audits[0][4]).toMatchObject({ name: "בניין א", reason: "חוב", live_subscription: true, stop_task: "opened" });
  });
  it.each(["opened", "already"])("bloc's stop_task %s is passed through, one SUSPEND_BUILDING row", async (stop) => {
    blocAnswer = suspended(stop);
    const j = await ((await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx)) as any).json();
    expect(j.stop_task).toBe(stop);
    expect(audits.map((a) => a[1])).toEqual(["SUSPEND_BUILDING"]);
  });
  it("stop_task failed → 200 (the suspension happened) + a SUSPEND_BUILDING_STOP_TASK_FAILED row", async () => {
    blocAnswer = suspended("failed");
    const res: any = await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).stop_task).toBe("failed");
    expect(audits.map((a) => a[1])).toEqual(["SUSPEND_BUILDING", "SUSPEND_BUILDING_STOP_TASK_FAILED"]);
    expect(audits[0][4]).toMatchObject({ live_subscription: true, stop_task: "failed" });
  });
  it("an admin confirming → bloc's 403 live_subscription_forbidden in Hebrew (billing is super-admin only), logged as refused", async () => {
    sessionRole = "admin";
    blocAnswer = { ok: false, status: 403, code: "live_subscription_forbidden", error: "live_subscription_forbidden" };
    const res: any = await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: LIVE_FORBIDDEN_TEXT, code: "live_subscription_forbidden" });
    expect(calls[0].payload.actor.role).toBe("admin");
    expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_FAILED"]);
    expect(audits[0][4]).toMatchObject({ live_subscription: true });
  });
  it("bloc could not read the subscription → 503 read_failed in Hebrew ('nothing changed'), never 'no subscription'", async () => {
    blocAnswer = { ok: false, status: 503, code: "read_failed", error: "read_failed" };
    const res: any = await PATCH(req({ is_active: false }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(READ_FAILED_TEXT);
  });
  it.each([
    ["409 changed", { ok: false, status: 409, code: "changed", error: "changed" }, 409, "BLOC_ACTION_FAILED"],
    ["409 archived", { ok: false, status: 409, code: "archived", error: "archived" }, 409, "BLOC_ACTION_FAILED"],
    ["503 write_failed", { ok: false, status: 503, code: "write_failed", error: "write_failed" }, 503, "BLOC_ACTION_FAILED"],
    ["503 read_failed", { ok: false, status: 503, code: "read_failed", error: "read_failed" }, 503, "BLOC_ACTION_FAILED"],
    ["timeout", { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב." }, 504, "BLOC_ACTION_UNKNOWN"],
  ])("a confirmed suspension that fails (%s) is never shown as suspended; the log keeps live_subscription", async (_n, answer, status, audit) => {
    blocAnswer = answer;
    const res: any = await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(status);
    const j = await res.json();
    expect(j).not.toHaveProperty("data");
    expect(j.error).toMatch(/[א-ת]/);
    expect(audits.map((x) => x[1])).toEqual([audit]);
    expect(audits[0][4]).toMatchObject({ action: "SUSPEND_BUILDING", live_subscription: true, is_active: false });
  });
  it("bloc's 409 without details (suspend) still opens the dialog — warned as having a standing order", async () => {
    blocAnswer = { ok: false, status: 409, code: "live_subscription", error: "live_subscription" };
    const j = await ((await PATCH(req({ is_active: false }), ctx)) as any).json();
    expect(j).toMatchObject({ code: "LIVE_SUBSCRIPTION", action: "suspend", subscription: { status: "", plan_id: "", has_recurring: true, period_end: null } });
  });
  it("no recurring instruction (has_recurring false) is passed on as false", async () => {
    blocAnswer = live409("suspend", { ...SUB, has_recurring: false });
    expect((await ((await PATCH(req({ is_active: false }), ctx)) as any).json()).subscription.has_recurring).toBe(false);
  });
  it("confirmed, but the subscription ended meanwhile (bloc: stop_task none) → suspended, no live_subscription in the log", async () => {
    blocAnswer = suspended("none");
    const res: any = await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx);
    expect((await res.json()).stop_task).toBe("none");
    expect(audits[0][4]).not.toHaveProperty("live_subscription");
  });
  it("confirmed, and bloc's stop_task is not one of the four → 502 bad_shape ('maybe it happened'), logged unknown", async () => {
    blocAnswer = suspended("queued");
    const res: any = await PATCH(req({ is_active: false, confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("bad_shape");
    expect(audits.map((x) => x[1])).toEqual(["BLOC_ACTION_UNKNOWN"]);
    expect(audits[0][4]).toMatchObject({ live_subscription: true });
  });
  it("reactivation never forwards a confirmation", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, building: { id: ID, name: "בניין א", is_active: true }, stop_task: "none" } };
    const res: any = await PATCH(req({ is_active: true, confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(200);
    expect(calls[0].payload).not.toHaveProperty("confirm_live_subscription");
    expect(audits[0][1]).toBe("ACTIVATE_BUILDING");
  });
  it("the confirmation is the literal true only (strict schema)", async () => {
    expect(((await PATCH(req({ is_active: false, confirm_live_subscription: "yes" }), ctx)) as any).status).toBe(400);
    expect(((await PATCH(req({ is_active: false, confirm_live_subscription: false }), ctx)) as any).status).toBe(400);
    expect(((await PATCH(req({ is_active: false, nonsense: 1 }), ctx)) as any).status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe("DELETE — archive", () => {
  beforeEach(() => { blocAnswer = archived("none"); });
  it("no live subscription → archived:true, stop_task none", async () => {
    const res: any = await DELETE(req({ reason: "אי-תשלום" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, archived: true, stop_task: "none" });
  });
  it("bloc's 409 live_subscription (action archive) → the panel's 409 with 'ארכוב' wording; nothing logged", async () => {
    blocAnswer = live409("archive");
    const res: any = await DELETE(req({ reason: "x" }), ctx);
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j).toMatchObject({ code: "LIVE_SUBSCRIPTION", action: "archive", subscription: SUB });
    expect(j.error).toBe("לבניין יש מנוי חי עם הוראת קבע. הארכוב לא עוצר את החיוב — אשרו כדי להמשיך ולפתוח משימת עצירה ידנית.");
    expect(audits).toEqual([]);
  });
  it("bloc's 409 without details still opens the dialog (the action asked for; 'there is a standing order')", async () => {
    blocAnswer = { ok: false, status: 409, code: "live_subscription", error: "live_subscription" };
    const j = await ((await DELETE(req({}), ctx)) as any).json();
    expect(j).toMatchObject({ code: "LIVE_SUBSCRIPTION", action: "archive", subscription: { has_recurring: true } });
  });
  it("confirmed: forwarded to bloc; stop_task + live_subscription in the log", async () => {
    blocAnswer = archived("opened");
    const res: any = await DELETE(req({ reason: "אי-תשלום", confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, archived: true, stop_task: "opened" });
    expect(calls[0].payload).toMatchObject({ action: "archive", building_id: ID, reason: "אי-תשלום", confirm_live_subscription: true });
    expect(audits[0][1]).toBe("ARCHIVE_BUILDING");
    expect(audits[0][4]).toMatchObject({ reason: "אי-תשלום", blocked: 3, live_subscription: true, stop_task: "opened" });
  });
  it("stop task failed after the archive → 200 stop_task failed + ARCHIVE_BUILDING_STOP_TASK_FAILED", async () => {
    blocAnswer = archived("failed");
    const res: any = await DELETE(req({ confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).stop_task).toBe("failed");
    expect(audits.map((a) => a[1])).toEqual(["ARCHIVE_BUILDING", "ARCHIVE_BUILDING_STOP_TASK_FAILED"]);
  });
  it("idempotent retry with the same confirmation: bloc says already → stop_task already", async () => {
    blocAnswer = archived("already");
    expect((await ((await DELETE(req({ confirm_live_subscription: true }), ctx)) as any).json()).stop_task).toBe("already");
  });
  it.each([
    ["503 write_failed", { ok: false, status: 503, code: "write_failed", error: "write_failed" }, 503, "BLOC_ACTION_FAILED"],
    ["404 not_found", { ok: false, status: 404, code: "not_found", error: "not_found" }, 404, "BLOC_ACTION_FAILED"],
    ["timeout", { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב." }, 504, "BLOC_ACTION_UNKNOWN"],
  ])("a confirmed archive that fails (%s) is never shown as archived; the log keeps live_subscription", async (_n, answer, status, audit) => {
    blocAnswer = answer;
    const res: any = await DELETE(req({ reason: "x", confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(status);
    expect(await res.json()).not.toHaveProperty("archived");
    expect(audits.map((x) => x[1])).toEqual([audit]);
    expect(audits[0][4]).toMatchObject({ action: "ARCHIVE_BUILDING", live_subscription: true, reason: "x" });
  });
  it("confirmed, the subscription ended meanwhile (stop_task none) → archived, no live_subscription in the log", async () => {
    blocAnswer = archived("none");
    await DELETE(req({ confirm_live_subscription: true }), ctx);
    expect(audits[0][1]).toBe("ARCHIVE_BUILDING");
    expect(audits[0][4]).not.toHaveProperty("live_subscription");
  });
  it("confirmed, and the answer is unclear (no archived) → 502 bad_shape, unknown", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, stop_task: "opened" } };
    const res: any = await DELETE(req({ confirm_live_subscription: true }), ctx);
    expect(res.status).toBe(502);
    expect(audits.map((x) => x[1])).toEqual(["BLOC_ACTION_UNKNOWN"]);
  });
  it("bloc's 409 without an action field keeps the archive wording (the panel knows what it asked)", async () => {
    blocAnswer = { ok: false, status: 409, code: "live_subscription", error: "live_subscription", data: { subscription: SUB } };
    const j = await ((await DELETE(req({}), ctx)) as any).json();
    expect(j.action).toBe("archive");
    expect(j.error).toContain("הארכוב לא עוצר את החיוב");
  });
  it("the first request carries no confirmation; the panel never reads billing_subscriptions or runs the rpc itself", async () => {
    await DELETE(req({ reason: "x" }), ctx);
    expect(calls[0].payload).not.toHaveProperty("confirm_live_subscription");
    expect(touched).toEqual([]);
  });
});
