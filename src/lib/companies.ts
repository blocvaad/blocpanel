// src/lib/companies.ts — חברות ניהול בפאנל (bloc REG-2): מה צוות bloc רואה כדי להחליט, ומה אפשר להחליט.
// pure — נבדק ב-src/lib/__tests__/companies.test.ts.
//
// ההחלטה עצמה עוברת ל-bloc (/api/management-companies → /api/internal/management-companies → SQL 187), ושם גם
// נאכפים המעברים: על המצב שנראה כאן (expected_status), ובאישור ובדחייה — גם על הפרטים שנראו
// (seen_details_at = details_updated_at כפי שנקרא). כאן — אותם מעברים, כדי לא להציע כפתור שייכשל.
import { ilDateTime, ilDate, ilTime } from "./committee";
import type { CompanyBillingFacts } from "./entitlementView";

export type CompanyStatus = "pending_approval" | "active" | "rejected" | "suspended";
export type CompanyAction = "approve" | "reject" | "suspend" | "reactivate";

export const COMPANY_STATUSES: readonly CompanyStatus[] = ["pending_approval", "active", "rejected", "suspended"];

export const STATUS_LABEL: Record<CompanyStatus, string> = {
  pending_approval: "ממתינה לאישור",
  active: "פעילה",
  rejected: "נדחתה",
  suspended: "מושעית",
};

/** מה אפשר להחליט מכל מצב (כמו ב-SQL 187). */
export const ACTIONS_FROM: Record<CompanyStatus, readonly CompanyAction[]> = {
  pending_approval: ["approve", "reject"],
  active: ["suspend"],
  rejected: ["approve"],
  suspended: ["reactivate"],
};

export function actionsFor(status: string | null | undefined): readonly CompanyAction[] {
  return (COMPANY_STATUSES as readonly string[]).includes(status ?? "") ? ACTIONS_FROM[status as CompanyStatus] : [];
}

/** הסיבה שנמסרת לחברה (דחייה, השעיה) — אחרי trim, כמו ב-bloc וב-SQL 187. */
export const REASON_MIN = 10;
export const REASON_MAX = 1000;
export const needsReason = (a: CompanyAction) => a === "reject" || a === "suspend";
/** אישור ודחייה — על הפרטים שנראו. */
export const onSeenDetails = (a: CompanyAction) => a === "approve" || a === "reject";

export type DecisionCopy = {
  button: string; title: string; submit: string; done: string; tone: "primary" | "danger"
  /** מה קורה בעקבות ההחלטה — מוצג בחלון לפני האישור. */
  consequence: string
};

export const DECISION_COPY: Record<CompanyAction, DecisionCopy> = {
  approve: {
    button: "אישור החברה", title: "אישור חברת הניהול", submit: "אישור החברה", done: "החברה אושרה", tone: "primary",
    consequence: "הבעלים יקבל גישה לפורטל הניהול, הודעה באפליקציה ומייל עם קוד החברה.",
  },
  reject: {
    button: "דחייה", title: "דחיית הבקשה", submit: "דחיית הבקשה", done: "הבקשה נדחתה", tone: "danger",
    consequence: "הבעלים יראה את הסיבה במסך הבקשה, במייל ובהודעה, ויוכל לתקן ולהגיש מחדש.",
  },
  suspend: {
    button: "השעיה", title: "השעיית החברה", submit: "השעיית החברה", done: "החברה הושעתה", tone: "danger",
    consequence: "הגישה לפורטל הניהול נסגרת מיד. הבניינים והנתונים של החברה נשמרים. הבעלים יקבל את הסיבה במייל ובהודעה.",
  },
  reactivate: {
    button: "ביטול ההשעיה", title: "ביטול ההשעיה", submit: "ביטול ההשעיה", done: "ההשעיה בוטלה", tone: "primary",
    consequence: "הגישה לפורטל הניהול חוזרת, והבעלים יקבל הודעה ומייל.",
  },
};

/** הכפתור בכרטיס: אישור של בקשה שנדחתה — "אישור בכל זאת". */
export function buttonLabel(action: CompanyAction, status: CompanyStatus): string {
  return action === "approve" && status === "rejected" ? "אישור בכל זאת" : DECISION_COPY[action].button;
}

/** אורך הסיבה כמו ב-bloc וב-SQL 187 (char_length): תווים אחרי trim, אימוג'י אחד הוא תו אחד. */
export const reasonLength = (s: string) => [...s.trim()].length;

/** מה חסר בסיבה — או null. */
export function reasonIssue(action: CompanyAction, reason: string): string | null {
  if (!needsReason(action)) return null;
  const n = reasonLength(reason);
  if (n === 0) return "כתבו לחברה את הסיבה.";
  if (n < REASON_MIN) return REASON_MIN - n === 1 ? "עוד תו אחד לפחות." : `עוד ${REASON_MIN - n} תווים לפחות.`;
  if (n > REASON_MAX) return `הסיבה ארוכה מדי (עד 1,000 תווים, יש ${n.toLocaleString("he-IL")}).`;
  return null;
}

export type CompanyForDecision = { id: string; status: CompanyStatus; details_updated_at?: string | null };

/** חברה כפי ש-GET /api/management-companies מחזיר. */
export type Company = {
  id: string; name: string; invite_code: string | null; phone: string | null; email: string | null; description: string | null
  tax_id: string | null; coverage_areas: string[] | null; status: CompanyStatus; created_at: string; owner_id: string
  office_address: string | null; portfolio_size: string | null; submitted_at: string | null; reject_reason: string | null
  details_updated_at: string | null; decided_at: string | null
  owner: { id: string; full_name: string | null; email: string | null; building_id: string | null; building_name?: string | null } | null
  billing: CompanyBillingFacts | null
};

/** הבקשה ל-PATCH /api/management-companies. */
export function decisionPayload(c: CompanyForDecision, action: CompanyAction, f: { reason?: string; note?: string } = {}): Record<string, unknown> {
  const note = (f.note ?? "").trim();
  return {
    id: c.id, action, expected_status: c.status,
    ...(onSeenDetails(action) ? { seen_details_at: c.details_updated_at ?? null } : {}),
    ...(needsReason(action) ? { reason: (f.reason ?? "").trim() } : {}),
    ...(note ? { note } : {}),
  };
}

/** מה באמת יצא לבעלים (bloc: notified — ההודעה באפליקציה נשמרה; email — נשלח / נכשל / אין כתובת). */
export type Delivery = { notified: boolean; email: "sent" | "failed" | "none" };

/**
 * תשובות שאחריהן מה שעל המסך אולי כבר לא המצב — החלון מציע "רענון הרשימה": השתנה בינתיים, או שלא ידוע אם
 * ההחלטה נשמרה (bloc לא ענה בזמן / שגיאת רשת — ייתכן שהחליט).
 */
const REFRESH_CODES = new Set(["CHANGED", "DETAILS_CHANGED", "INVALID_TRANSITION", "NOT_FOUND", "TIMEOUT", "NETWORK"]);
export const offersRefresh = (code: string | undefined | null) => REFRESH_CODES.has(code ?? "");

/** מה bloc אמר שיצא לבעלים, מתוך תשובת ההחלטה. הודעה באפליקציה — רק אם bloc אמר שנשמרה. */
export function deliveryOf(data: { notified?: unknown; email?: unknown } | null | undefined): Delivery {
  const email = data?.email === "sent" || data?.email === "failed" ? data.email : "none";
  return { notified: data?.notified === true, email };
}

/** הכול יצא כמו שצריך (ההודעה נשמרה, והמייל נשלח או שאין לבעלים מייל) — אחרת ההודעה בפאנל באזהרה, לא בהצלחה. */
export const deliveredAll = (d: Delivery) => d.notified && d.email !== "failed";

/** ההודעה אחרי החלטה שנשמרה — רק מה שבאמת יצא. */
export function doneText(action: CompanyAction, d: Delivery): string {
  const done = `${DECISION_COPY[action].done}.`;
  if (d.notified && d.email === "sent") return `${done} הבעלים קיבל הודעה באפליקציה ומייל.`;
  if (d.notified && d.email === "none") return `${done} לבעלים אין מייל בחשבון, אז נשלחה הודעה באפליקציה בלבד.`;
  if (d.notified) return `${done} ההודעה באפליקציה נשלחה, אבל המייל לא (תקלה בשליחה). כדאי לעדכן את הבעלים.`;
  if (d.email === "sent") return `${done} המייל נשלח, אבל ההודעה באפליקציה לא נשמרה.`;
  return `${done} ההודעה לבעלים לא נשלחה (תקלה). כדאי לעדכן אותו ישירות.`;
}

// ── הפרטים שבבקשה ─────────────────────────────────────────────────────────────

export const PORTFOLIO_LABEL: Record<string, string> = {
  "0": "עוד לא מנהלים בניינים",
  "1-10": "עד 10 בניינים",
  "11-50": "11-50 בניינים",
  "51-200": "51-200 בניינים",
  "200+": "מעל 200 בניינים",
};

export const taxDigits = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

/** ספרת ביקורת ישראלית (כמו ב-bloc, lib/identity/validate). */
export function validBusinessNumber(v: unknown): boolean {
  const d = taxDigits(v);
  if (!/^\d{9}$/.test(d) || /^0+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(d[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

export type BusinessKind = "company" | "partnership" | "cooperative" | "nonprofit" | "corporation" | "dealer";
export const BUSINESS_KIND_LABEL: Record<BusinessKind, string> = {
  company: "חברה בע״מ",
  partnership: "שותפות",
  cooperative: "אגודה שיתופית",
  nonprofit: "עמותה",
  corporation: "תאגיד",
  dealer: "עוסק (לפי מספר זהות)",
};

/** סוג העסק לפי הספרות הראשונות (כמו ב-bloc) — רק למספר תקין; אחרת null. */
export function businessKind(v: unknown): BusinessKind | null {
  const d = taxDigits(v);
  if (!validBusinessNumber(d)) return null;
  if (/^5[12]/.test(d)) return "company";
  if (d.startsWith("55")) return "partnership";
  if (d.startsWith("57")) return "cooperative";
  if (d.startsWith("58")) return "nonprofit";
  if (d.startsWith("5")) return "corporation";
  return "dealer";
}

/** ח.פ. לתצוגה: הספרות, והסוג — או "מספר לא תקין" (בקשה ישנה, לפני הבדיקה של REG-1). */
export function taxText(v: unknown): { digits: string; note: string; ok: boolean } | null {
  const digits = taxDigits(v);
  if (!digits) return null;
  const kind = businessKind(digits);
  return kind ? { digits, note: BUSINESS_KIND_LABEL[kind], ok: true } : { digits, note: "מספר לא תקין", ok: false };
}

// ── זמנים ─────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const valid = (iso: string | null | undefined): iso is string => !!iso && !Number.isNaN(new Date(iso).getTime());

/** כמה ימי לוח (שעון ישראל) עברו מאז. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!valid(iso)) return null;
  const a = Date.parse(`${dayKey(new Date(iso))}T00:00:00Z`);
  const b = Date.parse(`${dayKey(now)}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / DAY));
}

/** "היום, 14:20" / "אתמול, 09:05" / "12/10/2026" — שעון ישראל. */
export function whenText(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!valid(iso)) return null;
  const days = daysSince(iso, now);
  if (days === 0) return `היום, ${ilTime(iso)}`;
  if (days === 1) return `אתמול, ${ilTime(iso)}`;
  return ilDate(iso);
}

/** התאריך המלא, לרמז (title). */
export const fullWhen = (iso: string | null | undefined) => (valid(iso) ? ilDateTime(iso) : "");

/** כמה זמן בקשה ממתינה — לשורת התור. */
export function waitingText(iso: string | null | undefined, now: Date = new Date()): string | null {
  const d = daysSince(iso, now);
  if (d === null) return null;
  if (d === 0) return "נשלחה היום";
  if (d === 1) return "ממתינה מאתמול";
  return `ממתינה ${d} ימים`;
}

/** הבעלים ערך את הבקשה אחרי שנשלחה (REG-1 מאפשר עריכה בזמן ההמתנה) — יותר מדקה אחרי השליחה. */
export function editedAfterSend(c: { submitted_at?: string | null; created_at?: string | null; details_updated_at?: string | null }): boolean {
  const sent = c.submitted_at ?? c.created_at;
  if (!valid(sent) || !valid(c.details_updated_at)) return false;
  return Date.parse(c.details_updated_at) - Date.parse(sent) > 60_000;
}

/** סדר הרשימה: ממתינות — הוותיקה קודם (תור); השאר — ההחלטה האחרונה קודם, ואז החדשה קודם. */
export function sortCompanies<T extends { status: string; submitted_at?: string | null; created_at: string; decided_at?: string | null }>(list: readonly T[]): T[] {
  const sent = (c: T) => Date.parse(c.submitted_at ?? c.created_at) || 0;
  const last = (c: T) => Date.parse(c.decided_at ?? "") || Date.parse(c.created_at) || 0;
  return [...list].sort((a, b) => {
    const pa = a.status === "pending_approval", pb = b.status === "pending_approval";
    if (pa !== pb) return pa ? -1 : 1;
    return pa ? sent(a) - sent(b) : last(b) - last(a);
  });
}

// ── היסטוריה של חברה ──────────────────────────────────────────────────────────
// מה קרה עם הבקשה: מהיומן של bloc (audit_logs, target = החברה) — שליחה, עדכון, הגשה מחדש, וההחלטות מאז REG-2
// (עם איש הצוות, הסיבה והתיעוד); ומיומן הפאנל (MANAGEMENT_*) — החלטות מלפני REG-2, שלא נרשמו ב-bloc. החלטה
// מאז REG-2 נרשמת בשניהם — מוצגת פעם אחת (זו של bloc).

export const BLOC_COMPANY_EVENTS: Record<string, string> = {
  mgmt_company_registered: "הבקשה נשלחה",
  mgmt_company_request_updated: "הבקשה עודכנה",
  mgmt_company_resubmitted: "הבקשה הוגשה מחדש",
  mgmt_company_approved: "אושרה",
  mgmt_company_rejected: "נדחתה",
  mgmt_company_suspended: "הושעתה",
  mgmt_company_reactivated: "ההשעיה בוטלה",
  mgmt_company_updated: "פרטי החברה עודכנו",
};

export const PANEL_COMPANY_EVENTS: Record<string, string> = {
  MANAGEMENT_APPROVE: "אושרה",
  MANAGEMENT_REJECT: "נדחתה",
  MANAGEMENT_SUSPEND: "הושעתה",
  MANAGEMENT_REACTIVATE: "ההשעיה בוטלה",
  MANAGEMENT_PLAN_GRANTED: "הוענק מסלול ללא תשלום",
  MANAGEMENT_PLAN_GRANT_ENDED: "המסלול המוענק הסתיים",
};

/** הענקת מסלול: הסיבה שם פנימית (לא נשלחה לחברה) — מוצגת כתיעוד. */
const INTERNAL_REASON = new Set(["MANAGEMENT_PLAN_GRANTED"]);

export type BlocAuditRow = { id: string; action: string; created_at: string; details: Record<string, unknown> | null };
export type PanelAuditRow = { id: string; action: string; created_at: string; admin_email: string | null; metadata: Record<string, unknown> | null };
/** who — "צוות bloc" / "הבעלים"; email — של איש הצוות (מוצג בבידוד כיוון, ליד who). */
export type HistoryItem = { id: string; at: string; label: string; who: string; email: string | null; reason: string | null; note: string | null };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const SAME_DECISION_MS = 10 * 60_000;

export function companyHistory(bloc: readonly BlocAuditRow[], panel: readonly PanelAuditRow[], max = 30): HistoryItem[] {
  const fromBloc: HistoryItem[] = bloc.filter((r) => BLOC_COMPANY_EVENTS[r.action]).map((r) => {
    const d = r.details ?? {};
    const byPanel = d.via === "panel";
    return {
      id: `b-${r.id}`, at: r.created_at, label: BLOC_COMPANY_EVENTS[r.action],
      who: byPanel ? "צוות bloc" : "הבעלים", email: byPanel ? str(d.panel_admin) : null,
      reason: str(d.reason), note: byPanel ? str(d.panel_note) : null,
    };
  });
  const fromPanel: HistoryItem[] = panel.filter((r) => PANEL_COMPANY_EVENTS[r.action]).map((r) => ({
    id: `p-${r.id}`, at: r.created_at, label: PANEL_COMPANY_EVENTS[r.action],
    who: "צוות bloc", email: str(r.admin_email),
    reason: INTERNAL_REASON.has(r.action) ? null : str(r.metadata?.reason),
    note: INTERNAL_REASON.has(r.action) ? str(r.metadata?.reason) : str(r.metadata?.note),
  })).filter((p) => !fromBloc.some((b) => b.label === p.label && Math.abs(Date.parse(b.at) - Date.parse(p.at)) <= SAME_DECISION_MS));
  return [...fromBloc, ...fromPanel].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)).slice(0, max);
}
