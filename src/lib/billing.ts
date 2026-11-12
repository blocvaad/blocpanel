// src/lib/billing.ts (blocpanel)
//
// סיכום מצב חיוב הפלטפורמה לסופר-אדמין. טהור — מקבל שורות מ-billing_subscriptions
// ומחזיר מספרים והתראות. אין כאן פעולות כתיבה: הפאנל לא "מסמן שולם".

export type SubRow = {
  id: string;
  owner_type: string;
  owner_id: string;
  plan_id: string;
  status: string;
  amount_ils: number | string;
  founding_price: boolean;
  current_period_end: string | null;
  past_due_since: string | null;
  provider_recurring_uid: string | null;
  provider_cancelled_at: string | null;
  cancel_requested_at: string | null;
  created_at: string;
  /** BILL-1a (221): סיום מנוי. */
  ended_at?: string | null;
  ended_reason?: string | null;
};

export type BillingSummary = {
  mrr: number;                // חוזר חודשי: פעיל + בפיגור (אמורים להתחדש)
  endingRevenue: number;      // ממתין לביטול — משלם עד סוף התקופה ולא מתחדש
  counts: Record<string, number>;
  founding: number;
  alerts: {
    recurringNotStopped: SubRow[]; // בוטל/הוחלף אבל הוראת הקבע לא אושרה כעצורה ב-PayPlus
    stuckCheckouts: SubRow[];      // דף תשלום פתוח יותר מיממה
    pastDue: SubRow[];
    /** BILL-1a: ביטול בלי הוראת קבע ידועה וללא אישור עצירה — עצירה ידנית ב-PayPlus (משימה). */
    manualStop: SubRow[];
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const num = (v: number | string) => Number(v) || 0;

export function summarizeBilling(rows: SubRow[], now: number = Date.now()): BillingSummary {
  const counts: Record<string, number> = {};
  let mrr = 0;
  let endingRevenue = 0;
  let founding = 0;

  for (const r of rows) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    if (r.status === "active" || r.status === "past_due") mrr += num(r.amount_ils);
    if (r.status === "cancel_pending") endingRevenue += num(r.amount_ils);
    if (r.founding_price && ["trialing", "active", "past_due", "cancel_pending"].includes(r.status)) founding += 1;
  }

  return {
    mrr: Math.round(mrr * 100) / 100,
    endingRevenue: Math.round(endingRevenue * 100) / 100,
    counts,
    founding,
    alerts: {
      recurringNotStopped: rows.filter(
        (r) => (r.status === "cancelled" || r.status === "cancel_pending") && !!r.provider_recurring_uid && !r.provider_cancelled_at,
      ),
      stuckCheckouts: rows.filter(
        (r) => r.status === "checkout_pending" && now - new Date(r.created_at).getTime() > DAY_MS,
      ),
      pastDue: rows.filter((r) => r.status === "past_due"),
      manualStop: rows.filter((r) => r.status === "cancel_pending" && !r.provider_recurring_uid && !r.provider_cancelled_at),
    },
  };
}

// ── מצב חיבור PayPlus, לפי עדויות בבסיס הנתונים ─────────────────────────────
// הפאנל לא פונה ל-bloc ולא מחזיק מפתחות. המפתחות יושבים בסביבת bloc ב-Vercel,
// והעדות היחידה האמינה לכך שהם עובדים היא שדף תשלום נוצר בפועל (PayPlus החזיר
// קישור) ושהתקבל callback חתום. זה גם מה שמעניין בפועל: לא "האם הוגדר משתנה"
// אלא "האם התשלום עובד".
export type PayPlusEvidence = {
  state: 'never_used' | 'checkout_created' | 'working';
  lastEventAt: string | null;
  lastCheckoutAt: string | null;
};

export function payplusEvidence(rows: SubRow[], lastEventAt: string | null): PayPlusEvidence {
  const checkouts = rows
    .filter((r) => !!(r as { provider_page_request_uid?: string | null }).provider_page_request_uid)
    .map((r) => r.created_at)
    .sort();
  const lastCheckoutAt = checkouts.length ? checkouts[checkouts.length - 1] : null;
  return {
    state: lastEventAt ? 'working' : lastCheckoutAt ? 'checkout_created' : 'never_used',
    lastEventAt,
    lastCheckoutAt,
  };
}

export const PAYPLUS_STATE_TEXT: Record<PayPlusEvidence['state'], string> = {
  never_used:       'עדיין לא נוצר אף דף תשלום — התצורה לא נבדקה בפועל. המפתחות מוגדרים בסביבת bloc ב-Vercel.',
  checkout_created: 'דף תשלום נוצר בהצלחה (המפתחות עובדים), אבל עוד לא התקבל אישור תשלום מ-PayPlus.',
  working:          'תשלומים עובדים — התקבל callback חתום מ-PayPlus.',
};

export const STATUS_LABELS: Record<string, string> = {
  checkout_pending: "ממתין לתשלום",
  trialing: "ניסיון (כרטיס נשמר)",
  active: "פעיל",
  past_due: "בפיגור",
  cancel_pending: "ממתין לביטול",
  cancelled: "בוטל",
  suspended: "מושהה",
  comp: "ללא תשלום",
  refunded: "הוחזר",
};

/** subscriptions.ended_reason (221). */
export const ENDED_LABELS: Record<string, string> = {
  period_ended: "התקופה הסתיימה",
  refund_full: "הוחזר במלואו",
  chargeback: "חיוב נדחה בכרטיס",
};

/** billing_tasks.kind (221). */
export const TASK_KIND_LABELS: Record<string, string> = {
  manual_stop_recurring: "עצירה ידנית",
  orphan_recurring: "הוראה יתומה",
  refund_review: "החזר לבדיקה",
  refund_unmatched: "החזר לא מותאם",
  post_refund_recurring_check: "בדיקת הוראה אחרי החזר",
  charge_after_cancel_request: "חיוב אחרי בקשת ביטול",
  past_due_stale: "פיגור ממושך",
  company_takeover: "השתלטות חברה",
  stop_old_recurring: "עצירת הוראה ישנה",
};

/** מה לעשות, במשפט אחד, לכל סוג משימה. */
export const TASK_KIND_HINT: Record<string, string> = {
  manual_stop_recurring: "לעצור את הוראת הקבע ב-PayPlus ידנית, ואז ללחוץ \"עצרתי\" עם תיעוד.",
  orphan_recurring: "הגיעה הוראת קבע אחרת מזו הרשומה במנוי — לבדוק ב-PayPlus ולעצור את המיותרת.",
  refund_review: "הגיע החזר שלא הוחל אוטומטית — לבדוק מול PayPlus ולהחליט.",
  refund_unmatched: "הגיע החזר שלא הותאם לאף חיוב — לאתר את העסקה.",
  post_refund_recurring_check: "אחרי החזר — לוודא שהוראת הקבע נעצרה ב-PayPlus.",
  charge_after_cancel_request: "בוצע חיוב אחרי שהלקוח ביקש לבטל — לבדוק אם להחזיר.",
  past_due_stale: "מנוי בפיגור מעל 30 יום — לפנות ללקוח או לסגור.",
};

export const REFUND_KIND_LABELS: Record<string, string> = { refund: "החזר", chargeback: "ביטול חיוב בכרטיס" };
export const REFUND_CLASS_LABELS: Record<string, string> = {
  full: "מלא", partial: "חלקי", unmatched: "לא מותאם", older_period: "תקופה קודמת",
};
export const REFUND_OUTCOME_LABELS: Record<string, string> = {
  applied: "הוחל", flagged: "לבדיקה", recorded: "נרשם",
};
export const REFUND_PRODUCT_LABELS: Record<string, string> = { subscription: "מנוי", ai_topup: "קרדיטי AI" };
