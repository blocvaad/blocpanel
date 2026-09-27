// src/lib/money.ts — בקרת כסף: מה דורש עין אנושית, בסדר עדיפות.
//
// כל פריט כאן הוא מצב שהמערכת בכוונה *לא* סוגרת לבד (122/123/124):
//   • callback של סליקה על חיוב סגור / בלי אסימון  → כסף שהגיע ולא נרשם
//   • דיווח "שילמתי" שהוועד לא מטפל בו              → דייר תקוע
//   • ספק שדיווח שהתשלום לא הגיע                     → מחלוקת פתוחה
//   • הוראת קבע שבוטלה אבל לא אושרה כעצורה            → סיכון לחיוב כפול
//   • גבייה חיצונית שלא מתעדכנת                        → חברת ניהול לא מייבאת
export type Severity = "critical" | "warning" | "info";

export type MoneyInput = {
  webhookReviews: Array<{ reason: string | null }>;
  staleReports: number;           // pending_approval מעל 7 ימים
  disputes: number | null;        // null = 123 לא רץ
  recurringNotStopped: number;
  stuckCheckouts: number;
  staleExternal: number;          // external_pending מעל 45 יום
};

export type MoneyTile = { key: string; title: string; count: number; severity: Severity; hint: string };

export const REVIEW_REASON: Record<string, string> = {
  closed_payment:    "תשלום הגיע לחיוב שכבר נסגר (בוטל/פטור/זוכה)",
  unknown_status:    "תשלום הגיע לחיוב במצב לא מוכר",
  missing_url_token: "Cardcom בלי אסימון — checkout ישן או ניסיון זיוף",
};

export function summarizeMoney(i: MoneyInput): MoneyTile[] {
  const tiles: MoneyTile[] = [
    { key: "webhook_review", title: "תשלומים מקוונים לבדיקה", count: i.webhookReviews.length, severity: i.webhookReviews.length ? "critical" : "info",
      hint: "כסף שהספק דיווח ו-bloc לא סגר אוטומטית. לבדוק מול דוח הסליקה ולסגור ידנית אצל הוועד." },
    { key: "recurring_not_stopped", title: "הוראות קבע שלא נעצרו", count: i.recurringNotStopped, severity: i.recurringNotStopped ? "critical" : "info",
      hint: "מנוי שבוטל או הוחלף והוראת הקבע לא אושרה כעצורה ב-PayPlus — סיכון לחיוב כפול." },
    { key: "disputes", title: "מחלוקות ספקים פתוחות", count: i.disputes ?? 0, severity: i.disputes ? "warning" : "info",
      hint: i.disputes === null ? "מיגרציה 123 עוד לא רצה." : "ספק דיווח שהתשלום לא הגיע או הגיע בסכום שגוי." },
    { key: "stale_reports", title: "דיווחי תשלום תקועים (7+ ימים)", count: i.staleReports, severity: i.staleReports ? "warning" : "info",
      hint: "דייר דיווח ששילם והוועד לא אישר ולא דחה." },
    { key: "stale_external", title: "גבייה חיצונית לא מעודכנת (45+ יום)", count: i.staleExternal, severity: i.staleExternal ? "warning" : "info",
      hint: "חברת הניהול לא מייבאת קובץ התאמה — הדיירים נראים כלא-שילמו." },
    { key: "stuck_checkouts", title: "דפי תשלום פתוחים (מנוי ל-bloc)", count: i.stuckCheckouts, severity: "info",
      hint: "ועד/חברה פתחו דף תשלום ולא השלימו. הזדמנות לשיחה." },
  ];
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return tiles.sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
}
