// src/lib/blocRead.ts — א3-1 (bloc, החלטה 444): הקריאות של הפאנל דרך bloc, לא עם מפתח למסד.
//
// אותו ערוץ חתום כמו הפעולות (lib/blocApi: callBloc — HMAC, חלון 5 דקות, אותן הודעות כשל על הכתובת, Cloudflare ו-Vercel).
// bloc מחזיר רק מה שהמסך מציג — סכומים, מונים ושורות אחרונות — ואומר מה לא נטען (failed) ומה חלקי (partial). כשל בערוץ
// הוא מצב משלו במסך ("לא נטען" + הסיבה), אף פעם לא אפסים.
// הקבוצות הבאות (בניינים, אנשים, כסף, פרסום, סטורי) ייכנסו כאן קריאה אחרי קריאה; בסוף — גם הטבלאות של הפאנל עצמו.
import { callBloc, type BlocConfig } from "./blocApi";

export type PanelActor = { id: string; email: string; role: string };
export const READ_TIMEOUT_MS = 8_000;

export type OverviewRead = {
  stats: Record<string, number | string | null> | null;
  recentBuildings: { id: string; name: string | null; created_at: string | null; plan: string | null }[];
  revenueByMonth: { month: string; amount: number }[];
  counts: { pendingReports: number | null; supplierQueue: number | null; declined30: number | null };
  partial: boolean;
  failed: string[];
};

export type LiveRead = {
  cursor: string;
  src: {
    tenants: { id: string; full_name: string | null; building_id: string | null; created_at: string }[];
    tickets: { id: string; title: string | null; urgency: string | null; building_id: string | null; created_at: string }[];
    declined: { id: string; amount: number | string | null; building_id: string | null; failed_at: string }[];
    webhookErrors: { id: string; event_type: string; building_id: string | null; created_at: string }[];
  };
  names: Record<string, string>;
  /** null — המונה לא נטען ב-bloc (במסך "—"), לא 0. */
  stats: { pending_approvals: number | null; open_tickets: number | null; pending_reports: number | null; supplier_queue: number | null };
  failed: string[];
};

export type AnalyticsRead = {
  topBuildings: { name: string | null; tenant_count: number; open_tickets: number; pending_count: number }[];
  buildings: { active: number; suspended: number; archived: number; byPlan: Record<string, number> };
  payments: { byStatus: Record<string, number>; totalRevenue: number; totalDebt: number };
  tickets: { byUrgency: Record<string, number>; byStatus: Record<string, number> };
  revenueByMonth: { month: string; amount: number }[];
  growthByMonth: { month: string; count: number }[];
  tenantsByStatus: Record<string, number>;
  partial: boolean;
  failed: string[];
};

type Reads = { overview: OverviewRead; live: LiveRead; analytics: AnalyticsRead };
export type PanelRead = keyof Reads;

export type ReadResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** הצורה המינימלית שהמסך נשען עליה — תשובה אחרת היא כשל, לא מסך ריק. */
const SHAPE: Record<PanelRead, (d: Record<string, unknown>) => boolean> = {
  overview: (d) => (d.stats === null || isObj(d.stats)) && Array.isArray(d.recentBuildings) && Array.isArray(d.revenueByMonth) && isObj(d.counts) && Array.isArray(d.failed),
  live: (d) => typeof d.cursor === "string" && isObj(d.src) && ["tenants", "tickets", "declined", "webhookErrors"].every((k) => Array.isArray((d.src as Record<string, unknown>)[k]))
    && isObj(d.names) && isObj(d.stats) && Array.isArray(d.failed),
  analytics: (d) => Array.isArray(d.topBuildings) && isObj(d.buildings) && isObj((d.buildings as Record<string, unknown>).byPlan) && isObj(d.payments)
    && isObj((d.payments as Record<string, unknown>).byStatus) && isObj(d.tickets) && Array.isArray(d.revenueByMonth) && Array.isArray(d.growthByMonth)
    && isObj(d.tenantsByStatus) && Array.isArray(d.failed),
};

/** קריאה (לא פעולה): הטקסט של callBloc על זמן ("ייתכן שהפעולה בוצעה") לא מתאים כאן; וקודים של bloc — בעברית. */
const READ_TEXT: Record<string, string> = {
  TIMEOUT: "bloc לא ענה בזמן — נסו לרענן בעוד רגע.",
  NETWORK: "שגיאת רשת מול bloc — נסו לרענן בעוד רגע.",
  forbidden: "לתפקיד שלך אין הרשאה לנתונים האלה ב-bloc.",
  invalid: "bloc לא קיבל את הבקשה (ייתכן שהגרסאות של הפאנל ושל bloc שונות).",
  failed: "הקריאה נכשלה ב-bloc — נסו לרענן בעוד רגע.",
};

export async function readBloc<K extends PanelRead>(
  read: K,
  params: Record<string, unknown>,
  actor: PanelActor,
  opts: Parameters<typeof callBloc>[2] & { config?: BlocConfig | null } = {},
): Promise<ReadResult<Reads[K]>> {
  // קריאה של מסך: 8 שניות (לא 25 של פעולה) — כדי שהמסך יגיד "לא נטען" לפני שהפונקציה ב-Vercel נקטעת.
  // params קודם: read וה-actor (מהסשן) תמיד גוברים על מה שבא מבקשה.
  const r = await callBloc("/api/internal/panel-read", { ...params, read, actor: { id: actor.id, email: actor.email, role: actor.role } }, { timeoutMs: READ_TIMEOUT_MS, ...opts });
  if (!r.ok) return { ok: false, error: (r.code && READ_TEXT[r.code]) || r.error, code: r.code };
  const data = r.data.data;
  if (r.data.ok !== true || r.data.read !== read || !isObj(data) || !SHAPE[read](data)) {
    return { ok: false, error: "bloc ענה בצורה לא צפויה (ייתכן שהגרסה של bloc ישנה מהפאנל)", code: "BAD_SHAPE" };
  }
  return { ok: true, data: data as Reads[K] };
}
