// ADS-2ב1 — lib/adsServer: מה שהסטודיו קורא אחרי SQL 231 / 232. המודעה — הקוד וסוף המבצע (מבצע שהסתיים — לא מוגש: לא ב-placements
// ולא ב-ready); הקמפיין — paused_by_reports_at; ההגדרות — report_pause_at; תור הדיווחים — רק העמודות של REPORT_COLUMNS (אף פעם לא מי
// דיווח), הפתוחים וה-500 הסגורים האחרונים; לפני SQL 231 — "missing" לתור ו-null לתג, ושאר הסטודיו עובד כמו קודם.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const BASE_URL = "https://abc.supabase.co";
const OURS = (n: number) => `${BASE_URL}/storage/v1/object/public/ads/creatives/2026-11/${n}.webp`;
let tables: Record<string, any[]> = {};
let tableErrors: Record<string, unknown> = {};
let countResult: { count: number | null; error: unknown } = { count: 0, error: null };
const selects: Array<[string, string, unknown]> = [];
const ops: Array<[string, string, string, unknown]> = [];

function builder(table: string) {
  let head = false;
  let status: { op: string; v: unknown } | null = null;
  const res = () => {
    if (head) return countResult;
    if (tableErrors[table]) return { data: null, error: tableErrors[table] };
    let rows = tables[table] ?? [];
    if (status) rows = rows.filter((r) => (status!.op === "eq" ? r.status === status!.v : r.status !== status!.v));
    return { data: rows, error: null };
  };
  const b: any = {
    select: (cols: string, opts?: { count?: string; head?: boolean }) => { selects.push([table, cols, opts]); head = !!opts?.head; return b; },
    eq: (col: string, v: unknown) => { ops.push([table, "eq", col, v]); if (col === "status") status = { op: "eq", v }; return b; },
    neq: (col: string, v: unknown) => { ops.push([table, "neq", col, v]); if (col === "status") status = { op: "neq", v }; return b; },
    order: () => b, not: () => b, range: () => b, in: () => b,
    limit: (n: number) => { ops.push([table, "limit", "", n]); return b; },
    maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
    then: (ok: any, bad: any) => Promise.resolve(res()).then(ok, bad),
  };
  return b;
}
vi.mock("@/lib/supabase", () => ({
  adminClient: { from: (t: string) => builder(t), rpc: async (n: string) => ({ data: n === "ad_totals" ? [] : { totals: {} }, error: null }) },
}));

import { loadAdsOverview, loadReportsQueue, loadOpenReportsCount, creativeRow, parsePauseAt, REPORTS_CLOSED_MAX, REPORTS_OPEN_MAX } from "../adsServer";
import { REPORT_COLUMNS } from "../adsReports";
import { ilTodayKey, addDaysKey } from "../broadcasts";

const K = "11111111-1111-4111-8111-111111111111";
const today = ilTodayKey();
const campaign = (o: Record<string, unknown> = {}) => ({
  id: K, name: "פיצה", status: "active", starts_on: addDaysKey(today, -10), ends_on: addDaysKey(today, 20), days: [0, 1, 2, 3, 4, 5, 6], hour_from: 0, hour_to: 24,
  screens: ["home"], plans: ["free"], roles: ["tenant"], cities: [], building_ids: [], goal_views: null, daily_cap: null, per_user_cap: 3, weight: 1,
  contract_id: "ct1", ...o,
});
const creative = (id: string, o: Record<string, unknown> = {}) => ({
  id, campaign_id: K, image_url: OURS(1), image_alt: "a", headline: "h", body: null, cta_label: "לפרטים", cta_url: "https://x.example", active: true,
  created_at: "2026-11-01T10:00:00Z", ...o,
});
const report = (id: string, o: Record<string, unknown> = {}) => ({
  id, campaign_id: K, creative_id: null, reason: "misleading", note: null, status: "new", created_at: "2026-11-16T08:00:00Z", reviewed_at: null, ...o,
});

const ENV_BEFORE = process.env.NEXT_PUBLIC_SUPABASE_URL;
afterAll(() => { if (ENV_BEFORE === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = ENV_BEFORE; });
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE_URL;
  selects.length = 0; ops.length = 0; tableErrors = {}; countResult = { count: 0, error: null };
  tables = {
    ad_settings: [{ id: 1, enabled: true, excluded_buildings: [], testers: [] }],
    ad_advertisers: [{ id: "a1", name: "פיצה השכונה" }],
    ad_contracts: [{ id: "ct1", advertiser_id: "a1", status: "active", starts_on: addDaysKey(today, -30), ends_on: addDaysKey(today, 60), pricing: "cpm", price_ils: 10 }],
    ad_campaigns: [campaign()],
    ad_creatives: [creative("c1")],
    ad_reports: [],
    buildings: [],
  };
});
const overview = async () => { const r = await loadAdsOverview(); if (r.state !== "ok") throw new Error(r.state); return r; };

describe("the creative's coupon and offer end", () => {
  it("before SQL 231 — null; after — the code (upper-case, only a valid one) and the day", () => {
    expect(creativeRow(creative("x"))).toMatchObject({ coupon_code: null, offer_ends_on: null });
    expect(creativeRow(creative("x", { coupon_code: "save20", offer_ends_on: "2026-11-30" }))).toMatchObject({ coupon_code: "SAVE20", offer_ends_on: "2026-11-30" });
    expect(creativeRow(creative("x", { coupon_code: "-BAD", offer_ends_on: "2026-02-30" }))).toMatchObject({ coupon_code: null, offer_ends_on: null });
  });
  it("an active creative whose offer ended is not served: not in placements, not ready; counted as ended", async () => {
    tables.ad_creatives = [
      creative("c1", { format: "card", offer_ends_on: addDaysKey(today, -1) }),
      creative("c2", { format: "native", offer_ends_on: today }),
    ];
    const c = (await overview()).campaigns[0];
    expect([c.placements, c.creatives_active, c.creatives_ready, c.creatives_ended]).toEqual([["native"], 2, 1, 1]);
  });
  it("all active offers ended — no placement, nothing ready", async () => {
    tables.ad_creatives = [creative("c1", { offer_ends_on: addDaysKey(today, -3) })];
    const c = (await overview()).campaigns[0];
    expect([c.placements, c.slots, c.creatives_ready, c.creatives_ended]).toEqual([[], [], 0, 1]);
  });
});

describe("the campaign's paused_by_reports_at and the settings' report_pause_at", () => {
  it("before SQL 231 — null; after — as stored (a real timestamp only)", async () => {
    expect((await overview()).campaigns[0].paused_by_reports_at).toBeNull();
    tables.ad_campaigns = [campaign({ status: "paused", paused_by_reports_at: "2026-11-16T09:12:40.512331+00:00" })];
    expect((await overview()).campaigns[0].paused_by_reports_at).toBe("2026-11-16T09:12:40.512331+00:00");
    tables.ad_campaigns = [campaign({ paused_by_reports_at: "soon" })];
    expect((await overview()).campaigns[0].paused_by_reports_at).toBeNull();
  });
  it("report_pause_at: 0..20 as stored; missing (before 231) or wrong — null", async () => {
    expect((await overview()).settings.report_pause_at).toBeNull();
    tables.ad_settings = [{ id: 1, enabled: true, excluded_buildings: [], testers: [], report_pause_at: 3 }];
    expect((await overview()).settings.report_pause_at).toBe(3);
    expect([parsePauseAt(0), parsePauseAt(20), parsePauseAt(21), parsePauseAt(-1), parsePauseAt(2.5), parsePauseAt("3"), parsePauseAt(null)]).toEqual([0, 20, null, null, null, null, null]);
  });
});

describe("the home badge: how many open reports", () => {
  it("a head count of status 'new' — never the rows", async () => {
    countResult = { count: 3, error: null };
    expect(await loadOpenReportsCount()).toBe(3);
    const s = selects.find((x) => x[0] === "ad_reports")!;
    expect(s[1]).toBe("id");
    expect(s[2]).toEqual({ count: "exact", head: true });
    expect(ops).toContainEqual(["ad_reports", "eq", "status", "new"]);
  });
  it("before SQL 231 / a failed read / no count — null (no badge, the home screen still works)", async () => {
    countResult = { count: null, error: { code: "42P01", message: "relation \"public.ad_reports\" does not exist" } };
    expect(await loadOpenReportsCount()).toBeNull();
    countResult = { count: null, error: null };
    expect(await loadOpenReportsCount()).toBeNull();
  });
});

describe("the queue read", () => {
  it("only REPORT_COLUMNS — never who reported; the open ones and the last 500 closed", async () => {
    tables.ad_reports = [report("r1"), report("r2", { status: "dismissed", reviewed_at: "2026-11-16T09:00:00Z" }), report("r3", { user_id: "u1", building_id: "b1", serve_id: "s1" })];
    const q = await loadReportsQueue();
    if (q.state !== "ok") throw new Error(q.state);
    const reads = selects.filter((x) => x[0] === "ad_reports");
    expect(reads.map((x) => x[1])).toEqual([REPORT_COLUMNS, REPORT_COLUMNS]);
    for (const r of reads) expect(String(r[1])).not.toMatch(/user_id|building_id|serve_id|\*/);
    expect(ops).toContainEqual(["ad_reports", "eq", "status", "new"]);
    expect(ops).toContainEqual(["ad_reports", "neq", "status", "new"]);
    expect(ops).toContainEqual(["ad_reports", "limit", "", REPORTS_OPEN_MAX]);
    expect(ops).toContainEqual(["ad_reports", "limit", "", REPORTS_CLOSED_MAX]);
    expect(q.reports.map((r) => r.id).sort()).toEqual(["r1", "r2", "r3"]);
    expect(JSON.stringify(q.reports)).not.toMatch(/u1|b1|s1|user_id/);
    expect([q.truncated, q.campaigns.length, q.creatives.length]).toEqual([false, 1, 1]);
  });
  it("before SQL 231 — \"missing\"; a failed read — \"error\" (not an empty list); the overview's own state passes through", async () => {
    tableErrors.ad_reports = { code: "PGRST205", message: "Could not find the table 'public.ad_reports' in the schema cache" };
    expect((await loadReportsQueue()).state).toBe("missing");
    tableErrors.ad_reports = { code: "57014", message: "canceling statement due to statement timeout" };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await loadReportsQueue()).state).toBe("error");
    err.mockRestore();
    tableErrors = { ad_campaigns: { code: "42P01", message: "relation \"ad_campaigns\" does not exist" } };
    expect((await loadReportsQueue()).state).toBe("missing");
  });
  it("1,000 open reports — truncated is said", async () => {
    tables.ad_reports = Array.from({ length: REPORTS_OPEN_MAX }, (_, i) => report(`r${i}`));
    const q = await loadReportsQueue();
    expect(q.state === "ok" && q.truncated).toBe(true);
  });
});
