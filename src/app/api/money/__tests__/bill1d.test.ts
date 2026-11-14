// BILL-1d (review): a stuck callback marker that staff closed (bloc close_stuck_event → status 'failed', error 'staff: …') is not a
// rejected subscription charge — the "rejected" query of /api/money excludes it (and keeps rows whose error is NULL).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeAdminClient, type TableResult } from "@/lib/__tests__/bill1Mocks";

let tables: Record<string, TableResult | ((q: { ops: string[] }) => TableResult)>;
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "s", role: "admin" } }) }));
vi.mock("@/lib/supabase", () => ({ get adminClient() { return makeAdminClient(tables); } }));

const isRejectedQuery = (q: { ops: string[] }) => q.ops.some((o) => o.startsWith('eq:["status","failed"]'));
beforeEach(() => {
  tables = {
    webhook_log: { data: [], count: 0 }, payments: { data: [], count: 0 }, supplier_payments: { data: [] },
    billing_subscriptions: { data: [] }, payment_external_refs: { data: [] },
    billing_webhook_events: { data: [], count: 0 },
    buildings: { data: [] }, supplier_profiles: { data: [] }, management_companies: { data: [] }, billing_tasks: { count: 0 },
  };
});
const get = async () => (await (await import("../route")).GET()).json();

describe("GET /api/money — rejected subscription charges exclude staff-closed markers", () => {
  it("the failed-events query filters out error 'staff:*' and keeps NULL errors", async () => {
    let ops: string[] = [];
    tables.billing_webhook_events = (q) => { if (isRejectedQuery(q)) ops = q.ops; return { data: [], count: 0 }; };
    await get();
    expect(ops.length).toBeGreaterThan(0);
    expect(ops).toContain('or:["error.is.null,error.not.like.staff:*"]');
    expect(ops.some((o) => o.startsWith('gte:["received_at"'))).toBe(true);
  });
});
