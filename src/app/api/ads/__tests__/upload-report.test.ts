// /api/ads/upload ו-/api/ads/report (bloc ADS-1): תמונה לפי הבייטים עד 2MB לבאקט 'ads'; הדוח למפרסם —
// מספרים מצטברים בלבד, CSV עם שם קובץ, ביומן.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let guardArgs: any[] = [];
const audits: any[][] = [];
const uploads: any[] = [];
let uploadError: any = null;
let rows: Record<string, any> = {};
let rpcResult: any = { data: null, error: null };

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
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (t: string) => builder(t),
    rpc: async () => rpcResult,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: any, opts: any) => { uploads.push({ bucket, path, body, opts }); return { error: uploadError }; },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
      }),
    },
  },
}));

import { POST as UPLOAD } from "../upload/route";
import { GET as REPORT } from "../report/route";

const SESSION = { id: "a1", email: "tal@bloc.co.il", role: "admin" };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const fileReq = (bytes: Uint8Array | null, name = "a.jpg", type = "image/jpeg"): any => ({
  headers: { get: () => null },
  formData: async () => {
    const fd = new FormData();
    if (bytes) fd.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
    return fd;
  },
});

beforeEach(() => {
  guardResult = { ok: true, session: SESSION };
  guardArgs = []; audits.length = 0; uploads.length = 0; uploadError = null; rows = {}; rpcResult = { data: null, error: null };
});

describe("POST /api/ads/upload", () => {
  it("ads.manage; a JPEG goes to the ads bucket under the month, with a random name; the public URL back; logged", async () => {
    const r: any = await UPLOAD(fileReq(JPEG));
    expect(guardArgs[0]).toEqual({ permission: "ads.manage" });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe("ads");
    expect(uploads[0].path).toMatch(/^creatives\/\d{4}-\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(uploads[0].opts).toEqual({ contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    expect(body.url).toBe(`https://x.supabase.co/storage/v1/object/public/ads/${uploads[0].path}`);
    expect(audits[0][1]).toBe("AD_IMAGE_UPLOAD");
  });
  it("the type is the bytes', not the name's: an SVG named .jpg is refused (415)", async () => {
    const r: any = await UPLOAD(fileReq(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"), "x.jpg", "image/jpeg"));
    expect(r.status).toBe(415);
    expect((await r.json()).error).toBe("אפשר להעלות רק JPEG, PNG או WebP.");
    expect(uploads).toHaveLength(0);
  });
  it("over 2MB — 413; no file — 400; empty — 400", async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1); big.set(JPEG);
    expect((await UPLOAD(fileReq(big)) as any).status).toBe(413);
    expect((await UPLOAD(fileReq(null)) as any).status).toBe(400);
    expect((await UPLOAD(fileReq(new Uint8Array(0))) as any).status).toBe(400);
    expect(uploads).toHaveLength(0);
  });
  it("the bucket is missing (SQL 175 not run) — 503 that says so", async () => {
    uploadError = { message: "Bucket not found" };
    const r: any = await UPLOAD(fileReq(JPEG));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("SQL 175");
    expect(audits).toHaveLength(0);
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
