// BILL-1b: the tasks list with the new kinds (company_takeover, stop_old_recurring) and the context line on a manual stop
// task whose building is suspended / archived — rendered with the EXACT shape GET /api/billing returns (real handler, mocked tables).
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeAdminClient, type TableResult } from "@/lib/__tests__/bill1Mocks";

let tables: Record<string, TableResult | ((q: { ops: string[] }) => TableResult)> = {};
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "s", email: "a@b.c", role: "superadmin" } }) }));
vi.mock("@/lib/supabase", () => ({ get adminClient() { return makeAdminClient(tables); } }));

import { BillingTasks, type BillingTask } from "../BillingTasks";
import { stopTaskContext, TASK_KIND_HINT, TASK_KIND_LABELS } from "@/lib/billing";

const B_OK = "b1111111-1111-4111-8111-111111111111";
const B_SUSP = "b2222222-2222-4222-8222-222222222222";
const B_ARCH = "b3333333-3333-4333-8333-333333333333";
const S = (n: number) => `5${n}111111-1111-4111-8111-111111111111`;
let tasks: BillingTask[];
const byId = (id: string) => tasks.find((t) => t.id === id)!;
const html = (t: BillingTask[]) => renderToStaticMarkup(createElement(BillingTasks, { tasks: t }));

beforeAll(async () => {
  tables = {
    billing_subscriptions: (q) => q.ops.some((o) => o.startsWith("in:"))
      ? { data: [1, 2, 3, 4, 5].map((n) => ({ id: S(n), plan_id: "tower", amount_ils: 199, status: "cancel_pending", provider_recurring_uid: n === 2 ? null : "u", current_period_end: "2026-12-01T00:00:00Z" })) }
      : { data: [] },
    billing_webhook_events: { data: [] }, subscription_payments: { data: [] }, management_companies: { data: [] }, subscription_refunds: { data: [] },
    buildings: { data: [
      { id: B_OK, name: "השקד 104", is_active: true, is_archived: false },
      { id: B_SUSP, name: "הדקל 7", is_active: false, is_archived: false },
      { id: B_ARCH, name: "האלון 3", is_active: false, is_archived: true },
    ] },
    billing_tasks: { data: [
      { id: "t-takeover", kind: "company_takeover", status: "open", subscription_id: S(1), owner_type: "building", owner_id: B_OK, building_id: B_OK, created_at: "2026-11-10T10:00:00Z" },
      { id: "t-old", kind: "stop_old_recurring", status: "open", subscription_id: S(2), owner_type: "building", owner_id: B_OK, building_id: B_OK, created_at: "2026-11-10T11:00:00Z" },
      { id: "t-stop-susp", kind: "manual_stop_recurring", status: "open", subscription_id: S(3), owner_type: "building", owner_id: B_SUSP, building_id: B_SUSP, created_at: "2026-11-11T10:00:00Z" },
      { id: "t-stop-arch", kind: "manual_stop_recurring", status: "open", subscription_id: S(4), owner_type: "building", owner_id: B_ARCH, building_id: B_ARCH, created_at: "2026-11-11T11:00:00Z" },
      { id: "t-stop-ok", kind: "manual_stop_recurring", status: "open", subscription_id: S(5), owner_type: "building", owner_id: B_OK, building_id: B_OK, created_at: "2026-11-11T12:00:00Z" },
    ] },
  };
  tasks = (await (await (await import("@/app/api/billing/route")).GET()).json()).tasks;
});

describe("labels and hints (API §5 / PLAN §3)", () => {
  it("company_takeover and stop_old_recurring have labels and the contract hints", () => {
    expect(TASK_KIND_LABELS.company_takeover).toBeTruthy();
    expect(TASK_KIND_LABELS.stop_old_recurring).toBeTruthy();
    expect(TASK_KIND_HINT.company_takeover).toBe("העברת החיוב לחברה נכשלה 3 פעמים — עצרו את הוראת הקבע של הבניין ב-PayPlus ובדקו.");
    expect(TASK_KIND_HINT.stop_old_recurring).toBe("שדרוג: עצרו את ההוראה הישנה ב-PayPlus, ואז לחצו \"עצרתי\" עם תיעוד.");
  });
});

describe("the real GET /api/billing shape feeds the list", () => {
  it("owner_state is set only for a suspended / archived building (null otherwise)", () => {
    expect(byId("t-stop-susp").owner_state).toBe("הבניין מושעה");
    expect(byId("t-stop-arch").owner_state).toBe("הבניין בארכיון");
    expect(byId("t-stop-ok").owner_state).toBeNull();
    expect(byId("t-takeover").owner_state).toBeNull();
  });
  it("stopTaskContext: archived wins over suspended; unknown / active → null", () => {
    expect(stopTaskContext({ is_active: false, is_archived: true })).toBe("הבניין בארכיון");
    expect(stopTaskContext({ is_active: true, is_archived: false })).toBeNull();
    expect(stopTaskContext(undefined)).toBeNull();
  });
});

describe("company_takeover", () => {
  it("shows the label, who/what and the hint; closes with 'טופל' / 'סגירה בלי טיפול' (resolve_task), no 'עצרתי'", () => {
    const h = html([byId("t-takeover")]);
    expect(h).toContain(TASK_KIND_LABELS.company_takeover);
    expect(h).toContain("השקד 104");
    expect(h).toContain("העברת החיוב לחברה נכשלה 3 פעמים");
    expect(h).toContain(">טופל<");
    expect(h).toContain("סגירה בלי טיפול");
    expect(h).not.toContain("עצרתי");
    expect(h).toMatch(/data-task-action="done"[^>]*disabled/);
  });
});

describe("stop_old_recurring", () => {
  it("'עצרו ב-PayPlus' + the upgrade hint, a 'עצרתי' button (disabled until a note), the note hint, and NO dismiss button", () => {
    const h = html([byId("t-old")]);
    expect(h).toContain(TASK_KIND_LABELS.stop_old_recurring);
    expect(h).toContain("עצרו ב-PayPlus:");
    expect(h).toContain("שדרוג: עצרו את ההוראה הישנה ב-PayPlus");
    expect(h).toContain(">עצרתי<");
    expect(h).toMatch(/data-task-action="done"[^>]*disabled/);
    expect(h).toContain("data-stop-note-hint");
    expect(h).not.toContain('data-task-action="dismiss"');
    expect(h).not.toContain("סגירה בלי טיפול");
    expect(h).not.toContain(">טופל<");
  });
  it("the hint line is shown once (not duplicated by the generic hint)", () => {
    const h = html([byId("t-old")]);
    expect(h.split("שדרוג: עצרו את ההוראה הישנה").length - 1).toBe(1);
  });
});

describe("manual stop: context line for a suspended / archived building", () => {
  it("suspended → 'הבניין מושעה' line; archived → 'הבניין בארכיון'; active → no line", () => {
    const susp = html([byId("t-stop-susp")]);
    expect(susp).toMatch(/data-stop-context[^>]*><b>הבניין מושעה<\/b>/);
    expect(susp).toContain("עצרו ב-PayPlus");
    expect(susp).toContain(">עצרתי<");
    expect(html([byId("t-stop-arch")])).toMatch(/data-stop-context[^>]*><b>הבניין בארכיון<\/b>/);
    expect(html([byId("t-stop-ok")])).not.toContain("data-stop-context");
  });
  it("a task with no owner_state (older answer shape) renders as before", () => {
    const { owner_state, ...old } = byId("t-stop-susp") as any;
    expect(html([old as BillingTask])).not.toContain("data-stop-context");
  });
});
