// BILL-1d (C4): POST /api/billing/tasks — mark_stopped answers 'resumed' (+ task_id); the other answers are unchanged.
import { describe, it, expect, beforeEach, vi } from "vitest";

let blocAnswer: any;
const blocCalls: any[] = [];
const audits: any[] = [];
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "s1", email: "tal@bloc.test", role: "superadmin" } }) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { blocCalls.push({ path, payload }); return blocAnswer; } }));

const TID = "c1111111-1111-4111-8111-111111111111";
const NEW_TID = "d2222222-2222-4222-8222-222222222222";
const post = async (body: unknown) => (await import("../route")).POST({ json: async () => body } as any);
beforeEach(() => { blocAnswer = { ok: true, status: 200, data: { ok: true, result: "processed" } }; blocCalls.length = 0; audits.length = 0; });

describe("mark_stopped → resumed", () => {
  it("is ok (200), carries the new check task id, and is audited with it", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, result: "resumed", task_id: NEW_TID } };
    const res = await post({ task_id: TID, action: "done", kind: "manual_stop_recurring", note: "עצרתי ב-PayPlus ידנית" });
    expect(blocCalls[0].payload.action).toBe("mark_stopped");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: "resumed", task_id: NEW_TID });
    expect(audits[0][1]).toBe("BILLING_TASK_DONE");
    expect(audits[0][4]).toMatchObject({ result: "resumed", check_task_id: NEW_TID });
  });
  it("a resumed answer without a task id is still 'resumed', with no task_id key", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, result: "resumed" } };
    expect(await (await post({ task_id: TID, action: "done", kind: "manual_stop_recurring", note: "עצרתי ב-PayPlus ידנית" })).json()).toEqual({ ok: true, result: "resumed" });
  });
  it("a non-string task id is not echoed", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, result: "resumed", task_id: 5 } };
    expect(await (await post({ task_id: TID, action: "done", kind: "manual_stop_recurring", note: "עצרתי ב-PayPlus ידנית" })).json()).toEqual({ ok: true, result: "resumed" });
  });
  it("processed / already / unknown stay as before, with no task_id", async () => {
    for (const [got, want] of [["processed", "processed"], ["already", "already"], ["???", "processed"]] as const) {
      blocAnswer = { ok: true, status: 200, data: { ok: true, result: got, task_id: NEW_TID } };
      expect(await (await post({ task_id: TID, action: "done", kind: "manual_stop_recurring", note: "עצרתי ב-PayPlus ידנית" })).json()).toEqual({ ok: true, result: want });
    }
  });
  it("the new kinds close with resolve_task / dismiss_task like the other staff tasks", async () => {
    for (const kind of ["renewal_missing", "charge_not_applied"]) {
      blocCalls.length = 0;
      await post({ task_id: TID, action: "done", kind, note: "נבדק מול PayPlus ונסגר" });
      await post({ task_id: TID, action: "dismiss", kind, note: "נבדק מול PayPlus ונסגר" });
      expect(blocCalls.map((c) => c.payload.action)).toEqual(["resolve_task", "dismiss_task"]);
    }
  });
  it("the note rule is the same ≥10 for the new kinds", async () => {
    const res = await post({ task_id: TID, action: "done", kind: "renewal_missing", note: "קצר" });
    expect(res.status).toBe(400);
    expect(blocCalls).toEqual([]);
  });
});
