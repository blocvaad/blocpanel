// BILL-1a: GET /api/billing — tasks (open, staff) and refunds (latest 50); a failed read is null, never [];
// the recurring uid never leaves (a boolean only); the panel reads these tables, never writes them.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeAdminClient, type TableResult } from "@/lib/__tests__/bill1Mocks";

let guardResult: any;
let tables: Record<string, TableResult | ((q: { ops: string[] }) => TableResult)>;
const log: { table: string; op: string }[] = [];
vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/supabase", () => ({ get adminClient() { return makeAdminClient(tables, log); } }));

const B1 = "b1111111-1111-4111-8111-111111111111";
const S1 = "51111111-1111-4111-8111-111111111111";
const SECRET_UID = "rec-uid-SECRET-123";

beforeEach(() => {
  guardResult = { ok: true, session: { id: "s", email: "a@b.c", role: "superadmin" } };
  log.length = 0;
  tables = {
    billing_subscriptions: (q) => q.ops.some((o) => o.startsWith("in:") && o.includes(S1))
      ? { data: [{ id: S1, plan_id: "building_pro", amount_ils: 149, status: "cancel_pending", provider_recurring_uid: SECRET_UID, provider_cancelled_at: null, current_period_end: "2026-12-01T00:00:00Z" }] }
      : { data: [{ id: S1, owner_type: "building", owner_id: B1, plan_id: "building_pro", status: "cancel_pending", amount_ils: 149, founding_price: false, provider_recurring_uid: null, provider_cancelled_at: null, created_at: "2026-10-01T00:00:00Z" }] },
    billing_webhook_events: { data: [] },
    buildings: { data: [{ id: B1, name: "השקד 104" }] },
    subscription_payments: { data: [] },
    management_companies: { data: [] },
    billing_tasks: { data: [{ id: "t1", kind: "manual_stop_recurring", status: "open", subscription_id: S1, owner_type: "building", owner_id: B1, building_id: B1, created_at: "2026-11-10T10:00:00Z", payload: { existing_uid: SECRET_UID } }] },
    subscription_refunds: { data: [{ id: "r1", provider: "payplus", kind: "refund", product: "subscription", amount: 149, currency: "ILS", classification: "full", outcome: "flagged", subscription_id: S1, owner_type: "building", owner_id: B1, occurred_at: "2026-11-11T08:00:00Z", created_at: "2026-11-11T08:01:00Z", original_tx_uid: "tx-secret" }] },
  };
});

const get = async () => (await import("../route")).GET();

describe("GET /api/billing — BILL-1a", () => {
  it("returns open staff tasks with owner name, Hebrew kind, amount and a recurring boolean", async () => {
    const j = await (await get()).json();
    expect(j.tasks).toHaveLength(1);
    expect(j.tasks[0]).toMatchObject({ id: "t1", kind: "manual_stop_recurring", kind_label: "עצירה ידנית", owner_name: "השקד 104", amount: 149, has_recurring: true, created_at: "2026-11-10T10:00:00Z" });
  });
  it("returns the latest refunds with the owner name", async () => {
    const j = await (await get()).json();
    expect(j.refunds[0]).toMatchObject({ id: "r1", kind: "refund", classification: "full", outcome: "flagged", owner_name: "השקד 104", amount: 149 });
  });
  it("the recurring uid and raw payload never appear anywhere in the response", async () => {
    const text = JSON.stringify(await (await get()).json());
    expect(text).not.toContain(SECRET_UID);
    expect(text).not.toContain("tx-secret");
    expect(text).not.toContain("payload");
  });
  it("tasks query is scoped: status open + executor staff; refunds limited to 50", async () => {
    let tq: string[] = []; let rq: string[] = [];
    const prev = tables.billing_tasks; const prevR = tables.subscription_refunds;
    tables.billing_tasks = (q) => { tq = q.ops; return prev as TableResult; };
    tables.subscription_refunds = (q) => { rq = q.ops; return prevR as TableResult; };
    await get();
    expect(tq.join()).toContain('eq:["status","open"]');
    expect(tq.join()).toContain('eq:["executor","staff"]');
    expect(rq.join()).toContain("limit:[50]");
  });
  it("a failed tasks read is null (not []); the rest still loads", async () => {
    tables.billing_tasks = { error: { message: "boom" } };
    const j = await (await get()).json();
    expect(j.tasks).toBeNull();
    expect(j.refunds).toHaveLength(1);
    expect(j.subscriptions).toHaveLength(1);
  });
  it("a failed refunds read is null (not [])", async () => {
    tables.subscription_refunds = { error: { message: "boom" } };
    const j = await (await get()).json();
    expect(j.refunds).toBeNull();
    expect(j.tasks).toHaveLength(1);
  });
  it("no tasks is [] (empty), distinct from null (failed)", async () => {
    tables.billing_tasks = { data: [] };
    tables.subscription_refunds = { data: [] };
    const j = await (await get()).json();
    expect(j.tasks).toEqual([]);
    expect(j.refunds).toEqual([]);
  });
  it("a failed read of the task's subscription is flagged, not read as 'no recurring'", async () => {
    tables.billing_subscriptions = (q) => q.ops.some((o) => o.startsWith("in:") && o.includes(S1)) ? { error: { message: "x" } } : { data: [] };
    const j = await (await get()).json();
    expect(j.tasks[0].sub_read_failed).toBe(true);
  });
  it("non-superadmin is refused by guard", async () => {
    guardResult = { ok: false, response: new Response("no", { status: 403 }) };
    expect((await get()).status).toBe(403);
  });
  it("only reads: no write operation on any table", async () => {
    await get();
    expect(log.filter((l) => ["insert", "update", "upsert", "delete"].includes(l.op))).toEqual([]);
  });
});
