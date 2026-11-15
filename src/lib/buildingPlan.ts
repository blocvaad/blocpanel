// src/lib/buildingPlan.ts — "מסלול בלי חיוב" של בניין (PANEL-PAY א1, החלטה 363). לוגיקה טהורה לכרטיס ולדף הבניין.
//
// הענקה (מסלול ≠ free + סיבה) וסיום — סופר-אדמין בלבד, עם אישור בקוד, דרך bloc (/api/buildings/[id]/plan →
// /api/internal/plans). bloc בודק שוב הכול: מנוי משלם (409), כיסוי של חברת ניהול (409), בניין בארכיון (404), ושהמסלול לא
// השתנה מאז שהמסך נטען (expected_plan → 409 changed). כשל קריאה שם — 503, אף פעם "אין".
// הכרטיס: המסלול השמור, הסיבה ומי העניק (מיומן הפאנל), ומה אפשר לעשות עכשיו. כשל בטעינה — נאמר, לא ריק.
import { PLAN_OPTIONS, PAYING_STATUSES, GRACE_DAYS, planLabel } from "./plans";
import { STATUS_LABELS } from "./billing";

export const PLAN_MOVED_TEXT = "המסלול לא נקבע כאן יותר — מסלול בלי חיוב מוענק ומסתיים מהכרטיס \"מסלול בלי חיוב\" בדף הבניין (סופר-אדמין).";
export const PLAN_FIELDS = ["plan", "comp_reason", "plan_expires"] as const;

/** גוף בקשה עם שדה מסלול (עריכה / יצירה של בניין) — נענה ב-400 plan_moved לפני כל דבר אחר. */
export function hasPlanField(raw: unknown): boolean {
  return !!raw && typeof raw === "object" && PLAN_FIELDS.some((k) => k in (raw as Record<string, unknown>));
}

export const REASON_MIN = 3;
export const REASON_MAX = 300;
export const GRANTABLE_PLANS = PLAN_OPTIONS.filter((p) => p.value !== "free");

export type BuildingPlanInfo = { plan: string | null; compReason: string | null; planExpires: string | null };
/** עובדות המנוי מ-panel_building_billing. error — הקריאה נכשלה (לא "אין מנוי"). */
export type PlanFacts =
  | { state: "ok"; payingStatus: string | null; companyState: string | null; companyName: string | null; subscriptionStatus?: string | null }
  | { state: "error" };
export type GrantOrigin = { state: "ok"; who: string | null; at: string | null } | { state: "error" };
/** unchanged — שליחה חוזרת של אותה הענקה (bloc לא כתב דבר): לא "מי העניק" ולא שורה בציר. */
export type PlanEvent = { kind: "granted" | "ended" | "legacy"; plan: string | null; reason: string | null; who: string | null; at: string; unchanged?: boolean };
export type PlanHistory = { state: "ok"; events: PlanEvent[] } | { state: "error" };

/**
 * מה הכרטיס מציג:
 *   paying       — מנוי משלם חי: המסלול נקבע לפי המנוי, אין הענקה (bloc היה עונה 409).
 *   company      — חברת ניהול משלמת (active / grace): Pro דרכה, אין צורך במסלול נפרד.
 *   granted      — מסלול ≠ free עם סיבה: מוענק. אפשר לסיים.
 *   dated        — מסלול ≠ free בלי סיבה, עם תאריך סיום (plan_expires): ניסיון, העברת ועד, חסד, רדום, מנוי שבוטל ושולם עד
 *                  הסוף. לא "בלי תיעוד" ואין "תיעוד" — הענקה כאן מוחקת את התאריך ונותנת את המסלול לתמיד (סקירה #1), ולכן היא
 *                  רק הענקה מפורשת, שהכפתור שלה אומר את זה.
 *   undocumented — מסלול ≠ free בלי סיבה, בלי תאריך סיום ובלי מנוי משלם: מסלול קבוע בלי תיעוד. אפשר לתעד (הענקה עם סיבה);
 *                  סיום — רק אחרי התיעוד (bloc מסיים רק הענקה מתועדת: בלי comp_reason → 409 no_grant).
 *   none         — free: אפשר להעניק.
 * הענקה קיימת (comp_reason) מוצגת בכל מצב — גם בכיסוי של חברת ניהול, שם אפשר גם לסיים אותה (ל-end של bloc אין כלל כיסוי).
 * עובדות שלא נטענו — לפי המסלול השמור בלבד (bloc בודק שוב לפני כל שינוי), עם הערה.
 */
export type PlanCardMode = "paying" | "company" | "granted" | "dated" | "undocumented" | "none";

export function isGrantedPlan(info: BuildingPlanInfo): boolean {
  return !!info.plan && info.plan !== "free" && !!info.compReason?.trim();
}

export function planCardMode(info: BuildingPlanInfo, facts: PlanFacts): PlanCardMode {
  if (facts.state === "ok") {
    if (facts.payingStatus && (PAYING_STATUSES as readonly string[]).includes(facts.payingStatus)) return "paying";
    if (facts.companyState === "active" || facts.companyState === "grace") return "company";
  }
  if (!info.plan || info.plan === "free") return "none";
  if (isGrantedPlan(info)) return "granted";
  return info.planExpires ? "dated" : "undocumented";
}

/**
 * מי רשאי לפעול במצב הזה (הכרטיס מסתיר; ה-route ו-bloc אוכפים).
 * הענקה: none / undocumented — טופס גלוי; dated — רק אחרי "הענקה במקום התאריך", עם האזהרה שהתאריך נמחק.
 * סיום: רק הענקה מתועדת, ולא כשמנוי משלם קובע (bloc: 409 paying_subscription); בכיסוי של חברת ניהול — מותר.
 */
export function canGrantIn(mode: PlanCardMode): boolean { return mode === "none" || mode === "undocumented" || mode === "dated"; }
export function canEnd(mode: PlanCardMode, info: BuildingPlanInfo): boolean {
  return isGrantedPlan(info) && (mode === "granted" || mode === "company");
}

type TagTone = "ok" | "wait" | "danger" | "muted" | "info";
export const MODE_TAG: Record<PlanCardMode, { tone: TagTone; text: string }> = {
  paying: { tone: "ok", text: "מנוי משלם" },
  company: { tone: "ok", text: "דרך חברת הניהול" },
  granted: { tone: "info", text: "מוענק" },
  dated: { tone: "muted", text: "עם תאריך סיום" },
  undocumented: { tone: "wait", text: "בלי תיעוד" },
  none: { tone: "muted", text: "ללא מסלול" },
};

// ── מסלול עם תאריך סיום (dated) — מה הוא, לפי העובדות שהדף כבר טוען (panel_building_billing) ──

const DAY = 24 * 60 * 60 * 1000;
export type DatedKind = "trial" | "paid" | "canceled" | "past_due" | "handover" | "grace" | "dormant" | "unknown";

/**
 * כמו bloc (lib/plans effectivePlan, lib/billing/entitlement): תאריך שעבר — ימי חסד (GRACE_DAYS) ואז רדום; העברת ועד —
 * רדום מיד אחרי המועד. תאריך עתידי — לפי buildings.subscription_status: succession העברת ועד, canceled מנוי שבוטל ושולם עד
 * הסוף, past_due בפיגור, active מנוי, trial ניסיון. לא ידוע (עובדות שלא נטענו, סטטוס אחר / חסר, תאריך לא קריא) — unknown,
 * והכרטיס אומר רק "מסלול עם תאריך סיום".
 */
export function datedKind(info: BuildingPlanInfo, facts: PlanFacts, now: number = Date.now()): DatedKind {
  const exp = info.planExpires ? Date.parse(info.planExpires) : NaN;
  if (facts.state !== "ok" || !Number.isFinite(exp)) return "unknown";
  const st = facts.subscriptionStatus ?? null;
  if (exp <= now) {
    if (st === "succession") return "dormant";
    return now - exp < GRACE_DAYS * DAY ? "grace" : "dormant";
  }
  if (st === "succession") return "handover";
  if (st === "canceled" || st === "cancelled") return "canceled";
  if (st === "past_due") return "past_due";
  if (st === "active") return "paid";
  if (st === "trial") return "trial";
  return "unknown";
}

export const DATED_TAG: Record<DatedKind, { tone: TagTone; text: string }> = {
  trial: { tone: "info", text: "ניסיון" },
  paid: { tone: "ok", text: "מנוי בתוקף" },
  canceled: { tone: "wait", text: "בוטל — בתוקף עד הסוף" },
  past_due: { tone: "wait", text: "בפיגור" },
  handover: { tone: "wait", text: "העברת ועד" },
  grace: { tone: "wait", text: "ימי חסד" },
  dormant: { tone: "danger", text: "רדום" },
  unknown: { tone: "muted", text: "עם תאריך סיום" },
};

/** תאריך במילים בשעון ישראל ("14 בדצמבר 2026"), או "". */
export function longDate(iso: string | null, plusDays = 0): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t + plusDays * DAY).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "long", year: "numeric" });
}

/** השורה של מסלול עם תאריך סיום: מה הוא ועד מתי (התאריך במילים). */
export function datedLine(kind: DatedKind, info: BuildingPlanInfo, now: number = Date.now()): string {
  const d = longDate(info.planExpires);
  const label = planLabel(info.plan);
  const exp = info.planExpires ? Date.parse(info.planExpires) : NaN;
  const days = Number.isFinite(exp) ? Math.max(1, Math.ceil((exp - now) / DAY)) : 0;
  switch (kind) {
    case "trial": return `ניסיון של ${label} — ${days === 1 ? "יום אחד" : `${days} ימים`} לסיום, עד ${d}. אם לא ישולם עד אז, הבניין יוצא מהמסלול.`;
    case "paid": return `מנוי ${label} בתוקף עד ${d}.`;
    case "canceled": return `המנוי בוטל — ${label} שולם עד ${d}, ואז הבניין יוצא מהמסלול.`;
    case "past_due": return `התשלום על ${label} בפיגור — המסלול בתוקף עד ${d}.`;
    case "handover": return `העברת ועד — לוועד החדש יש עד ${d} להזין אמצעי תשלום, ואז הבניין רדום.`;
    case "grace": return `${label} פג ב-${d} — ימי חסד עד ${longDate(info.planExpires, GRACE_DAYS)}, ואז הבניין רדום (קריאה בלבד).`;
    case "dormant": return `${label} פג ב-${d} — הבניין רדום (קריאה בלבד) עד שהוועד יבחר מסלול.`;
    default: return d ? `${label} — מסלול עם תאריך סיום: ${d}.` : `${label} — מסלול עם תאריך סיום.`;
  }
}

/** האזהרה בהענקה למסלול עם תאריך סיום: ההענקה מוחקת את התאריך, והבניין נשאר על המסלול בלי תאריך סיום. */
export function datedGrantWarning(info: BuildingPlanInfo): string {
  const d = longDate(info.planExpires);
  return `ההענקה מוחקת את תאריך הסיום${d ? ` (${d})` : ""}: הבניין יישאר על המסלול שתבחרו בלי תאריך סיום ובלי חיוב, עד שמישהו יסיים את ההענקה.`;
}

/** Escape סוגר את אישור הסיום — רק כשלא באמצע שליחה. */
export function escapeCloses(key: string, busy: boolean): boolean {
  return key === "Escape" && !busy;
}

export const VIEW_ONLY_TEXT = "רק סופר-אדמין מעניק או מסיים מסלול בלי חיוב.";
export const FACTS_ERROR_TEXT = "לא הצלחנו לבדוק אם יש לבניין מנוי משלם או כיסוי של חברת ניהול. bloc בודק את זה שוב לפני כל שינוי.";
export const ORIGIN_ERROR_TEXT = "לא הצלחנו לטעון מי העניק.";
export const ORIGIN_UNKNOWN_TEXT = "לא רשום ביומן הפאנל (הוענק לפני שהפעולה עברה לכרטיס הזה).";
export const HISTORY_ERROR_TEXT = "לא הצלחנו לטעון את ההיסטוריה של המסלול.";
export const NET_ERROR_TEXT = "אין חיבור לשרת. בדקו את החיבור ונסו שוב.";

export function modeLine(mode: PlanCardMode, info: BuildingPlanInfo, facts: PlanFacts, now: number = Date.now()): string {
  if (mode === "paying") {
    const st = facts.state === "ok" && facts.payingStatus ? STATUS_LABELS[facts.payingStatus] ?? facts.payingStatus : "";
    const plan = info.plan && info.plan !== "free" ? ` על ${planLabel(info.plan)}` : "";
    const until = info.planExpires && longDate(info.planExpires) ? `, בתוקף עד ${longDate(info.planExpires)}` : "";
    return `לבניין מנוי משלם${st ? ` (${st})` : ""}${plan}${until} — המסלול נקבע לפי המנוי ומשתנה רק ממסך המנוי של הוועד.`;
  }
  if (mode === "company") {
    const who = facts.state === "ok" && facts.companyName ? facts.companyName : "חברת הניהול";
    return isGrantedPlan(info)
      ? `הבניין כלול דרך ${who} (Pro). ההענקה שמוצגת כאן לא נחוצה בזמן הכיסוי — אפשר לסיים אותה, כדי שלא תישאר כשהכיסוי ייגמר.`
      : `הבניין כלול דרך ${who} (Pro) — אין צורך במסלול נפרד.`;
  }
  if (mode === "dated") return datedLine(datedKind(info, facts, now), info, now);
  if (mode === "undocumented") return `לבניין מסלול ${planLabel(info.plan)} בלי סיבה מתועדת ובלי מנוי משלם. תעדו למה (הענקה עם סיבה) — אחרי התיעוד אפשר גם לסיים אותו.`;
  if (mode === "none") return "לבניין אין מסלול כרגע. בוחרים מסלול, כותבים למה — והבניין מקבל אותו מיד.";
  return "";
}

export function checkReason(v: string): { ok: true; value: string } | { ok: false; error: string } {
  const t = v.trim();
  if (t.length < REASON_MIN) return { ok: false, error: "כתבו סיבה (3 תווים לפחות, למשל: בניין בדיקות, פיילוט)." };
  if (t.length > REASON_MAX) return { ok: false, error: `הסיבה ארוכה מדי (עד ${REASON_MAX} תווים).` };
  return { ok: true, value: t };
}

export function grantBody(plan: string, reason: string, expected: string | null) {
  return { action: "grant" as const, plan, comp_reason: reason.trim(), ...(expected ? { expected_plan: expected } : {}) };
}
export function endBody(expected: string | null) {
  return { action: "end_grant" as const, ...(expected ? { expected_plan: expected } : {}) };
}

// ── מי העניק — מיומן הפאנל (panel_audit_logs של הבניין, מהחדש לישן) ──

export type AuditRow = { action: string; admin_email: string | null; created_at: string; metadata: Record<string, unknown> | null };
export const ORIGIN_ACTIONS = ["BUILDING_PLAN_GRANTED", "BUILDING_PLAN_GRANT_ENDED", "UPDATE_BUILDING", "CREATE_BUILDING"] as const;

const metaPlan = (row: AuditRow): string | null => {
  const m = row.metadata ?? {};
  if (row.action === "UPDATE_BUILDING") {
    const c = (m as { changes?: unknown }).changes;
    return c && typeof c === "object" && typeof (c as { plan?: unknown }).plan === "string" ? (c as { plan: string }).plan : null;
  }
  return typeof (m as { plan?: unknown }).plan === "string" ? (m as { plan: string }).plan : null;
};
const metaReason = (row: AuditRow): string | null => {
  const m = row.metadata ?? {};
  const src = row.action === "UPDATE_BUILDING" ? (m as { changes?: Record<string, unknown> }).changes ?? {} : m;
  const v = (src as { comp_reason?: unknown }).comp_reason;
  return typeof v === "string" && v.trim() ? v : null;
};

/** האירועים של המסלול בלבד (הענקה / סיום / שינוי מסלול ישן מטופס העריכה), מהחדש לישן. */
export function planEvents(rows: AuditRow[]): PlanEvent[] {
  const out: PlanEvent[] = [];
  for (const r of rows) {
    if (r.action === "BUILDING_PLAN_GRANTED") {
      out.push({ kind: "granted", plan: metaPlan(r), reason: metaReason(r), who: r.admin_email, at: r.created_at, ...((r.metadata ?? {}).unchanged === true ? { unchanged: true } : {}) });
    }
    else if (r.action === "BUILDING_PLAN_GRANT_ENDED") out.push({ kind: "ended", plan: null, reason: null, who: r.admin_email, at: r.created_at });
    else if ((r.action === "UPDATE_BUILDING" || r.action === "CREATE_BUILDING") && metaPlan(r)) {
      out.push({ kind: "legacy", plan: metaPlan(r), reason: metaReason(r), who: r.admin_email, at: r.created_at });
    }
  }
  return out;
}

/**
 * מי העניק את המסלול הנוכחי: האירוע האחרון שקבע את המסלול הזה (הענקה בכרטיס, או שינוי מסלול ישן מטופס העריכה / היצירה).
 * אירוע חדש יותר שקבע מסלול אחר, או סיום — המקור לא ידוע (null). שליחה חוזרת שלא שינתה דבר (unchanged) — מדלגים עליה.
 */
export function grantOrigin(events: PlanEvent[], info: BuildingPlanInfo): { who: string | null; at: string | null } {
  const none = { who: null, at: null };
  if (!info.plan || info.plan === "free") return none;
  for (const e of events) {
    if (e.unchanged) continue;
    if (e.kind === "ended") return none;
    if (e.plan === info.plan) return { who: e.who, at: e.at };
    if (e.plan) return none;     // מסלול אחר נקבע אחרי — המקור של הנוכחי לא ביומן
  }
  return none;
}

// ── אחרי פעולה (טהור) ──

export type PlanMsg = { ok: boolean; text: string; code?: string };
/** תשובת POST /api/buildings/[id]/plan כפי שהדפדפן קיבל אותה; null = אין חיבור לשרת. */
export type PlanAnswer = { ok: boolean; status: number; j: { building?: { plan?: unknown; comp_reason?: unknown; plan_expires?: unknown } | null; unchanged?: boolean; error?: string; code?: string } } | null;
export const UNCHANGED_TEXT = "לא השתנה דבר — זה כבר המסלול והסיבה של הבניין.";

const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);

/** קודים שאומרים "השתנה, או ייתכן שבוצע" — סוגרים את האישור ומציעים רענון. */
export const REFRESH_CODES: ReadonlySet<string> = new Set(["changed", "bad_shape", "TIMEOUT", "NETWORK"]);

export function afterPlanAction(a: PlanAnswer, action: "grant" | "end_grant", prev: BuildingPlanInfo, chosenPlan?: string):
  { info: BuildingPlanInfo; msg: PlanMsg; closeConfirm: boolean; clearReason: boolean } {
  if (!a) return { info: prev, msg: { ok: false, text: NET_ERROR_TEXT }, closeConfirm: false, clearReason: false };
  if (a.ok) {
    const b = a.j.building;
    const info: BuildingPlanInfo = b
      ? { plan: strOrNull(b.plan), compReason: strOrNull(b.comp_reason), planExpires: strOrNull(b.plan_expires) }
      : action === "grant" ? { ...prev, plan: chosenPlan ?? prev.plan } : { plan: "free", compReason: null, planExpires: null };
    const text = a.j.unchanged ? UNCHANGED_TEXT : action === "grant"
      ? `מסלול ${planLabel(info.plan)} הוענק לבניין, בלי חיוב.`
      : "המסלול המוענק הסתיים. הבניין חזר ל\"ללא מסלול\".";
    return { info, msg: { ok: true, text }, closeConfirm: true, clearReason: action === "grant" };
  }
  return { info: prev, msg: { ok: false, text: a.j.error ?? "הפעולה נכשלה. נסו שוב.", code: a.j.code }, closeConfirm: !!a.j.code && REFRESH_CODES.has(a.j.code), clearReason: false };
}

/**
 * הדף נטען: עובדות המנוי מ-panel_building_billing → PlanFacts. כשל קריאה — error, לא "אין מנוי"; גם תשובה שאינה רשימה (בלי
 * שגיאה) היא קריאה שנכשלה (סקירה #7, S1022 — כמו ב-bloc: non-list → read_failed). רשימה ריקה — אין מנוי ואין חברה.
 */
export function planFactsFrom(res: { data: unknown; error: unknown }): PlanFacts {
  if (res.error || !Array.isArray(res.data)) return { state: "error" };
  const row = (res.data[0] ?? null) as { live_subscription_status?: unknown; company_state?: unknown; company_name?: unknown; subscription_status?: unknown } | null;
  return {
    state: "ok",
    payingStatus: strOrNull(row?.live_subscription_status),
    companyState: strOrNull(row?.company_state),
    companyName: strOrNull(row?.company_name),
    subscriptionStatus: strOrNull(row?.subscription_status),
  };
}

/** תאריך קצר בשעון ישראל, או "". */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
}
