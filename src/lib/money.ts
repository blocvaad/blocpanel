// src/lib/money.ts — בקרת כסף: מה דורש עין אנושית, בסדר עדיפות.
//
// כל פריט כאן הוא מצב שהמערכת בכוונה *לא* סוגרת לבד (122/123/124):
//   • callback של סליקה על חיוב סגור / בלי אסימון  → כסף שהגיע ולא נרשם
//   • דיווח "שילמתי" שהוועד לא מטפל בו              → דייר תקוע
//   • ספק שדיווח שהתשלום לא הגיע                     → מחלוקת פתוחה
//   • הוראת קבע שבוטלה אבל לא אושרה כעצורה            → סיכון לחיוב כפול
//   • גבייה חיצונית שלא מתעדכנת                        → חברת ניהול לא מייבאת
//   • PAY-0: חיוב מנוי ל-bloc ש-PayPlus דיווח ולא הוחל  → אולי צריך להחזיר ללקוח
export type Severity = "critical" | "warning" | "info";

export type MoneyInput = {
  webhookReviews: Array<{ reason: string | null }>;
  staleReports: number;           // pending_approval מעל 7 ימים
  disputes: number | null;        // null = הקריאה נכשלה
  recurringNotStopped: number;
  stuckCheckouts: number;
  staleExternal: number;          // external_pending מעל 45 יום
  /** PAY-0: callbacks חתומים של מנוי שלא הוחלו (billing_webhook_events status 'failed', 30 יום). null — הקריאה נכשלה. */
  billingRejected?: number | null;
  /**
   * PAY-0 (סקירה): הספירות מה-DB (בלי תקרת הרשימה של 50, ובלי דחיית כרטיס רגילה שתופסת מקום). null — הקריאה נכשלה.
   * בלי הספירות — נגזר מ-webhookReviews (התנהגות קודמת).
   */
  reviewTotal?: number | null;
  transientTotal?: number | null;
};

/** count null — לא נקרא (לא "0"): האריח אומר את זה (design-language §8). */
export type MoneyTile = { key: string; title: string; count: number | null; severity: Severity; hint: string };

const FAILED_READ = "הקריאה נכשלה — נסו לרענן.";

/** כל סיבה ש-bloc כותב ל-webhook_log (event_type 'failed') — מה זה אומר לצוות. */
export const REVIEW_REASON: Record<string, string> = {
  closed_payment:      "תשלום הגיע לחיוב שכבר נסגר (בוטל/פטור/זוכה)",
  unknown_status:      "תשלום הגיע לחיוב במצב לא מוכר",
  missing_url_token:   "Cardcom / Grow בלי אסימון — checkout ישן או ניסיון זיוף",
  double_payment:      "ייתכן תשלום כפול — עסקה נוספת על חיוב ששולם",
  amount_mismatch:     "סכום או מטבע שונים מהחיוב — החיוב נשאר פתוח",
  duplicate_reference: "מספר העסקה כבר רשום על חיוב אחר — לא נרשם",
  not_a_charge:        "הספק דיווח על זיכוי או ביטול — ב-bloc החיוב לא השתנה",
  ledger_write_failed: "שולם, אבל השורה ביומן הכספי (finance_log) לא נכתבה",
  unknown_payment:     "callback מאומת לחיוב שלא קיים בבניין",
  db_error:            "תקלה רגעית ב-DB — הספק שולח שוב; לבדוק רק אם החיוב לא נסגר",
};

/** תקלה רגעית — הספק שולח שוב. נספרת בנפרד, ולא כ"כסף שמחכה להחלטה". */
export const TRANSIENT_REVIEW: ReadonlySet<string> = new Set(["db_error"]);

/** סיבות הדחייה של callback של מנוי (bloc → billing_webhook_events.error). */
export const BILLING_REASON: Record<string, string> = {
  unknown_subscription:            "מנוי לא מוכר",
  amount_mismatch:                 "סכום שונה מהמסלול",
  currency:                        "מטבע שאינו שקל",
  charge_on_inactive_subscription: "חיוב על מנוי שבוטל או הוחלף",
  not_a_charge:                    "זיכוי או ביטול מ-PayPlus — לא הוחל",
};

const ilsText = (n: unknown) => `₪${Number(n ?? 0).toLocaleString("he-IL")}`;

/** השורה המשנית של פריט "לבדיקה": מה הסיבה, ולסכום שונה — כמה שולם וכמה החיוב. */
export function reviewLine(r: { reason: string; amount?: unknown; owed?: unknown; detail?: unknown; kind?: unknown }): string {
  const label = REVIEW_REASON[r.reason] ?? r.reason;
  if (r.reason === "amount_mismatch" && r.owed != null) {
    const why = r.detail === "currency" ? " · מטבע אחר" : r.detail === "changed" ? " · החיוב השתנה בזמן התשלום" : "";
    return `${label} · שולם ${ilsText(r.amount)}, החיוב ${ilsText(r.owed)}${why}`;
  }
  if (r.reason === "not_a_charge" && typeof r.kind === "string" && r.kind) return `${label} · ${r.kind}`;
  return label;
}

/** billing_webhook_events.error: ה-JSON ש-bloc כותב (PAY-0), או טקסט חופשי משורות ישנות. */
export function billingRejection(error: string | null | undefined): { reason: string | null; label: string; amount: number | null } {
  if (!error) return { reason: null, label: "נדחה", amount: null };
  try {
    const j = JSON.parse(error) as { reason?: unknown; amount?: unknown };
    const reason = typeof j.reason === "string" ? j.reason : null;
    return { reason, label: (reason && BILLING_REASON[reason]) ?? reason ?? "נדחה", amount: typeof j.amount === "number" ? j.amount : null };
  } catch {
    return { reason: null, label: error.slice(0, 80), amount: null };
  }
}

/** ספירה שנקראה (מספר) או לא (null): לא נקרא — אזהרה עם "הקריאה נכשלה"; אחרת — לפי הספירה. */
function tile(key: string, title: string, count: number | null, whenSome: Severity, hint: string): MoneyTile {
  if (count === null) return { key, title, count: null, severity: "warning", hint: FAILED_READ };
  return { key, title, count, severity: count ? whenSome : "info", hint };
}

export function summarizeMoney(i: MoneyInput): MoneyTile[] {
  const real = i.webhookReviews.filter((r) => !TRANSIENT_REVIEW.has(r.reason ?? ""));
  const reviewTotal = i.reviewTotal !== undefined ? i.reviewTotal : real.length;
  const transientTotal = i.transientTotal !== undefined ? i.transientTotal : i.webhookReviews.length - real.length;
  const billingRejected = i.billingRejected === undefined ? 0 : i.billingRejected;
  const tiles: MoneyTile[] = [
    tile("webhook_review", "תשלומים מקוונים לבדיקה", reviewTotal, "critical",
      "כסף שהספק דיווח ו-bloc לא סגר אוטומטית. לבדוק מול דוח הסליקה ולסגור ידנית אצל הוועד."),
    tile("billing_rejected", "חיובי מנוי ל-bloc שנדחו", billingRejected, "critical",
      "PayPlus דיווח על כסף למנוי ו-bloc לא הפעיל אותו (מנוי לא מוכר, סכום או מטבע שונה, זיכוי, חיוב על מנוי שבוטל). לבדוק אם צריך להחזיר ללקוח."),
    tile("webhook_db_error", "תקלות DB רגעיות ב-webhook", transientTotal, "warning",
      "הספק קיבל 503 ושולח שוב. אם החיוב עדיין פתוח אחרי יום — לבדוק מול דוח הסליקה."),
    { key: "recurring_not_stopped", title: "הוראות קבע שלא נעצרו", count: i.recurringNotStopped, severity: i.recurringNotStopped ? "critical" : "info",
      hint: "מנוי שבוטל או הוחלף והוראת הקבע לא אושרה כעצורה ב-PayPlus — סיכון לחיוב כפול." },
    // LEDGER-1b: null = הקריאה נכשלה (123 רצה מזמן) — "—" ואזהרה, לא 0.
    tile("disputes", "מחלוקות ספקים פתוחות", i.disputes, "warning", "ספק דיווח שהתשלום לא הגיע או הגיע בסכום שגוי."),
    { key: "stale_reports", title: "דיווחי תשלום תקועים (7+ ימים)", count: i.staleReports, severity: i.staleReports ? "warning" : "info",
      hint: "דייר דיווח ששילם והוועד לא אישר ולא דחה." },
    { key: "stale_external", title: "גבייה חיצונית לא מעודכנת (45+ יום)", count: i.staleExternal, severity: i.staleExternal ? "warning" : "info",
      hint: "חברת הניהול לא מייבאת קובץ התאמה — הדיירים נראים כלא-שילמו." },
    { key: "stuck_checkouts", title: "דפי תשלום פתוחים (מנוי ל-bloc)", count: i.stuckCheckouts, severity: "info",
      hint: "ועד/חברה פתחו דף תשלום ולא השלימו. הזדמנות לשיחה." },
  ];
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return tiles.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.count ?? 0) - (a.count ?? 0));
}
