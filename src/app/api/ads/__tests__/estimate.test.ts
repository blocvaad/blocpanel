// /api/ads/estimate (bloc ADS-2א v2, החלטה 382): מד הקהל של הסטודיו — קריאה בלבד, רק למי שמנהל פרסום (ads.manage — סקירה #4): הגוף נבדק (רק שדות הקהל),
// ad_estimate_reach נקרא עם service role, והתשובה — מספרים בלבד. לפני SQL 230 — 503 sql_missing עם המשפט "ההערכה תופיע אחרי SQL 230";
// כשל — "לא הצלחנו להעריך כרגע" (אף פעם לא 0); צורה לא צפויה — אותו דבר. לא נרשם ביומן (אין בו פרטים של אף אחד).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ESTIMATE_FAILED_TEXT, ESTIMATE_SQL_MISSING_TEXT } from "@/lib/adsStudio";

let guardResult: any;
let guardArgs: any[] = [];
const audits: any[][] = [];
const rpcCalls: Array<[string, any]> = [];
let rpcResult: any;
const fromCalls: string[] = [];
vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: { rpc: async (n: string, a: any) => { rpcCalls.push([n, a]); if (rpcResult === "throw") throw new Error("x"); return rpcResult; }, from: (t: string) => { fromCalls.push(t); throw new Error("no table reads"); } },
}));

import { POST } from "../estimate/route";

const B = "22222222-2222-4222-8222-222222222222";
const body = (o: Record<string, unknown> = {}) => ({ screens: ["home", "market"], plans: ["free", "building"], roles: ["tenant"], cities: ["חיפה"], building_ids: [B], ...o });
const req = (b: unknown): any => ({ json: async () => b, headers: { get: () => null } });
const post = async (b: unknown) => { const r: any = await POST(req(b)); return { status: r.status, body: await r.json(), cache: r.headers.get("Cache-Control") }; };

beforeEach(() => {
  guardResult = { ok: true, session: { id: "a1", email: "tal@bloc.co.il", role: "admin" } };
  guardArgs = []; audits.length = 0; rpcCalls.length = 0; fromCalls.length = 0;
  rpcResult = { data: { users: 1240, buildings: 38 }, error: null };
});

describe("POST /api/ads/estimate — access and the body", () => {
  it("ads.manage (review #4 — only who builds campaigns; a read-only role cannot difference the counts); a refused guard answers as it is, nothing read", async () => {
    await post(body());
    expect(guardArgs).toEqual([{ permission: "ads.manage" }]);
    guardResult = { ok: false, response: new Response(JSON.stringify({ error: "אין הרשאה" }), { status: 403 }) };
    const r = await post(body());
    expect([r.status, r.body]).toEqual([403, { error: "אין הרשאה" }]);
    expect(rpcCalls).toHaveLength(1);
  });
  it("only the audience fields: screens / plans / roles (at least one each, known values), up to 50 cities, up to 500 building ids", async () => {
    for (const bad of [
      body({ screens: [] }), body({ plans: ["gold"] }), body({ roles: ["management"] }), body({ screens: ["payments"] }),
      body({ cities: Array.from({ length: 51 }, (_, i) => `עיר ${i}`) }), body({ cities: [""] }), body({ building_ids: ["x"] }),
      body({ building_ids: Array.from({ length: 501 }, () => B) }), body({ name: "x" }), { screens: ["home"], plans: ["free"] }, "x", null,
    ]) {
      const r = await post(bad);
      expect(r.status, JSON.stringify(bad).slice(0, 60)).toBe(400);
    }
    expect(rpcCalls).toHaveLength(0);
  });
  it("ADS-2ג1: the five screens (+ the inbox and the announcements) go to ad_estimate_reach; an unknown one is refused", async () => {
    await post(body({ screens: ["home", "market", "events", "inbox", "announcements"] }));
    expect(rpcCalls[0][1].p_screens).toEqual(["home", "market", "events", "inbox", "announcements"]);
    expect((await post(body({ screens: ["announcements", "lobby"] }))).status).toBe(400);
    expect(rpcCalls).toHaveLength(1);
  });
  it("cities / building ids default to empty; subsets deduplicated", async () => {
    await post({ screens: ["home", "home"], plans: ["free"], roles: ["tenant", "committee", "tenant"] });
    expect(rpcCalls).toEqual([["ad_estimate_reach", { p_screens: ["home"], p_plans: ["free"], p_roles: ["tenant", "committee"], p_cities: [], p_buildings: [] }]]);
  });
});

describe("POST /api/ads/estimate — the answer: numbers only, never 0 on a failure", () => {
  it("ad_estimate_reach with the five arguments → {ok, users, buildings, under10}; no-store; not logged; no table read", async () => {
    const r = await post(body());
    expect(rpcCalls).toEqual([["ad_estimate_reach", { p_screens: ["home", "market"], p_plans: ["free", "building"], p_roles: ["tenant"], p_cities: ["חיפה"], p_buildings: [B] }]]);
    expect([r.status, r.body]).toEqual([200, { ok: true, users: 1240, buildings: 38, under10: false }]);
    expect(r.cache).toBe("no-store");
    expect(audits).toEqual([]);
    expect(fromCalls).toEqual([]);
  });
  it("under 10: bloc answers 0 with under_10 — the panel says \"fewer than 10\" (users forced to 0 even if a number came)", async () => {
    rpcResult = { data: { users: 0, buildings: 2, under_10: true }, error: null };
    expect((await post(body())).body).toEqual({ ok: true, users: 0, buildings: 2, under10: true });
    rpcResult = { data: { users: 7, buildings: 1, under_10: true }, error: null };
    expect((await post(body())).body).toEqual({ ok: true, users: 0, buildings: 1, under10: true });
  });
  it("before SQL 230 (the function is missing): 503 sql_missing with the sentence", async () => {
    for (const error of [{ code: "PGRST202", message: "Could not find the function" }, { code: "42883" }, { message: "function public.ad_estimate_reach does not exist" }]) {
      rpcResult = { data: null, error };
      const r = await post(body());
      expect([r.status, r.body], JSON.stringify(error)).toEqual([503, { error: ESTIMATE_SQL_MISSING_TEXT, code: "sql_missing" }]);
    }
    expect(ESTIMATE_SQL_MISSING_TEXT).toBe("ההערכה תופיע אחרי SQL 230");
  });
  it("any other error: 502 failed with \"לא הצלחנו להעריך כרגע\" (never a 0)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcResult = { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
    const r = await post(body());
    expect([r.status, r.body]).toEqual([502, { error: ESTIMATE_FAILED_TEXT, code: "failed" }]);
    expect(ESTIMATE_FAILED_TEXT).toBe("לא הצלחנו להעריך כרגע");
    expect(log.mock.calls.map((c) => c.join(" "))).toEqual(["[ads estimate] 57014"]);   // the code only — no audience, no message
    log.mockRestore();
  });
  it("an unexpected shape (null, an array, negatives, fractions, strings) → 502 bad_shape, never a number", async () => {
    for (const data of [null, [], { users: -1, buildings: 2 }, { users: 1.5, buildings: 2 }, { users: "12", buildings: "x" }, { buildings: 3 }, "12"]) {
      rpcResult = { data, error: null };
      const r = await post(body());
      expect([r.status, r.body], JSON.stringify(data)).toEqual([502, { error: ESTIMATE_FAILED_TEXT, code: "bad_shape" }]);
    }
  });
});
