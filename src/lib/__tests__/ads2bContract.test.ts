// ADS-2ב1 — החוזה המשותף עם bloc: tests/fixtures/ads2b/*.json, עותק בבייטים של הקובץ של bloc (כשהעץ של bloc כאן — נבדק בייט בבייט).
// מה שהפאנל צורך ממנו: creative.save עם הקוד וסוף המבצע (מה תקין ומה נדחה, ובאיזה שדה), settings.save + report_pause_at, reports.review
// (הבקשה, כל תשובה של bloc → מה המסך אומר), ad_report עם העתקות ודיווחים (והחלוקה לפי פורמט — אותם מספרים כמו formats של bloc), ו"למה לא
// מוצג?" עם hidden. הזמן — 16.11.2026 (היום של הקובץ), כדי שסוף המבצע ייבדק מול אותו יום כמו ב-bloc.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { adActionSchema, type AdAction } from "../validation";
import { adsAnswer, adsFailure, adsRefusal, invalidText, COUPON_BLOC_INVALID_TEXT, OFFER_BLOC_INVALID_TEXT, DECISION_BLOC_INVALID_TEXT, REPORT_PAUSE_BLOC_INVALID_TEXT, SEEN_UNTIL_BLOC_INVALID_TEXT, ADS_FORBIDDEN_TEXT, AD_ENTITY } from "../adsActions";
import { parseReport } from "../ads";
import { cmpTs, groupReports, parseReportRows, reviewBody, seenUntilFor } from "../adsReports";
import { byFormat, creativePayloadFor, emptyCreativeForm } from "../adsStudio";
import { parseExplain, explainView, CHECK_FAIL } from "../adsExplain";
import { COUPON_INVALID_TEXT, OFFER_PAST_TEXT, OFFER_INVALID_TEXT } from "../adsOffer";

const FIX = join(process.cwd(), "tests", "fixtures", "ads2b");
const read = (f: string) => JSON.parse(readFileSync(join(FIX, f), "utf8"));
const BLOC_FIX = join(process.env.BLOC_ROOT ?? "/home/claude/hood-ads2", "tests", "fixtures", "ads2b");
const md5 = (p: string) => createHash("md5").update(readFileSync(p)).digest("hex");

// the fixture's "today" (Israel) — the offer end is checked against the same day as bloc's tests
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T10:00:00Z")); });
afterAll(() => { vi.useRealTimers(); });

describe("the shared fixture — byte for byte the same as bloc's", () => {
  it("the panel has its copy (11 files)", () => {
    expect(readdirSync(FIX).filter((f: string) => f.endsWith(".json")).sort()).toEqual([
      "ad_explain_hidden.raw.json", "ad_next_ad.raw.json", "ad_next_preview.raw.json", "ad_report.raw.json", "ad_view.json", "creative_save_coupon.json",
      "explain_answer_hidden.json", "helpers.json", "queue_rows.json", "reports_review.json", "settings_save_report_pause_at.json",
    ]);
  });
  it("every file equals bloc's (when bloc's tree is here)", () => {
    if (!existsSync(BLOC_FIX)) return;
    const theirs = readdirSync(BLOC_FIX).filter((f: string) => f.endsWith(".json")).sort();
    expect(readdirSync(FIX).filter((f: string) => f.endsWith(".json")).sort()).toEqual(theirs);
    for (const f of theirs) expect(md5(join(FIX, f)), f).toBe(md5(join(BLOC_FIX, f)));
  });
});

const withoutActor = (r: Record<string, unknown>) => { const { actor: _a, ...rest } = r; return rest; };
const parse = (body: Record<string, unknown>) => adActionSchema.safeParse(body);
const issueOf = (body: Record<string, unknown>) => { const r = parse(body); return r.success ? null : { path: String(r.error.issues[0].path[0]), message: r.error.issues[0].message }; };

describe("creative.save with a coupon and an offer end (creative_save_coupon.json)", () => {
  const fx = read("creative_save_coupon.json");
  const base = withoutActor(fx.request);
  it("bloc's request passes the panel's schema, and the panel stores what bloc stores (trim + upper)", () => {
    const r = parse(base);
    expect(r.success).toBe(true);
    const d = r.success ? r.data as AdAction & { coupon_code: string | null; offer_ends_on: string | null } : null;
    expect({ coupon_code: d?.coupon_code, offer_ends_on: d?.offer_ends_on }).toEqual(fx.stored);
  });
  it("every valid case: the same stored values (null / empty / omitted — none; banner + coupon — saved)", () => {
    for (const v of fx.valid as Array<Record<string, unknown>>) {
      const { stored, omit: _o, note: _n, ...patch } = v as { stored: unknown; omit?: boolean; note?: string };
      // each case is bloc's request without the two fields, plus the case's own (a field the case does not name — omitted)
      const core: Record<string, unknown> = { ...base };
      delete core.coupon_code; delete core.offer_ends_on;
      const body: Record<string, unknown> = { ...core, ...patch };
      const r = parse(body);
      expect(r.success, JSON.stringify(v)).toBe(true);
      const d = r.success ? r.data as Record<string, unknown> : {};
      expect({ coupon_code: d.coupon_code, offer_ends_on: d.offer_ends_on }, JSON.stringify(v)).toEqual(stored);
    }
  });
  it("every invalid case: refused on bloc's field — with a Hebrew sentence (before bloc)", () => {
    for (const v of fx.invalid as Array<Record<string, unknown> & { field: string }>) {
      const { field, ...patch } = v;
      const i = issueOf({ ...base, ...patch });
      expect(i?.path, JSON.stringify(v)).toBe(field);
      expect([COUPON_INVALID_TEXT, OFFER_PAST_TEXT, OFFER_INVALID_TEXT], JSON.stringify(v)).toContain(i?.message);
    }
  });
  it("bloc's 400 invalid + field → the panel's own sentence for each field", () => {
    for (const field of ["coupon_code", "offer_ends_on"]) {
      const f = adsFailure({ status: fx.errorStatus, code: "invalid", error: "invalid", data: { ...fx.errorShape, field } }, "creative.save");
      expect(f.error).toBe(field === "coupon_code" ? COUPON_BLOC_INVALID_TEXT : OFFER_BLOC_INVALID_TEXT);
      expect(invalidText(field)).toBe(f.error);
    }
  });
  it("bloc's answer is a clear success (the same id on edit)", () => {
    const r = parse(base);
    expect(r.success && adsAnswer(r.data as AdAction, fx.response)).toEqual({ id: fx.response.id, creatives: null });
  });
  it("the studio's payload for the same ad carries what bloc expects (upper-case code, the date as is)", () => {
    const f = { ...emptyCreativeForm((i) => `k${i}`), coupon_code: fx.request.coupon_code as string, offer_ends_on: fx.request.offer_ends_on as string };
    const p = creativePayloadFor("card", f, fx.request.campaign_id as string);
    expect([p.coupon_code, p.offer_ends_on]).toEqual([fx.stored.coupon_code, fx.stored.offer_ends_on]);
  });
});

describe("settings.save + report_pause_at (settings_save_report_pause_at.json)", () => {
  const fx = read("settings_save_report_pause_at.json");
  it("bloc's request, every valid value — pass; every invalid one — refused on report_pause_at", () => {
    expect(parse(withoutActor(fx.request)).success).toBe(true);
    for (const n of fx.valid) expect(parse({ action: "settings.save", report_pause_at: n }).success, String(n)).toBe(true);
    for (const n of fx.invalid) expect(issueOf({ action: "settings.save", report_pause_at: n })?.path, String(n)).toBe(fx.field);
  });
  it("bloc's invalid on the field has its sentence; the answer is a clear success", () => {
    expect(adsFailure({ status: 400, code: "invalid", error: "invalid", data: { field: fx.field } }, "settings.save").error).toBe(REPORT_PAUSE_BLOC_INVALID_TEXT);
    const r = parse(withoutActor(fx.request));
    expect(r.success && adsAnswer(r.data as AdAction, fx.response)).toEqual({ id: null, creatives: null });
  });
});

describe("reports.review (reports_review.json)", () => {
  const fx = read("reports_review.json");
  type Case = { title: string; request: Record<string, unknown>; status: number; response: Record<string, unknown> };
  const cases = fx.cases as Case[];
  const at = (t: string) => { const c = cases.find((x) => x.title === t); if (!c) throw new Error(`no case "${t}" in reports_review.json`); return c; };
  // review #10 (bloc's B10): every decision carries seen_until — the newest created_at shown for that campaign; bloc closes only the open
  // reports created at or before it. Without it bloc closes every open report (the behaviour before): the panel never sends that form.
  const SEEN = fx.request.seen_until as string;
  const NO_SEEN = "no seen_until — every open report (the behaviour before)";
  const seen = (r: Record<string, unknown>) => (typeof r.seen_until === "string" ? r : { ...r, seen_until: SEEN });   // bloc's refusal cases carry none
  it("bloc's request (minus actor) passes as is — seen_until untouched; every decision passes; an unknown decision is refused before bloc, on decision", () => {
    const r = parse(withoutActor(fx.request));
    expect(r.success && r.data).toEqual(withoutActor(fx.request));
    expect(SEEN).toBe("2026-11-16T09:12:40.512331+00:00");
    for (const d of fx.decisions) expect(parse({ action: "reports.review", campaign_id: fx.request.campaign_id, decision: d, seen_until: SEEN }).success, d).toBe(true);
    for (const c of cases.filter((x) => x.status === 200 && x.title !== NO_SEEN)) expect(typeof c.request.seen_until, c.title).toBe("string");
    expect(issueOf(seen(withoutActor(at("an unknown decision").request)))?.path).toBe("decision");
  });
  it("bloc's seen_until is what the queue sends for the reports it shows (queue_rows.json → seenUntilFor → reviewBody)", () => {
    const q = read("queue_rows.json");
    const camp = { ...q.campaign, id: fx.request.campaign_id };
    const [g] = groupReports(parseReportRows(q.rows), [camp], []);
    expect(reviewBody(g.campaignId, "dismiss", seenUntilFor(g, "new"))).toEqual(withoutActor(fx.request));
    // the queue loaded before the newest report arrived: it shows two, sends the second's time — bloc's "before the newest" case
    const early = at("seen_until before the newest open report — the two up to it are closed, the third stays open");
    const [g2] = groupReports(parseReportRows(q.rows).filter((x) => cmpTs(x.created_at, SEEN) < 0), [camp], []);
    expect([g2.open, reviewBody(g2.campaignId, "dismiss", seenUntilFor(g2, "new"))]).toEqual([early.response.closed, withoutActor(early.request)]);
  });
  it("no seen_until (the old form — every open report) is refused before bloc, on seen_until", () => {
    expect(issueOf(withoutActor(at(NO_SEEN).request))?.path).toBe("seen_until");
    expect(issueOf({ action: "reports.review", campaign_id: fx.request.campaign_id, decision: "dismiss", seen_until: null })?.path).toBe("seen_until");
  });
  it("seen_until must be a time, ≤ 40 characters — bloc's non-ISO case is refused before bloc; if bloc refuses one, the panel's sentence", () => {
    const bad = at("a seen_until that is not an ISO 8601 timestamp");
    expect(issueOf(withoutActor(bad.request))?.path).toBe("seen_until");
    expect(adsFailure({ status: bad.status, code: String(bad.response.code), error: "invalid", data: bad.response }, "reports.review").error).toBe(SEEN_UNTIL_BLOC_INVALID_TEXT);
    const base = { action: "reports.review", campaign_id: fx.request.campaign_id, decision: "dismiss" };
    for (const v of ["", "yesterday", "2026-11-16", "2026-13-45T25:59:00Z", "2026-11-16T09:12:40.512331", "2026-11-16 09:12:40.512331+00:00", 1794820360512,
      `2026-11-16T09:12:40.${"1".repeat(40)}+00:00`]) expect(issueOf({ ...base, seen_until: v })?.path, String(v)).toBe("seen_until");
    for (const v of ["2026-11-16T09:12:40.512331+00:00", "2026-11-16T09:12:40Z", "2026-11-16T11:12:40.5+02:00"]) expect(parse({ ...base, seen_until: v }).success, v).toBe(true);
  });
  it("the panel refuses before bloc exactly what bloc's own schema refuses (z.string().datetime({ offset: true })), plus a length bound", () => {
    const blocSchema = join(process.env.BLOC_ROOT ?? "/home/claude/hood-ads2", "src", "lib", "panelAds", "schema.ts");
    if (existsSync(blocSchema)) expect(readFileSync(blocSchema, "utf8")).toContain("seen_until: z.string().datetime({ offset: true }).optional(),");
    const blocs = z.string().datetime({ offset: true });
    const base = { action: "reports.review", campaign_id: fx.request.campaign_id, decision: "dismiss" };
    for (const v of [SEEN, "2026-11-16T08:47:53.904118+00:00", "2026-11-16T09:12:40Z", "2026-11-16T09:12:40+0200", "2026-11-16T09:12:40.512331",
      "2026-11-16 09:12:40.512331+00:00", "2026-11-16T09:12+00:00", "2026-02-30T09:12:40Z", "2026-11-16T24:00:00Z", "16/11/2026 09:12"]) {
      expect(parse({ ...base, seen_until: v }).success, v).toBe(blocs.safeParse(v).success);
    }
  });
  it("every 200 of bloc is a clear success with the status after and how many closed", () => {
    for (const c of [{ title: "main", request: fx.request, status: 200, response: fx.response }, ...cases.filter((x) => x.status === 200)]) {
      const r = parse(seen(withoutActor(c.request)));
      const done = r.success ? adsAnswer(r.data as AdAction, c.response) : null;
      expect(done, c.title).toEqual({ id: null, creatives: null, review: { status: c.response.status, closed: c.response.closed } });
      expect(r.success && adsRefusal(r.data as AdAction, c.response), c.title).toBe(null);
    }
  });
  it("404 / 400 / 403 of bloc → the panel's sentences", () => {
    const f404 = at("an unknown campaign");
    expect(adsFailure({ status: f404.status, code: String(f404.response.code), error: String(f404.response.error), data: f404.response }, "reports.review").error).toBe(AD_ENTITY.campaign.notFound);
    const f400 = at("an unknown decision");
    expect(adsFailure({ status: f400.status, code: String(f400.response.code), error: "invalid", data: f400.response }, "reports.review").error).toBe(DECISION_BLOC_INVALID_TEXT);
    const f403 = at("a viewer (no ads.manage)");
    expect(adsFailure({ status: f403.status, code: String(f403.response.code), error: "forbidden", data: f403.response }, "reports.review").error).toBe(ADS_FORBIDDEN_TEXT);
  });
  it("a 200 with result: 'not_found' (if bloc ever answers so) is a refusal, not \"maybe done\"", () => {
    const r = parse(seen(withoutActor(fx.request)));
    const b = r.success ? r.data as AdAction : null;
    expect(b && adsRefusal(b, { ok: true, result: "not_found" })).toEqual({ status: 404, code: "not_found", error: AD_ENTITY.campaign.notFound });
    expect(b && adsAnswer(b, { ok: true, result: "not_found" })).toBeNull();
    expect(b && adsAnswer(b, { ok: false })).toBeNull();
  });
});

describe("ad_report with copies and reports (ad_report.raw.json)", () => {
  const raw = read("ad_report.raw.json");
  const rep = parseReport(raw);
  it("copies in the totals, the days and per creative; the reports counts (numbers only)", () => {
    expect(rep.totals.copies).toBe(raw.totals.copies);
    expect(rep.days.map((d) => d.copies)).toEqual(raw.days.map((d: { copies: number }) => d.copies));
    expect(rep.creatives.map((c) => c.copies)).toEqual(raw.creatives.map((c: { copies: number }) => c.copies));
    expect(rep.reports).toEqual({ open: raw.reports.open, total: raw.reports.total, pausedByReportsAt: raw.reports.paused_by_reports_at });
  });
  it("the panel's own split by format = bloc's formats[] (serves, views, clicks, copies)", () => {
    const fmts = byFormat(rep.creatives, (id) => rep.creatives.find((c) => c.creative_id === id)?.format);
    expect(fmts.map((x) => ({ format: x.format, serves: x.serves, views: x.views, clicks: x.clicks, copies: x.copies })))
      .toEqual(raw.formats.map((x: Record<string, unknown>) => ({ format: x.format, serves: x.serves, views: x.views, clicks: x.clicks, copies: x.copies })));
  });
  it("before SQL 232 (no reports / bad shape) — null, never invented", () => {
    expect(parseReport({ totals: {} }).reports).toBeNull();
    expect(parseReport({ reports: { open: "3", total: 4 } }).reports).toBeNull();
    expect(parseReport({ reports: { open: 3, total: 1 } }).reports).toEqual({ open: 3, total: 3, pausedByReportsAt: null });
  });
});

describe("\"למה לא מוצג?\" with hidden (explain_answer_hidden.json)", () => {
  const fx = read("explain_answer_hidden.json");
  it("a campaign the user hid fails on hidden — said in Hebrew; the one with only ended creatives fails on creative", () => {
    const p = parseExplain(fx);
    const v = explainView(p, new Date("2026-11-16T10:20:31Z"), "full");
    const hid = v.campaigns.find((c) => c.id.endsWith("07"))!;
    expect(hid.failed).toEqual([CHECK_FAIL.hidden]);
    expect(CHECK_FAIL.hidden).toBe("המשתמש בחר לא לראות את הפרסומת או את המפרסם");   // review #9 — neutral, no detail
    const ended = v.campaigns.find((c) => c.id.endsWith("08"))!;
    expect(ended.failed).toEqual([CHECK_FAIL.creative]);
    expect(ended.formats).toEqual([]);
    expect(v.campaigns.find((c) => c.id.endsWith("01"))!.failed).toEqual([]);
  });
  it("bloc before SQL 232 sends no hidden — read as passed, not as \"failed\"", () => {
    const old = JSON.parse(JSON.stringify(fx));
    for (const c of old.db.campaigns) delete c.checks.hidden;
    const p = parseExplain(old);
    expect(p.campaigns.every((c) => c.checks.hidden === true)).toBe(true);
    // an explicit non-boolean is not "false" either — only false fails
    old.db.campaigns[0].checks.hidden = "no";
    expect(parseExplain(old).campaigns[0].checks.hidden).toBe(true);
  });
});
