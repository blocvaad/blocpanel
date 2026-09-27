// src/lib/liveEvents.ts — פיד "חי" בפאנל.
// קודם: Supabase Realtime מהדפדפן עם מפתח anon. RLS חוסם ל-anon את profiles /
// payments / service_tickets / panel_notifications (deny_all), כך שהפיד לא קיבל
// אף אירוע — שקט מוחלט שנראה כמו "אין פעילות". עכשיו: השרת (service_role, אחרי
// guard) מחזיר אירועים מאז cursor, והלקוח מושך כל 15 שניות.

export type LiveEventType = "new_tenant" | "urgent_ticket" | "new_ticket" | "declined_payment" | "webhook_error";

export interface LiveEvent {
  id: string;          // יציב — משמש לסינון כפילויות בין סבבי משיכה
  type: LiveEventType;
  message: string;
  at: string;          // ISO
  href: string;
}

export interface LiveSources {
  tenants: Array<{ id: string; full_name: string | null; building_id: string | null; created_at: string | null }>;
  tickets: Array<{ id: string; title: string | null; urgency: string | null; building_id: string | null; created_at: string | null }>;
  declined: Array<{ id: string; amount: number | string | null; building_id: string | null; failed_at: string | null }>;
  webhookErrors: Array<{ id: string; event_type: string | null; building_id: string | null; created_at: string | null }>;
}

export const LIVE_MAX_LOOKBACK_MS = 24 * 3600_000;
export const LIVE_DEFAULT_LOOKBACK_MS = 60 * 60_000;
export const LIVE_POLL_MS = 15_000;

/** cursor מהלקוח: ISO תקין, לא בעתיד, לא יותר מ-24 שעות אחורה. */
export function clampSince(raw: string | null, now = Date.now()): string {
  const t = raw ? Date.parse(raw) : NaN;
  if (!Number.isFinite(t) || t > now) return new Date(now - LIVE_DEFAULT_LOOKBACK_MS).toISOString();
  return new Date(Math.max(t, now - LIVE_MAX_LOOKBACK_MS)).toISOString();
}

const URGENT = new Set(["high", "urgent", "critical", "דחוף"]);

export function buildLiveEvents(src: LiveSources, names: Record<string, string> = {}): LiveEvent[] {
  const where = (b: string | null) => (b && names[b] ? ` · ${names[b]}` : "");
  const out: LiveEvent[] = [];
  for (const t of src.tenants) {
    if (!t.created_at) continue;
    out.push({ id: `tenant:${t.id}`, type: "new_tenant", at: t.created_at, href: "/tenants",
      message: `דייר חדש ממתין לאישור: ${t.full_name?.trim() || "ללא שם"}${where(t.building_id)}` });
  }
  for (const t of src.tickets) {
    if (!t.created_at) continue;
    const urgent = URGENT.has(String(t.urgency ?? "").toLowerCase());
    out.push({ id: `ticket:${t.id}`, type: urgent ? "urgent_ticket" : "new_ticket", at: t.created_at, href: "/tickets",
      message: `${urgent ? "תקלה דחופה" : "תקלה חדשה"}: ${t.title?.trim() || "ללא כותרת"}${where(t.building_id)}` });
  }
  for (const p of src.declined) {
    if (!p.failed_at) continue;
    out.push({ id: `declined:${p.id}:${p.failed_at}`, type: "declined_payment", at: p.failed_at, href: "/money",
      message: `סליקה נדחתה: ₪${Number(p.amount ?? 0).toLocaleString("he-IL")}${where(p.building_id)}` });
  }
  for (const w of src.webhookErrors) {
    if (!w.created_at) continue;
    out.push({ id: `webhook:${w.id}`, type: "webhook_error", at: w.created_at, href: "/money",
      message: `${w.event_type === "ip_blocked" ? "webhook תשלומים נחסם (IP לא מורשה)" : "webhook תשלומים נכשל / לבדיקה"}${where(w.building_id)}` });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** מיזוג אירועים חדשים לרשימה קיימת: בלי כפילויות, החדש ראשון, תקרה. */
export function mergeLiveEvents(prev: LiveEvent[], incoming: LiveEvent[], cap = 50): LiveEvent[] {
  const seen = new Set<string>();
  const all = [...incoming, ...prev].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, cap);
}
