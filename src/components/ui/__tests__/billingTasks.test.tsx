// BILL-1a: the billing screen's tasks / refunds areas, rendered with the EXACT shape /api/billing returns
// (the fixture is the real handler's output over mocked tables, not hand-written).
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeAdminClient, type TableResult } from "@/lib/__tests__/bill1Mocks";

let tables: Record<string, TableResult | ((q: { ops: string[] }) => TableResult)> = {};
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "s", email: "a@b.c", role: "superadmin" } }) }));
vi.mock("@/lib/supabase", () => ({ get adminClient() { return makeAdminClient(tables); } }));

import { BillingTasks, BillingRefunds, noteOk, type BillingTask, type BillingRefund } from "../BillingTasks";

const B1 = "b1111111-1111-4111-8111-111111111111";
const S1 = "51111111-1111-4111-8111-111111111111";
const S2 = "52222222-2222-4222-8222-222222222222";
let tasks: BillingTask[]; let refunds: BillingRefund[];

beforeAll(async () => {
  tables = {
    billing_subscriptions: (q) => q.ops.some((o) => o.startsWith("in:"))
      ? { data: [{ id: S1, plan_id: "building_pro", amount_ils: 149, provider_recurring_uid: null, current_period_end: "2026-12-01T00:00:00Z" },
                 { id: S2, plan_id: "building_pro", amount_ils: 149, provider_recurring_uid: "u", current_period_end: null }] }
      : { data: [] },
    billing_webhook_events: { data: [] }, subscription_payments: { data: [] }, management_companies: { data: [] },
    buildings: { data: [{ id: B1, name: "השקד 104" }] },
    billing_tasks: { data: [
      { id: "t1", kind: "manual_stop_recurring", status: "open", subscription_id: S1, owner_type: "building", owner_id: B1, building_id: B1, created_at: "2026-11-10T10:00:00Z" },
      { id: "t2", kind: "refund_review", status: "open", subscription_id: S2, owner_type: "building", owner_id: B1, building_id: B1, created_at: "2026-11-11T10:00:00Z" },
    ] },
    subscription_refunds: { data: [
      { id: "r1", provider: "payplus", kind: "refund", product: "subscription", amount: 149, currency: "ILS", classification: "older_period", outcome: "flagged", subscription_id: S1, owner_type: "building", owner_id: B1, occurred_at: "2026-11-11T08:00:00Z", created_at: "x" },
      { id: "r2", provider: "payplus", kind: "chargeback", product: "ai_topup", amount: 49, currency: "ILS", classification: "full", outcome: "applied", subscription_id: null, owner_type: "building", owner_id: B1, occurred_at: "2026-11-09T08:00:00Z", created_at: "x" },
    ] },
  };
  const j = await (await (await import("@/app/api/billing/route")).GET()).json();
  tasks = j.tasks; refunds = j.refunds;
});

const html = (el: unknown) => renderToStaticMarkup(el as never);

describe("BillingTasks", () => {
  it("manual stop: who, what, 'stop in PayPlus' and a disabled 'עצרתי' button that needs a note", () => {
    const h = html(createElement(BillingTasks, { tasks }));
    expect(h).toContain("משימות (2)");
    expect(h).toContain("עצירה ידנית");
    expect(h).toContain("השקד 104");
    expect(h).toContain("₪149 לחודש");
    expect(h).toContain("עצרו ב-PayPlus");
    expect(h).toContain("עצרתי");
    expect(h).toMatch(/data-task-action="done"[^>]*disabled/);
    expect(h).toContain("תיעוד חובה");
  });
  it("manual stop: only 'עצרתי' (no dismiss), with the hint; other kinds keep both; all disabled until the note is long enough", () => {
    const stop = html(createElement(BillingTasks, { tasks: [tasks[0]] }));
    expect(stop).toMatch(/data-task-action="done"[^>]*disabled/);
    expect(stop).not.toContain('data-task-action="dismiss"');
    expect(stop).not.toContain("סגירה בלי טיפול");
    expect(stop).toContain("גם אם לא נמצאה הוראת קבע ב-PayPlus — לחצו &#x27;עצרתי&#x27; וכתבו זאת בתיעוד.");
    const other = html(createElement(BillingTasks, { tasks: [tasks[1]] }));
    expect(other).toMatch(/data-task-action="done"[^>]*disabled/);
    expect(other).toMatch(/data-task-action="dismiss"[^>]*disabled/);
    expect(other).toContain("סגירה בלי טיפול");
    expect(other).not.toContain("data-stop-note-hint");
  });
  it("manual stop: primary 'עצרתי'; other kinds: primary 'טופל' (and no 'עצרתי')", () => {
    expect(html(createElement(BillingTasks, { tasks: [tasks[0]] }))).toContain("עצרתי");
    const h = html(createElement(BillingTasks, { tasks: [tasks[1]] }));
    expect(h).toContain("החזר לבדיקה");
    expect(h).toContain(">טופל<");
    expect(h).not.toContain("עצרתי");
  });
  it("failed read (null) says so — not 'no tasks', not loading", () => {
    const h = html(createElement(BillingTasks, { tasks: null }));
    expect(h).toContain('data-billing-failed="tasks"');
    expect(h).toContain("הקריאה נכשלה — נסו לרענן");
    expect(h).not.toContain("אין משימות פתוחות");
    expect(h).not.toContain("טוען");
  });
  it("empty array says there are none", () => {
    const h = html(createElement(BillingTasks, { tasks: [] }));
    expect(h).toContain("אין משימות פתוחות");
    expect(h).not.toContain("הקריאה נכשלה");
  });
  it("a viewer-style render offers no action button", () => {
    const h = html(createElement(BillingTasks, { tasks, canManage: false }));
    expect(h).not.toContain("data-task-action");
    expect(h).toContain("לסופר-אדמין בלבד");
  });
  it("the recurring uid is not in the screen input (boolean only)", () => {
    expect(JSON.stringify(tasks)).not.toMatch(/provider_recurring_uid/);
    expect(typeof tasks[0].has_recurring).toBe("boolean");
  });
});

describe("BillingRefunds", () => {
  it("lists refunds with Hebrew kind / product / classification / outcome", () => {
    const h = html(createElement(BillingRefunds, { refunds }));
    expect(h).toContain("החזר");
    expect(h).toContain("ביטול חיוב בכרטיס");
    expect(h).toContain("קרדיטי AI");
    expect(h).toContain("תקופה קודמת");
    expect(h).toContain("לבדיקה");
    expect(h).toContain("הוחל");
  });
  it("failed (null) ≠ empty ([])", () => {
    expect(html(createElement(BillingRefunds, { refunds: null }))).toContain('data-billing-failed="refunds"');
    const e = html(createElement(BillingRefunds, { refunds: [] }));
    expect(e).toContain("עוד לא התקבלו החזרים");
    expect(e).not.toContain("הקריאה נכשלה");
  });
});

describe("note gate", () => {
  it("needs 10 trimmed characters", () => {
    expect(noteOk("")).toBe(false);
    expect(noteOk("123456789")).toBe(false);
    expect(noteOk("   123456789   ")).toBe(false);
    expect(noteOk("1234567890")).toBe(true);
  });
});
