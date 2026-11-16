// /api/ads/upload ו-/api/ads/report (bloc ADS-1): תמונה לפי הבייטים עד 2MB לבאקט 'ads'; הדוח למפרסם — מספרים מצטברים בלבד,
// CSV עם שם קובץ, ביומן.
// PANEL-PAY א2ב (החלטה 372, C4): ההעלאה בלי service role — bloc נותן כתובת חתומה (image.upload_url עם הסוג והגודל), הפאנל
// שולח אליה את הבייטים ב-PUT (content-type, cache-control לשנה, x-upsert=false) ומחזיר את הכתובת הציבורית. הדוח — קריאה, נשאר.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { UPLOAD_FAILED_TEXT } from "@/lib/adsUi";
import { ADS_FORBIDDEN_TEXT, UPLOAD_BAD_SHAPE_TEXT, UPLOAD_INVALID_TEXT, UPLOAD_NO_ANSWER_TEXT } from "@/lib/adsActions";
import { ADS_SQL_MISSING } from "@/lib/ads";

let guardResult: any;
let guardArgs: any[] = [];
const audits: any[][] = [];
let rows: Record<string, any> = {};
let rpcResult: any = { data: null, error: null };
let storageTouched = 0;
const calls: Array<{ path: string; payload: any }> = [];
let blocAnswer: any;
const puts: Array<{ url: string; init: any }> = [];
let putAnswer: any;

function builder(table: string) {
  const b: any = {
    select: () => b, eq: () => b,
    maybeSingle: async () => rows[table] ?? { data: null, error: null },
    then: (ok: any, bad: any) => Promise.resolve(rows[table] ?? { data: [], error: null }).then(ok, bad),
  };
  return b;
}
vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (t: string) => builder(t),
    rpc: async () => rpcResult,
    storage: { from: () => { storageTouched++; throw new Error("the panel must not use storage — the upload goes through bloc's signed URL"); } },
  },
}));

import { POST as UPLOAD } from "../upload/route";
import { GET as REPORT } from "../report/route";

const SESSION = { id: "a1", email: "tal@bloc.co.il", role: "admin" };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const fileReq = (bytes: Uint8Array | null, name = "a.jpg", type = "image/jpeg"): any => ({
  headers: { get: () => null },
  formData: async () => {
    const fd = new FormData();
    if (bytes) fd.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
    return fd;
  },
});
const PATH = "creatives/2026-11/0b0c9d8e-7f6a-4b5c-8d9e-0f1a2b3c4d5e.jpg";
const SIGNED = `https://test.supabase.co/storage/v1/object/upload/sign/ads/${PATH}?token=tok-123`;
const PUBLIC = `https://test.supabase.co/storage/v1/object/public/ads/${PATH}`;
// bloc's answer as built (C4, with anon_key — the public key the PUT sends like supabase-js uploadToSignedUrl)
const ANON = "anon-public-key";
const okUrl = (o: Record<string, unknown> = {}) => ({ ok: true, status: 200, data: { ok: true, path: PATH, token: "tok-123", signed_url: SIGNED, public_url: PUBLIC, anon_key: ANON, ...o } });
const fail = (status: number, code?: string, error = code ?? "x") => ({ ok: false, status, code, error });
const realFetch = globalThis.fetch;

beforeEach(() => {
  guardResult = { ok: true, session: SESSION };
  guardArgs = []; audits.length = 0; rows = {}; rpcResult = { data: null, error: null }; storageTouched = 0;
  calls.length = 0; puts.length = 0; blocAnswer = okUrl(); putAnswer = { status: 200 };
  globalThis.fetch = (async (url: any, init: any) => {
    puts.push({ url: String(url), init });
    if (putAnswer === "throw") throw new TypeError("fetch failed");
    if (putAnswer === "abort") { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
    return new Response(JSON.stringify({ Key: `ads/${PATH}` }), { status: putAnswer.status });
  }) as any;
});
afterAll(() => { globalThis.fetch = realFetch; });

describe("POST /api/ads/upload — bloc's signed URL, then a PUT", () => {
  it("ads.manage; bloc is asked for a URL with the type and size from the bytes; the bytes go to the signed URL; the public URL back; logged", async () => {
    const r: any = await UPLOAD(fileReq(JPEG));
    expect(guardArgs[0]).toEqual({ permission: "ads.manage" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, url: PUBLIC });
    expect(calls).toEqual([{ path: "/api/internal/ads", payload: { actor: SESSION, action: "image.upload_url", type: "image/jpeg", bytes: JPEG.length } }]);
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toBe(SIGNED);
    expect(puts[0].init.method).toBe("PUT");
    expect(puts[0].init.headers).toEqual({ "content-type": "image/jpeg", "cache-control": "max-age=31536000", "x-upsert": "false", apikey: ANON, authorization: `Bearer ${ANON}` });
    expect(new Uint8Array(puts[0].init.body)).toEqual(JPEG);
    expect(JSON.stringify(puts[0].init.headers)).not.toMatch(/service/i);
    expect(storageTouched).toBe(0);
    expect(audits).toHaveLength(1);
    expect(audits[0].slice(1)).toEqual(["AD_IMAGE_UPLOAD", "ad_image", PATH, { bytes: JPEG.length, type: "image/jpeg" }, undefined]);
  });
  it("an older bloc without anon_key → the PUT goes without a key (never a made-up one)", async () => {
    blocAnswer = okUrl({ anon_key: undefined });
    const r: any = await UPLOAD(fileReq(JPEG));
    expect(r.status).toBe(200);
    expect(puts[0].init.headers).toEqual({ "content-type": "image/jpeg", "cache-control": "max-age=31536000", "x-upsert": "false" });
  });
  it("config_missing (bloc has no public key) → the Hebrew sentence, 503, no PUT", async () => {
    blocAnswer = fail(503, "config_missing");
    const r: any = await UPLOAD(fileReq(JPEG));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe("ההעלאה לא זמינה כרגע — חסרה הגדרה ב-bloc. התמונה לא הועלתה.");
    expect(puts).toHaveLength(0);
  });
  it("the type is the bytes', not the name's: a PNG named .jpg goes as image/png", async () => {
    await UPLOAD(fileReq(PNG, "photo.jpg", "image/jpeg"));
    expect(calls[0].payload.type).toBe("image/png");
    expect(puts[0].init.headers["content-type"]).toBe("image/png");
  });
  it("an SVG named .jpg is refused here (415) — bloc is never asked", async () => {
    const r: any = await UPLOAD(fileReq(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"), "x.jpg", "image/jpeg"));
    expect(r.status).toBe(415);
    expect((await r.json()).error).toBe("אפשר להעלות רק JPEG, PNG או WebP.");
    expect(calls).toHaveLength(0);
    expect(puts).toHaveLength(0);
  });
  it("over 2MB — 413; no file — 400; empty — 400; nothing sent anywhere", async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1); big.set(JPEG);
    const r1: any = await UPLOAD(fileReq(big));
    expect(r1.status).toBe(413);
    expect((await r1.json()).error).toBe("התמונה גדולה מ-2MB. הקטינו אותה ונסו שוב.");
    const r2: any = await UPLOAD(fileReq(null));
    expect([r2.status, (await r2.json()).error]).toEqual([400, "בחרו קובץ תמונה"]);
    const r3: any = await UPLOAD(fileReq(new Uint8Array(0)));
    expect([r3.status, (await r3.json()).error]).toEqual([400, "הקובץ ריק"]);
    expect(calls).toHaveLength(0);
    expect(puts).toHaveLength(0);
  });
  it("exactly 2MB is accepted", async () => {
    const max = new Uint8Array(2 * 1024 * 1024); max.set(JPEG);
    const r: any = await UPLOAD(fileReq(max));
    expect(r.status).toBe(200);
    expect(calls[0].payload.bytes).toBe(2 * 1024 * 1024);
  });
  it("the PUT fails (rejected / network / timeout) → \"ההעלאה נכשלה. נסו שוב.\", no URL, nothing logged as uploaded", async () => {
    for (const [answer, code] of [[{ status: 400 }, "put_rejected"], [{ status: 403 }, "put_rejected"], ["throw", "put_network"], ["abort", "put_timeout"]] as const) {
      audits.length = 0;
      putAnswer = answer;
      const r: any = await UPLOAD(fileReq(JPEG));
      expect(r.status, code).toBe(502);
      expect(await r.json(), code).toEqual({ error: UPLOAD_FAILED_TEXT, code });
      expect(audits, code).toEqual([]);
    }
    expect(UPLOAD_FAILED_TEXT).toBe("ההעלאה נכשלה. נסו שוב.");
  });
  it("bloc refuses or is not set up → Hebrew, nothing PUT, logged as a refused bloc action", async () => {
    const cases: Array<[any, number, string, string]> = [
      [fail(503, "sql_missing"), 503, ADS_SQL_MISSING, "BLOC_ACTION_FAILED"],
      [fail(403, "forbidden"), 403, ADS_FORBIDDEN_TEXT, "BLOC_ACTION_FAILED"],
      [fail(400, "invalid"), 400, UPLOAD_INVALID_TEXT, "BLOC_ACTION_FAILED"],
      [fail(503, "write_failed"), 503, UPLOAD_FAILED_TEXT, "BLOC_ACTION_FAILED"],
      [fail(500, "failed"), 500, UPLOAD_FAILED_TEXT, "BLOC_ACTION_UNKNOWN"],
      [fail(503, "NOT_CONFIGURED", "החיבור ל-bloc לא מוגדר"), 503, "החיבור ל-bloc לא מוגדר", "BLOC_ACTION_FAILED"],
    ];
    for (const [answer, status, text, audit] of cases) {
      audits.length = 0; puts.length = 0;
      blocAnswer = answer;
      const r: any = await UPLOAD(fileReq(JPEG));
      expect(r.status, answer.code).toBe(status);
      expect((await r.json()).error, answer.code).toBe(text);
      expect(puts, answer.code).toHaveLength(0);
      expect(audits.map((a) => a[1]), answer.code).toEqual([audit]);
      expect(audits[0][4], answer.code).toMatchObject({ action: "AD_IMAGE_UPLOAD", code: answer.code, bytes: JPEG.length, type: "image/jpeg" });
    }
  });
  it("bloc did not answer in time / network — the image was not uploaded (no \"maybe done\"): try again", async () => {
    for (const code of ["TIMEOUT", "NETWORK"]) {
      blocAnswer = fail(504, code, "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב.");
      const r: any = await UPLOAD(fileReq(JPEG));
      expect(await r.json(), code).toEqual({ error: UPLOAD_NO_ANSWER_TEXT, code });
    }
    expect(UPLOAD_NO_ANSWER_TEXT).not.toContain("ייתכן");
    expect(puts).toHaveLength(0);
  });
  it("an unclear URL answer (no ok, no signed URL, http, another bucket) → 502 bad_shape, nothing PUT", async () => {
    const bad = [
      { ok: true, status: 200, data: {} },
      okUrl({ ok: undefined }),
      okUrl({ signed_url: "" }),
      okUrl({ signed_url: SIGNED.replace("https:", "http:") }),
      okUrl({ public_url: PUBLIC.replace("/public/ads/", "/public/avatars/") }),
      okUrl({ public_url: 42 }),
      okUrl({ path: "" }),
    ];
    for (const answer of bad) {
      audits.length = 0; puts.length = 0;
      blocAnswer = answer;
      const r: any = await UPLOAD(fileReq(JPEG));
      expect(r.status, JSON.stringify(answer.data)).toBe(502);
      expect(await r.json()).toEqual({ error: UPLOAD_BAD_SHAPE_TEXT, code: "bad_shape" });
      expect(puts).toHaveLength(0);
      expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_UNKNOWN"]);
    }
  });
});

describe("GET /api/ads/report", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const get = (q: string): any => ({ url: `https://panel.example/api/ads/report?${q}`, headers: { get: () => null } });
  beforeEach(() => {
    rows = {
      ad_campaigns: { data: { id: ID, name: "פיצה סתיו", starts_on: "2026-10-01", ends_on: "2026-10-30", contract_id: "k1" }, error: null },
      ad_contracts: { data: { id: "k1", reference: "K-7", pricing: "cpm", price_ils: 50, advertiser_id: "adv1" }, error: null },
      ad_creatives: { data: [{ id: "c1", headline: "פיצה ב-49" }], error: null },
      ad_advertisers: { data: { name: "פיצה השכונה" }, error: null },
    };
    rpcResult = { data: { totals: { serves: 10, views: 8, clicks: 1, closes: 6, reach: 7 }, days: [{ day: "2026-10-12", serves: 10, views: 8, clicks: 1, closes: 6, reach: 7 }], creatives: [{ creative_id: "c1", serves: 10, views: 8, clicks: 1, closes: 6 }], screens: [{ screen: "home", views: 8, clicks: 1 }], cities: [{ city: "חיפה", views: 8, clicks: 1 }] }, error: null };
  });
  it("ads.read; JSON with the advertiser, campaign and numbers", async () => {
    const r: any = await REPORT(get(`campaign=${ID}`));
    expect(guardArgs[0]).toEqual({ permission: "ads.read" });
    const body = await r.json();
    expect(body.advertiser).toBe("פיצה השכונה");
    expect(body.report.totals).toEqual({ serves: 10, views: 8, clicks: 1, closes: 6, reach: 7 });
    expect(audits).toHaveLength(0);
  });
  it("CSV: attachment with a Hebrew-safe name, aggregates only, logged", async () => {
    const r: any = await REPORT(get(`campaign=${ID}&format=csv`));
    expect(r.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("Content-Disposition")).toContain("filename*=UTF-8''bloc-ad-report-");
    const text = await r.text();
    expect(text).toContain("פיצה השכונה");
    expect(text).toContain("פיצה ב-49");
    expect(text).toContain("חיפה");
    expect(audits[0][1]).toBe("AD_REPORT_EXPORT");
  });
  it("a bad id is 400; an unknown campaign 404; SQL 175 missing 503", async () => {
    expect((await REPORT(get("campaign=x")) as any).status).toBe(400);
    rows.ad_campaigns = { data: null, error: null };
    expect((await REPORT(get(`campaign=${ID}`)) as any).status).toBe(404);
    rows.ad_campaigns = { data: null, error: { code: "42P01", message: "relation does not exist" } };
    const r: any = await REPORT(get(`campaign=${ID}`));
    expect(r.status).toBe(503);
  });
});

// ── ADS-2א v2: הדוח — הפורמט שייך למודעה: ב-CSV ליד כל מודעה (מ-ad_report אחרי SQL 230, אחרת מהמודעה עצמה); לפני 228 — עמודה ריקה ──
describe("GET /api/ads/report — the format of each creative (ADS-2א v2)", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const get = (q: string): any => ({ url: `https://panel.example/api/ads/report?${q}`, headers: { get: () => null } });
  const camp = { id: ID, name: "פס סתיו", starts_on: "2026-10-01", ends_on: "2026-10-30", contract_id: "k1" };
  const rep = (creatives: unknown[], extra: Record<string, unknown> = {}) => ({ data: { totals: { serves: 4, views: 3, clicks: 1, closes: 0, reach: 3 }, days: [], creatives, screens: [], cities: [], ...extra }, error: null });
  beforeEach(() => {
    rows = {
      ad_campaigns: { data: camp, error: null },
      ad_contracts: { data: { id: "k1", reference: "K-7", pricing: "cpm", price_ils: 50, advertiser_id: "adv1" }, error: null },
      ad_creatives: { data: [{ id: "c1", headline: "פס" }, { id: "c2", headline: "חלון", format: "dialog" }], error: null },
      ad_advertisers: { data: { name: "פיצה השכונה" }, error: null },
    };
    rpcResult = rep([{ creative_id: "c1", serves: 2, views: 2, clicks: 1, closes: 0 }, { creative_id: "c2", serves: 2, views: 1, clicks: 0, closes: 0 }]);
  });
  it("the campaign as before (no targeting, no format); the creatives read with \"*\" (format exists only after SQL 228)", async () => {
    const body = await (await REPORT(get(`campaign=${ID}`)) as any).json();
    expect(body.campaign).toEqual(camp);
    expect(body.report).not.toHaveProperty("format");
  });
  it("CSV: the creative's format in the third column — from the creative itself (before the report has it); unknown — empty", async () => {
    const csv = await (await REPORT(get(`campaign=${ID}&format=csv`)) as any).text();
    expect(csv).toContain("\r\nפרסומת,חשיפות,פורמט,הקלקות,CTR,סגירות\r\n");
    expect(csv).toContain("\r\nפס,2,,1,");
    expect(csv).toContain("\r\nחלון,1,חלון קופץ,0,");
  });
  it("CSV: ad_report's own format (SQL 230) wins over the creative's; the frozen reach note under the totals", async () => {
    rpcResult = rep([{ creative_id: "c1", serves: 2, views: 2, clicks: 1, closes: 0, format: "banner" }, { creative_id: "c2", serves: 2, views: 1, clicks: 0, closes: 0, format: "native" }], { reach_frozen_at: "2027-01-12T03:00:00Z" });
    const csv = await (await REPORT(get(`campaign=${ID}&format=csv`)) as any).text();
    expect(csv).toContain("\r\nפס,2,פס,1,");
    expect(csv).toContain("\r\nחלון,1,כרטיס ברשימה,0,");
    expect(csv).toContain("נכון ל-12.01.2027");
  });
  it("CSV: an upper-bound reach (review #7) — the number stays a number, and the why goes under the totals", async () => {
    rpcResult = rep([], { reach_upper_bound: true });
    const csv = await (await REPORT(get(`campaign=${ID}&format=csv`)) as any).text();
    expect(csv).toContain("לכל היותר");
    expect(csv).toContain("נספר פעמיים");
    rpcResult = rep([]);
    expect(await (await REPORT(get(`campaign=${ID}&format=csv`)) as any).text()).not.toContain("לכל היותר");
  });
  it("a junk format on the creative row is ignored (never printed raw)", async () => {
    rows.ad_creatives = { data: [{ id: "c1", headline: "פס", format: "popup" }], error: null };
    rpcResult = rep([{ creative_id: "c1", serves: 2, views: 2, clicks: 1, closes: 0 }]);
    const csv = await (await REPORT(get(`campaign=${ID}&format=csv`)) as any).text();
    expect(csv).toContain("\r\nפס,2,,1,");
    expect(csv).not.toContain("popup");
  });
});
