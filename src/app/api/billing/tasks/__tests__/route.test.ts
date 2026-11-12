// BILL-1a: POST /api/billing/tasks — billing.manage (super-admin only), zod, the signed bloc call, the answers, audit.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { can } from "@/lib/permissions";
import { NextResponse } from "next/server";

let guardImpl: (o: any) => any;
let blocAnswer: any;
const blocCalls: any[] = [];
const audits: any[] = [];
vi.mock("@/lib/guard", () => ({ guard: async (o: any) => guardImpl(o) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { blocCalls.push({ path, payload }); return blocAnswer; } }));

const TID = "c1111111-1111-4111-8111-111111111111";
const session = { id: "s1", email: "tal@bloc.test", role: "superadmin" };
const req = (body: unknown): any => ({ json: async () => body });
const post = async (body: unknown) => (await import("../route")).POST(req(body));

beforeEach(() => {
  guardImpl = () => ({ ok: true, session });
  blocAnswer = { ok: true, status: 200, data: { ok: true, result: "processed" } };
  blocCalls.length = 0; audits.length = 0;
});

describe("permission billing.manage", () => {
  it("super-admin only", () => {
    expect(can("superadmin", "billing.manage")).toBe(true);
    expect(can("admin", "billing.manage")).toBe(false);
    expect(can("viewer", "billing.manage")).toBe(false);
  });
  it("asks guard for billing.manage; 403 from guard stops everything (no bloc call, no audit)", async () => {
    let asked: any;
    guardImpl = (o) => { asked = o; return { ok: false, response: NextResponse.json({ error: "אין הרשאה" }, { status: 403 }) }; };
    const res = await post({ task_id: TID, action: "done", kind: "manual_stop_recurring", note: "עצרתי ב-PayPlus" });
    expect(asked).toEqual({ permission: "billing.manage" });
    expect(res.status).toBe(403);
    expect(blocCalls).toEqual([]); expect(audits).toEqual([]);
  });
});

describe("validation (zod)", () => {
  it.each([
    ["bad uuid", { task_id: "x", action: "done", kind: "manual_stop_recurring", note: "עצרתי ב-PayPlus" }],
    ["bad action", { task_id: TID, action: "delete", note: "עצרתי ב-PayPlus" }],
    ["note too short", { task_id: TID, action: "done", kind: "manual_stop_recurring", note: "קצר" }],
    ["note only spaces", { task_id: TID, action: "done", kind: "manual_stop_recurring", note: "            " }],
    ["no note", { task_id: TID, action: "dismiss", kind: "refund_review" }],
    ["blank kind", { task_id: TID, action: "done", kind: "  ", note: "עצרתי ב-PayPlus" }],
    ["no kind", { task_id: TID, action: "done", note: "עצרתי ב-PayPlus" }],
  ])("%s → 400, no bloc call", async (_n, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(blocCalls).toEqual([]);
  });
  it("body that is not JSON → 400", async () => {
    const res = await (await import("../route")).POST({ json: async () => { throw new Error("x"); } } as any);
    expect(res.status).toBe(400);
  });
});

describe("the signed bloc call", () => {
  it("done → mark_stopped with the trimmed note and the staff email as actor; audited", async () => {
    const res = await post({ task_id: TID, action: "done", kind: "manual_stop_recurring", note: "  עצרתי ב-PayPlus ידנית  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: "processed" });
    expect(blocCalls).toEqual([{ path: "/api/internal/billing", payload: { action: "mark_stopped", task_id: TID, note: "עצרתי ב-PayPlus ידנית", actor: "tal@bloc.test" } }]);
    expect(audits).toHaveLength(1);
    expect(audits[0][0]).toBe(session);
    expect(audits[0][1]).toBe("BILLING_TASK_DONE");
    expect(audits[0][3]).toBe(TID);
    expect(audits[0][4]).toMatchObject({ actor_email: "tal@bloc.test", result: "processed" });
  });
  it.each([
    ["done", "manual_stop_recurring", "mark_stopped"],
    ["done", "refund_review", "resolve_task"],
    ["done", "orphan_recurring", "resolve_task"],
    ["done", "past_due_stale", "resolve_task"],
    ["dismiss", "manual_stop_recurring", "dismiss_task"],
    ["dismiss", "refund_unmatched", "dismiss_task"],
  ])("%s on %s → bloc action %s", async (action, kind, want) => {
    await post({ task_id: TID, action, kind, note: "תיעוד של לפחות עשרה תווים" });
    expect(blocCalls[0].payload.action).toBe(want);
  });
  it("bloc 409 use_mark_stopped (resolve_task on a manual stop) passes through untouched", async () => {
    blocAnswer = { ok: false, status: 409, error: "use mark_stopped", code: "use_mark_stopped" };
    const res = await post({ task_id: TID, action: "done", kind: "refund_review", note: "תיעוד של לפחות עשרה תווים" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("use_mark_stopped");
    expect(audits).toEqual([]);
  });
  it("bloc 409 use_mark_stopped on a dismiss of a manual stop → a clear Hebrew message, code kept, no audit", async () => {
    blocAnswer = { ok: false, status: 409, error: "use_mark_stopped", code: "use_mark_stopped" };
    const res = await post({ task_id: TID, action: "dismiss", kind: "manual_stop_recurring", note: "תיעוד של לפחות עשרה תווים" });
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.code).toBe("use_mark_stopped");
    expect(j.error).toContain("עצרתי");
    expect(j.error).not.toBe("use_mark_stopped");
    expect(audits).toEqual([]);
  });
  it("dismiss → dismiss_task", async () => {
    await post({ task_id: TID, action: "dismiss", kind: "refund_review", note: "לא רלוונטי, טופל בשיחה" });
    expect(blocCalls[0].payload.action).toBe("dismiss_task");
    expect(audits[0][1]).toBe("BILLING_TASK_DISMISSED");
  });
  it("'already' is a 200 with result already (and audited as such)", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, result: "already" } };
    const res = await post({ task_id: TID, action: "done", kind: "manual_stop_recurring", note: "עצרתי ב-PayPlus" });
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe("already");
    expect(audits[0][4].result).toBe("already");
  });
  it("bloc 400 (note) passes through as 400, no audit", async () => {
    blocAnswer = { ok: false, status: 400, error: "note_required" };
    const res = await post({ task_id: TID, action: "done", kind: "manual_stop_recurring", note: "עצרתי ב-PayPlus" });
    expect(res.status).toBe(400);
    expect(audits).toEqual([]);
  });
  it("bloc 409 (wrong kind / state) passes through with its code, no audit", async () => {
    blocAnswer = { ok: false, status: 409, error: "סוג משימה לא מתאים", code: "wrong_kind" };
    const res = await post({ task_id: TID, action: "done", kind: "manual_stop_recurring", note: "עצרתי ב-PayPlus" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "סוג משימה לא מתאים", code: "wrong_kind" });
    expect(audits).toEqual([]);
  });
  it("a bloc connection failure keeps its status and message, no audit", async () => {
    blocAnswer = { ok: false, status: 502, code: "REJECTED", error: "bloc דחה" };
    const res = await post({ task_id: TID, action: "done", kind: "manual_stop_recurring", note: "עצרתי ב-PayPlus" });
    expect(res.status).toBe(502);
    expect(audits).toEqual([]);
  });
});
