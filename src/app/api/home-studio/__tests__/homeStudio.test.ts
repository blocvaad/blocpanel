// bloc HOME-STUDIO-1 (החלטות 684–694): /api/home-studio ו-/api/home-studio/upload בפאנל — דרך bloc החתום בלבד.
//   • GET: home_studio.read; no-store; לפני SQL 256 — 503 missing; כשל — 502 עם המשפט (לא "אין כרטיסים"); צורה לא מוכרת — 502.
//   • POST: קריאה (card.stats) — גם צופה; כל כתיבה — home_studio.manage, נבדק לפני bloc; bloc מקבל את איש הצוות ואת הפעולה כמו שהיא.
//   • הצלחה רק בצורה המוכרת; ביומן הפאנל — בלי תוכן (שם, טקסט, תמונה); כשל — BLOC_ACTION_FAILED / UNKNOWN והמשפט, עם השדה.
//   • המתג: שורה ביומן רק כשמשהו השתנה. העלאה: כמו הפרסומות — רק נתיב studio/ של הבאקט 'ads'.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

let guardResult: any;
let guardArgs: any[] = [];
const calls: Array<{ path: string; payload: any }> = [];
const audits: any[][] = [];
let blocAnswer: any;
const puts: Array<{ url: string; init: any }> = [];
let putAnswer: any;

vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("no direct db"); }, storage: { from: () => { throw new Error("no direct storage"); } } } }));

import { GET, POST } from "../route";
import { POST as UPLOAD } from "../upload/route";

const C1 = "c1000000-0000-4000-8000-000000000001";
const U1 = "d1000000-0000-4000-8000-000000000001";
const as = (role: string) => ({ id: "44444444-4444-4444-8444-444444444444", email: "tal@bloc.co.il", full_name: "טל", role, auth_level: "mfa" });
const req = (body: any): any => ({ json: async () => body, headers: { get: () => "1.2.3.4, 5.6.7.8" } });
const CARD = {
  id: C1, name: "באנר", shape: "banner", slot: "after_tiles", position: 0, source: "manual",
  content: { title: null, subtitle: null, style: "soft", countdown: false, items: [{ id: "a1", title: "שלום טל הסוד", body: null, image_url: null, image_alt: null, icon: null, accent: "brand", link: null, cta: null, badge: null }] },
  audience: { roles: ["tenant"], cities: [], plans: [], new_days: null, rollout: 100 }, starts_at: null, ends_at: null, frequency: "until_closed", status: "draft",
  test_emails: [], version: 2, created_by: "team@bloc.co.il", updated_by: null, created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z", published_at: null,
};
const UPD = { id: U1, title: "חדש", body: "משהו חדש", image_url: null, link: null, roles: ["tenant"], status: "draft", version: 1, created_by: "x@bloc.co.il", updated_by: null, created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z", published_at: null };
const SAVE = { action: "card.save", name: "באנר", shape: "banner", slot: "after_tiles", position: 0, source: "manual", content: CARD.content, audience: CARD.audience, starts_at: null, ends_at: null, frequency: "until_closed" };
const ok = (data: Record<string, unknown>) => ({ ok: true, status: 200, data: { ok: true, ...data } });
const fail = (status: number, code?: string, data?: Record<string, unknown>) => ({ ok: false, status, code, error: code ?? "x", ...(data ? { data } : {}) });

beforeEach(() => {
  guardResult = { ok: true, session: as("admin") };
  guardArgs = []; calls.length = 0; audits.length = 0; puts.length = 0;
  blocAnswer = ok({ enabled: true, cards: [CARD], updates: [UPD], totals: { [C1]: { views: 5, taps: 1, closes: 0, swipes: 0, ends: 0 } } });
});

describe("GET /api/home-studio", () => {
  it("home_studio.read; no-store; the list as parsed; missing / failure / a bad shape — never an empty list", async () => {
    let res: any = await GET();
    expect(guardArgs[0]).toEqual({ permission: "home_studio.read" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ state: "ok", enabled: true, unknown: 0, totals: { [C1]: { views: 5 } } });
    expect(body.cards.map((c: any) => c.id)).toEqual([C1]);
    expect(calls).toEqual([{ path: "/api/internal/home-studio", payload: { actor: { id: as("admin").id, email: "tal@bloc.co.il", role: "admin" }, action: "list" } }]);
    blocAnswer = fail(503, "sql_missing");
    res = await GET();
    expect([res.status, (await res.json()).state]).toEqual([503, "missing"]);
    blocAnswer = fail(503, "read_failed");
    res = await GET();
    expect([res.status, (await res.json()).message]).toEqual([502, "bloc לא הצליח לקרוא כרגע. נסו שוב בעוד רגע."]);
    blocAnswer = ok({ enabled: true, cards: "nope", updates: [], totals: {} });
    res = await GET();
    expect(res.status).toBe(502);
    expect((await res.json()).message).toMatch(/לא בצורה המוכרת/);
  });
  it("stopped by the guard → no bloc call", async () => {
    guardResult = { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: 403 }) };
    expect(((await GET()) as any).status).toBe(403);
    expect(calls).toEqual([]);
  });
});

describe("POST /api/home-studio — who", () => {
  it("a viewer may read the stats; every write → 403 before bloc", async () => {
    guardResult = { ok: true, session: as("viewer") };
    blocAnswer = ok({ days: [{ day: "2026-11-24", views: 3, taps: 1, closes: 0, swipes: 0, ends: 0 }] });
    const s: any = await POST(req({ action: "card.stats", id: C1 }));
    expect(s.status).toBe(200);
    expect((await s.json()).days).toHaveLength(1);
    expect(guardArgs[0]).toEqual({ permission: "home_studio.read" });
    calls.length = 0;
    for (const body of [SAVE, { action: "card.duplicate", id: C1 }, { action: "card.status", id: C1, version: 2, status: "live" },
      { action: "update.save", title: "t", body: "b", image_url: null, link: null, roles: ["tenant"] }, { action: "update.status", id: U1, version: 1, status: "live" }, { action: "switch", enabled: false }]) {
      const r: any = await POST(req(body));
      expect([body.action, r.status]).toEqual([body.action, 403]);
    }
    expect(calls).toEqual([]);
    expect(audits).toEqual([]);
  });
  it("a bad body (unknown action / field / enum, the bloc-only actions) → 400 before bloc", async () => {
    for (const body of [{ action: "nuke" }, { ...SAVE, extra: 1 }, { ...SAVE, shape: "square" }, { action: "list" }, { action: "image.upload_url", type: "image/png", bytes: 3 }, { action: "card.stats", id: "x" }]) {
      const r: any = await POST(req(body));
      expect([body.action, r.status]).toEqual([body.action, 400]);
    }
    expect(calls).toEqual([]);
  });
});

describe("POST /api/home-studio — what", () => {
  it("card.save: the actor and the fields as they are; the card back; the log — without the content", async () => {
    blocAnswer = ok({ card: CARD, created: true });
    const r: any = await POST(req(SAVE));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, action: "card.save", created: true, card: { id: C1, version: 2 } });
    const { action, ...rest } = SAVE;
    expect(calls).toEqual([{ path: "/api/internal/home-studio", payload: { actor: { id: as("admin").id, email: "tal@bloc.co.il", role: "admin" }, action, ...rest } }]);
    expect(audits).toHaveLength(1);
    expect(audits[0].slice(1)).toEqual(["HOME_CARD_SAVE", "home_card", C1, { created: true, shape: "banner", slot: "after_tiles", source: "manual" }, "1.2.3.4"]);
    expect(JSON.stringify(audits)).not.toContain("שלום טל");
  });
  it("card.status to test: the emails go to bloc, only their count to the log; duplicate; update.save; switch (logged only when changed)", async () => {
    blocAnswer = ok({ card: { ...CARD, status: "test", test_emails: ["tal@bloc.co.il"], version: 3 } });
    let r: any = await POST(req({ action: "card.status", id: C1, version: 2, status: "test", test_emails: ["tal@bloc.co.il"] }));
    expect((await r.json()).card.status).toBe("test");
    expect(calls[0].payload).toMatchObject({ action: "card.status", id: C1, version: 2, status: "test", test_emails: ["tal@bloc.co.il"] });
    expect(audits[0].slice(1, 5)).toEqual(["HOME_CARD_STATUS", "home_card", C1, { to: "test", testers: 1 }]);
    blocAnswer = ok({ card: { ...CARD, id: "c1000000-0000-4000-8000-000000000009", name: "באנר (עותק)", version: 1 } });
    r = await POST(req({ action: "card.duplicate", id: C1 }));
    expect((await r.json()).card.name).toBe("באנר (עותק)");
    expect(audits[1].slice(1, 5)).toEqual(["HOME_CARD_DUPLICATE", "home_card", C1, { copy_of: C1 }]);
    blocAnswer = ok({ update: UPD, created: true });
    r = await POST(req({ action: "update.save", title: "חדש", body: "משהו חדש", image_url: null, link: { kind: "route", path: "/chat" }, roles: ["tenant"] }));
    expect(await r.json()).toMatchObject({ ok: true, created: true, update: { id: U1 } });
    expect(audits[2].slice(1, 5)).toEqual(["BLOC_UPDATE_SAVE", "bloc_update", U1, { created: true, roles: ["tenant"] }]);
    blocAnswer = ok({ enabled: false, changed: false });
    r = await POST(req({ action: "switch", enabled: false }));
    expect(await r.json()).toEqual({ ok: true, action: "switch", enabled: false, changed: false });
    expect(audits).toHaveLength(3);
    blocAnswer = ok({ enabled: false, changed: true });
    await POST(req({ action: "switch", enabled: false }));
    expect(audits[3].slice(1, 5)).toEqual(["HOME_STUDIO_SWITCH", "home_studio", undefined, { enabled: false, changed: true }]);
  });
  it("a refusal: the Hebrew sentence with the field, BLOC_ACTION_FAILED; a timeout: maybe done → BLOC_ACTION_UNKNOWN", async () => {
    blocAnswer = fail(400, "item_empty", { error: "item_empty", code: "item_empty", field: "content.items.0" });
    let r: any = await POST(req(SAVE));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "פריט 1: צריך תמונה או כותרת.", code: "item_empty", field: "content.items.0" });
    expect(audits[0].slice(1, 3)).toEqual(["BLOC_ACTION_FAILED", "home_card"]);
    expect(audits[0][4]).toMatchObject({ action: "HOME_CARD_SAVE", outcome: "failed", code: "item_empty" });
    blocAnswer = fail(504, "TIMEOUT");
    r = await POST(req({ action: "card.status", id: C1, version: 2, status: "live" }));
    expect(await r.json()).toMatchObject({ code: "TIMEOUT", error: "לא ברור אם הפעולה בוצעה. רעננו את הדף לפני שמנסים שוב." });
    expect(audits[1].slice(1, 4)).toEqual(["BLOC_ACTION_UNKNOWN", "home_card", C1]);
    blocAnswer = fail(409, "changed");
    r = await POST(req({ action: "card.status", id: C1, version: 1, status: "live" }));
    expect([r.status, (await r.json()).error]).toEqual([409, "מישהו אחר שמר שינוי בינתיים. רעננו את הדף, ואז ערכו שוב."]);
  });
  it("ok but not the known shape → 502 'not clear', logged as unknown (writes); the stats read → 'not known', no log", async () => {
    blocAnswer = ok({ card: { id: C1 } });
    let r: any = await POST(req(SAVE));
    expect([r.status, (await r.json()).code]).toEqual([502, "bad_shape"]);
    expect(audits[0].slice(1, 3)).toEqual(["BLOC_ACTION_UNKNOWN", "home_card"]);
    blocAnswer = ok({ days: "x" });
    r = await POST(req({ action: "card.stats", id: C1 }));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/לא בצורה המוכרת/);
    expect(audits).toHaveLength(1);
    blocAnswer = fail(503, "read_failed");
    r = await POST(req({ action: "card.stats", id: C1 }));
    expect([r.status, (await r.json()).error]).toEqual([503, "bloc לא הצליח לקרוא כרגע. נסו שוב בעוד רגע."]);
    expect(audits).toHaveLength(1);
  });
});

describe("POST /api/home-studio/upload — like the ads: bloc's signed URL, then a PUT, only under studio/", () => {
  const PATH = "studio/2026-11/0b0c9d8e-7f6a-4b5c-8d9e-0f1a2b3c4d5e.png";
  const SIGNED = `https://test.supabase.co/storage/v1/object/upload/sign/ads/${PATH}?token=tok`;
  const PUBLIC = `https://test.supabase.co/storage/v1/object/public/ads/${PATH}`;
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const fileReq = (bytes: Uint8Array | null): any => ({ headers: { get: () => null }, formData: async () => { const fd = new FormData(); if (bytes) fd.append("file", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "a.png"); return fd; } });
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    putAnswer = { status: 200 };
    blocAnswer = ok({ path: PATH, token: "tok", signed_url: SIGNED, public_url: PUBLIC, anon_key: "anon" });
    globalThis.fetch = (async (url: any, init: any) => { puts.push({ url: String(url), init }); return new Response("{}", { status: putAnswer.status }); }) as any;
  });
  afterAll(() => { globalThis.fetch = realFetch; });

  it("home_studio.manage; the type from the bytes; the PUT to the signed URL; the public URL back; logged", async () => {
    const r: any = await UPLOAD(fileReq(PNG));
    expect(guardArgs[0]).toEqual({ permission: "home_studio.manage" });
    expect(await r.json()).toEqual({ ok: true, url: PUBLIC });
    expect(calls).toEqual([{ path: "/api/internal/home-studio", payload: { actor: { id: as("admin").id, email: "tal@bloc.co.il", role: "admin" }, action: "image.upload_url", type: "image/png", bytes: PNG.length } }]);
    expect(puts.map((p) => [p.url, p.init.method])).toEqual([[SIGNED, "PUT"]]);
    expect(audits[0].slice(1, 5)).toEqual(["HOME_STUDIO_IMAGE", "home_studio_image", PATH, { bytes: PNG.length, type: "image/png" }]);
  });
  it("a path outside studio/ (an ad's place) → refused as a bad shape, no PUT", async () => {
    const ad = "creatives/2026-11/x.png";
    blocAnswer = ok({ path: ad, token: "tok", signed_url: SIGNED.replace(PATH, ad), public_url: PUBLIC.replace(PATH, ad), anon_key: "anon" });
    const r: any = await UPLOAD(fileReq(PNG));
    expect([r.status, (await r.json()).code]).toEqual([502, "bad_shape"]);
    expect(puts).toEqual([]);
    expect(audits[0].slice(1, 3)).toEqual(["BLOC_ACTION_UNKNOWN", "home_studio_image"]);
  });
  it("not an image / no file → refused before bloc; the PUT failed → nothing saved, said", async () => {
    expect(((await UPLOAD(fileReq(new Uint8Array([1, 2, 3])))) as any).status).toBe(415);
    expect(((await UPLOAD(fileReq(null))) as any).status).toBe(400);
    expect(calls).toEqual([]);
    putAnswer = { status: 400 };
    const r: any = await UPLOAD(fileReq(PNG));
    expect([r.status, (await r.json()).error]).toEqual([502, "ההעלאה נכשלה. נסו שוב."]);
    expect(audits.filter((a) => a[1] === "HOME_STUDIO_IMAGE")).toEqual([]);
  });
});
