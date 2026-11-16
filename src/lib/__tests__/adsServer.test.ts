// ADS-2א v2 — lib/adsServer: מה שהסטודיו קורא (C7). הפורמט שייך למודעה: קמפיין מוצג בכל מקום שהמודעות הפעילות שלו מתאימות לו
// (placements / slots), ו"רץ עכשיו?" סופר רק מודעות פעילות שכל התמונות שלהן מהבאקט של bloc (creatives_ready). לפני SQL 228 העמודות
// החדשות חסרות — card / null / light / 0.5 / null; המותג של המפרסם (logo_url / brand_color) — null. הקריאות — "*". מסך הבית — הימים
// של כל קמפיין מ-ad_report (נכשל — null, לא אפסים); דף הקמפיין — היומן של הפאנל (נכשל — null).
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const BASE_URL = "https://abc.supabase.co";
const OURS = (n: number) => `${BASE_URL}/storage/v1/object/public/ads/creatives/2026-11/${n}.webp`;
const FOREIGN = "https://cdn.example.com/x.jpg";
let tables: Record<string, any[]> = {};
let tableErrors: Record<string, unknown> = {};
const selects: Array<[string, string]> = [];
const filters: Array<[string, string, unknown]> = [];
let rpcImpl: (name: string, args: any) => { data: unknown; error: unknown } = () => ({ data: null, error: null });
const rpcCalls: Array<[string, any]> = [];

function builder(table: string) {
  const res = () => ({ data: tableErrors[table] ? null : tables[table] ?? [], error: tableErrors[table] ?? null });
  const b: any = {
    select: (cols: string) => { selects.push([table, cols]); return b; },
    eq: () => b, order: () => b, not: () => b, range: () => b, limit: () => b,
    in: (col: string, v: unknown) => { filters.push([table, col, v]); return b; },
    maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
    then: (ok: any, bad: any) => Promise.resolve(res()).then(ok, bad),
  };
  return b;
}
vi.mock("@/lib/supabase", () => ({
  adminClient: { from: (t: string) => builder(t), rpc: async (n: string, a: any) => { rpcCalls.push([n, a]); return rpcImpl(n, a); } },
}));

import { loadAdsOverview, loadCampaignPage, loadStudioDaily, loadCampaignHistory, creativeRow, STUDIO_DAILY_MAX, type AdCampaignRow } from "../adsServer";

const K = "11111111-1111-4111-8111-111111111111";
const campaign = (o: Record<string, unknown> = {}) => ({
  id: K, name: "פיצה", status: "active", starts_on: "2026-11-01", ends_on: "2026-11-30", days: [0, 1, 2, 3, 4, 5, 6], hour_from: 0, hour_to: 24,
  screens: ["home"], plans: ["free"], roles: ["tenant"], cities: [], building_ids: [], goal_views: null, daily_cap: null, per_user_cap: 3, weight: 1,
  contract_id: "ct1", ...o,
});
const creative = (id: string, o: Record<string, unknown> = {}) => ({
  id, campaign_id: K, image_url: OURS(1), image_alt: "a", headline: "h", body: null, cta_label: "לפרטים", cta_url: "https://x.example", active: true,
  created_at: "2026-11-01T10:00:00Z", ...o,
});
const frames = (n: number, url = (i: number) => OURS(i)) => Array.from({ length: n }, (_, i) => ({ image_url: url(i), image_alt: "x" }));

const ENV_BEFORE = process.env.NEXT_PUBLIC_SUPABASE_URL;
afterAll(() => { if (ENV_BEFORE === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = ENV_BEFORE; });
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE_URL;
  selects.length = 0; filters.length = 0; rpcCalls.length = 0; tableErrors = {};
  rpcImpl = (n) => ({ data: n === "ad_totals" ? [] : { totals: {} }, error: null });
  tables = {
    ad_settings: [{ id: 1, enabled: true, excluded_buildings: [], testers: [] }],
    ad_advertisers: [{ id: "a1", name: "פיצה השכונה" }],
    ad_contracts: [{ id: "ct1", advertiser_id: "a1", status: "active", starts_on: "2026-10-01", ends_on: "2026-12-31", pricing: "cpm", price_ils: 10 }],
    ad_campaigns: [campaign()],
    ad_creatives: [creative("c1")],
    buildings: [],
  };
});

const overview = async () => { const r = await loadAdsOverview(); if (r.state !== "ok") throw new Error(r.state); return r; };
const one = async () => (await overview()).campaigns[0];

describe("before SQL 228 — the new columns are missing", () => {
  it("a creative without format is a card: the campaign shows as a card, one active ready creative", async () => {
    const c = await one();
    expect([c.placements, c.slots]).toEqual([["card"], ["full"]]);
    expect([c.creatives_active, c.creatives_ready, c.creatives_total]).toEqual([1, 1, 1]);
    expect("format" in c).toBe(false);   // v2: no campaign format
  });
  it("the creative's new fields default like bloc: card, no position, light, no accent, focal in the middle, no frames", () => {
    expect(creativeRow(creative("x"))).toMatchObject({ format: "card", banner_position: null, theme: "light", accent: null, focal_x: 0.5, focal_y: 0.5, frames: null });
  });
  it("the advertiser's brand is null; the campaign has no logo / color", async () => {
    const o = await overview();
    expect([o.advertisers[0].logo_url, o.advertisers[0].brand_color]).toEqual([null, null]);
    expect([o.campaigns[0].advertiser_logo, o.campaigns[0].advertiser_color]).toEqual([null, null]);
  });
  it("the reads are \"*\" (a missing column in a list would break the whole screen)", async () => {
    await loadAdsOverview();
    for (const t of ["ad_creatives", "ad_campaigns", "ad_advertisers", "ad_contracts"]) expect(selects).toContainEqual([t, "*"]);
  });
});

describe("after SQL 228 — the format is the creative's; the campaign shows where its active creatives fit", () => {
  it("placements: the formats of the ACTIVE creatives, once each, in the fixed order; slots follow", async () => {
    tables.ad_creatives = [
      creative("n", { format: "native" }), creative("d", { format: "dialog" }), creative("d2", { format: "dialog" }),
      creative("b", { format: "banner", banner_position: "top", active: false }), creative("s", { format: "story", frames: frames(2) }),
    ];
    const c = await one();
    expect(c.placements).toEqual(["dialog", "story", "native"]);
    expect(c.slots).toEqual(["full", "inline"]);
    expect([c.creatives_active, c.creatives_total]).toEqual([4, 5]);
  });
  it("ready = active with every image ours (the cover and all frames); inactive never counts", async () => {
    tables.ad_creatives = [
      creative("ok", { format: "story", frames: frames(3) }),
      creative("out", { format: "carousel", frames: frames(2, (i) => (i ? FOREIGN : OURS(i))) }),
      creative("cover", { image_url: FOREIGN }),
      creative("off", { active: false }),
    ];
    const c = await one();
    expect([c.creatives_active, c.creatives_ready]).toEqual([3, 1]);
  });
  it("without the project URL the images are not judged (unknown is not \"outside\")", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    tables.ad_creatives = [creative("x", { image_url: FOREIGN })];
    expect((await one()).creatives_ready).toBe(1);
  });
  it("each creative checked: a position only on a banner, theme / accent / focal / frames cleaned (junk → defaults)", () => {
    expect(creativeRow(creative("a", { format: "banner", banner_position: "top", theme: "dark", accent: "#16a34a", focal_x: 0.2, focal_y: "0.8" })))
      .toMatchObject({ format: "banner", banner_position: "top", theme: "dark", accent: "#16A34A", focal_x: 0.2, focal_y: 0.8 });
    expect(creativeRow(creative("b", { format: "native", banner_position: "top", theme: "neon", accent: "red", focal_x: 3, frames: "x" })))
      .toMatchObject({ format: "native", banner_position: null, theme: "light", accent: null, focal_x: 0.5, frames: null });
    expect(creativeRow(creative("c", { format: "carousel", frames: [{ image_url: OURS(1), image_alt: "x", caption: "  ", focal: [0.1, 0.9] }, 7, { image_url: OURS(2) }] })).frames)
      .toEqual([{ image_url: OURS(1), image_alt: "x", caption: null, cta_url: null, focal: [0.1, 0.9] }, { image_url: OURS(2), image_alt: "", caption: null, cta_url: null, focal: null }]);
  });
  it("the advertiser's brand: the logo (any https — the screens judge ours) and the color upper-case; a bad color — null", async () => {
    tables.ad_advertisers = [{ id: "a1", name: "פיצה השכונה", logo_url: OURS(9), brand_color: "#dc2626" }];
    const o = await overview();
    expect([o.advertisers[0].logo_url, o.advertisers[0].brand_color]).toEqual([OURS(9), "#DC2626"]);
    expect([o.campaigns[0].advertiser_logo, o.campaigns[0].advertiser_color]).toEqual([OURS(9), "#DC2626"]);
    tables.ad_advertisers = [{ id: "a1", name: "פיצה", logo_url: "  ", brand_color: "blue" }];
    const p = await overview();
    expect([p.advertisers[0].logo_url, p.advertisers[0].brand_color]).toEqual([null, null]);
  });
  it("the overview carries every creative (the studio's cards and previews)", async () => {
    tables.ad_creatives = [creative("a"), creative("b", { format: "dialog" })];
    expect((await overview()).creatives.map((c) => [c.id, c.format])).toEqual([["a", "card"], ["b", "dialog"]]);
  });
});

describe("the studio home — each campaign's days from ad_report (for the 7-day line and the range)", () => {
  const row = (o: Partial<AdCampaignRow>): AdCampaignRow => ({ id: "x", status: "active", ends_on: "2026-11-30", ...o } as AdCampaignRow);
  it("non-draft campaigns that ended at most 30 days ago; the last 30 days only; reach and when it was frozen", async () => {
    rpcImpl = (n, a) => ({
      data: { totals: { reach: a.p_campaign === "a" ? 40 : 7 }, reach_frozen_at: a.p_campaign === "a" ? "2027-01-12T03:00:00Z" : null,
        days: [{ day: "2026-10-01", views: 9, clicks: 9 }, { day: "2026-11-14", views: 5, clicks: 1 }, { day: "2026-11-15", views: 3, clicks: 0 }] },
      error: null,
    });
    const out = await loadStudioDaily([
      row({ id: "a" }), row({ id: "draft", status: "draft" }), row({ id: "old", ends_on: "2026-10-15" }), row({ id: "edge", ends_on: "2026-10-16" }),
    ], "2026-11-15");
    expect(Object.keys(out).sort()).toEqual(["a", "edge"]);
    expect(out.a).toEqual({ days: [{ day: "2026-11-14", views: 5, clicks: 1 }, { day: "2026-11-15", views: 3, clicks: 0 }], reach: 40, frozenAt: "2027-01-12T03:00:00Z" });
    expect(rpcCalls.map(([n, a]) => [n, a.p_campaign])).toEqual([["ad_report", "a"], ["ad_report", "edge"]]);
  });
  it("a failed read is null (never zeros) — an error, or a throw", async () => {
    rpcImpl = (_n, a) => { if (a.p_campaign === "boom") throw new Error("x"); return a.p_campaign === "bad" ? { data: null, error: { code: "XX" } } : { data: { totals: {} }, error: null }; };
    const out = await loadStudioDaily([row({ id: "ok" }), row({ id: "bad" }), row({ id: "boom" })], "2026-11-15");
    expect(out).toEqual({ ok: { days: [], reach: 0, frozenAt: null }, bad: null, boom: null });
  });
  it("at most STUDIO_DAILY_MAX campaigns are read (the most recently updated)", async () => {
    const many = Array.from({ length: STUDIO_DAILY_MAX + 5 }, (_, i) => row({ id: `c${i}` }));
    const out = await loadStudioDaily(many, "2026-11-15");
    expect(Object.keys(out)).toHaveLength(STUDIO_DAILY_MAX);
    expect(out).toHaveProperty("c0");
    expect(out).not.toHaveProperty(`c${STUDIO_DAILY_MAX}`);
  });
});

describe("the campaign page — the creatives, the report and the panel's own history", () => {
  it("history: the panel's AD_* rows on the campaign and its creatives (ids and entity types filtered), newest first", async () => {
    tables.panel_audit_logs = [{ action: "AD_CAMPAIGN_STATUS", admin_email: "a@b.co", created_at: "2026-11-15T10:00:00Z", entity_type: "ad_campaign", entity_id: K, metadata: { to: "active" } }];
    const h = await loadCampaignHistory(K, ["c1", "c2"]);
    expect(h).toEqual([{ action: "AD_CAMPAIGN_STATUS", admin_email: "a@b.co", created_at: "2026-11-15T10:00:00Z", entity_type: "ad_campaign", metadata: { to: "active" } }]);
    expect(filters).toContainEqual(["panel_audit_logs", "entity_id", [K, "c1", "c2"]]);
    expect(filters).toContainEqual(["panel_audit_logs", "entity_type", ["ad_campaign", "ad_creative"]]);
  });
  it("history: a failed read is null (the tab says so), junk metadata → {}", async () => {
    tableErrors.panel_audit_logs = { code: "XX" };
    expect(await loadCampaignHistory(K, [])).toBeNull();
    tableErrors = {};
    tables.panel_audit_logs = [{ action: "AD_CREATIVE_SAVE", created_at: "2026-11-15T10:00:00Z", entity_type: "ad_creative", metadata: "x" }];
    expect((await loadCampaignHistory(K, []))![0]).toEqual({ action: "AD_CREATIVE_SAVE", admin_email: null, created_at: "2026-11-15T10:00:00Z", entity_type: "ad_creative", metadata: {} });
  });
  it("loadCampaignPage: the campaign's creatives, its contracts (with advertiser_id), the advertisers and the history", async () => {
    tables.ad_creatives = [creative("c1", { format: "dialog", theme: "dark" }), { ...creative("other"), campaign_id: "zzz" }];
    tables.panel_audit_logs = [];
    const p = await loadCampaignPage(K);
    if (p.state !== "ok") throw new Error(p.state);
    expect(p.creatives.map((c) => [c.id, c.format, c.theme])).toEqual([["c1", "dialog", "dark"]]);
    expect(p.contracts[0]).toMatchObject({ id: "ct1", advertiser_id: "a1", advertiser: "פיצה השכונה" });
    expect(p.advertisers.map((a) => a.id)).toEqual(["a1"]);
    expect(p.history).toEqual([]);
    expect(filters.find((f) => f[0] === "panel_audit_logs" && f[1] === "entity_id")?.[2]).toEqual([K, "c1"]);
  });
  it("a new campaign (null): no creatives, no history read", async () => {
    const p = await loadCampaignPage(null);
    if (p.state !== "ok") throw new Error(p.state);
    expect([p.campaign, p.creatives, p.history]).toEqual([null, [], []]);
    expect(filters.some((f) => f[0] === "panel_audit_logs")).toBe(false);
  });
});
