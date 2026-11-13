// BILL-1b: POST /api/billing/tasks — stop_old_recurring → mark_old_stopped; the new 409 codes are mapped to Hebrew.
import { describe, it, expect, beforeEach, vi } from "vitest";

let blocAnswer: any;
const blocCalls: any[] = [];
const audits: any[] = [];
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "s1", email: "tal@bloc.test", role: "superadmin" } }) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { blocCalls.push({ path, payload }); return blocAnswer; } }));

const TID = "c1111111-1111-4111-8111-111111111111";
const post = async (body: unknown) => (await import("../route")).POST({ json: async () => body } as any);
beforeEach(() => { blocAnswer = { ok: true, status: 200, data: { ok: true, result: "processed" } }; blocCalls.length = 0; audits.length = 0; });

describe("stop_old_recurring", () => {
  it("done → mark_old_stopped (not resolve_task), trimmed note, staff email as actor; audited with the kind", async () => {
    const res = await post({ task_id: TID, action: "done", kind: "stop_old_recurring", note: "  עצרתי את ההוראה הישנה ב-PayPlus  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: "processed" });
    expect(blocCalls).toEqual([{ path: "/api/internal/billing", payload: { action: "mark_old_stopped", task_id: TID, note: "עצרתי את ההוראה הישנה ב-PayPlus", actor: "tal@bloc.test" } }]);
    expect(audits[0][1]).toBe("BILLING_TASK_DONE");
    expect(audits[0][4]).toMatchObject({ kind: "stop_old_recurring", result: "processed" });
  });
  it("bloc 'already' → ok/already", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, result: "already" } };
    expect(await (await post({ task_id: TID, action: "done", kind: "stop_old_recurring", note: "עצרתי ב-PayPlus ידנית" })).json()).toEqual({ ok: true, result: "already" });
  });
  it("dismiss is still sent as dismiss_task; bloc's 409 use_mark_old_stopped becomes a Hebrew message with the code", async () => {
    blocAnswer = { ok: false, status: 409, code: "use_mark_old_stopped", error: "x" };
    const res = await post({ task_id: TID, action: "dismiss", kind: "stop_old_recurring", note: "לא נדרש כלל, טעות" });
    expect(blocCalls[0].payload.action).toBe("dismiss_task");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "משימת עצירת הוראה ישנה נסגרת רק בלחיצה על \"עצרתי\" — כתבו בתיעוד מה נמצא ב-PayPlus.", code: "use_mark_old_stopped" });
    expect(audits).toEqual([]);
  });
  it("409 system_task is mapped to a Hebrew message (a system task closes itself)", async () => {
    blocAnswer = { ok: false, status: 409, code: "system_task", error: "x" };
    const res = await post({ task_id: TID, action: "done", kind: "company_takeover", note: "ניסיון לסגור ידנית" });
    expect(blocCalls[0].payload.action).toBe("resolve_task");
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.code).toBe("system_task");
    expect(j.error).toContain("משימת מערכת");
    expect(audits).toEqual([]);
  });
  it("409 wrong_kind passes through as bloc said it", async () => {
    blocAnswer = { ok: false, status: 409, code: "wrong_kind", error: "סוג המשימה לא מתאים לפעולה" };
    const res = await post({ task_id: TID, action: "done", kind: "stop_old_recurring", note: "עצרתי ב-PayPlus ידנית" });
    expect(await res.json()).toEqual({ error: "סוג המשימה לא מתאים לפעולה", code: "wrong_kind" });
  });
  it("every other kind is unchanged: manual stop → mark_stopped, company_takeover / refunds → resolve_task", async () => {
    for (const [kind, want] of [["manual_stop_recurring", "mark_stopped"], ["company_takeover", "resolve_task"], ["refund_review", "resolve_task"]] as const) {
      blocCalls.length = 0;
      await post({ task_id: TID, action: "done", kind, note: "טופל ובדוק מול PayPlus" });
      expect(blocCalls[0].payload.action).toBe(want);
    }
  });
});
