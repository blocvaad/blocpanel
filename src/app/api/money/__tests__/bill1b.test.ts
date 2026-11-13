// BILL-1b: /api/money tile "callbacks תקועים" = billing_webhook_events status 'received' older than an hour.
// A failed read is a dash with the failed-read hint — never 0.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeAdminClient, type TableResult } from "@/lib/__tests__/bill1Mocks";
import { summarizeMoney } from "@/lib/money";

let tables: Record<string, TableResult | ((q: { ops: string[] }) => TableResult)>;
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "s", role: "admin" } }) }));
vi.mock("@/lib/supabase", () => ({ get adminClient() { return makeAdminClient(tables); } }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => createElement("a", { href }, children as never) }));
import MoneyBoard from "@/components/ui/MoneyBoard";

const isStuckQuery = (q: { ops: string[] }) => q.ops.some((o) => o.startsWith('eq:["status","received"]'));
beforeEach(() => {
  tables = {
    webhook_log: { data: [], count: 0 }, payments: { data: [], count: 0 }, supplier_payments: { data: [] },
    billing_subscriptions: { data: [] }, payment_external_refs: { data: [] },
    billing_webhook_events: (q) => isStuckQuery(q) ? { count: 3 } : { data: [], count: 0 },
    buildings: { data: [] }, supplier_profiles: { data: [] }, management_companies: { data: [] }, billing_tasks: { count: 0 },
  };
});
const get = async () => (await (await import("../route")).GET()).json();
const tile = (j: any, key: string) => j.tiles.find((t: any) => t.key === key);

describe("GET /api/money — stuck callbacks", () => {
  it("counts received events older than an hour (query shape checked), critical when > 0", async () => {
    let ops: string[] = [];
    tables.billing_webhook_events = (q) => { if (isStuckQuery(q)) ops = q.ops; return isStuckQuery(q) ? { count: 3 } : { data: [], count: 0 }; };
    const t0 = Date.now();
    const j = await get();
    expect(tile(j, "stuck_callbacks")).toMatchObject({ title: "callbacks תקועים", count: 3, severity: "critical" });
    const lt = ops.find((o) => o.startsWith("lt:"))!;
    const [col, iso] = JSON.parse(lt.slice(3));
    expect(col).toBe("received_at");
    const age = t0 - new Date(iso).getTime();
    expect(age).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
    expect(age).toBeLessThan(60 * 60 * 1000 + 60_000);
    expect(ops.some((o) => o.includes('"exact"') && o.includes("head"))).toBe(true);   // count only
  });
  it("zero is 0 / info, not a dash", async () => {
    tables.billing_webhook_events = { data: [], count: 0 };
    expect(tile(await get(), "stuck_callbacks")).toMatchObject({ count: 0, severity: "info" });
  });
  it("a failed read is null → warning + the failed-read hint (and the other tiles are unaffected)", async () => {
    tables.billing_webhook_events = (q) => isStuckQuery(q) ? { error: { message: "x" } } : { data: [], count: 0 };
    const j = await get();
    expect(tile(j, "stuck_callbacks")).toMatchObject({ count: null, severity: "warning", hint: "הקריאה נכשלה — נסו לרענן." });
    expect(tile(j, "billing_rejected")).toMatchObject({ count: 0 });
  });
  it("rendered: a failed read shows a dash, never 0; a count shows the number", async () => {
    tables.billing_webhook_events = (q) => isStuckQuery(q) ? { error: { message: "x" } } : { data: [], count: 0 };
    const failed = renderToStaticMarkup(createElement(MoneyBoard, { data: await get() }));
    expect(failed).toMatch(/data-money-tile="stuck_callbacks"[\s\S]*?—[\s\S]*?הקריאה נכשלה/);
    tables.billing_webhook_events = (q) => isStuckQuery(q) ? { count: 4 } : { data: [], count: 0 };
    const ok = renderToStaticMarkup(createElement(MoneyBoard, { data: await get() }));
    expect(ok).toMatch(/data-money-tile="stuck_callbacks"[\s\S]*?>4</);
  });
  it("summarizeMoney without the input adds no tile (older callers unchanged)", () => {
    const t = summarizeMoney({ webhookReviews: [], staleReports: 0, disputes: 0, recurringNotStopped: 0, stuckCheckouts: 0, staleExternal: 0 });
    expect(t.find((x) => x.key === "stuck_callbacks")).toBeUndefined();
  });
});
