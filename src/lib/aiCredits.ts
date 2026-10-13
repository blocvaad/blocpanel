// src/lib/aiCredits.ts (blocpanel) — הקרדיטים של ה-AI בבניין (bloc AI-1, SQL 173), לתצוגה בדף הבניין.
//
// מראה של bloc/src/lib/ai/quota.ts: הקרדיטים לחודש לפי המסלול האפקטיבי, ושמות השימושים. מקור האמת
// לספירה ולאכיפה הוא bloc (ai_quota_reserve / settle, 173). כאן — קריאה (ai_quota_status) ומתנה
// (ai_topup_grant), ב-service role. כל שינוי מכסה חייב להיעשות בשני המקומות.

export const AI_MONTHLY_CREDITS: Record<string, number> = {
  free: 0,
  building: 200,
  large: 2000,
  tower: 6000,
  company: 6000,
};

const LEGACY: Record<string, string> = { pro: "tower", business: "company" };

/** הקרדיטים לחודש למסלול (גם מזהים ישנים — כמו normalizePlanId של bloc). */
export function aiMonthlyFor(plan: string | null | undefined): number {
  const id = plan ? (LEGACY[plan] ?? plan) : "free";
  return AI_MONTHLY_CREDITS[id] ?? 0;
}

export const AI_FEATURE_LABEL: Record<string, string> = {
  assistant: "שאלות ובקשות לעוזר",
  photo: "זיהוי תקלה מתמונה",
  smart_fill: "כתיבת מודעות והזמנות",
  rewrite: "ניסוח הודעות",
  chat_rewrite: "ניסוח בצ׳אט",
  insight: "תובנות יומיות (לא נספרות)",
};

export const AI_GRANT_MAX_UNITS = 100000;
export const AI_GRANT_MAX_MONTHS = 24;

/** מה ש-ai_quota_status מחזיר (173). */
export type AIQuotaStatus = {
  period: string;
  pool: number;
  pool_used: number;
  resident_limit: number;
  topup_total: number;
  topup_left: number;
  topups: { id: string; source: string; units: number; units_used: number; paid_at: string | null; expires_at: string | null }[];
  by_feature: Record<string, number>;
  staff_units: number;
  resident_units: number;
  system_calls: number;
};

export type AICreditsView = {
  monthly: string;
  pct: number;
  tone: "green" | "yellow" | "red";
  topups: string;
  features: { label: string; credits: string }[];
  who: string;
  packs: { id: string; line: string }[];
  systemCalls: string | null;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v: number) => Math.max(0, Math.round(v)).toLocaleString("he-IL");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "");

export function aiCreditsView(s: AIQuotaStatus): AICreditsView {
  const pool = n(s.pool);
  const used = n(s.pool_used);
  const pct = pool > 0 ? Math.min(100, Math.round((used / pool) * 100)) : used > 0 ? 100 : 0;
  const features = Object.entries(s.by_feature ?? {})
    .map(([k, v]) => [k, n(v)] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ label: AI_FEATURE_LABEL[k] ?? k, credits: fmt(v) }));
  return {
    monthly: pool > 0 ? `${fmt(used)} מתוך ${fmt(pool)} קרדיטים (${pct}%)` : "אין קרדיטים במסלול",
    pct,
    tone: pct >= 100 ? "red" : pct >= 80 ? "yellow" : "green",
    topups: n(s.topup_left) > 0 ? `${fmt(n(s.topup_left))} מתוך ${fmt(n(s.topup_total))}` : "אין",
    features,
    who: `ועד וחברת הניהול ${fmt(n(s.staff_units))}, דיירים ${fmt(n(s.resident_units))}`,
    packs: (s.topups ?? []).map((t) => ({
      id: t.id,
      line: `${fmt(n(t.units))} קרדיטים ב${t.source === "grant" ? "מתנה" : "רכישה"}, נשארו ${fmt(n(t.units) - n(t.units_used))}${t.expires_at ? `, עד ${day(t.expires_at)}` : ""}`,
    })),
    systemCalls: n(s.system_calls) > 0 ? `${fmt(n(s.system_calls))} תובנות יומיות החודש (לא נספרות)` : null,
  };
}
