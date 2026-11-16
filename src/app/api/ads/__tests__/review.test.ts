// /api/ads — ADS-2ב1 (החלטות 387–391): reports.review, הקוד וסוף המבצע ב-creative.save, ו-report_pause_at ב-settings.save. כמו כל פעולה:
// ads.manage והסכמה (משפט בעברית) כאן, הכתיבה ב-bloc (/api/internal/ads) עם השחקן מהסשן; הפאנל לא נוגע בטבלאות; כל קוד של bloc בעברית;
// הצלחה רק עם ok === true; היומן של הפאנל — AD_REPORTS_REVIEW על הקמפיין (מופיע בהיסטוריה שלו). הבקשות והתשובות — מהקובץ המשותף.
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADS_FORBIDDEN_TEXT, AD_ENTITY, COUPON_BLOC_INVALID_TEXT, DECISION_BLOC_INVALID_TEXT, OFFER_SQL_MISSING_TEXT, REPORTS_SQL_MISSING_ACTION_TEXT,
  REPORT_PAUSE_SQL_MISSING_TEXT, SEEN_UNTIL_BLOC_INVALID_TEXT,
} from "@/lib/adsActions";
import { BAD_SHAPE_TEXT } from "@/lib/moneyActions";
import { ADS_SQL_MISSING } from "@/lib/ads";
import { COUPON_INVALID_TEXT, OFFER_PAST_TEXT } from "@/lib/adsOffer";
import { SEEN_UNTIL_TEXT } from "@/lib/validation";

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
  },
}));

import { POST } from "../route";

const FIX = join(process.cwd(), "tests", "fixtures", "ads2b");
const review = JSON.parse(readFileSync(join(FIX, "reports_review.json"), "utf8"));
const coupon = JSON.parse(readFileSync(join(FIX, "creative_save_coupon.json"), "utf8"));
const SESSION = { id: "a1", email: "tal@bloc.co.il", full_name: "טל", role: "admin", auth_level: "mfa" };
const ACTOR = { id: "a1", email: "tal@bloc.co.il", role: "admin" };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const post = async (body: any) => { const r: any = await POST(req(body)); return { status: r.status, body: await r.json() }; };
const ok = (data: any) => ({ ok: true, status: 200, data });
const fail = (status: number, code?: string, data?: any, error = code ?? "x") => ({ ok: false, status, code, error, ...(data ? { data } : {}) });
const last = () => audits[audits.length - 1];
const noActor = (r: Record<string, unknown>) => { const { actor: _a, ...rest } = r; return rest; };
// review #10 (bloc's B10): every decision carries seen_until — bloc's request has it; its refusal cases (404/400/403) carry none
const NO_SEEN = "no seen_until — every open report (the behaviour before)";
const withSeen = (r: Record<string, unknown>) => (typeof r.seen_until === "string" ? r : { ...r, seen_until: review.request.seen_until });
const REVIEW = noActor(review.request);
const CAMP = review.request.campaign_id as string;

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T10:00:00Z")); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => {
  guardResult = { ok: true, session: SESSION };
  guardArgs = []; audits.length = 0; calls.length = 0; touched.length = 0;
  blocAnswer = ok(review.response);
});

describe("reports.review", () => {
  it("ads.manage; bloc gets exactly its request (actor from the session); the answer: ok + the status after + how many closed", async () => {
    const r = await post(REVIEW);
    expect(guardArgs[0]).toEqual({ permission: "ads.manage" });
    expect(calls).toEqual([{ path: "/api/internal/ads", payload: { actor: ACTOR, ...REVIEW } }]);
    expect(calls[0].payload).toEqual({ ...review.request, actor: ACTOR });
    expect(r).toEqual({ status: 200, body: { ok: true, status: "active", closed: 3 } });
    expect(touched).toEqual([]);
  });
  it("the panel's log: AD_REPORTS_REVIEW on the campaign — the decision, bloc's name / from, the status after, closed (no reporter)", async () => {
    await post(REVIEW);
    expect(audits).toHaveLength(1);
    expect(audits[0].slice(1, 4)).toEqual(["AD_REPORTS_REVIEW", "ad_campaign", CAMP]);
    expect(audits[0][4]).toEqual({ name: review.response.name, from: "paused", decision: "dismiss", seen_until: REVIEW.seen_until, status: "active", closed: 3 });
    expect(JSON.stringify(audits[0][4])).not.toMatch(/user|building|serve/);
  });
  it("every 200 case of bloc → ok with its status and closed", async () => {
    for (const c of (review.cases as any[]).filter((x) => x.status === 200 && x.title !== NO_SEEN)) {
      calls.length = 0;
      blocAnswer = ok(c.response);
      const r = await post(noActor(c.request));
      expect(calls[0].payload, c.title).toEqual({ ...c.request, actor: ACTOR });
      expect(r, c.title).toEqual({ status: 200, body: { ok: true, status: c.response.status, closed: c.response.closed } });
    }
  });
  it("404 / 400 decision / 403 of bloc → Hebrew, and BLOC_ACTION_FAILED in the log", async () => {
    const at = (t: string) => (review.cases as any[]).find((c) => c.title === t);
    const nf = at("an unknown campaign");
    blocAnswer = fail(nf.status, nf.response.code, nf.response, nf.response.error);
    expect(await post(withSeen(noActor(nf.request)))).toEqual({ status: 404, body: { error: AD_ENTITY.campaign.notFound, code: "not_found" } });
    expect(last().slice(1, 4)).toEqual(["BLOC_ACTION_FAILED", "ad_campaign", nf.request.campaign_id]);
    blocAnswer = fail(400, "invalid", { field: "decision" }, "invalid");
    expect((await post(REVIEW)).body.error).toBe(DECISION_BLOC_INVALID_TEXT);
    blocAnswer = fail(403, "forbidden", undefined, "forbidden");
    expect((await post(REVIEW)).body.error).toBe(ADS_FORBIDDEN_TEXT);
  });
  it("seen_until goes to bloc exactly as shown (microseconds kept); bloc's no-seen_until form and its non-ISO case — 400 before bloc", async () => {
    await post(REVIEW);
    expect(calls[0].payload.seen_until).toBe("2026-11-16T09:12:40.512331+00:00");
    for (const t of [NO_SEEN, "a seen_until that is not an ISO 8601 timestamp"]) {
      calls.length = 0; audits.length = 0;
      const r = await post(noActor((review.cases as any[]).find((c) => c.title === t).request));
      expect([r.status, r.body.error], t).toEqual([400, SEEN_UNTIL_TEXT]);
      expect(calls, t).toHaveLength(0);
    }
    blocAnswer = fail(400, "invalid", { field: "seen_until" }, "invalid");
    expect((await post(REVIEW)).body.error).toBe(SEEN_UNTIL_BLOC_INVALID_TEXT);
  });
  it("an unknown decision never reaches bloc (400, Hebrew)", async () => {
    const r = await post({ ...REVIEW, decision: "delete" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("החלטה לא מוכרת על הדיווחים");
    expect(calls).toHaveLength(0);
  });
  it("a 200 with result: 'not_found' — a refusal (404), not \"maybe done\"; a 200 without ok — bad shape (maybe done)", async () => {
    blocAnswer = ok({ ok: true, result: "not_found" });
    expect(await post(REVIEW)).toEqual({ status: 404, body: { error: AD_ENTITY.campaign.notFound, code: "not_found" } });
    expect(last()[1]).toBe("BLOC_ACTION_FAILED");
    blocAnswer = ok({ status: "active" });
    const r = await post(REVIEW);
    expect([r.status, r.body.error]).toEqual([502, BAD_SHAPE_TEXT]);
    expect(last()[1]).toBe("BLOC_ACTION_UNKNOWN");
  });
  it("before SQL 231 bloc answers sql_missing — the sentence names SQL 231, not 175", async () => {
    blocAnswer = fail(503, "sql_missing");
    expect((await post(REVIEW)).body.error).toBe(REPORTS_SQL_MISSING_ACTION_TEXT);
  });
});

describe("creative.save with the coupon and the offer end", () => {
  const BODY = noActor(coupon.request);
  it("bloc gets the code upper-cased and trimmed, the date as is; the log records both (marketing text, not a person)", async () => {
    blocAnswer = ok(coupon.response);
    const r = await post(BODY);
    expect(r).toEqual({ status: 200, body: { ok: true, id: coupon.response.id } });
    expect([calls[0].payload.coupon_code, calls[0].payload.offer_ends_on]).toEqual([coupon.stored.coupon_code, coupon.stored.offer_ends_on]);
    expect(audits[0][4]).toMatchObject({ coupon_code: "SAVE20", offer_ends_on: "2026-11-30" });
  });
  it("without them (an older screen) bloc gets explicit nulls — no field is left to chance", async () => {
    const { coupon_code: _c, offer_ends_on: _o, ...old } = BODY;
    blocAnswer = ok(coupon.response);
    await post(old);
    expect([calls[0].payload.coupon_code, calls[0].payload.offer_ends_on]).toEqual([null, null]);
    expect(audits[0][4]).not.toHaveProperty("coupon_code");
  });
  it("a bad code or an ended offer never reaches bloc (400, the Hebrew sentence)", async () => {
    for (const [patch, text] of [[{ coupon_code: "SAVE 20" }, COUPON_INVALID_TEXT], [{ offer_ends_on: "2026-11-15" }, OFFER_PAST_TEXT]] as const) {
      calls.length = 0;
      const r = await post({ ...BODY, ...patch });
      expect([r.status, r.body.error], JSON.stringify(patch)).toEqual([400, text]);
      expect(calls).toHaveLength(0);
    }
  });
  it("bloc's invalid on coupon_code → its sentence; sql_missing with a code → SQL 231, without → SQL 175 as before", async () => {
    blocAnswer = fail(400, "invalid", { field: "coupon_code" }, "invalid");
    expect((await post(BODY)).body.error).toBe(COUPON_BLOC_INVALID_TEXT);
    blocAnswer = fail(503, "sql_missing");
    expect((await post(BODY)).body.error).toBe(OFFER_SQL_MISSING_TEXT);
    expect((await post({ ...BODY, coupon_code: null, offer_ends_on: null })).body.error).toBe(ADS_SQL_MISSING);
  });
});

describe("settings.save + report_pause_at", () => {
  it("0..20 goes to bloc and to the log; 21 / 2.5 / \"3\" never leave the panel", async () => {
    blocAnswer = ok({ ok: true });
    expect((await post({ action: "settings.save", report_pause_at: 5 })).body).toEqual({ ok: true });
    expect(calls[0].payload).toEqual({ actor: ACTOR, action: "settings.save", report_pause_at: 5 });
    expect(audits[0].slice(1, 4)).toEqual(["AD_SETTINGS", "ad_settings", "1"]);
    expect(audits[0][4]).toMatchObject({ report_pause_at: 5 });
    for (const bad of [21, 2.5, "3", -1]) {
      calls.length = 0;
      const r = await post({ action: "settings.save", report_pause_at: bad });
      expect(r.status, String(bad)).toBe(400);
      expect(calls).toHaveLength(0);
    }
    blocAnswer = fail(503, "sql_missing");
    expect((await post({ action: "settings.save", report_pause_at: 0 })).body.error).toBe(REPORT_PAUSE_SQL_MISSING_TEXT);
    expect((await post({ action: "settings.save", enabled: true })).body.error).toBe(ADS_SQL_MISSING);
  });
});
