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
};
