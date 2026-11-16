// src/lib/adsReports.ts — תור הדיווחים על פרסומות (bloc ADS-2ב1, החלטות 386–387, 390). דפדפן ושרת, טהור (בלי I/O).
//
// דייר מדווח על פרסומת באפליקציה (סיבה אחת ופרטים לא חובה); bloc שומר את הדיווח, מסתיר את הקמפיין מהמדווח, וכשמספר המשתמשים
// השונים שדיווחו על קמפיין פעיל בסיבה חמורה (מטעה / פוגעני / הונאה), בדיווחים שעוד לא נבדקו, ב-7 הימים האחרונים מגיע ל-report_pause_at (ברירת מחדל 3;
// 0 — כבוי) — הקמפיין מושהה (status 'paused' ו-paused_by_reports_at). הצוות מחליט בתור: "בדקנו — תקין" (הדיווחים הפתוחים נסגרים;
// קמפיין שהושהה בגלל דיווחים חוזר לפעול), "להשאיר מושהה" (הדיווחים — טופלו), "להשהות" (קמפיין פעיל; הדיווחים — טופלו). כל החלטה —
// reports.review דרך bloc (ad_reports_review), ונרשמת ביומן.
// אף פעם לא מי דיווח: הקריאה של הפאנל לא בוחרת user_id / building_id / serve_id, ו-parseReportRows לא מעתיק אותם גם אם הגיעו.
// כאן: הסיבות בעברית, הקיבוץ לפי קמפיין, הסינון ("חדשים" / "הכל"), הסדר (מושהה בגלל דיווחים — ראשון), ההחלטות האפשריות בכל מצב
// והמשפט אחרי כל החלטה.
// סקירה #10 (שינוי חוזה): כל החלטה שולחת seen_until — ה-created_at החדש ביותר מבין הדיווחים שהוצגו לקמפיין; bloc סוגר רק דיווחים
// פתוחים שנוצרו עד אליו (דיווח שהגיע אחרי שהדף נטען לא נסגר בלי שראו אותו). המחרוזת עוברת כמו שהיא מה-DB (מיקרו-שניות — לא דרך Date).

export const AD_REPORT_REASONS = ["misleading", "offensive", "scam", "irrelevant", "too_often", "other"] as const;
export type AdReportReason = typeof AD_REPORT_REASONS[number];
/** החלטה 386 — הסיבות במילים שהדייר בחר באפליקציה (tests/fixtures/ads2b/queue_rows.json — reasons, כמו ב-bloc). */
export const REASON_LABEL: Record<AdReportReason, string> = {
  misleading: "מטעה", offensive: "פוגעני או לא הולם", scam: "הונאה או ספאם", irrelevant: "לא רלוונטי לי", too_often: "מופיע יותר מדי", other: "אחר",
};
/** החלטה 387: רק אלה נספרות להשהיה האוטומטית. */
export const SERIOUS_REASONS: ReadonlySet<AdReportReason> = new Set<AdReportReason>(["misleading", "offensive", "scam"]);

export type AdReportStatus = "new" | "dismissed" | "actioned";
export const REPORT_STATUS_LABEL: Record<AdReportStatus, string> = { new: "חדש", dismissed: "נבדק — תקין", actioned: "טופל" };

/** דיווח כמו שהפאנל קורא אותו — בלי שום פרט על מי דיווח (אין user_id / building_id / serve_id). */
export interface AdReportRow {
  id: string; campaign_id: string; creative_id: string | null; reason: AdReportReason; note: string | null;
  status: AdReportStatus; created_at: string; reviewed_at: string | null;
}
/** העמודות שהפאנל בוחר מ-ad_reports — ורק הן (בדיקת חיווט: אין כאן מזהה של אדם, בניין או הגשה). */
export const REPORT_COLUMNS = "id, campaign_id, creative_id, reason, note, status, created_at, reviewed_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
const isReason = (v: unknown): v is AdReportReason => typeof v === "string" && (AD_REPORT_REASONS as readonly string[]).includes(v);
const isStatus = (v: unknown): v is AdReportStatus => v === "new" || v === "dismissed" || v === "actioned";
/**
 * סדר של חותמות זמן מה-DB: לפי הזמן, ובאותה אלפית שנייה — לפי המחרוזת (באותו פורמט היא מסדרת גם מיקרו-שניות). שלילי — a קודם.
 * Date.parse לבד היה משווה 09:12:40.512331 ו-09:12:40.512001 כשווים.
 */
export function cmpTs(a: string, b: string): number {
  const d = Date.parse(a) - Date.parse(b);
  if (d !== 0 && !Number.isNaN(d)) return d;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** מה שה-DB החזיר → דיווחים בדוקים. שורה בלי קמפיין / סיבה / מצב / זמן תקינים — לא נכנסת. רק השדות של AdReportRow מועתקים. */
export function parseReportRows(raw: unknown): AdReportRow[] {
  if (!Array.isArray(raw)) return [];
  const out: AdReportRow[] = [];
  for (const r of raw) {
    if (!isObj(r)) continue;
    const created = iso(r.created_at);
    if (typeof r.id !== "string" || typeof r.campaign_id !== "string" || !UUID.test(r.campaign_id) || !isReason(r.reason) || !isStatus(r.status) || !created) continue;
    const note = typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 300) : null;
    out.push({
      id: r.id, campaign_id: r.campaign_id, creative_id: typeof r.creative_id === "string" && UUID.test(r.creative_id) ? r.creative_id : null,
      reason: r.reason, note, status: r.status, created_at: created, reviewed_at: iso(r.reviewed_at),
    });
  }
  return out;
}

// ── הקיבוץ לפי קמפיין ──

/** מה התור צריך לדעת על קמפיין (מ-AdCampaignRow). */
export interface ReportCampaign {
  id: string; name: string; status: string; advertiser: string; advertiser_logo: string | null; advertiser_color: string | null;
  paused_by_reports_at: string | null;
}
/** מה התור צריך לדעת על מודעה (התמונה הקטנה). */
export interface ReportCreative { id: string; campaign_id: string; image_url: string; image_alt: string; focal_x: number; focal_y: number; format: string; active: boolean; headline: string }

/** רק מה שהתור צריך מקמפיין (גם מה שנשלח לדפדפן — בלי שאר השדות של AdCampaignRow). */
export const toReportCampaign = (c: ReportCampaign): ReportCampaign => ({
  id: c.id, name: c.name, status: c.status, advertiser: c.advertiser, advertiser_logo: c.advertiser_logo, advertiser_color: c.advertiser_color,
  paused_by_reports_at: c.paused_by_reports_at,
});
/** רק מה שהתור צריך ממודעה (התמונה הקטנה). */
export const toReportCreative = (c: ReportCreative): ReportCreative => ({
  id: c.id, campaign_id: c.campaign_id, image_url: c.image_url, image_alt: c.image_alt, focal_x: c.focal_x, focal_y: c.focal_y, format: c.format,
  active: c.active, headline: c.headline,
});

/** paused_reports — הושהה אוטומטית בגלל דיווחים; paused — הושהה ביד; active — פעיל; idle — טיוטה / הסתיים / לא ידוע. */
export type ReportGroupState = "paused_reports" | "paused" | "active" | "idle";
export const pausedByReports = (c: { status: string; paused_by_reports_at: string | null }) => c.status === "paused" && !!c.paused_by_reports_at;
export function groupState(c: ReportCampaign | null): ReportGroupState {
  if (!c) return "idle";
  if (pausedByReports(c)) return "paused_reports";
  if (c.status === "paused") return "paused";
  if (c.status === "active") return "active";
  return "idle";
}

export interface ReportNote { id: string; reason: AdReportReason; note: string; created_at: string; status: AdReportStatus }
export interface ReportGroup {
  campaignId: string;
  /** null — הקמפיין לא נמצא בקריאה (נמחק בינתיים). */
  campaign: ReportCampaign | null;
  state: ReportGroupState;
  creative: ReportCreative | null;
  open: number; total: number; seriousOpen: number;
  byReason: Array<{ reason: AdReportReason; open: number; total: number }>;
  /** הדיווח האחרון (מכל המצבים); openLastAt — הפתוח האחרון (אין פתוח — null). */
  lastAt: string; openLastAt: string | null;
  notes: ReportNote[];
}
/** כמה הערות לכל היותר בכל קמפיין (השאר — "ועוד N"). */
export const NOTES_MAX = 20;

/**
 * הדיווחים → קבוצה לכל קמפיין: מספרים לפי סיבה (פתוחים / סה"כ), הדיווח האחרון, ההערות (עם הסיבה, התאריך והמצב — בלי מי), והתמונה
 * של המודעה שדווחה לאחרונה (אחרת המודעה הפעילה הראשונה של הקמפיין).
 */
export function groupReports(rows: readonly AdReportRow[], campaigns: readonly ReportCampaign[], creatives: readonly ReportCreative[]): ReportGroup[] {
  const camp = new Map(campaigns.map((c) => [c.id, c]));
  const cre = new Map(creatives.map((c) => [c.id, c]));
  const by = new Map<string, AdReportRow[]>();
  for (const r of rows) by.set(r.campaign_id, [...(by.get(r.campaign_id) ?? []), r]);
  const out: ReportGroup[] = [];
  for (const [campaignId, list] of by) {
    const sorted = [...list].sort((a, b) => cmpTs(b.created_at, a.created_at));
    const c = camp.get(campaignId) ?? null;
    const open = sorted.filter((r) => r.status === "new");
    const reported = sorted.map((r) => (r.creative_id ? cre.get(r.creative_id) : undefined)).find((x) => x && x.campaign_id === campaignId) ?? null;
    const fallback = creatives.find((x) => x.campaign_id === campaignId && x.active) ?? creatives.find((x) => x.campaign_id === campaignId) ?? null;
    out.push({
      campaignId, campaign: c, state: groupState(c), creative: reported ?? fallback,
      open: open.length, total: sorted.length, seriousOpen: open.filter((r) => SERIOUS_REASONS.has(r.reason)).length,
      byReason: AD_REPORT_REASONS.map((reason) => ({
        reason, open: open.filter((r) => r.reason === reason).length, total: sorted.filter((r) => r.reason === reason).length,
      })).filter((x) => x.total > 0),
      lastAt: sorted[0].created_at, openLastAt: open.length ? open[0].created_at : null,
      notes: sorted.filter((r) => r.note).map((r) => ({ id: r.id, reason: r.reason, note: r.note as string, created_at: r.created_at, status: r.status })),
    });
  }
  return sortGroups(out);
}

/** הסדר: מושהה בגלל דיווחים — ראשון (באדום); אחר כך הכי הרבה פתוחים; אחר כך הדיווח האחרון. */
export function sortGroups(list: readonly ReportGroup[]): ReportGroup[] {
  const rank = (g: ReportGroup) => (g.state === "paused_reports" ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || b.open - a.open || cmpTs(b.lastAt, a.lastAt));
}

export type ReportsFilter = "new" | "all";
export const REPORTS_FILTERS: Array<{ key: ReportsFilter; label: string }> = [{ key: "new", label: "חדשים" }, { key: "all", label: "הכל" }];
/** "חדשים" — קבוצות עם דיווח פתוח, או קמפיין שעדיין מושהה בגלל דיווחים; "הכל" — כל קבוצה. */
export const needsReview = (g: ReportGroup) => g.open > 0 || g.state === "paused_reports";
export const filterGroups = (list: readonly ReportGroup[], f: ReportsFilter): ReportGroup[] => (f === "all" ? [...list] : list.filter(needsReview));

// ── ההחלטות ──

export const REVIEW_DECISIONS = ["dismiss", "keep_paused", "pause"] as const;
export type ReviewDecision = typeof REVIEW_DECISIONS[number];
export interface DecisionOption { decision: ReviewDecision; label: string; primary: boolean; confirm: string; danger: boolean }

const openText = (n: number) => (n === 1 ? "הדיווח הפתוח" : `${n} הדיווחים הפתוחים`);
const asOk = (n: number) => (n === 1 ? "כתקין" : "כתקינים");
const asDone = (n: number) => (n === 1 ? "כטופל" : "כטופלו");
/**
 * מה אפשר להחליט (החלטה 387): קמפיין מושהה (בגלל דיווחים או ביד) — "בדקנו — תקין" / "להשאיר מושהה"; פעיל — "בדקנו — תקין" /
 * "להשהות"; טיוטה / הסתיים — "בדקנו — תקין" / "סימון כטופל". קבוצה בלי דיווח פתוח שלא מושהית בגלל דיווחים — אין מה להחליט.
 * לכל החלטה — משפט אישור שאומר מה יקרה.
 */
export function decisionsFor(g: ReportGroup): DecisionOption[] {
  if (!needsReview(g) || !g.campaign) return [];
  const n = g.open;
  const dismiss: DecisionOption = g.state === "paused_reports"
    ? { decision: "dismiss", label: "בדקנו — תקין", primary: true, danger: false, confirm: `${n ? `לסגור את ${openText(n)} ${asOk(n)} ולהחזיר` : "להחזיר"} את הקמפיין לפעול? הוא יחזור להיות מוצג לדיירים מיד.` }
    : { decision: "dismiss", label: "בדקנו — תקין", primary: true, danger: false, confirm: `לסגור את ${openText(n)} ${asOk(n)}? הקמפיין לא משתנה.` };
  if (g.state === "paused_reports" || g.state === "paused") {
    return [dismiss, { decision: "keep_paused", label: "להשאיר מושהה", primary: false, danger: false, confirm: n ? `לסמן את ${openText(n)} ${asDone(n)} ולהשאיר את הקמפיין מושהה?` : "להשאיר את הקמפיין מושהה?" }];
  }
  if (g.state === "active") {
    return [dismiss, { decision: "pause", label: "להשהות", primary: false, danger: true, confirm: `להשהות את הקמפיין ולסמן את ${openText(n)} ${asDone(n)}? הוא יפסיק להיות מוצג לדיירים מיד.` }];
  }
  return [dismiss, { decision: "keep_paused", label: "סימון כטופל", primary: false, danger: false, confirm: `לסמן את ${openText(n)} ${asDone(n)}? הקמפיין לא פעיל, והוא לא משתנה.` }];
}

/** reports.review — מה נשלח ל-/api/ads (ומשם, חתום, ל-bloc). */
/**
 * seen_until (סקירה #10): ה-created_at החדש ביותר מבין הדיווחים שמוצגים לקמפיין — ב"חדשים" הפתוחים (אין פתוח — האחרון בכלל, ואז
 * אין מה לסגור), ב"הכל" — כולם. bloc סוגר רק דיווחים פתוחים שנוצרו עד אליו.
 */
export const seenUntilFor = (g: Pick<ReportGroup, "lastAt" | "openLastAt">, filter: ReportsFilter): string =>
  (filter === "new" ? g.openLastAt ?? g.lastAt : g.lastAt);
export const reviewBody = (campaignId: string, decision: ReviewDecision, seenUntil: string) =>
  ({ action: "reports.review" as const, campaign_id: campaignId, decision, seen_until: seenUntil });

/** התשובה של bloc (דרך הפאנל): status — מצב הקמפיין אחרי ההחלטה; closed — כמה דיווחים נסגרו. שדה חסר / לא תקין — null. */
export interface ReviewAnswer { status: string | null; closed: number | null }
export function parseReviewAnswer(d: Record<string, unknown>): ReviewAnswer {
  const status = typeof d.status === "string" && ["draft", "active", "paused", "ended"].includes(d.status) ? d.status : null;
  const closed = typeof d.closed === "number" && Number.isInteger(d.closed) && d.closed >= 0 ? d.closed : null;
  return { status, closed };
}

const CAMPAIGN_STATUS_HE: Record<string, string> = { draft: "טיוטה", active: "פעיל", paused: "מושהה", ended: "הסתיים" };
/** מצב הקמפיין כמו ש-bloc החזיר, במשפט. */
const STATUS_NOW: Record<string, string> = { draft: "הקמפיין טיוטה.", active: "הקמפיין פעיל.", paused: "הקמפיין מושהה.", ended: "הקמפיין הסתיים." };
/**
 * המשפט אחרי החלטה שהצליחה — לפי מה ש-bloc החזיר (status, closed), אף פעם לא לפי מה שציפינו (סקירה #10): אין מצב — "רעננו".
 */
export function reviewNotice(decision: ReviewDecision, wasPausedByReports: boolean, a: ReviewAnswer): string {
  const closed = a.closed === null ? "הדיווחים נסגרו." : a.closed === 0 ? "לא היו דיווחים פתוחים." : a.closed === 1 ? "דיווח אחד נסגר." : `${a.closed} דיווחים נסגרו.`;
  const st = a.status;
  if (!st) return `${closed} רעננו כדי לראות את מצב הקמפיין.`;
  if (decision === "dismiss" && wasPausedByReports) {
    return st === "active" ? `${closed} הקמפיין חזר לפעול.`
      : `${closed} הקמפיין לא חזר לפעול (${CAMPAIGN_STATUS_HE[st]}) — כנראה שהתאריכים שלו או החוזה כבר לא בתוקף. בדקו בדף הקמפיין.`;
  }
  if (decision === "pause") return st === "paused" ? `${closed} הקמפיין הושהה.` : `${closed} הקמפיין לא הושהה (${CAMPAIGN_STATUS_HE[st]}).`;
  if (decision === "keep_paused" && st === "paused") return `${closed} הקמפיין נשאר מושהה.`;
  return `${closed} ${STATUS_NOW[st]}`;
}

// ── המשפטים של המסך ──

/** התג במסך הבית של הסטודיו: "3 דיווחים חדשים" / "דיווח חדש אחד". */
export const reportsCountText = (n: number) => (n === 1 ? "דיווח חדש אחד" : `${n.toLocaleString("he-IL")} דיווחים חדשים`);
export const PAUSED_BY_REPORTS_TEXT = "הושהה אוטומטית בגלל דיווחים";
export const PAUSED_BY_REPORTS_SHORT = "הושהה בגלל דיווחים";
export const REPORTS_SQL_MISSING_TEXT = "תור הדיווחים יופיע אחרי SQL 231 של bloc.";
export const REPORTS_FAILED_TEXT = "לא הצלחנו לטעון את הדיווחים. זו תקלה בקריאה — הדיווחים עצמם לא נפגעו.";
export const REPORTS_EMPTY_NEW_TEXT = "אין דיווחים שמחכים לבדיקה.";
export const REPORTS_EMPTY_ALL_TEXT = "עוד לא דווח על אף פרסומת.";
export const REPORTS_PRIVACY_TEXT = "בלי פרטים על מי דיווח: לא שם, לא בניין ולא עיר. המפרסם לא יודע על הדיווחים.";
/** "דיווחים: 2 פתוחים · 5 בסך הכל" (בדוח של קמפיין). */
export function reportsSummaryText(open: number, total: number): string {
  const o = open === 0 ? "אין פתוחים" : open === 1 ? "פתוח אחד" : `${open} פתוחים`;
  return total > open ? `דיווחים: ${o} · ${total} בסך הכל` : `דיווחים: ${o}`;
}
