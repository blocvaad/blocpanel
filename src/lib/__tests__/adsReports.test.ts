// ADS-2ב1 (החלטות 386–387, 390) — lib/adsReports: תור הדיווחים. הסיבות, המצבים והעמודות — מול tests/fixtures/ads2b/queue_rows.json (זהה
// לזה של bloc); אף פעם לא מי דיווח (העמודות והפענוח); הקיבוץ לפי קמפיין, הסדר (מושהה בגלל דיווחים — ראשון), הסינון, ההחלטות האפשריות
// בכל מצב ומשפט האישור שלהן, והמשפט אחרי כל תשובה של bloc (reports_review.json).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AD_REPORT_REASONS, REASON_LABEL, SERIOUS_REASONS, REPORT_COLUMNS, REPORT_STATUS_LABEL, REVIEW_DECISIONS, NOTES_MAX, parseReportRows, groupReports,
  groupState, filterGroups, needsReview, decisionsFor, reviewBody, parseReviewAnswer, reviewNotice, reportsCountText, reportsSummaryText,
  toReportCampaign, toReportCreative, pausedByReports, sortGroups, seenUntilFor, cmpTs, type ReportCampaign, type ReportCreative, type ReportGroup, type AdReportRow,
} from "../adsReports";

const FIX = join(process.cwd(), "tests", "fixtures", "ads2b");
const queue = JSON.parse(readFileSync(join(FIX, "queue_rows.json"), "utf8"));
const review = JSON.parse(readFileSync(join(FIX, "reports_review.json"), "utf8"));
const CAMP = queue.campaign.id as string;

const camp = (o: Partial<ReportCampaign> = {}): ReportCampaign => ({
  id: CAMP, name: "מבצע חורף — כרטיס", status: "paused", advertiser: "קפה השכונה", advertiser_logo: null, advertiser_color: "#0E7C66",
  paused_by_reports_at: queue.campaign.paused_by_reports_at, ...o,
});
const cre = (id: string, o: Partial<ReportCreative> = {}): ReportCreative => ({
  id, campaign_id: CAMP, image_url: "https://abcd1234.supabase.co/storage/v1/object/public/ads/creatives/2026-11/01-1.png", image_alt: "קפה",
  focal_x: 0.5, focal_y: 0.4, format: "card", active: true, headline: "קפה", ...o,
});

describe("the contract with bloc (queue_rows.json)", () => {
  it("the panel selects exactly bloc's column list — and none of the forbidden (who reported)", () => {
    expect(REPORT_COLUMNS).toBe(queue.select);
    for (const f of queue.forbidden as string[]) expect(REPORT_COLUMNS.split(/,\s*/)).not.toContain(f);
  });
  it("the six reasons with the app's words; the serious three; the three statuses", () => {
    expect([...AD_REPORT_REASONS].sort()).toEqual(Object.keys(queue.reasons).sort());
    for (const r of AD_REPORT_REASONS) expect(REASON_LABEL[r], r).toBe(queue.reasons[r]);
    expect([...SERIOUS_REASONS].sort()).toEqual([...queue.serious].sort());
    expect(Object.keys(REPORT_STATUS_LABEL).sort()).toEqual([...queue.statuses].sort());
    expect([...REVIEW_DECISIONS]).toEqual(review.decisions);
  });
  it("parseReportRows: bloc's rows parse whole; identity fields that slip in are NOT copied", () => {
    const rows = parseReportRows(queue.rows);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual(queue.rows[0]);
    const leaky = parseReportRows([{ ...queue.rows[0], user_id: "u1", building_id: "b1", serve_id: "s1", city: "חיפה", email: "x@y.z" }]);
    expect(Object.keys(leaky[0]).sort()).toEqual(REPORT_COLUMNS.split(/,\s*/).sort());
    expect(JSON.stringify(leaky)).not.toMatch(/u1|b1|s1|חיפה|x@y\.z/);
  });
  it("parseReportRows drops what is not a report (bad campaign / reason / status / time) and trims the note to 300", () => {
    const ok = queue.rows[0];
    const rows = parseReportRows([
      null, "x", { ...ok, campaign_id: "nope" }, { ...ok, reason: "spam" }, { ...ok, status: "open" }, { ...ok, created_at: "yesterday" },
      { ...ok, id: "long", note: `  ${"א".repeat(400)}  ` }, { ...ok, id: "empty", note: "   ", creative_id: "x" },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["long", "empty"]);
    expect(rows[0].note).toHaveLength(300);
    expect([rows[1].note, rows[1].creative_id]).toEqual([null, null]);
    expect(parseReportRows({ rows: [] })).toEqual([]);
  });
});

describe("grouping by campaign", () => {
  const rows = parseReportRows(queue.rows);
  it("counts per reason (open / total), the last report, the notes with reason + date + status — never who", () => {
    const [g] = groupReports(rows, [camp()], [cre("00000000-0000-4000-f000-000000000001"), cre("00000000-0000-4000-f000-000000000012", { format: "banner" })]);
    expect([g.open, g.total, g.seriousOpen, g.state]).toEqual([3, 4, 3, "paused_reports"]);
    expect(g.byReason).toEqual([
      { reason: "misleading", open: 1, total: 1 }, { reason: "offensive", open: 1, total: 1 }, { reason: "scam", open: 1, total: 1 }, { reason: "too_often", open: 0, total: 1 },
    ]);
    expect(g.lastAt).toBe("2026-11-16T09:12:40.512331+00:00");
    expect(g.notes.map((n) => [n.reason, n.status])).toEqual([["misleading", "new"], ["too_often", "dismissed"]]);
    expect(g.creative?.id).toBe("00000000-0000-4000-f000-000000000012");   // the creative of the newest report
    expect(JSON.stringify(g)).not.toMatch(/user_id|building_id|serve_id/);
  });
  it("seriousOpen counts only misleading / offensive / scam among the open ones", () => {
    const mixed = [{ ...rows[0], id: "a", reason: "too_often" as const }, { ...rows[1], id: "b" }, { ...rows[3], id: "c", reason: "scam" as const }];
    const [g] = groupReports(mixed, [camp()], []);
    expect([g.open, g.seriousOpen]).toEqual([2, 1]);
  });
  it("the thumbnail falls back to the campaign's first active creative; a deleted campaign is a group with campaign null", () => {
    const noCreative = rows.map((r) => ({ ...r, creative_id: null }));
    const [g] = groupReports(noCreative, [camp()], [cre("x1", { active: false }), cre("x2")]);
    expect(g.creative?.id).toBe("x2");
    const [h] = groupReports(rows, [], []);
    expect([h.campaign, h.state, h.creative]).toEqual([null, "idle", null]);
    expect(decisionsFor(h)).toEqual([]);
  });
  it("a creative of another campaign is never the thumbnail", () => {
    const [g] = groupReports(rows, [camp()], [cre("00000000-0000-4000-f000-000000000012", { campaign_id: "00000000-0000-4000-e000-0000000000aa" })]);
    expect(g.creative).toBeNull();
  });
  it("order: paused by reports first; then most open; then the newest report", () => {
    const mk = (id: string, state: ReportGroup["state"], open: number, lastAt: string): ReportGroup => ({
      campaignId: id, campaign: null, state, creative: null, open, total: open, seriousOpen: 0, byReason: [], lastAt, openLastAt: open ? lastAt : null, notes: [],
    });
    const out = sortGroups([mk("a", "active", 1, "2026-11-16T10:00:00Z"), mk("b", "active", 5, "2026-11-10T10:00:00Z"), mk("c", "paused_reports", 3, "2026-11-01T10:00:00Z"), mk("d", "active", 1, "2026-11-16T11:00:00Z")]);
    expect(out.map((g) => g.campaignId)).toEqual(["c", "b", "d", "a"]);
  });
  it("state: paused + paused_by_reports_at → paused_reports; paused alone → paused; active; draft / ended → idle", () => {
    expect([groupState(camp()), groupState(camp({ paused_by_reports_at: null })), groupState(camp({ status: "active" })), groupState(camp({ status: "ended" })), groupState(camp({ status: "draft" }))])
      .toEqual(["paused_reports", "paused", "active", "idle", "idle"]);
    expect(pausedByReports({ status: "active", paused_by_reports_at: "2026-11-16T09:00:00Z" })).toBe(false);
  });
  it("filters: \"חדשים\" — open reports, or still paused by reports; \"הכל\" — everything", () => {
    const groups = groupReports([...rows, { ...rows[3], id: "z", campaign_id: "00000000-0000-4000-e000-000000000002" }], [camp(), camp({ id: "00000000-0000-4000-e000-000000000002", status: "active", paused_by_reports_at: null })], []);
    expect(groups.map((g) => [g.campaignId.slice(-1), needsReview(g)])).toEqual([["1", true], ["2", false]]);
    expect(filterGroups(groups, "new")).toHaveLength(1);
    expect(filterGroups(groups, "all")).toHaveLength(2);
    // kept paused (reports actioned) — still needs a decision: "בדקנו — תקין" resumes it
    const kept = groupReports(rows.map((r) => ({ ...r, status: "actioned" as const })), [camp()], []);
    expect([kept[0].open, needsReview(kept[0])]).toEqual([0, true]);
  });
  it("at most NOTES_MAX notes are kept per group by the card (the lib keeps all; the card slices)", () => {
    const many: AdReportRow[] = Array.from({ length: 25 }, (_, i) => ({ ...rows[0], id: `n${i}`, created_at: `2026-11-1${i % 6}T08:00:00Z` }));
    expect(groupReports(many, [camp()], [])[0].notes).toHaveLength(25);
    expect(NOTES_MAX).toBe(20);
  });
  it("toReportCampaign / toReportCreative pick only what the queue needs (the browser gets no more)", () => {
    const big = { ...camp(), contract_id: "secret", views: 9, cities: ["חיפה"], building_ids: ["b1"] } as unknown as ReportCampaign;
    expect(Object.keys(toReportCampaign(big)).sort()).toEqual(["advertiser", "advertiser_color", "advertiser_logo", "id", "name", "paused_by_reports_at", "status"]);
    const bigC = { ...cre("c"), cta_url: "https://x", body: "b" } as unknown as ReportCreative;
    expect(Object.keys(toReportCreative(bigC)).sort()).toEqual(["active", "campaign_id", "focal_x", "focal_y", "format", "headline", "id", "image_alt", "image_url"]);
  });
});

describe("the decisions (387) and what each says", () => {
  const rows = parseReportRows(queue.rows);
  const g = (o: Partial<ReportCampaign>) => groupReports(rows, [camp(o)], [])[0];
  it("paused by reports: \"בדקנו — תקין\" (resumes — said) / \"להשאיר מושהה\"", () => {
    const d = decisionsFor(g({}));
    expect(d.map((x) => [x.decision, x.label])).toEqual([["dismiss", "בדקנו — תקין"], ["keep_paused", "להשאיר מושהה"]]);
    expect(d[0].confirm).toBe("לסגור את 3 הדיווחים הפתוחים כתקינים ולהחזיר את הקמפיין לפעול? הוא יחזור להיות מוצג לדיירים מיד.");
    expect(d[1].confirm).toBe("לסמן את 3 הדיווחים הפתוחים כטופלו ולהשאיר את הקמפיין מושהה?");
  });
  it("kept paused (nothing open): dismiss only resumes", () => {
    const kept = groupReports(rows.map((r) => ({ ...r, status: "actioned" as const })), [camp()], [])[0];
    const d = decisionsFor(kept);
    expect(d[0].confirm).toBe("להחזיר את הקמפיין לפעול? הוא יחזור להיות מוצג לדיירים מיד.");
    expect(d[1].confirm).toBe("להשאיר את הקמפיין מושהה?");
  });
  it("active: \"בדקנו — תקין\" (nothing changes) / \"להשהות\" (danger)", () => {
    const d = decisionsFor(g({ status: "active", paused_by_reports_at: null }));
    expect(d.map((x) => [x.decision, x.danger])).toEqual([["dismiss", false], ["pause", true]]);
    expect(d[0].confirm).toBe("לסגור את 3 הדיווחים הפתוחים כתקינים? הקמפיין לא משתנה.");
    expect(d[1].confirm).toBe("להשהות את הקמפיין ולסמן את 3 הדיווחים הפתוחים כטופלו? הוא יפסיק להיות מוצג לדיירים מיד.");
  });
  it("paused by hand: dismiss / keep paused; draft or ended: dismiss / \"סימון כטופל\"", () => {
    expect(decisionsFor(g({ paused_by_reports_at: null })).map((x) => [x.decision, x.label])).toEqual([["dismiss", "בדקנו — תקין"], ["keep_paused", "להשאיר מושהה"]]);
    const ended = decisionsFor(g({ status: "ended", paused_by_reports_at: null }));
    expect(ended.map((x) => [x.decision, x.label])).toEqual([["dismiss", "בדקנו — תקין"], ["keep_paused", "סימון כטופל"]]);
  });
  it("one open report: the singular", () => {
    const one = groupReports([rows[0]], [camp({ status: "active", paused_by_reports_at: null })], [])[0];
    expect(decisionsFor(one)[0].confirm).toBe("לסגור את הדיווח הפתוח כתקין? הקמפיין לא משתנה.");
    expect(decisionsFor(one)[1].confirm).toBe("להשהות את הקמפיין ולסמן את הדיווח הפתוח כטופל? הוא יפסיק להיות מוצג לדיירים מיד.");
  });
  it("reviewBody — bloc's request (minus actor, added by the route), with seen_until (review #10)", () => {
    const { actor: _a, ...asked } = review.request;
    expect(reviewBody(CAMP, "dismiss", review.request.seen_until)).toEqual(asked);
    expect(Object.keys(reviewBody(CAMP, "pause", "x"))).toEqual(["action", "campaign_id", "decision", "seen_until"]);
  });
  it("seen_until = the newest created_at among the reports SHOWN: \"חדשים\" — the open ones; \"הכל\" — all; the string as the DB wrote it", () => {
    const rows = [...parseReportRows(queue.rows), { ...parseReportRows(queue.rows)[3], id: "late-closed", created_at: "2026-11-16T09:30:00.100000+00:00" }];
    const [g] = groupReports(rows, [camp()], []);
    expect(g.openLastAt).toBe("2026-11-16T09:12:40.512331+00:00");   // r3, the newest open — microseconds kept
    expect(g.lastAt).toBe("2026-11-16T09:30:00.100000+00:00");       // a closed one, newer
    expect(seenUntilFor(g, "new")).toBe("2026-11-16T09:12:40.512331+00:00");
    expect(seenUntilFor(g, "all")).toBe("2026-11-16T09:30:00.100000+00:00");
    // kept paused, nothing open: "חדשים" falls back to the newest report (there is nothing open to close)
    const [kept] = groupReports(rows.map((r) => ({ ...r, status: "actioned" as const })), [camp()], []);
    expect([kept.openLastAt, seenUntilFor(kept, "new")]).toEqual([null, kept.lastAt]);
  });
  it("cmpTs orders by time, and inside one millisecond by the microseconds (Date.parse alone would call them equal)", () => {
    expect(cmpTs("2026-11-16T09:12:40.512331+00:00", "2026-11-16T09:12:40.512001+00:00")).toBeGreaterThan(0);
    expect(cmpTs("2026-11-16T09:12:40+00:00", "2026-11-16T10:12:40+00:00")).toBeLessThan(0);
    expect(cmpTs("2026-11-16T11:00:00+02:00", "2026-11-16T09:30:00+00:00")).toBeLessThan(0);   // 09:00Z vs 09:30Z
    expect(cmpTs("2026-11-16T09:12:40.5+00:00", "2026-11-16T09:12:40.5+00:00")).toBe(0);
    const [g] = groupReports([
      { ...parseReportRows(queue.rows)[0], id: "a", created_at: "2026-11-16T09:12:40.512001+00:00" },
      { ...parseReportRows(queue.rows)[0], id: "b", created_at: "2026-11-16T09:12:40.512331+00:00" },
    ], [camp()], []);
    expect(g.openLastAt).toBe("2026-11-16T09:12:40.512331+00:00");
  });
  it("parseReviewAnswer: bloc's status / closed; anything else — null", () => {
    expect(parseReviewAnswer(review.response)).toEqual({ status: "active", closed: 3 });
    expect(parseReviewAnswer({ ok: true, status: "weird", closed: -1 })).toEqual({ status: null, closed: null });
    expect(parseReviewAnswer({ ok: true, closed: 2.5 })).toEqual({ status: null, closed: null });
  });
  it("the notice after each of bloc's answers", () => {
    expect(reviewNotice("dismiss", true, parseReviewAnswer(review.response))).toBe("3 דיווחים נסגרו. הקמפיין חזר לפעול.");
    const byTitle = (t: string) => (review.cases as Array<{ title: string; response: Record<string, unknown> }>).find((c) => c.title.startsWith(t))!;
    expect(reviewNotice("keep_paused", true, parseReviewAnswer(byTitle("keep_paused").response))).toBe("3 דיווחים נסגרו. הקמפיין נשאר מושהה.");
    expect(reviewNotice("pause", false, parseReviewAnswer(byTitle("pause").response))).toBe("דיווח אחד נסגר. הקמפיין הושהה.");
    expect(reviewNotice("dismiss", true, parseReviewAnswer(byTitle("seen_until before the newest open report").response))).toBe("2 דיווחים נסגרו. הקמפיין חזר לפעול.");
    expect(reviewNotice("dismiss", true, parseReviewAnswer(byTitle("dismiss — paused by reports but its dates passed").response)))
      .toBe("3 דיווחים נסגרו. הקמפיין לא חזר לפעול (מושהה) — כנראה שהתאריכים שלו או החוזה כבר לא בתוקף. בדקו בדף הקמפיין.");
    // worded from bloc's status, never assumed (review #10)
    expect(reviewNotice("dismiss", false, { status: "active", closed: 0 })).toBe("לא היו דיווחים פתוחים. הקמפיין פעיל.");
    expect(reviewNotice("dismiss", false, { status: "paused", closed: 2 })).toBe("2 דיווחים נסגרו. הקמפיין מושהה.");
    expect(reviewNotice("dismiss", true, { status: null, closed: null })).toBe("הדיווחים נסגרו. רעננו כדי לראות את מצב הקמפיין.");
    expect(reviewNotice("pause", false, { status: "ended", closed: 2 })).toBe("2 דיווחים נסגרו. הקמפיין לא הושהה (הסתיים).");
    expect(reviewNotice("pause", false, { status: null, closed: 1 })).toBe("דיווח אחד נסגר. רעננו כדי לראות את מצב הקמפיין.");
    expect(reviewNotice("keep_paused", true, { status: "active", closed: 1 })).toBe("דיווח אחד נסגר. הקמפיין פעיל.");
    expect(reviewNotice("keep_paused", false, { status: "ended", closed: 4 })).toBe("4 דיווחים נסגרו. הקמפיין הסתיים.");
    expect(reviewNotice("keep_paused", false, { status: null, closed: 4 })).toBe("4 דיווחים נסגרו. רעננו כדי לראות את מצב הקמפיין.");
  });
});

describe("the screen's words", () => {
  it("the home badge and the report summary", () => {
    expect([reportsCountText(1), reportsCountText(3), reportsCountText(1200)]).toEqual(["דיווח חדש אחד", "3 דיווחים חדשים", "1,200 דיווחים חדשים"]);
    expect([reportsSummaryText(2, 2), reportsSummaryText(2, 5), reportsSummaryText(0, 4), reportsSummaryText(1, 1)])
      .toEqual(["דיווחים: 2 פתוחים", "דיווחים: 2 פתוחים · 5 בסך הכל", "דיווחים: אין פתוחים · 4 בסך הכל", "דיווחים: פתוח אחד"]);
  });
});
