// /api/ads (bloc ADS-1): ניהול בלבד (ads.manage), כל פעולה לטבלה שלה, ביומן; מה שהוצג — שגיאה בעברית
// (409), SQL 175 שלא רץ — 503; הפעלת קמפיין רק עם חוזה פעיל ופרסומת פעילה; מכשירי בדיקה לפי אימייל קיים.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let guardArgs: any[] = [];
const audits: any[][] = [];
type Op = { table: string; op: string; payload?: any; filters: Array<[string, string, unknown]>; select?: string; opts?: any };
const ops: Op[] = [];
// התשובה לכל (טבלה, פעולה) — אפשר לדרוס בכל בדיקה
let answers: Record<string, any> = {};

function builder(table: string) {
  const op: Op = { table, op: "select", filters: [] };
  ops.push(op);
  const result = () => {
    const key = `${table}.${op.op}`;
    const a = answers[key];
    return typeof a === "function" ? a(op) : (a ?? { data: null, error: null });
  };
  const b: any = {
    select: (s?: string, o?: any) => { if (op.op === "select") op.select = s; else op.select = s; op.opts = o ?? op.opts; return b; },
    insert: (p: any) => { op.op = "insert"; op.payload = p; return b; },
    update: (p: any) => { op.op = "update"; op.payload = p; return b; },
    delete: () => { op.op = "delete"; return b; },
    eq: (c: string, v: unknown) => { op.filters.push(["eq", c, v]); return b; },
    in: (c: string, v: unknown) => { op.filters.push(["in", c, v]); return b; },
    maybeSingle: async () => result(),
    single: async () => result(),
    then: (ok: any, bad: any) => Promise.resolve(result()).then(ok, bad),
  };
  return b;
}

vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/supabase", () => ({ adminClient: { from: (t: string) => builder(t) } }));

import { POST } from "../route";

const ID = "11111111-1111-4111-8111-111111111111";
const K = "22222222-2222-4222-8222-222222222222";
const SESSION = { id: "a1", email: "tal@bloc.co.il", full_name: "טל", role: "admin", auth_level: "mfa" };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const post = async (body: any) => { const r: any = await POST(req(body)); return { status: r.status, body: await r.json() }; };
const opsOn = (table: string, op?: string) => ops.filter((o) => o.table === table && (!op || o.op === op));

beforeEach(() => {
  guardResult = { ok: true, session: SESSION };
  guardArgs = []; audits.length = 0; ops.length = 0; answers = {};
});

describe("POST /api/ads — access", () => {
  it("asks for ads.manage; a refusal writes nothing", async () => {
    await post({ action: "advertiser.save", name: "פיצה" });
    expect(guardArgs[0]).toEqual({ permission: "ads.manage" });
    guardResult = { ok: false, response: { status: 403, json: async () => ({ error: "אין הרשאה" }) } };
    ops.length = 0; audits.length = 0;
    const r: any = await POST(req({ action: "advertiser.save", name: "פיצה" }));
    expect(r.status).toBe(403);
    expect(ops).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("an invalid body is 400 in Hebrew, nothing written", async () => {
    const r = await post({ action: "advertiser.save", name: "א" });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("לפחות 2");
    expect(ops).toHaveLength(0);
  });
});

describe("advertisers and contracts", () => {
  it("a new advertiser: inserted with who created it, logged", async () => {
    answers["ad_advertisers.insert"] = { data: { id: ID }, error: null };
    const r = await post({ action: "advertiser.save", name: "פיצה השכונה", business_id: "514000001" });
    expect(r).toEqual({ status: 200, body: { ok: true, id: ID } });
    expect(opsOn("ad_advertisers", "insert")[0].payload).toMatchObject({ name: "פיצה השכונה", business_id: "514000001", created_by: "tal@bloc.co.il" });
    expect(audits[0][1]).toBe("AD_ADVERTISER_SAVE");
    expect(audits[0][4]).toMatchObject({ name: "פיצה השכונה", created: true });
  });
  it("an update targets the id; a missing one is 404", async () => {
    answers["ad_advertisers.update"] = { data: null, error: null };
    const r = await post({ action: "advertiser.save", id: ID, name: "פיצה" });
    expect(r.status).toBe(404);
    expect(opsOn("ad_advertisers", "update")[0].filters).toContainEqual(["eq", "id", ID]);
    expect(audits).toHaveLength(0);
  });
  it("archive and back", async () => {
    answers["ad_advertisers.update"] = { data: { id: ID, name: "פיצה" }, error: null };
    await post({ action: "advertiser.archive", id: ID, archived: true });
    expect(typeof opsOn("ad_advertisers", "update")[0].payload.archived_at).toBe("string");
    await post({ action: "advertiser.archive", id: ID, archived: false });
    expect(opsOn("ad_advertisers", "update")[1].payload.archived_at).toBeNull();
    expect(audits.map((a) => a[1])).toEqual(["AD_ADVERTISER_ARCHIVE", "AD_ADVERTISER_ARCHIVE"]);
  });
  it("deleting an advertiser with contracts: the database refuses (23503) — 409 with what to do instead", async () => {
    answers["ad_advertisers.delete"] = { data: null, error: { code: "23503", message: "violates foreign key" } };
    const r = await post({ action: "advertiser.delete", id: ID });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("לארכיון");
    expect(audits).toHaveLength(0);
  });
  it("a contract: the price is rounded to agorot; logged with the money terms", async () => {
    answers["ad_contracts.insert"] = { data: { id: K }, error: null };
    const r = await post({ action: "contract.save", advertiser_id: ID, pricing: "cpm", price_ils: 49.999, starts_on: "2026-10-01", ends_on: "2026-12-31", status: "active" });
    expect(r.status).toBe(200);
    expect(opsOn("ad_contracts", "insert")[0].payload).toMatchObject({ advertiser_id: ID, pricing: "cpm", price_ils: 50, status: "active", impression_cap: null, created_by: "tal@bloc.co.il" });
    expect(audits[0][1]).toBe("AD_CONTRACT_SAVE");
    expect(audits[0][4]).toMatchObject({ pricing: "cpm", price_ils: 50, created: true });
  });
  it("changing the price after delivery: AD_CONTRACT_LOCKED → 409 in Hebrew", async () => {
    answers["ad_contracts.update"] = { data: null, error: { code: "P0001", message: "AD_CONTRACT_LOCKED" } };
    const r = await post({ action: "contract.save", id: K, advertiser_id: ID, pricing: "cpm", price_ils: 40, starts_on: "2026-10-01", ends_on: "2026-12-31" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("חוזה חדש");
  });
  it("SQL 175 missing — 503 that says so", async () => {
    answers["ad_contracts.insert"] = { data: null, error: { code: "42P01", message: 'relation "public.ad_contracts" does not exist' } };
    const r = await post({ action: "contract.save", advertiser_id: ID, pricing: "flat", price_ils: 1000, starts_on: "2026-10-01", ends_on: "2026-12-31" });
    expect(r.status).toBe(503);
    expect(r.body.error).toContain("SQL 175");
  });
});

const CAMPAIGN = {
  action: "campaign.save", contract_id: K, name: "פיצה סתיו", starts_on: "2026-10-13", ends_on: "2026-11-12",
  days: [0, 1, 2, 3, 4], hour_from: 8, hour_to: 22, screens: ["home"], goal_views: 10000, daily_cap: null,
  per_user_cap: 3, plans: ["free", "building"], roles: ["tenant"], cities: [], building_ids: [], weight: 1,
};

describe("campaigns", () => {
  it("a new campaign is a draft, whatever was sent", async () => {
    answers["ad_campaigns.insert"] = { data: { id: ID }, error: null };
    const r = await post(CAMPAIGN);
    expect(r.status).toBe(200);
    expect(opsOn("ad_campaigns", "insert")[0].payload).toMatchObject({ status: "draft", name: "פיצה סתיו", plans: ["free", "building"], created_by: "tal@bloc.co.il" });
    expect(audits[0][1]).toBe("AD_CAMPAIGN_SAVE");
  });
  it("moving a shown campaign to another contract: 409", async () => {
    answers["ad_campaigns.update"] = { data: null, error: { code: "P0001", message: "AD_CAMPAIGN_LOCKED" } };
    const r = await post({ ...CAMPAIGN, id: ID });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("נשאר בחוזה שלו");
  });

  const camp = (o: Record<string, unknown> = {}) => ({ id: ID, name: "פיצה", status: "draft", ends_on: "2099-12-31", contract_id: K, ...o });
  it("activation: the contract must be active and current, and there must be an active creative", async () => {
    answers["ad_campaigns.select"] = { data: camp(), error: null };
    answers["ad_contracts.select"] = { data: { status: "draft", ends_on: "2099-12-31" }, error: null };
    let r = await post({ action: "campaign.status", id: ID, status: "active" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("החוזה של הקמפיין לא פעיל");
    answers["ad_contracts.select"] = { data: { status: "active", ends_on: "2000-01-01" }, error: null };
    r = await post({ action: "campaign.status", id: ID, status: "active" });
    expect(r.body.error).toBe("החוזה של הקמפיין הסתיים.");
    answers["ad_contracts.select"] = { data: { status: "active", ends_on: "2099-12-31" }, error: null };
    answers["ad_creatives.select"] = { count: 0, data: null, error: null };
    r = await post({ action: "campaign.status", id: ID, status: "active" });
    expect(r.body.error).toContain("אין בקמפיין פרסומת פעילה");
    expect(opsOn("ad_creatives", "select").at(-1)!.filters).toEqual([["eq", "campaign_id", ID], ["eq", "active", true]]);
    expect(opsOn("ad_campaigns", "update")).toHaveLength(0);
    answers["ad_creatives.select"] = { count: 2, data: null, error: null };
    answers["ad_campaigns.update"] = { data: { id: ID }, error: null };
    r = await post({ action: "campaign.status", id: ID, status: "active" });
    expect(r.status).toBe(200);
    expect(opsOn("ad_campaigns", "update")[0].payload).toEqual({ status: "active" });
    expect(audits.at(-1)![1]).toBe("AD_CAMPAIGN_STATUS");
    expect(audits.at(-1)![4]).toMatchObject({ from: "draft", to: "active" });
  });
  it("an end date in the past cannot be activated", async () => {
    answers["ad_campaigns.select"] = { data: camp({ ends_on: "2000-01-01" }), error: null };
    const r = await post({ action: "campaign.status", id: ID, status: "active" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("תאריך הסיום");
  });
  it("ended is final; nothing goes back to draft; pause needs no checks", async () => {
    answers["ad_campaigns.select"] = { data: camp({ status: "ended" }), error: null };
    expect((await post({ action: "campaign.status", id: ID, status: "active" })).body.error).toContain("לשכפל");
    answers["ad_campaigns.select"] = { data: camp({ status: "active" }), error: null };
    expect((await post({ action: "campaign.status", id: ID, status: "draft" })).body.error).toContain("לא חוזר לטיוטה");
    answers["ad_campaigns.update"] = { data: { id: ID }, error: null };
    const r = await post({ action: "campaign.status", id: ID, status: "paused" });
    expect(r.status).toBe(200);
    expect(opsOn("ad_contracts")).toHaveLength(0);
  });
  it("duplicate: a draft copy named \"(עותק)\" with its active creatives, logged", async () => {
    answers["ad_campaigns.select"] = { data: { ...camp({ status: "active" }), plans: ["free"], created_at: "x", created_by: "y", updated_at: "z" }, error: null };
    answers["ad_campaigns.insert"] = { data: { id: "33333333-3333-4333-8333-333333333333" }, error: null };
    answers["ad_creatives.select"] = { data: [{ image_url: "https://a/1.webp", headline: "א", active: true }, { image_url: "https://a/2.webp", headline: "ב", active: false }], error: null };
    answers["ad_creatives.insert"] = { data: null, error: null };
    const r = await post({ action: "campaign.duplicate", id: ID });
    expect(r.body).toEqual({ ok: true, id: "33333333-3333-4333-8333-333333333333" });
    const ins = opsOn("ad_campaigns", "insert")[0].payload;
    expect(ins).toMatchObject({ name: "פיצה (עותק)", status: "draft", plans: ["free"], created_by: "tal@bloc.co.il" });
    expect(ins).not.toHaveProperty("id");
    expect(ins).not.toHaveProperty("created_at");
    expect(opsOn("ad_creatives", "insert")[0].payload).toEqual([{ image_url: "https://a/1.webp", headline: "א", active: true, campaign_id: "33333333-3333-4333-8333-333333333333", created_by: "tal@bloc.co.il" }]);
    expect(audits[0][1]).toBe("AD_CAMPAIGN_DUPLICATE");
  });
  it("deleting a campaign that was shown: 409", async () => {
    answers["ad_campaigns.delete"] = { data: null, error: { code: "23503", message: "fk" } };
    expect((await post({ action: "campaign.delete", id: ID })).status).toBe(409);
  });
});

describe("creatives", () => {
  const CR = { action: "creative.save", campaign_id: ID, image_url: "https://x.supabase.co/a.webp", image_alt: "פיצה", headline: "פיצה ב-49", cta_label: "להזמנה", cta_url: "https://pizza.example" };
  it("saved; a shown creative's content is locked (409)", async () => {
    answers["ad_creatives.insert"] = { data: { id: ID }, error: null };
    expect((await post(CR)).status).toBe(200);
    expect(opsOn("ad_creatives", "insert")[0].payload).toMatchObject({ headline: "פיצה ב-49", body: null, created_by: "tal@bloc.co.il" });
    answers["ad_creatives.update"] = { data: null, error: { code: "P0001", message: "AD_CREATIVE_LOCKED" } };
    const r = await post({ ...CR, id: ID, headline: "שונה" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("פרסומת חדשה");
  });
  it("turned off / on; logged", async () => {
    answers["ad_creatives.update"] = { data: { id: ID, headline: "פיצה" }, error: null };
    await post({ action: "creative.active", id: ID, active: false });
    expect(opsOn("ad_creatives", "update")[0].payload).toEqual({ active: false });
    expect(audits[0][1]).toBe("AD_CREATIVE_ACTIVE");
  });
});

describe("settings", () => {
  it("the switch, by who", async () => {
    answers["ad_settings.update"] = { data: { enabled: false }, error: null };
    const r = await post({ action: "settings.save", enabled: false });
    expect(r.status).toBe(200);
    const u = opsOn("ad_settings", "update")[0];
    expect(u.payload).toEqual({ updated_by: "tal@bloc.co.il", enabled: false });
    expect(u.filters).toContainEqual(["eq", "id", 1]);
    expect(audits[0][1]).toBe("AD_SETTINGS");
  });
  it("test devices by the email of a bloc account; an unknown email is named, nothing saved", async () => {
    answers["profiles.select"] = { data: [{ id: "p1", email: "tal@example.com" }], error: null };
    let r = await post({ action: "settings.save", tester_emails: ["tal@example.com", "nobody@example.com"] });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("אין חשבון bloc עם האימייל: nobody@example.com");
    expect(opsOn("ad_settings", "update")).toHaveLength(0);
    answers["ad_settings.update"] = { data: { enabled: true }, error: null };
    r = await post({ action: "settings.save", tester_emails: ["TAL@example.com"] });
    expect(r.status).toBe(200);
    expect(opsOn("ad_settings", "update")[0].payload.testers).toEqual(["p1"]);
    // an empty list clears without a lookup
    ops.length = 0;
    await post({ action: "settings.save", tester_emails: [] });
    expect(opsOn("profiles")).toHaveLength(0);
    expect(opsOn("ad_settings", "update")[0].payload.testers).toEqual([]);
  });
  it("no settings row — SQL 175 not run", async () => {
    answers["ad_settings.update"] = { data: null, error: null };
    const r = await post({ action: "settings.save", enabled: true });
    expect(r.status).toBe(503);
  });
});
