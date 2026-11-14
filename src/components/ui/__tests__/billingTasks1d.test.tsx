// BILL-1d: labels / hints for renewal_missing and charge_not_applied, unknown kinds, the 'resumed' message, and the stuck list
// states (loading / empty / failed / list) + the close dialog — rendered with the exact shape GET /api/billing returns.
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeAdminClient, type TableResult } from "@/lib/__tests__/bill1Mocks";

let tables: Record<string, TableResult | ((q: { ops: string[] }) => TableResult)> = {};
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "s", email: "a@b.c", role: "superadmin" } }) }));
vi.mock("@/lib/supabase", () => ({ get adminClient() { return makeAdminClient(tables); } }));

import { BillingTasks, StuckEvents, StuckCloseDialog, chargedText, type BillingTask, type StuckEvent } from "../BillingTasks";
import { TASK_KIND_HINT, TASK_KIND_LABELS, taskResultText, TASK_RESUMED_TEXT, taskDetail, STUCK_READ_FAILED_TEXT } from "@/lib/billing";

const S1 = "51111111-1111-4111-8111-111111111111";
const row = (id: string, kind: string, payload: unknown) => ({ id, kind, status: "open", subscription_id: S1, owner_type: "building", owner_id: "b1", building_id: "b1", created_at: "2026-11-10T10:00:00Z", payload });
let tasks: BillingTask[];
let stuck: StuckEvent[];
const html = (t: BillingTask[]) => renderToStaticMarkup(createElement(BillingTasks, { tasks: t }));
const one = (id: string) => html([tasks.find((t) => t.id === id)!]);

beforeAll(async () => {
  tables = {
    billing_subscriptions: (q) => q.ops.some((o) => o.startsWith("in:"))
      ? { data: [{ id: S1, plan_id: "building_pro", amount_ils: 149, status: "active", provider_recurring_uid: "U", provider_cancelled_at: null, current_period_end: "2026-12-01T00:00:00Z" }] } : { data: [] },
    billing_webhook_events: (q) => q.ops.some((o) => o.startsWith("eq:") && o.includes("received"))
      ? { data: [{ id: "e1111111-1111-4111-8111-111111111111", event_type: "payment", received_at: "2026-07-01T09:30:00Z" }] } : { data: [] },
    buildings: { data: [{ id: "b1", name: "השקד 104" }] }, subscription_payments: { data: [] }, management_companies: { data: [] }, subscription_refunds: { data: [] },
    billing_tasks: { data: [
      row("t-renew", "renewal_missing", { reason: "period_passed", status: "active" }),
      row("t-resumed", "renewal_missing", { reason: "resumed_after_manual_stop", stopped_task_id: "x" }),
      row("t-charge", "charge_not_applied", { tx: "TX-77", amount: 119, status: "stale", recurring_uid: "U" }),
      row("t-unknown", "brand_new_kind", { a: 1 }),
    ] },
  };
  const j = await (await (await import("@/app/api/billing/route")).GET()).json();
  tasks = j.tasks; stuck = j.stuck_events;
});

describe("labels and hints", () => {
  it("renewal_missing: 'חידוש לא הגיע' + one-line hint", () => {
    expect(TASK_KIND_LABELS.renewal_missing).toBe("חידוש לא הגיע");
    expect(TASK_KIND_HINT.renewal_missing).toContain("PayPlus");
    const h = one("t-renew");
    expect(h).toContain("חידוש לא הגיע");
    expect(h).toContain(TASK_KIND_HINT.renewal_missing);
    expect(h).toContain("תקופת החיוב עברה ולא הגיע חידוש");
  });
  it("renewal_missing after a manual stop shows the resumed reason", () => {
    expect(one("t-resumed")).toContain("הלקוח חידש את המנוי אחרי שהוראת הקבע נעצרה ידנית");
  });
  it("charge_not_applied: label, hint, the charged amount in ₪ as bloc writes it (shekels), tx and status", () => {
    expect(TASK_KIND_LABELS.charge_not_applied).toBe("חיוב שלא נרשם");
    const h = one("t-charge");
    expect(h).toContain("חיוב שלא נרשם");
    expect(h).toContain(TASK_KIND_HINT.charge_not_applied);
    expect(h).toContain("₪119");
    expect(h).not.toContain("₪1.19");
    expect(h).toContain("TX-77");
    expect(h).toContain("stale");
  });
  it("both kinds close with 'טופל' and 'סגירה בלי טיפול' and need a note", () => {
    for (const id of ["t-renew", "t-charge"]) {
      const h = one(id);
      expect(h).toContain('data-task-action="done"');
      expect(h).toContain('data-task-action="dismiss"');
      expect(h).toContain("טופל");
      expect(h).toContain("תיעוד חובה");
      expect(h).not.toContain("עצרתי");
    }
  });
  it("an unknown kind renders with the generic label and hint (no crash, no raw code as label)", () => {
    const h = one("t-unknown");
    expect(h).toContain("משימה אחרת");
    expect(h).toContain('data-billing-task="brand_new_kind"');
    expect(h).toContain("לא מכיר");
  });
  it("a task with a missing kind_label and no detail still renders", () => {
    const bare = { id: "x", kind: "zzz", kind_label: "", created_at: "2026-11-10T10:00:00Z", owner_type: "building", owner_name: null, subscription_id: null, plan_id: null, amount: null, sub_status: null, current_period_end: null, has_recurring: false } as BillingTask;
    expect(html([bare])).toContain("משימה אחרת");
    const known = { ...bare, kind: "renewal_missing", detail: undefined } as BillingTask;
    expect(html([known])).toContain("חידוש לא הגיע");
    const charge = { ...bare, kind: "charge_not_applied", kind_label: "חיוב שלא נרשם", detail: null } as BillingTask;
    expect(html([charge])).toContain("חיוב שלא נרשם");
  });
  it("renewal_missing for a deferred first charge (bloc reason deferred_first_charge_missing) has its own Hebrew line", () => {
    const t = { ...tasks[0], detail: { reason: "deferred_first_charge_missing" } } as BillingTask;
    expect(html([t])).toContain("החיוב הראשון של המסלול החדש היה אמור להגיע בסוף התקופה ששולמה, ולא הגיע.");
    expect(html([t])).not.toContain("deferred_first_charge_missing");
  });
  it("an unknown renewal reason is shown as text, not hidden", () => {
    const t = { ...tasks[0], detail: { reason: "future_reason" } } as BillingTask;
    expect(html([t])).toContain("future_reason");
  });
  it("charge_not_applied without an amount shows no amount line", () => {
    const t = { ...tasks.find((x) => x.id === "t-charge")!, detail: { tx: "TX-9" } } as BillingTask;
    const h = html([t]);
    expect(h).toContain("TX-9");
    expect(h).not.toContain("סכום שחויב");
  });
  it("chargedText: the payload amount is in shekels (as bloc writes cb.amount) — 119 → ₪119, never ÷100", () => {
    expect(chargedText(119)).toBe("₪119");
    expect(chargedText("149")).toBe("₪149");
  });
  it("taskDetail edge cases", () => {
    expect(taskDetail("charge_not_applied", { amount: "2500", tx: 12 })).toEqual({ tx: "12", amount: 2500 });
    expect(taskDetail("charge_not_applied", { amount: "abc" })).toEqual({});
    expect(taskDetail("charge_not_applied", { amount: "" })).toEqual({});
    expect(taskDetail("charge_not_applied", null)).toBeNull();
    expect(taskDetail("renewal_missing", "str")).toBeNull();
    expect(taskDetail("other", { reason: "x" })).toBeNull();
    expect(taskDetail("renewal_missing", { reason: "  " })).toEqual({});
    expect(taskDetail("charge_not_applied", { tx: "x".repeat(300) })!.tx).toHaveLength(120);
  });
});

describe("the 'resumed' answer", () => {
  it("is a clear Hebrew message: the customer resumed, a check task was opened, shown after refresh", () => {
    const t = taskResultText("resumed");
    expect(t).toBe(TASK_RESUMED_TEXT);
    expect(t).toContain("חידש");
    expect(t).toContain("נפתחה משימת בדיקה");
    expect(t).toContain("רענון");
  });
  it("processed / already / anything else keep their texts", () => {
    expect(taskResultText("processed")).toBe("נשמר");
    expect(taskResultText("already")).toBe("המשימה כבר נסגרה");
    expect(taskResultText(undefined)).toBe("נשמר");
  });
});

describe("stuck list states", () => {
  const render = (events: StuckEvent[] | null | undefined, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(StuckEvents, { events, ...extra }));
  it("loading", () => {
    const h = render(undefined);
    expect(h).toContain('data-billing-loading="stuck-events"');
    expect(h).toContain("טוען");
    expect(h).not.toContain("data-stuck-event=");
  });
  it("empty", () => {
    const h = render([]);
    expect(h).toContain('data-billing-empty="stuck-events"');
    expect(h).toContain("(0)");
  });
  it("failed: '—' and an error line, never 0", () => {
    const h = render(null);
    expect(h).toContain('data-billing-failed="stuck-events"');
    expect(h).toContain(STUCK_READ_FAILED_TEXT);
    expect(h).toContain("(—)");
    expect(h).not.toContain("(0)");
    expect(h).not.toContain("data-billing-empty");
  });
  it("list from the real route: id, Israel time, event type, a close button", () => {
    expect(stuck).toHaveLength(1);
    const h = render(stuck, { onClose: async () => ({ ok: true, message: "x" }) });
    expect(h).toContain("e1111111-1111-4111-8111-111111111111");
    expect(h).toContain("12:30");              // 09:30Z in July = 12:30 Israel (UTC+3)
    expect(h).toContain("payment");
    expect(h).toContain('data-stuck-close="e1111111-1111-4111-8111-111111111111"');
    expect(h).toContain("סגירה");
    expect(h).toContain("(1)");
  });
  it("a missing event type shows '—'", () => {
    expect(render([{ id: "e2", event_type: null, received_at: "2026-07-01T09:30:00Z" }])).toContain("<td style=\"padding:8px 6px\">—</td>");
  });
  it("a viewer without the permission sees the list but no close button", () => {
    expect(render(stuck, { canManage: false })).not.toContain("data-stuck-close");
  });
});

describe("close dialog", () => {
  const ev = { id: "e1", event_type: "payment", received_at: "2026-07-01T09:30:00Z" };
  const dlg = (note: string, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(StuckCloseDialog, { event: ev, note, onNote: () => {}, busy: false, msg: null, onSubmit: () => {}, onCancel: () => {}, ...extra }));
  it("renders a dialog with a required note; confirm disabled under 10 chars", () => {
    const h = dlg("קצר");
    expect(h).toContain('role="dialog"');
    expect(h).toContain("תיעוד חובה");
    expect(h).toMatch(/data-stuck-confirm="true"[^>]*disabled/);
  });
  it("9 chars after trim: still disabled; 10: enabled", () => {
    expect(dlg("  123456789  ")).toMatch(/data-stuck-confirm="true"[^>]*disabled/);
    expect(dlg("  1234567890  ")).not.toMatch(/data-stuck-confirm="true"[^>]*disabled/);
  });
  it("busy disables both buttons", () => {
    const h = dlg("1234567890", { busy: true });
    expect(h).toMatch(/data-stuck-confirm="true"[^>]*disabled/);
    expect(h).toMatch(/data-stuck-cancel="true"[^>]*disabled/);
    expect(h).toContain("שומר");
  });
  it("shows an error message as an alert", () => {
    const h = dlg("1234567890", { msg: { ok: false, text: "לא נשמר כלום" } });
    expect(h).toContain('data-stuck-msg="error"');
    expect(h).toContain("לא נשמר כלום");
  });
});
