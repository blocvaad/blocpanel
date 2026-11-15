// src/lib/moneyActions.ts — פעולות כסף מהפאנל דרך bloc (PANEL-PAY א1, החלטה 362).
//
// מסלול לבניין / לחברה, קרדיטים ל-AI וספקי הסליקה נכתבים עכשיו ב-bloc (/api/internal/plans, /ai-credits,
// /collection-providers — חתום, סופר-אדמין, אותם כללים כמו שהיו בפאנל). כאן: השחקן שנשלח, התרגום של הקודים של bloc
// לעברית ברורה, ומה נרשם ביומן הפאנל כשהתשובה לא ברורה (bloc לא ענה בזמן — ייתכן שהפעולה בוצעה).
import {
  GATE_OPEN_TEXT, GATE_REOPEN_TEXT, GATE_ALREADY_TEXT, GATE_NOT_CLOSED_TEXT,
} from "./collectionProviders";

export type MoneyKind = "building_plan" | "company_plan" | "ai_credits" | "collection_provider";

export const READ_FAILED_TEXT = "לא הצלחנו לבדוק — שום דבר לא השתנה. נסו שוב.";
export const WRITE_FAILED_TEXT = "השמירה ב-bloc נכשלה, ולכן שום דבר לא השתנה. נסו שוב.";
export const FORBIDDEN_TEXT = "bloc סירב: הפעולה הזו לסופר-אדמין בלבד.";
export const INVALID_TEXT = "bloc דחה את הבקשה כלא תקינה. רעננו את הדף ונסו שוב.";
export const UNEXPECTED_TEXT = "הפעולה נכשלה ב-bloc. רעננו את הדף ובדקו לפני שמנסים שוב.";

/** 409 של bloc — לפי הסיבה. סיבה שלא כאן: המשפט של bloc אם הוא בעברית, אחרת UNEXPECTED_TEXT. */
const CONFLICT_TEXT: Record<MoneyKind, Record<string, string>> = {
  building_plan: {
    paying_subscription: "לבניין יש מנוי משלם פעיל — המסלול משתנה רק דרך מסך המנוי של הוועד.",
    company_covered: "הבניין כלול דרך חברת הניהול — אין צורך במסלול נפרד.",
    no_grant: "לבניין אין מסלול מוענק לסיים.",
    changed: "המסלול של הבניין השתנה מאז שהדף נטען. רעננו את הדף ובדקו לפני שמנסים שוב.",
  },
  company_plan: {
    paying_subscription: "לחברה מנוי משלם פעיל — אין צורך בהענקה.",
    company_not_active: "אפשר להעניק מסלול רק לחברה מאושרת.",
    no_grant: "לחברה אין מסלול מוענק לסיים.",
    changed: "המסלול של החברה השתנה מאז שהדף נטען. רעננו את הדף ובדקו לפני שמנסים שוב.",
  },
  ai_credits: {},
  collection_provider: {
    gate_open: GATE_OPEN_TEXT, provider_gate_open: GATE_OPEN_TEXT,
    gate_reopen_while_offered: GATE_REOPEN_TEXT, provider_gate_reopen_while_offered: GATE_REOPEN_TEXT,
    gate_already_closed: GATE_ALREADY_TEXT, provider_gate_already_closed: GATE_ALREADY_TEXT,
    gate_not_closed: GATE_NOT_CLOSED_TEXT,
    changed: "הספק השתנה מאז שהדף נטען. רעננו את הדף ובדקו לפני שמנסים שוב.",
  },
};

const NOT_FOUND_TEXT: Record<MoneyKind, string> = {
  building_plan: "הבניין לא נמצא, או שהוא בארכיון.",
  company_plan: "החברה לא נמצאה.",
  ai_credits: "הבניין לא נמצא.",
  collection_provider: "הספק לא נמצא אצל bloc.",
};

/** קודים של callBloc: הבקשה לא הגיעה ל-bloc (או שלא ידוע) — המשפט של callBloc כבר אומר מה לעשות. */
export const CONNECTION_CODES: ReadonlySet<string> = new Set([
  "NOT_CONFIGURED", "SELF_URL", "REDIRECT", "EDGE_BLOCKED", "ORIGIN_PROTECTED", "OLD_BLOC", "UPSTREAM_401", "REJECTED", "TIMEOUT", "NETWORK",
]);

export const hebrew = (s: string | undefined) => !!s && /[֐-׿]/.test(s);

export type MoneyFailure = { status: number; code: string; error: string };

/** תשובת כשל של bloc → מה הפאנל מחזיר למסך (סטטוס, קוד, משפט בעברית). */
export function moneyFailure(r: { status: number; error: string; code?: string }, kind: MoneyKind): MoneyFailure {
  const code = r.code ?? "";
  if (code && CONNECTION_CODES.has(code)) return { status: r.status, code, error: r.error };
  if (r.status === 503 && code === "read_failed") return { status: 503, code, error: READ_FAILED_TEXT };
  if (r.status === 503 && code === "write_failed") return { status: 503, code, error: WRITE_FAILED_TEXT };
  if (r.status === 403) return { status: 403, code: code || "forbidden", error: FORBIDDEN_TEXT };
  if (r.status === 404) return { status: 404, code: code || "not_found", error: NOT_FOUND_TEXT[kind] };
  if (r.status === 409) {
    const known = CONFLICT_TEXT[kind][code];
    return { status: 409, code: code || "conflict", error: known ?? (hebrew(r.error) ? r.error : UNEXPECTED_TEXT) };
  }
  if (r.status === 400) return { status: 400, code: code || "invalid", error: hebrew(r.error) ? r.error : INVALID_TEXT };
  return { status: r.status >= 400 ? r.status : 502, code: code || "failed", error: hebrew(r.error) ? r.error : UNEXPECTED_TEXT };
}

/**
 * כשל — האם ייתכן שהפעולה בוצעה ב-bloc (ליומן הפאנל, כדי שלא יחסיר פעולה שאולי קרתה)?
 * unknown = לא ענה בזמן / שגיאת רשת / שגיאת שרת בלי קוד מוכר; failed = נדחה או לא הגיע (4xx, חתימה, חיבור, קריאה,
 * כתיבה אחת שנכשלה).
 */
export function moneyOutcome(r: { status: number; code?: string }): "unknown" | "failed" {
  if (r.code === "TIMEOUT" || r.code === "NETWORK") return "unknown";
  if (r.status < 500) return "failed";
  if (r.code && (CONNECTION_CODES.has(r.code) || r.code === "read_failed" || r.code === "write_failed")) return "failed";
  return "unknown";
}

/** שורת היומן של כשל: MONEY_ACTION_FAILED / MONEY_ACTION_UNKNOWN, עם הפעולה שנוסתה והקוד של bloc. */
export function failureAudit(r: { status: number; code?: string }, action: string): { name: "MONEY_ACTION_FAILED" | "MONEY_ACTION_UNKNOWN"; meta: Record<string, unknown> } {
  const outcome = moneyOutcome(r);
  return {
    name: outcome === "unknown" ? "MONEY_ACTION_UNKNOWN" : "MONEY_ACTION_FAILED",
    meta: { action, outcome, code: r.code ?? null, status: r.status },
  };
}

/**
 * תשובת 2xx שאינה התשובה של bloc (סקירה #6): בלי ok === true, או בלי השורה שחוזרת (בניין / חברה / ספק). callBloc הופך גוף
 * שאינו JSON ל-{} — אסור להסיק מזה הצלחה. ייתכן שהפעולה בוצעה: עונים 502 bad_shape ורושמים MONEY_ACTION_UNKNOWN.
 */
export const BAD_SHAPE_TEXT = "bloc ענה בצורה לא צפויה — ייתכן שהפעולה בוצעה. רעננו את הדף ובדקו לפני שמנסים שוב.";
export function badShape(action: string): { status: 502; code: "bad_shape"; error: string; audit: { name: "MONEY_ACTION_UNKNOWN"; meta: Record<string, unknown> } } {
  return { status: 502, code: "bad_shape", error: BAD_SHAPE_TEXT, audit: { name: "MONEY_ACTION_UNKNOWN", meta: { action, outcome: "unknown", code: "bad_shape" } } };
}

/** השחקן ל-bloc — תמיד מהסשן (לא מהגוף), עם התפקיד: bloc אוכף סופר-אדמין גם אצלו (403 לפני כל קריאה). */
export function actorOf(s: { id: string; email: string; role: string }): { id: string; email: string; role: string } {
  return { id: s.id, email: s.email, role: s.role };
}

export const firstIp = (h: string | null | undefined) => (h ? h.split(",")[0]?.trim() || undefined : undefined);

/** מה שחוזר מ-bloc על מסלול (בניין / חברה) — רק השדות האלה עוברים לדפדפן. */
export type PlanRow = { id: string; plan: string | null; plan_expires: string | null; comp_reason: string | null };
export function planRow(x: unknown): PlanRow | null {
  const o = (x && typeof x === "object" ? x : null) as Record<string, unknown> | null;
  if (!o || typeof o.id !== "string") return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return { id: o.id, plan: str(o.plan), plan_expires: str(o.plan_expires), comp_reason: str(o.comp_reason) };
}
