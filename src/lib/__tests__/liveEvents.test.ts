import { describe, it, expect } from "vitest";
import { buildLiveEvents, mergeLiveEvents, clampSince, LIVE_MAX_LOOKBACK_MS } from "../liveEvents";

const NOW = Date.parse("2026-09-27T12:00:00Z");

describe("liveEvents", () => {
  it("clampSince: invalid/future → default lookback; too old → 24h cap", () => {
    expect(Date.parse(clampSince(null, NOW))).toBeLessThan(NOW);
    expect(Date.parse(clampSince("garbage", NOW))).toBeLessThan(NOW);
    expect(Date.parse(clampSince(new Date(NOW + 60_000).toISOString(), NOW))).toBeLessThan(NOW);
    expect(Date.parse(clampSince("2020-01-01T00:00:00Z", NOW))).toBe(NOW - LIVE_MAX_LOOKBACK_MS);
    const ok = new Date(NOW - 5 * 60_000).toISOString();
    expect(clampSince(ok, NOW)).toBe(ok);
  });

  it("builds typed events, newest first, with building names", () => {
    const ev = buildLiveEvents({
      tenants: [{ id: "t1", full_name: "דנה", building_id: "b1", created_at: "2026-09-27T11:00:00Z" }],
      tickets: [
        { id: "k1", title: "נזילה", urgency: "urgent", building_id: "b1", created_at: "2026-09-27T11:30:00Z" },
        { id: "k2", title: "נורה", urgency: "low", building_id: null, created_at: "2026-09-27T10:00:00Z" },
      ],
      declined: [{ id: "p1", amount: "250", building_id: "b1", failed_at: "2026-09-27T11:45:00Z" }],
      webhookErrors: [{ id: "w1", event_type: "payplus", building_id: null, created_at: "2026-09-27T09:00:00Z" }],
    }, { b1: "השקד 104" });
    expect(ev.map((e) => e.type)).toEqual(["declined_payment", "urgent_ticket", "new_tenant", "new_ticket", "webhook_error"]);
    expect(ev[0].message).toContain("השקד 104");
    expect(ev[0].href).toBe("/money");
  });

  it("skips rows without a timestamp", () => {
    expect(buildLiveEvents({ tenants: [{ id: "t", full_name: null, building_id: null, created_at: null }], tickets: [], declined: [], webhookErrors: [] })).toHaveLength(0);
  });

  it("merge de-duplicates across polls and caps", () => {
    const a = { id: "x", type: "new_ticket" as const, message: "", at: "2026-09-27T10:00:00Z", href: "/" };
    const b = { ...a, id: "y", at: "2026-09-27T11:00:00Z" };
    expect(mergeLiveEvents([a], [a, b]).map((e) => e.id)).toEqual(["y", "x"]);
    const many = Array.from({ length: 80 }, (_, i) => ({ ...a, id: String(i), at: new Date(NOW - i * 1000).toISOString() }));
    expect(mergeLiveEvents([], many)).toHaveLength(50);
  });
});
