// BILL-1a wiring: the panel never writes billing_tasks / subscription_refunds; actions go through blocApi only.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { can, permissionsFor } from "@/lib/permissions";
import { summarizeBilling, STATUS_LABELS, ENDED_LABELS, TASK_KIND_LABELS, type SubRow } from "@/lib/billing";

const SRC = join(process.cwd(), "src");
function walk(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "__tests__" && n !== "node_modules") walk(p, out); }
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const files = walk(SRC).map((p) => ({ p, s: readFileSync(p, "utf8") }));

describe("BILL-1a wiring", () => {
  it("no insert / update / upsert / delete on billing_tasks or subscription_refunds anywhere in src", () => {
    const bad: string[] = [];
    for (const { p, s } of files) {
      for (const m of s.matchAll(/from\(\s*["'`](billing_tasks|subscription_refunds)["'`]\s*\)([\s\S]{0,400})/g)) {
        if (/\.(insert|update|upsert|delete)\s*\(/.test(m[2].split(/;\s*\n/)[0] + m[2].slice(0, 200))) bad.push(`${p}: ${m[1]}`);
      }
      if (/\.rpc\(\s*["'`]billing_(task_open|task_resolve|mark_provider_stopped|record_refund)/.test(s)) bad.push(`${p}: rpc`);
    }
    expect(bad).toEqual([]);
  });
  it("the only code that mentions these tables reads them (select / count)", () => {
    for (const { p, s } of files) {
      if (!/billing_tasks|subscription_refunds/.test(s) || /billingTasks\.test/.test(p)) continue;
      // רק ה-routes שקוראים, ותגובות/תוויות. כתיבה כבר נבדקת למעלה.
      expect(/api\/billing\/route\.ts|api\/money\/route\.ts|api\/billing\/tasks\/route\.ts|lib\/billing\.ts|lib\/money\.ts|ui\/BillingTasks/.test(p), p).toBe(true);
    }
  });
  it("the task action reaches bloc only through callBloc('/api/internal/billing')", () => {
    const route = readFileSync(join(SRC, "app/api/billing/tasks/route.ts"), "utf8");
    expect(route).toMatch(/callBloc\(\s*"\/api\/internal\/billing"/);
    expect(route).not.toMatch(/adminClient/);
    for (const a of ["mark_stopped", "resolve_task", "dismiss_task"]) expect(route).toContain(a);
    expect(route).toMatch(/permission:\s*"billing\.manage"/);
    expect(readFileSync(join(SRC, "lib/blocApi.ts"), "utf8")).toContain('"/api/internal/billing"');
  });
  it("the manual-stop task has no dismiss button (UI) and the 409 text is Hebrew", () => {
    const ui = readFileSync(join(SRC, "components/ui/BillingTasks.tsx"), "utf8");
    expect(ui).toMatch(/\{!closesWithStopped && \(\s*<button data-task-action="dismiss"/);
    expect(readFileSync(join(SRC, "app/api/billing/tasks/route.ts"), "utf8")).toContain("use_mark_stopped");
  });
  it("billing.manage is super-admin only", () => {
    expect(can("superadmin", "billing.manage")).toBe(true);
    expect(permissionsFor("admin")).not.toContain("billing.manage");
    expect(permissionsFor("viewer")).not.toContain("billing.manage");
  });
  it("labels: refunded, ended reasons, every task kind from the contract", () => {
    expect(STATUS_LABELS.refunded).toBeTruthy();
    for (const k of ["period_ended", "refund_full", "chargeback"]) expect(ENDED_LABELS[k]).toBeTruthy();
    const want: Record<string, string> = { manual_stop_recurring: "עצירה ידנית", orphan_recurring: "הוראה יתומה", refund_review: "החזר לבדיקה",
      refund_unmatched: "החזר לא מותאם", post_refund_recurring_check: "בדיקת הוראה אחרי החזר", charge_after_cancel_request: "חיוב אחרי בקשת ביטול", past_due_stale: "פיגור ממושך" };
    for (const [k, v] of Object.entries(want)) expect(TASK_KIND_LABELS[k]).toBe(v);
  });
  it("alerts.manualStop: cancel_pending with no uid and no provider_cancelled_at — nothing else", () => {
    const row = (o: Partial<SubRow>): SubRow => ({ id: "x", owner_type: "building", owner_id: "o", plan_id: "p", status: "cancel_pending", amount_ils: 1, founding_price: false,
      current_period_end: null, past_due_since: null, provider_recurring_uid: null, provider_cancelled_at: null, cancel_requested_at: null, created_at: "2026-01-01", ...o });
    const rows = [
      row({ id: "yes" }),
      row({ id: "has-uid", provider_recurring_uid: "u" }),
      row({ id: "stopped", provider_cancelled_at: "2026-11-01" }),
      row({ id: "active", status: "active" }),
      row({ id: "cancelled", status: "cancelled" }),
    ];
    const s = summarizeBilling(rows);
    expect(s.alerts.manualStop.map((r) => r.id)).toEqual(["yes"]);
    expect(s.alerts.recurringNotStopped.map((r) => r.id)).toEqual(["has-uid"]);
  });
});
