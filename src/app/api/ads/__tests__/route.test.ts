// /api/ads — PANEL-PAY א2ב (החלטה 371, C3): ads.manage והסכמה (משפט בעברית) כאן; הכתיבה ב-bloc (/api/internal/ads), חתומה, עם
// השחקן מהסשן. הפאנל לא נוגע בטבלאות ad_*; כל קוד של bloc בעברית (המשפטים שהפאנל הציג עד עכשיו); הצלחה רק עם ok === true
// והמזהה; תשובה לא ברורה — "ייתכן שבוצע", לא הצלחה; היומן של הפאנל (AD_* / BLOC_ACTION_FAILED / BLOC_ACTION_UNKNOWN).
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ADS_FORBIDDEN_TEXT, ADS_NETWORK_TEXT, ADS_UNKNOWN_TEXT, AD_ACTIONS, CAMPAIGN_STATUS_TEXT, CHECK_FAILED_TEXT, IN_USE_SAVE_TEXT,
  IN_USE_TEXT, LOCKED_OTHER_TEXT, LOCKED_TEXT,
} from "@/lib/adsActions";
import { READ_FAILED_TEXT, INVALID_TEXT, UNEXPECTED_TEXT, BAD_SHAPE_TEXT } from "@/lib/moneyActions";
import { ADS_SQL_MISSING } from "@/lib/ads";
import { IMAGE_NOT_OURS_TEXT } from "@/lib/adsUi";

let guardResult: any;
let guardArgs: any[] = [];
const audits: any[][] = [];
const calls: Array<{ path: string; payload: any }> = [];
let blocAnswer: any;
const touched: string[] = [];

vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (t: string) => { touched.push(t); throw new Error(`the panel must not touch ${t} in /api/ads`); },
    rpc: (n: string) => { touched.push(n); throw new Error("no rpc in /api/ads"); },
    storage: { from: () => { throw new Error("no storage in /api/ads"); } },
  },
}));

import { POST } from "../route";

const ID = "11111111-1111-4111-8111-111111111111";
const K = "22222222-2222-4222-8222-222222222222";
const NEW = "33333333-3333-4333-8333-333333333333";
const SESSION = { id: "a1", email: "tal@bloc.co.il", full_name: "טל", role: "admin", auth_level: "mfa" };
const ACTOR = { id: "a1", email: "tal@bloc.co.il", role: "admin" };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const post = async (body: any) => { const r: any = await POST(req(body)); return { status: r.status, body: await r.json() }; };
const ok = (data: any) => ({ ok: true, status: 200, data });
const fail = (status: number, code?: string, data?: any, error = code ?? "x") => ({ ok: false, status, code, error, ...(data ? { data } : {}) });

const ADV = { action: "advertiser.save", name: "פיצה השכונה", business_id: "51-400000-1" };
const CONTRACT = { action: "contract.save", advertiser_id: ID, pricing: "cpm", price_ils: 49.999, starts_on: "2026-10-01", ends_on: "2026-12-31" };
const CAMPAIGN = {
  action: "campaign.save", contract_id: K, name: "פיצה סתיו", starts_on: "2026-10-13", ends_on: "2026-11-12",
  days: [4, 0, 1, 1], hour_from: 8, hour_to: 22, screens: ["home"], goal_views: 10000, daily_cap: null,
  per_user_cap: 3, plans: ["free", "building"], roles: ["tenant"], cities: [], building_ids: [], weight: 1,
};
const CREATIVE = {
  action: "creative.save", campaign_id: ID, image_url: "https://test.supabase.co/storage/v1/object/public/ads/creatives/2026-11/a.webp",
  image_alt: "פיצה", headline: "פיצה ב-49", cta_label: "להזמנה", cta_url: "https://pizza.example",
};
/** one valid body per action (the ids are the target) */
const BODY: Record<string, any> = {
  "advertiser.save": ADV,
  "advertiser.archive": { action: "advertiser.archive", id: ID, archived: true },
  "advertiser.delete": { action: "advertiser.delete", id: ID },
  "contract.save": CONTRACT,
  "contract.delete": { action: "contract.delete", id: K },
  "campaign.save": CAMPAIGN,
  "campaign.status": { action: "campaign.status", id: ID, status: "active" },
  "campaign.duplicate": { action: "campaign.duplicate", id: ID },
  "campaign.delete": { action: "campaign.delete", id: ID },
  "creative.save": CREATIVE,
  "creative.active": { action: "creative.active", id: ID, active: false },
  "creative.delete": { action: "creative.delete", id: ID },
  "settings.save": { action: "settings.save", enabled: false },
};

beforeEach(() => {
  guardResult = { ok: true, session: SESSION };
  guardArgs = []; audits.length = 0; calls.length = 0; touched.length = 0;
  blocAnswer = ok({ ok: true, id: NEW });
});

describe("POST /api/ads — access and the body, before bloc", () => {
  it("asks for ads.manage; a refusal sends nothing and logs nothing", async () => {
    await post(ADV);
    expect(guardArgs[0]).toEqual({ permission: "ads.manage" });
    guardResult = { ok: false, response: { status: 403, json: async () => ({ error: "אין הרשאה" }) } };
    calls.length = 0; audits.length = 0;
    const r: any = await POST(req(ADV));
    expect(r.status).toBe(403);
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("an invalid body is 400 in Hebrew (the panel's own schema); bloc is never asked", async () => {
    const r = await post({ action: "advertiser.save", name: "א" });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("לפחות 2");
    const r2 = await post({ ...CREATIVE, cta_url: "http://pizza.example" });
    expect(r2.status).toBe(400);
    expect(r2.body.error).toContain("https://");
    const r3 = await post({ action: "nope", id: ID });
    expect(r3.status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
});

describe("one signed request per action, with the session's actor and the panel's parsed fields", () => {
  it("advertiser.save: the actor from the session (id, email, role — nothing else), the cleaned fields; no created_by from the panel", async () => {
    const r = await post(ADV);
    expect(r).toEqual({ status: 200, body: { ok: true, id: NEW } });
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/api/internal/ads");
    expect(calls[0].payload).toEqual({
      actor: ACTOR, action: "advertiser.save", name: "פיצה השכונה", legal_name: null, business_id: "514000001",
      contact_name: null, contact_phone: null, contact_email: null, website: null, notes: null,
    });
    expect(touched).toEqual([]);
  });
  it("contract.save: the price rounded to agorot, the status default and the empty cap — as the panel parsed them", async () => {
    await post(CONTRACT);
    expect(calls[0].payload).toMatchObject({ action: "contract.save", pricing: "cpm", price_ils: 50, status: "draft", impression_cap: null, reference: null });
    expect(calls[0].payload).not.toHaveProperty("id");
    expect(calls[0].payload).not.toHaveProperty("created_by");
  });
  it("campaign.save: days deduped and sorted; settings: emails lowercased", async () => {
    await post(CAMPAIGN);
    expect(calls[0].payload.days).toEqual([0, 1, 4]);
    blocAnswer = ok({ ok: true });
    await post({ action: "settings.save", tester_emails: ["TAL@Example.com"], excluded_buildings: [ID, ID] });
    expect(calls[1].payload).toEqual({ actor: ACTOR, action: "settings.save", tester_emails: ["tal@example.com"], excluded_buildings: [ID, ID] });
  });
  it("every action of the screen goes to the same path, with its own action name", async () => {
    for (const [action, body] of Object.entries(BODY)) {
      calls.length = 0;
      blocAnswer = ok(action === "campaign.duplicate" ? { ok: true, id: NEW, creatives: "ok" } : AD_ACTIONS[action as keyof typeof AD_ACTIONS].kind === "save" ? { ok: true, id: body.id ?? NEW } : { ok: true });
      const r = await post(body);
      expect(r.status, action).toBe(200);
      expect(calls.map((c) => [c.path, c.payload.action, c.payload.actor]), action).toEqual([["/api/internal/ads", action, ACTOR]]);
    }
    expect(touched).toEqual([]);
  });
});

describe("success only with ok === true and the expected shape", () => {
  it("a new advertiser: the id from bloc; the panel's log AD_ADVERTISER_SAVE with the name", async () => {
    await post(ADV);
    expect(audits).toHaveLength(1);
    expect(audits[0].slice(1, 4)).toEqual(["AD_ADVERTISER_SAVE", "ad_advertiser", NEW]);
    expect(audits[0][4]).toEqual({ name: "פיצה השכונה", created: true });
  });
  it("an edit answers with the same id; another id, a missing id, a non-uuid id or no ok → 502 bad_shape, BLOC_ACTION_UNKNOWN", async () => {
    blocAnswer = ok({ ok: true, id: ID });
    expect((await post({ ...ADV, id: ID })).body).toEqual({ ok: true, id: ID });
    expect(audits[0][4]).toEqual({ name: "פיצה השכונה", created: false });
    for (const data of [{ ok: true, id: NEW }, { ok: true }, { ok: true, id: "abc" }, { id: ID }, { ok: "true", id: ID }, {}]) {
      audits.length = 0;
      blocAnswer = ok(data);
      const r = await post({ ...ADV, id: ID });
      expect(r.status, JSON.stringify(data)).toBe(502);
      expect(r.body).toEqual({ error: BAD_SHAPE_TEXT, code: "bad_shape" });
      expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_UNKNOWN"]);
      expect(audits[0].slice(2, 4)).toEqual(["ad_advertiser", ID]);
      expect(audits[0][4]).toMatchObject({ action: "AD_ADVERTISER_SAVE", outcome: "unknown", code: "bad_shape", name: "פיצה השכונה" });
    }
  });
  it("a create without an id in the answer is never \"saved\"", async () => {
    blocAnswer = ok({ ok: true });
    for (const body of [ADV, CONTRACT, CAMPAIGN, CREATIVE]) {
      const r = await post(body);
      expect(r.status).toBe(502);
      expect(r.body.code).toBe("bad_shape");
    }
  });
  it("archive / status / active / delete / settings: ok === true is enough; anything else is unclear", async () => {
    blocAnswer = ok({ ok: true });
    for (const a of ["advertiser.archive", "advertiser.delete", "contract.delete", "campaign.status", "campaign.delete", "creative.active", "creative.delete", "settings.save"]) {
      expect((await post(BODY[a])).body, a).toEqual({ ok: true });
    }
    blocAnswer = ok({ archived: true });
    expect((await post(BODY["advertiser.archive"])).status).toBe(502);
  });
  it("the log keeps today's facts: archive (archived), status (to), active, settings (counts, on ad_settings 1); names when bloc returns them", async () => {
    blocAnswer = ok({ ok: true, name: "פיצה" });
    await post(BODY["advertiser.archive"]);
    expect(audits[0].slice(1)).toEqual(["AD_ADVERTISER_ARCHIVE", "ad_advertiser", ID, { archived: true, name: "פיצה" }, undefined]);
    blocAnswer = ok({ ok: true, from: "draft", name: "פיצה סתיו" });
    await post(BODY["campaign.status"]);
    expect(audits[1].slice(1, 5)).toEqual(["AD_CAMPAIGN_STATUS", "ad_campaign", ID, { to: "active", from: "draft", name: "פיצה סתיו" }]);
    blocAnswer = ok({ ok: true });
    await post(BODY["creative.active"]);
    expect(audits[2].slice(1, 5)).toEqual(["AD_CREATIVE_ACTIVE", "ad_creative", ID, { active: false }]);
    await post({ action: "settings.save", enabled: true, tester_emails: ["a@b.co"], excluded_buildings: [ID] });
    expect(audits[3].slice(1, 5)).toEqual(["AD_SETTINGS", "ad_settings", "1", { enabled: true, excluded: 1, testers: 1 }]);
    await post(BODY["contract.delete"]);
    expect(audits[4].slice(1, 5)).toEqual(["AD_CONTRACT_DELETE", "ad_contract", K, {}]);
    await post(BODY["creative.delete"]);
    expect(audits[5].slice(1, 4)).toEqual(["AD_CREATIVE_DELETE", "ad_creative", ID]);
  });
  it("an identical status: bloc answers ok without writing — when it says unchanged, the log says so", async () => {
    blocAnswer = ok({ ok: true, unchanged: true });
    expect((await post(BODY["campaign.status"])).body).toEqual({ ok: true });
    expect(audits[0][4]).toEqual({ to: "active", unchanged: true });
    blocAnswer = ok({ ok: true, unchanged: "yes" });
    await post(BODY["campaign.status"]);
    expect(audits[1][4]).toEqual({ to: "active" });
  });
  it("contract / campaign / creative saves log the same money terms, dates and targeting as before (no notes, no contact details)", async () => {
    blocAnswer = ok({ ok: true, id: K });
    await post(CONTRACT);
    expect(audits[0].slice(1, 4)).toEqual(["AD_CONTRACT_SAVE", "ad_contract", K]);
    expect(audits[0][4]).toEqual({ created: true, advertiser_id: ID, pricing: "cpm", price_ils: 50, impression_cap: null, starts_on: "2026-10-01", ends_on: "2026-12-31", status: "draft" });
    blocAnswer = ok({ ok: true, id: NEW });
    await post(CAMPAIGN);
    expect(audits[1][4]).toEqual({ created: true, name: "פיצה סתיו", contract_id: K, starts_on: "2026-10-13", ends_on: "2026-11-12", goal_views: 10000, plans: ["free", "building"], screens: ["home"] });
    await post(CREATIVE);
    expect(audits[2].slice(1, 5)).toEqual(["AD_CREATIVE_SAVE", "ad_creative", NEW, { created: true, campaign_id: ID, headline: "פיצה ב-49" }]);
    await post({ ...ADV, notes: "סוד", contact_phone: "050-0000000", contact_email: "x@y.co" });
    expect(JSON.stringify(audits[3][4])).not.toMatch(/סוד|050|x@y/);
  });
});

describe("campaign.duplicate — a new draft; the creatives' fate is said, never swallowed", () => {
  it("review #6: bloc skipped ads with an outside image → skipped_outside to the screen and the panel log", async () => {
    blocAnswer = ok({ ok: true, id: NEW, creatives: "ok", skipped_outside: 2, name: "x (עותק)", from: ID });
    const r = await post(BODY["campaign.duplicate"]);
    expect(r.body).toEqual({ ok: true, id: NEW, creatives: "ok", skipped_outside: 2 });
    expect(audits.at(-1)?.[4]).toMatchObject({ creatives: "ok", skipped_outside: 2 });
  });
  it("creatives 'ok' → the new id and 'ok'; the log on the new campaign, from the source", async () => {
    blocAnswer = ok({ ok: true, id: NEW, creatives: "ok" });
    const r = await post(BODY["campaign.duplicate"]);
    expect(r).toEqual({ status: 200, body: { ok: true, id: NEW, creatives: "ok" } });
    expect(audits[0].slice(1, 5)).toEqual(["AD_CAMPAIGN_DUPLICATE", "ad_campaign", NEW, { from: ID, creatives: "ok" }]);
  });
  it("creatives 'failed' → said in the answer and the log", async () => {
    blocAnswer = ok({ ok: true, id: NEW, creatives: "failed" });
    expect((await post(BODY["campaign.duplicate"])).body).toEqual({ ok: true, id: NEW, creatives: "failed" });
    expect(audits[0][4]).toEqual({ from: ID, creatives: "failed" });
  });
  it("what the panel sent wins over bloc's answer in the log (from = the source, never bloc's from); bloc's name is added", async () => {
    blocAnswer = ok({ ok: true, id: NEW, creatives: "ok", from: "elsewhere", name: "פיצה (עותק)" });
    await post(BODY["campaign.duplicate"]);
    expect(audits[0][4]).toEqual({ from: ID, creatives: "ok", name: "פיצה (עותק)" });
    blocAnswer = ok({ ok: true, id: NEW, name: "שם אחר" });
    await post(ADV);
    expect(audits[1][4]).toEqual({ name: "פיצה השכונה", created: true });
  });
  it("creatives missing or strange → 'unknown' (the copy exists; the ads are not claimed)", async () => {
    for (const creatives of [undefined, "yes", true, null]) {
      blocAnswer = ok({ ok: true, id: NEW, ...(creatives === undefined ? {} : { creatives }) });
      expect((await post(BODY["campaign.duplicate"])).body.creatives, String(creatives)).toBe("unknown");
    }
  });
  it("the source id back, or no id → unclear (bad_shape), logged on the source", async () => {
    for (const data of [{ ok: true, id: ID, creatives: "ok" }, { ok: true, id: ID.toUpperCase(), creatives: "ok" }, { ok: true, creatives: "ok" }]) {
      audits.length = 0;
      blocAnswer = ok(data);
      const r = await post(BODY["campaign.duplicate"]);
      expect(r.status).toBe(502);
      expect(audits[0].slice(1, 4)).toEqual(["BLOC_ACTION_UNKNOWN", "ad_campaign", ID]);
    }
  });
});

describe("every bloc code → the Hebrew the panel showed until now", () => {
  const cases: Array<[string, string, any, string, number]> = [
    // [action, why, bloc's answer, Hebrew, panel status]
    ["contract.save", "sql_missing", fail(503, "sql_missing"), ADS_SQL_MISSING, 503],
    ["contract.save", "locked contract", fail(409, "locked", { which: "contract" }), LOCKED_TEXT.contract, 409],
    ["campaign.save", "locked campaign", fail(409, "locked", { which: "campaign" }), LOCKED_TEXT.campaign, 409],
    ["creative.save", "locked creative", fail(409, "locked", { which: "creative" }), LOCKED_TEXT.creative, 409],
    ["creative.save", "locked, which as the trigger name", fail(409, "locked", { which: "AD_CREATIVE_LOCKED" }), LOCKED_TEXT.creative, 409],
    ["contract.save", "locked without which → the action's own", fail(409, "locked"), LOCKED_TEXT.contract, 409],
    ["advertiser.save", "locked on an advertiser (no trigger)", fail(409, "locked"), LOCKED_OTHER_TEXT, 409],
    ["advertiser.delete", "in_use on delete", fail(409, "in_use"), IN_USE_TEXT, 409],
    ["campaign.delete", "in_use on delete", fail(409, "in_use"), IN_USE_TEXT, 409],
    ["campaign.save", "in_use on a save (its contract is gone)", fail(409, "in_use"), IN_USE_SAVE_TEXT, 409],
    ["campaign.duplicate", "in_use on a duplicate", fail(409, "in_use"), IN_USE_SAVE_TEXT, 409],
    ["contract.save", "check_failed", fail(400, "check_failed"), CHECK_FAILED_TEXT, 400],
    ["advertiser.archive", "not_found advertiser", fail(404, "not_found"), "המפרסם לא נמצא", 404],
    ["contract.delete", "not_found contract", fail(404, "not_found"), "החוזה לא נמצא", 404],
    ["campaign.status", "not_found campaign", fail(404, "not_found"), "הקמפיין לא נמצא", 404],
    ["creative.active", "not_found creative", fail(404, "not_found"), "הפרסומת לא נמצאה", 404],
    ["settings.save", "not_found settings (no row)", fail(404, "not_found"), "ההגדרות לא נמצאו. צריך להריץ את SQL 175 של bloc.", 404],
    ["campaign.status", "read_failed", fail(503, "read_failed"), READ_FAILED_TEXT, 503],
    ["creative.save", "invalid + field", fail(400, "invalid", { field: "image_alt" }), "bloc דחה את הבקשה — שדה לא תקין: תיאור התמונה. בדקו אותו ונסו שוב.", 400],
    ["campaign.save", "invalid + a nested field", fail(400, "invalid", { field: "days.2" }), "bloc דחה את הבקשה — שדה לא תקין: הימים. בדקו אותו ונסו שוב.", 400],
    ["settings.save", "invalid + a path array", fail(400, "invalid", { field: ["tester_emails", 0] }), "bloc דחה את הבקשה — שדה לא תקין: מכשירי הבדיקה. בדקו אותו ונסו שוב.", 400],
    ["advertiser.save", "invalid + an unknown field", fail(400, "invalid", { field: "zzz" }), INVALID_TEXT, 400],
    ["advertiser.save", "invalid + a prototype key", fail(400, "invalid", { field: "constructor" }), INVALID_TEXT, 400],
    ["advertiser.save", "invalid without a field", fail(400, "invalid"), INVALID_TEXT, 400],
    ["creative.save", "image_not_ours", fail(400, "image_not_ours"), IMAGE_NOT_OURS_TEXT, 400],
    ["settings.save", "unknown_emails", fail(400, "unknown_emails", { emails: ["nobody@example.com"] }), "אין חשבון bloc עם האימייל: nobody@example.com", 400],
    ["settings.save", "unknown_emails, two (junk dropped)", fail(400, "unknown_emails", { emails: ["a@x.co", 7, "", "b@x.co"] }), "אין חשבון bloc עם האימייל: a@x.co, b@x.co", 400],
    ["settings.save", "unknown_emails without the list", fail(400, "unknown_emails"), "אחד האימיילים ברשימה לא שייך לחשבון bloc. בדקו אותם ונסו שוב.", 400],
    ["advertiser.delete", "forbidden", fail(403, "forbidden"), ADS_FORBIDDEN_TEXT, 403],
    ["campaign.status", "a 409 bloc did not document, English", fail(409, "weird", undefined, "nope"), UNEXPECTED_TEXT, 409],
    ["campaign.status", "a 409 bloc did not document, in Hebrew", fail(409, "weird", undefined, "משהו בעברית"), "משהו בעברית", 409],
    ["advertiser.save", "a 400 without a code, English", fail(400, undefined, undefined, "bad"), INVALID_TEXT, 400],
  ];
  for (const [action, why, answer, text, status] of cases) {
    it(`${action} — ${why}`, async () => {
      blocAnswer = answer;
      const r = await post(BODY[action]);
      expect(r.status).toBe(status);
      expect(r.body.error).toBe(text);
      expect(Object.keys(r.body).sort()).toEqual(["code", "error"]);
      expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_FAILED"]);
      expect(audits[0][4]).toMatchObject({ action: AD_ACTIONS[action as keyof typeof AD_ACTIONS].audit, outcome: "failed", status: answer.status });
    });
  }
  it("write_failed → each action's own sentence (as the panel said), nothing changed", async () => {
    const expected: Record<string, string> = {
      "advertiser.save": "שמירת המפרסם נכשלה. נסו שוב.", "advertiser.archive": "העדכון נכשל. נסו שוב.", "advertiser.delete": "המחיקה נכשלה. נסו שוב.",
      "contract.save": "שמירת החוזה נכשלה. נסו שוב.", "contract.delete": "המחיקה נכשלה. נסו שוב.",
      "campaign.save": "שמירת הקמפיין נכשלה. נסו שוב.", "campaign.status": "העדכון נכשל. נסו שוב.", "campaign.duplicate": "השכפול נכשל. נסו שוב.",
      "campaign.delete": "המחיקה נכשלה. נסו שוב.", "creative.save": "שמירת הפרסומת נכשלה. נסו שוב.", "creative.active": "העדכון נכשל. נסו שוב.",
      "creative.delete": "המחיקה נכשלה. נסו שוב.", "settings.save": "שמירת ההגדרות נכשלה. נסו שוב.",
    };
    blocAnswer = fail(503, "write_failed");
    for (const [action, text] of Object.entries(expected)) {
      audits.length = 0;
      const r = await post(BODY[action]);
      expect([r.status, r.body], action).toEqual([503, { error: text, code: "write_failed" }]);
      expect(audits[0][1], action).toBe("BLOC_ACTION_FAILED");
    }
  });
  it("campaign.status — the six checks, in bloc now, with the same sentences (409)", async () => {
    for (const [code, text] of Object.entries(CAMPAIGN_STATUS_TEXT)) {
      blocAnswer = fail(409, code);
      expect(await post(BODY["campaign.status"]), code).toEqual({ status: 409, body: { error: text, code } });
    }
    expect(Object.keys(CAMPAIGN_STATUS_TEXT)).toEqual(["campaign_ended", "no_back_to_draft", "campaign_dates_passed", "contract_not_active", "contract_ended", "no_active_creative", "changed"]);
    expect(CAMPAIGN_STATUS_TEXT.changed).toBe("מישהו אחר שינה את הסטטוס של הקמפיין בינתיים. רעננו ונסו שוב.");
    expect(CAMPAIGN_STATUS_TEXT.campaign_ended).toBe("קמפיין שהסתיים לא חוזר לפעול. אפשר לשכפל אותו לקמפיין חדש.");
    expect(CAMPAIGN_STATUS_TEXT.no_active_creative).toBe("אין בקמפיין פרסומת פעילה. מוסיפים פרסומת עם תמונה, ואז מפעילים.");
  });
  it("a 403 without a code keeps the forbidden sentence (code forbidden); a 404 without a code — not found", async () => {
    blocAnswer = fail(403);
    expect((await post(BODY["advertiser.delete"])).body).toEqual({ error: ADS_FORBIDDEN_TEXT, code: "forbidden" });
    blocAnswer = fail(404, "gone");
    expect((await post(BODY["creative.delete"])).body).toEqual({ error: "הפרסומת לא נמצאה", code: "gone" });
  });
});

describe("unclear answers — \"maybe it happened, refresh\", logged unknown, never success and never a plain failure", () => {
  it("timeout: callBloc's sentence (maybe done — refresh), BLOC_ACTION_UNKNOWN", async () => {
    blocAnswer = fail(504, "TIMEOUT", undefined, "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב.");
    const r = await post(CAMPAIGN);
    expect(r.status).toBe(504);
    expect(r.body).toEqual({ error: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב.", code: "TIMEOUT" });
    expect(audits[0][1]).toBe("BLOC_ACTION_UNKNOWN");
    expect(audits[0][2]).toBe("ad_campaign");
    expect(audits[0][3]).toBeUndefined();
    expect(audits[0][4]).toMatchObject({ action: "AD_CAMPAIGN_SAVE", outcome: "unknown", code: "TIMEOUT", name: "פיצה סתיו" });
  });
  it("network: not callBloc's bare \"שגיאת רשת\" — \"maybe done, refresh\"", async () => {
    blocAnswer = fail(504, "NETWORK", undefined, "שגיאת רשת מול bloc");
    const r = await post(BODY["campaign.duplicate"]);
    expect(r.body).toEqual({ error: ADS_NETWORK_TEXT, code: "NETWORK" });
    expect(ADS_NETWORK_TEXT).toContain("ייתכן שהפעולה בוצעה");
    expect(audits[0].slice(1, 4)).toEqual(["BLOC_ACTION_UNKNOWN", "ad_campaign", ID]);
  });
  it("a server error without a known code (500 failed / 500 other / 503 bare) → maybe done, code failed, the bloc code kept in the log", async () => {
    for (const answer of [fail(500, "failed"), fail(500, "internal"), fail(503, undefined, undefined, "הפעולה נכשלה ב-bloc")]) {
      audits.length = 0;
      blocAnswer = answer;
      const r = await post(ADV);
      expect(r.status).toBe(answer.status);
      expect(r.body).toEqual({ error: ADS_UNKNOWN_TEXT, code: "failed" });
      expect(audits[0][1]).toBe("BLOC_ACTION_UNKNOWN");
      expect(audits[0][4].code).toBe(answer.code ?? null);
    }
  });
  it("connection problems that never reached bloc pass through as written, logged failed (not unknown)", async () => {
    for (const [code, status, text] of [["REJECTED", 502, "bloc דחה את הבקשה בכתובת…"], ["NOT_CONFIGURED", 503, "החיבור ל-bloc לא מוגדר"], ["OLD_BLOC", 502, "גרסה ישנה"]] as const) {
      audits.length = 0;
      blocAnswer = fail(status, code, undefined, text);
      const r = await post(BODY["creative.active"]);
      expect([r.status, r.body], code).toEqual([status, { error: text, code }]);
      expect(audits[0][1], code).toBe("BLOC_ACTION_FAILED");
    }
  });
  it("sql_missing / read_failed / write_failed are definite (503 but logged failed — nothing changed)", async () => {
    for (const code of ["sql_missing", "read_failed", "write_failed"]) {
      audits.length = 0;
      blocAnswer = fail(503, code);
      await post(BODY["campaign.delete"]);
      expect(audits[0][1], code).toBe("BLOC_ACTION_FAILED");
    }
  });
});
