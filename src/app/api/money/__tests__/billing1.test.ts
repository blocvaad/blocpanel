// BILL-1a: /money tiles "משימות חיוב פתוחות" and "החזרים לבדיקה"; a failed read is a dash + the failed-read hint.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeAdminClient, type TableResult } from "@/lib/__tests__/bill1Mocks";
import { summarizeMoney, BILLING_REASON, billingRejection } from "@/lib/money";

let tables: Record<string, TableResult | ((q: { ops: string[] }) => TableResult)>;
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "s", role: "admin" } }) }));
vi.mock("@/lib/supabase", () => ({ get adminClient() { return makeAdminClient(tables); } }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => createElement("a", { href }, children as never) }));
import MoneyBoard from "@/components/ui/MoneyBoard";

beforeEach(() => {
  tables = {
    webhook_log: { data: [], count: 0 }, payments: { data: [], count: 0 }, supplier_payments: { data: [] },
    billing_subscriptions: { data: [] }, payment_external_refs: { data: [] }, billing_webhook_events: { data: [], count: 0 },
    buildings: { data: [] }, supplier_profiles: { data: [] }, management_companies: { data: [] },
    billing_tasks: (q) => q.ops.some((o) => o.includes("refund_review")) ? { count: 2 } : { count: 5 },
  };
});
const get = async () => (await (await import("../route")).GET()).json();
const tile = (j: any, key: string) => j.tiles.find((t: any) => t.key === key);

describe("GET /api/money — BILL-1a tiles", () => {
  it("counts open staff tasks and refund tasks from the DB", async () => {
    const j = await get();
    expect(tile(j, "billing_tasks")).toMatchObject({ title: "משימות חיוב פתוחות", count: 5, severity: "critical" });
    expect(tile(j, "refunds_review")).toMatchObject({ title: "החזרים לבדיקה", count: 2, severity: "critical" });
  });
  it("zero is 0 (info), not a dash", async () => {
    tables.billing_tasks = { count: 0 };
    const j = await get();
    expect(tile(j, "billing_tasks")).toMatchObject({ count: 0, severity: "info" });
  });
  it("a failed read is null → warning with the failed-read hint; the other tile is unaffected", async () => {
    tables.billing_tasks = (q) => q.ops.some((o) => o.includes("refund_review")) ? { error: { message: "x" } } : { count: 5 };
    const j = await get();
    expect(tile(j, "refunds_review")).toMatchObject({ count: null, severity: "warning", hint: "הקריאה נכשלה — נסו לרענן." });
    expect(tile(j, "billing_tasks").count).toBe(5);
  });
  it("rendered: a failed tile shows a dash, not 0", async () => {
    tables.billing_tasks = { error: { message: "x" } };
    const j = await get();
    const h = renderToStaticMarkup(createElement(MoneyBoard, { data: j }));
    expect(h).toMatch(/data-money-tile="billing_tasks"[\s\S]*?—[\s\S]*?הקריאה נכשלה/);
  });
  it("summarizeMoney without the new inputs adds no tile (older callers unchanged)", () => {
    const t = summarizeMoney({ webhookReviews: [], staleReports: 0, disputes: 0, recurringNotStopped: 0, stuckCheckouts: 0, staleExternal: 0 });
    expect(t.find((x) => x.key === "billing_tasks")).toBeUndefined();
  });
});

describe("BILLING_REASON — new rejection reasons", () => {
  it("zero_amount_without_trial and wrong_product have Hebrew labels", () => {
    expect(BILLING_REASON.zero_amount_without_trial).toBeTruthy();
    expect(BILLING_REASON.wrong_product).toBeTruthy();
    expect(billingRejection(JSON.stringify({ reason: "wrong_product" })).label).toBe(BILLING_REASON.wrong_product);
    expect(billingRejection(JSON.stringify({ reason: "zero_amount_without_trial" })).label).toBe(BILLING_REASON.zero_amount_without_trial);
  });
});
