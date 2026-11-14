// BILL-1d: GET /api/billing — the new task kinds (label, safe detail), unknown kinds, and the stuck callback markers list.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeAdminClient, type TableResult } from "@/lib/__tests__/bill1Mocks";

let tables: Record<string, TableResult | ((q: { ops: string[] }) => TableResult)>;
const log: { table: string; op: string }[] = [];
const eventQueries: string[][] = [];
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "s", email: "a@b.c", role: "superadmin" } }) }));
vi.mock("@/lib/supabase", () => ({ get adminClient() { return makeAdminClient(tables, log); } }));

const S1 = "51111111-1111-4111-8111-111111111111";
const task = (id: string, kind: string, payload: unknown) => ({ id, kind, status: "open", subscription_id: S1, owner_type: "building", owner_id: "b1", building_id: "b1", created_at: "2026-11-10T10:00:00Z", payload });
const stuck = (q: { ops: string[] }): TableResult => {
  eventQueries.push(q.ops);
  return q.ops.some((o) => o.startsWith("eq:") && o.includes("received")) ? stuckResult : { data: [] };
};
let stuckResult: TableResult;
const get = async () => (await (await import("../route")).GET()).json();

beforeEach(() => {
  log.length = 0; eventQueries.length = 0;
  stuckResult = { data: [{ id: "e1", event_type: "payment", event_key: "TX-9:received", occurred_at: "2026-11-14T07:59:00Z", received_at: "2026-11-14T08:00:00Z", error: "secret", raw: "x" }] };
  tables = {
    billing_subscriptions: (q) => q.ops.some((o) => o.startsWith("in:"))
      ? { data: [{ id: S1, plan_id: "building_pro", amount_ils: 149, status: "active", provider_recurring_uid: "SECRET-UID", provider_cancelled_at: null, current_period_end: "2026-12-01T00:00:00Z" }] }
      : { data: [] },
    billing_webhook_events: stuck, buildings: { data: [{ id: "b1", name: "השקד" }] }, subscription_payments: { data: [] },
    management_companies: { data: [] }, subscription_refunds: { data: [] },
    billing_tasks: { data: [
      task("t1", "renewal_missing", { reason: "resumed_after_manual_stop", stopped_task_id: "x", recurring_uid: "SECRET-UID" }),
      task("t2", "charge_not_applied", { tx: "TX-77", amount: 119, recurring_uid: "SECRET-UID", status: "stale", via: "stale" }),
      task("t3", "something_new", { recurring_uid: "SECRET-UID", x: 1 }),
      task("t4", "manual_stop_recurring", { recurring_uid: "SECRET-UID" }),
    ] },
  };
});

describe("tasks", () => {
  it("labels for the two new kinds; an unknown kind gets the generic label, not the raw code", async () => {
    const j = await get();
    const by = (id: string) => j.tasks.find((t: any) => t.id === id);
    expect(by("t1").kind_label).toBe("חידוש לא הגיע");
    expect(by("t2").kind_label).toBe("חיוב שלא נרשם");
    expect(by("t3").kind_label).toBe("משימה אחרת");
    expect(by("t3").kind).toBe("something_new");
  });
  it("detail carries only the whitelisted fields; the uid never leaves", async () => {
    const j = await get();
    const by = (id: string) => j.tasks.find((t: any) => t.id === id);
    expect(by("t1").detail).toEqual({ reason: "resumed_after_manual_stop" });
    expect(by("t2").detail).toEqual({ tx: "TX-77", amount: 119, status: "stale" });
    expect(by("t3").detail).toBeNull();
    expect(by("t4").detail).toBeNull();
    expect(JSON.stringify(j)).not.toContain("SECRET-UID");
    expect(JSON.stringify(j)).not.toContain("payload");
  });
});

describe("tasks read", () => {
  it("selects payload (so detail can be derived) and nothing is written", async () => {
    const seen: string[] = [];
    const orig = tables.billing_tasks;
    tables.billing_tasks = (q) => { seen.push(...q.ops); return orig as TableResult; };
    await get();
    expect(seen.some((o) => o.startsWith("select:") && o.includes("payload"))).toBe(true);
  });
});

describe("stuck_events", () => {
  it("returns id / event_type / event_key (without :received) / occurred_at / received_at only", async () => {
    const j = await get();
    expect(j.stuck_events).toEqual([{ id: "e1", event_type: "payment", event_key: "TX-9", occurred_at: "2026-11-14T07:59:00Z", received_at: "2026-11-14T08:00:00Z" }]);
  });
  it("the query is status 'received', older than an hour, oldest first, limited", async () => {
    await get();
    const q = eventQueries.find((ops) => ops.some((o) => o.startsWith("eq:") && o.includes("received")))!;
    expect(q).toBeTruthy();
    const lt = q.find((o) => o.startsWith("lt:"))!;
    expect(lt).toContain("received_at");
    const iso = JSON.parse(lt.slice(3))[1];
    const age = Date.now() - new Date(iso).getTime();
    expect(age).toBeGreaterThan(59 * 60_000);
    expect(age).toBeLessThan(61 * 60_000);
    expect(q).toContain("limit:[50]");
    expect(q.some((o) => o.startsWith("order:") && o.includes("true"))).toBe(true);
  });
  it("empty is [] (not null)", async () => {
    stuckResult = { data: [] };
    expect((await get()).stuck_events).toEqual([]);
  });
  it("a failed read is null, never []", async () => {
    stuckResult = { data: null, error: { message: "boom" } };
    const j = await get();
    expect(j.stuck_events).toBeNull();
  });
  it("the stuck read does not write", async () => {
    await get();
    expect(log.filter((l) => /insert|update|upsert|delete/.test(l.op))).toEqual([]);
  });
});
