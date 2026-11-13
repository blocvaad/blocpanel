// src/lib/billing.ts (blocpanel)
//
// סיכום מצב חיוב הפלטפורמה לסופר-אדמין. טהור — מקבל שורות מ-billing_subscriptions
// ומחזיר מספרים והתראות. אין כאן פעולות כתיבה: הפאנל לא "מסמן שולם".
import { PAYING_STATUSES } from "./plans";

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
  company_takeover: "העברה לחברת ניהול",
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
  // BILL-1b (API §5 / PLAN §3)
  company_takeover: "העברת החיוב לחברה נכשלה 3 פעמים — עצרו את הוראת הקבע של הבניין ב-PayPlus ובדקו.",
  stop_old_recurring: "שדרוג: עצרו את ההוראה הישנה ב-PayPlus, ואז לחצו \"עצרתי\" עם תיעוד.",
};

export const REFUND_KIND_LABELS: Record<string, string> = { refund: "החזר", chargeback: "ביטול חיוב בכרטיס" };
export const REFUND_CLASS_LABELS: Record<string, string> = {
  full: "מלא", partial: "חלקי", unmatched: "לא מותאם", older_period: "תקופה קודמת",
};
export const REFUND_OUTCOME_LABELS: Record<string, string> = {
  applied: "הוחל", flagged: "לבדיקה", recorded: "נרשם",
};
export const REFUND_PRODUCT_LABELS: Record<string, string> = { subscription: "מנוי", ai_topup: "קרדיטי AI" };

// ── BILL-1b ──────────────────────────────────────────────────────────────────

/** מצב הבניין בשורת ההקשר של משימת עצירה ידנית (מ-buildings שכבר נקרא), או null כשהוא פעיל / לא ידוע. */
export function stopTaskContext(b: { is_active?: boolean | null; is_archived?: boolean | null } | null | undefined): string | null {
  if (!b) return null;
  if (b.is_archived) return "הבניין בארכיון";
  if (b.is_active === false) return "הבניין מושעה";
  return null;
}

// ── BILL-1b: השעיה / ארכוב עם מנוי חי (החלטה 319, E46) ────────────────────────
export type LiveSubOwner = { type: "building" | "management_company"; id: string };
export type LiveSub = { status: string; plan_id: string; has_recurring: boolean; period_end: string | null };
export type LiveSubResult = { live: true; sub: LiveSub } | { live: false; sub: null } | { error: string };
export type LiveSubAction = "suspend" | "archive";

export const LIVE_SUBSCRIPTION_TEXT = {
  building: "לבניין יש מנוי חי עם הוראת קבע. ההשעיה לא עוצרת את החיוב — אשרו כדי להמשיך ולפתוח משימת עצירה ידנית.",
  buildingArchive: "לבניין יש מנוי חי עם הוראת קבע. הארכוב לא עוצר את החיוב — אשרו כדי להמשיך ולפתוח משימת עצירה ידנית.",
  company: "לחברה יש מנוי חי עם הוראת קבע. ההשעיה לא עוצרת את החיוב — אשרו כדי להמשיך ולפתוח משימת עצירה ידנית.",
} as const;

export function liveSubscriptionText(owner: LiveSubOwner["type"], action: LiveSubAction): string {
  if (owner === "management_company") return LIVE_SUBSCRIPTION_TEXT.company;
  return action === "archive" ? LIVE_SUBSCRIPTION_TEXT.buildingArchive : LIVE_SUBSCRIPTION_TEXT.building;
}

type ReadDb = { from: (t: string) => any };

/**
 * המנוי החי של בעלים (PAYING_STATUSES). קריאה בלבד. כשל קריאה = {error}, לעולם לא "אין מנוי"
 * (הקורא עונה 503 ולא ממשיך). בוליאני has_recurring נגזר מהשורה — ה-uid לא יוצא.
 */
export async function liveSubscription(db: ReadDb, owner: LiveSubOwner): Promise<LiveSubResult> {
  try {
    const { data, error } = await db.from("billing_subscriptions")
      .select("status, plan_id, provider_recurring_uid, current_period_end")
      .eq("owner_type", owner.type).eq("owner_id", owner.id)
      .in("status", PAYING_STATUSES as unknown as string[]).limit(1);
    if (error) return { error: String(error.message ?? "read failed") };
    const row = (Array.isArray(data) ? data[0] : data) as { status: string; plan_id: string; provider_recurring_uid?: string | null; current_period_end?: string | null } | null | undefined;
    if (!row) return { live: false, sub: null };
    return { live: true, sub: { status: row.status, plan_id: row.plan_id, has_recurring: !!row.provider_recurring_uid, period_end: row.current_period_end ?? null } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "read failed" };
  }
}

export type StopTaskResult = "opened" | "already" | "none" | "failed";
export const STOP_TASK_FAILED_TEXT = "הפעולה בוצעה, אבל משימת העצירה לא נפתחה — הוראת הקבע עדיין פעילה ב-PayPlus. נסו שוב עם אותו אישור, או עצרו אותה ב-PayPlus ידנית.";
