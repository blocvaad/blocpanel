import { describe, it, expect } from "vitest";
import { summarizeBilling, type SubRow } from "../billing";

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const row = (over: Partial<SubRow>): SubRow => ({
  id: Math.random().toString(36).slice(2), owner_type: "building", owner_id: "b1", plan_id: "large",
  status: "active", amount_ils: 119, founding_price: false, current_period_end: null, past_due_since: null,
  provider_recurring_uid: "rec", provider_cancelled_at: null, cancel_requested_at: null,
  created_at: new Date(NOW - 3600_000).toISOString(), ...over,
});

describe("summarizeBilling", () => {
  it("MRR counts renewing subscriptions only (active + past due)", () => {
    const s = summarizeBilling([
      row({ status: "active", amount_ils: 119 }),
      row({ status: "past_due", amount_ils: "199.00" }),
      row({ status: "cancel_pending", amount_ils: 59, provider_cancelled_at: new Date(NOW).toISOString() }),
      row({ status: "trialing", amount_ils: 119 }),
    ], NOW);
    expect(s.mrr).toBe(318);
    expect(s.endingRevenue).toBe(59);
    expect(s.counts).toMatchObject({ active: 1, past_due: 1, cancel_pending: 1, trialing: 1 });
  });

  it("flags a cancelled/replaced subscription whose PayPlus recurring was not confirmed stopped (double-charge risk)", () => {
    const risky = row({ status: "cancelled", provider_cancelled_at: null });
    const safe = row({ status: "cancelled", provider_cancelled_at: new Date(NOW).toISOString() });
    const noRecurring = row({ status: "cancelled", provider_recurring_uid: null });
    const s = summarizeBilling([risky, safe, noRecurring], NOW);
    expect(s.alerts.recurringNotStopped.map((r) => r.id)).toEqual([risky.id]);
  });

  it("flags checkouts open for more than a day", () => {
    const stuck = row({ status: "checkout_pending", created_at: new Date(NOW - 2 * 86_400_000).toISOString() });
    const fresh = row({ status: "checkout_pending" });
    expect(summarizeBilling([stuck, fresh], NOW).alerts.stuckCheckouts.map((r) => r.id)).toEqual([stuck.id]);
  });

  it("counts founding-price subscriptions that are still live", () => {
    const s = summarizeBilling([
      row({ founding_price: true }), row({ founding_price: true, status: "cancelled", provider_cancelled_at: "x" }),
    ], NOW);
    expect(s.founding).toBe(1);
  });
});
