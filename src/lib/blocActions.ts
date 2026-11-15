// src/lib/blocActions.ts — בניין ואימות ספק דרך bloc (PANEL-PAY א2, החלטות 367–369, C1–C2). שרת, טהור (בלי I/O).
//
// הפאנל לא כותב יותר ל-buildings, ל-supplier_profiles ול-notifications של bloc. יצירת בניין (עם ראש הוועד באותה בקשה),
// עריכה, השעיה / הפעלה, ארכוב (כולל כלל המנוי החי של BILL-1b) ואימות / דחייה / הסרת אימות של ספק נשלחים חתומים ל-bloc
// (/api/internal/buildings, /api/internal/suppliers), שבודק הרשאה (לפי ה-actor), כותב, שולח את ההודעה ורושם ביומן שלו.
// כאן: התרגום של הקודים של bloc לעברית, מה נחשב תשובה ברורה (ok === true והשורה שחוזרת), ומה נרשם ביומן הפאנל כשנכשל או
// כשלא ידוע אם בוצע. bloc עונה בקודים בלבד ({ error: <code>, code }) — אף משפט של bloc לא מוצג כמו שהוא אם אינו בעברית.
import {
  CONNECTION_CODES, hebrew, moneyOutcome, BAD_SHAPE_TEXT, READ_FAILED_TEXT, WRITE_FAILED_TEXT, INVALID_TEXT, UNEXPECTED_TEXT,
} from "./moneyActions";
import type { LiveSub, LiveSubAction, StopTaskResult } from "./billing";

export type BlocActionKind = "building_create" | "building_update" | "building_active" | "building_archive" | "supplier";

/** 403 של bloc — לפי הפעולה (אותן הרשאות כמו בפאנל: buildings.modify / סופר-אדמין לארכוב / suppliers.verify). */
export const FORBIDDEN_TEXT: Record<BlocActionKind, string> = {
  building_create: "bloc סירב: פתיחת בניין — למנהלים ולסופר-אדמין בלבד.",
  building_update: "bloc סירב: עריכת בניין — למנהלים ולסופר-אדמין בלבד.",
  building_active: "bloc סירב: השעיה והפעלה של בניין — למנהלים ולסופר-אדמין בלבד.",
  building_archive: "bloc סירב: העברה לארכיון — לסופר-אדמין בלבד.",
  supplier: "bloc סירב: אימות ספקים — למנהלים ולסופר-אדמין בלבד.",
};
/** אישור השעיה של בניין עם מנוי חי — רק למי שמנהל חיובים (BILL-1b; bloc אוכף גם הוא). */
export const LIVE_FORBIDDEN_TEXT = "יש כאן מנוי חי ל-bloc. אישור השעיה או ארכוב של לקוח משלם — רק למי שמנהל חיובים (סופר-אדמין).";

export const NOT_FOUND_TEXT: Record<BlocActionKind, string> = {
  building_create: "bloc לא מצא את מה שנדרש לפתיחת הבניין. רעננו את הדף ונסו שוב.",
  building_update: "הבניין לא נמצא, או שהוא בארכיון.",
  building_active: "הבניין לא נמצא, או שהוא בארכיון.",
  building_archive: "הבניין לא נמצא.",
  supplier: "הספק לא נמצא.",
};

const CHANGED_BUILDING = "הבניין השתנה מאז שהדף נטען. רעננו את הדף ובדקו לפני שמנסים שוב.";
/** 409 של bloc — לפי הסיבה. live_subscription לא כאן: הוא נפתח כחלון האישור (liveConflictOf). */
export const CONFLICT_TEXT: Record<BlocActionKind, Record<string, string>> = {
  building_create: {},
  building_update: {
    archived: "הבניין בארכיון — אי אפשר לערוך אותו.",
    changed: CHANGED_BUILDING,
  },
  building_active: {
    archived: "הבניין בארכיון — אי אפשר להשעות או להפעיל אותו.",
    changed: CHANGED_BUILDING,
  },
  building_archive: {
    archived: "הבניין כבר בארכיון.",
    changed: CHANGED_BUILDING,
  },
  supplier: {
    changed: "מצב האימות של הספק השתנה מאז שהדף נטען. רעננו את הדף ובדקו לפני שמנסים שוב.",
  },
};

export type ActionFailure = { status: number; code: string; error: string };

/** תשובת כשל של bloc → מה הפאנל מחזיר למסך (סטטוס, קוד, משפט בעברית). קודי החיבור של callBloc — כמו שהם. */
export function blocActionFailure(r: { status: number; error: string; code?: string }, kind: BlocActionKind): ActionFailure {
  const code = r.code ?? "";
  if (code && CONNECTION_CODES.has(code)) return { status: r.status, code, error: r.error };
  if (r.status === 503 && code === "read_failed") return { status: 503, code, error: READ_FAILED_TEXT };
  if (r.status === 503 && code === "write_failed") return { status: 503, code, error: WRITE_FAILED_TEXT };
  if (r.status === 403) {
    if (code === "live_subscription_forbidden") return { status: 403, code, error: LIVE_FORBIDDEN_TEXT };
    return { status: 403, code: code || "forbidden", error: FORBIDDEN_TEXT[kind] };
  }
  if (r.status === 404) return { status: 404, code: code || "not_found", error: NOT_FOUND_TEXT[kind] };
  if (r.status === 409) {
    const known = CONFLICT_TEXT[kind][code];
    return { status: 409, code: code || "conflict", error: known ?? (hebrew(r.error) ? r.error : UNEXPECTED_TEXT) };
  }
  if (r.status === 400) return { status: 400, code: code || "invalid", error: hebrew(r.error) ? r.error : INVALID_TEXT };
  return { status: r.status >= 400 ? r.status : 502, code: code || "failed", error: hebrew(r.error) ? r.error : UNEXPECTED_TEXT };
}

/** שורת היומן של כשל: BLOC_ACTION_FAILED (נדחה / לא הגיע) או BLOC_ACTION_UNKNOWN (ייתכן שבוצע), עם הפעולה שנוסתה. */
export function actionFailureAudit(r: { status: number; code?: string }, action: string): {
  name: "BLOC_ACTION_FAILED" | "BLOC_ACTION_UNKNOWN"; meta: Record<string, unknown>;
} {
  const outcome = moneyOutcome(r);
  return {
    name: outcome === "unknown" ? "BLOC_ACTION_UNKNOWN" : "BLOC_ACTION_FAILED",
    meta: { action, outcome, code: r.code ?? null, status: r.status },
  };
}

/** 2xx שאינה התשובה של bloc (בלי ok === true או בלי השורה) — ייתכן שבוצע: 502 bad_shape, BLOC_ACTION_UNKNOWN ביומן. */
export function actionBadShape(action: string): {
  status: 502; code: "bad_shape"; error: string; audit: { name: "BLOC_ACTION_UNKNOWN"; meta: Record<string, unknown> };
} {
  return { status: 502, code: "bad_shape", error: BAD_SHAPE_TEXT, audit: { name: "BLOC_ACTION_UNKNOWN", meta: { action, outcome: "unknown", code: "bad_shape" } } };
}

// ── מה ש-bloc מחזיר — רק השדות האלה עוברים לדפדפן וליומן ──

const obj = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : null);
const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);

export type BuildingRow = { id: string; name: string; address: string | null; max_tenants: number | null; is_active: boolean | null; invite_code: string | null };
export function buildingRow(x: unknown): BuildingRow | null {
  const o = obj(x);
  if (!o || typeof o.id !== "string" || !o.id || typeof o.name !== "string") return null;
  return {
    id: o.id, name: o.name, address: strOrNull(o.address),
    max_tenants: typeof o.max_tenants === "number" ? o.max_tenants : null,
    is_active: typeof o.is_active === "boolean" ? o.is_active : null,
    invite_code: strOrNull(o.invite_code),
  };
}

export type ActiveRow = { id: string; name: string; is_active: boolean };
/** השעיה / הפעלה: השורה, ורק אם המצב שחזר הוא המצב שביקשנו. */
export function activeRow(x: unknown, wanted: boolean): ActiveRow | null {
  const o = obj(x);
  if (!o || typeof o.id !== "string" || !o.id || typeof o.name !== "string" || o.is_active !== wanted) return null;
  return { id: o.id, name: o.name, is_active: wanted };
}

const STOP_TASKS: ReadonlySet<string> = new Set(["opened", "already", "none", "failed"]);
export const stopTaskOf = (v: unknown): StopTaskResult | null => (typeof v === "string" && STOP_TASKS.has(v) ? v as StopTaskResult : null);

export type ArchiveAnswer = { blocked: number | null; stop_task: StopTaskResult; name: string | null };
/** ארכוב: ok === true, archived === true ו-stop_task מוכר (opened / already / none / failed) — אחרת null (לא ברור). */
export function archiveAnswer(d: Record<string, unknown>): ArchiveAnswer | null {
  if (d.ok !== true || d.archived !== true) return null;
  const stop = stopTaskOf(d.stop_task);
  if (!stop) return null;
  const b = obj(d.building);
  const name = strOrNull(b?.name) ?? strOrNull(d.building_name);
  return { blocked: typeof d.blocked === "number" ? d.blocked : null, stop_task: stop, name };
}

export type SupplierAction = "verify" | "reject" | "revoke";
export type SupplierRow = { id: string; business_name: string | null; verification_status: "verified" | "rejected"; verified_at: string | null; verification_rejection_reason: string | null };
/** אימות → verified; דחייה / הסרה → rejected. מצב אחר = לא התשובה שציפינו לה. */
export function supplierRow(x: unknown, action: SupplierAction): SupplierRow | null {
  const o = obj(x);
  const want = action === "verify" ? "verified" : "rejected";
  if (!o || typeof o.id !== "string" || !o.id || o.verification_status !== want) return null;
  // business_name — ליומן של הפאנל (bloc מחזיר אותו מ-א2, סקירה #2); אצל bloc ישן — null.
  return { id: o.id, business_name: strOrNull(o.business_name), verification_status: want, verified_at: strOrNull(o.verified_at), verification_rejection_reason: strOrNull(o.verification_rejection_reason) };
}

// ── ראש הוועד בבניין חדש (founder — באותה בקשה של היצירה) ──

/** הקודים של founder ב-bloc (lib/panelMembers panelFounder) → משפט: מה קרה ומה עושים. */
export const FOUNDER_TEXT: Record<string, string> = {
  NO_USER: "אין ב-bloc חשבון עם המייל הזה. שלחו לראש הוועד את קוד ההצטרפות, וכשיצטרף — מנו אותו מהדף שלו.",
  AMBIGUOUS: "יש ב-bloc יותר מחשבון אחד עם המייל הזה. מנו את ראש הוועד מהדף של האדם.",
  DELETED: "החשבון עם המייל הזה נמחק.",
  BLOCKED: "החשבון עם המייל הזה חסום.",
  PERSONA: "אפשר למנות לוועד רק דייר — לא חשבון של ספק או של חברת ניהול.",
  HAS_HEAD: "לבניין כבר יש ראש ועד.",
  APARTMENT_FLOOR: "הדירה בבקשה שלו לא מתאימה לקומה שרשומה בבניין. תקנו את הדירה והקומה, ואז מנו אותו מהדף שלו.",
  NO_BUILDING: "bloc לא מצא את הבניין החדש כשניסה למנות את ראש הוועד. פתחו את דף הבניין, ומנו את ראש הוועד מהדף שלו.",
  ARCHIVED: "הבניין בארכיון — אי אפשר למנות לו ראש ועד.",
};
export const FOUNDER_FAILED_TEXT = "מינוי ראש הוועד לא הצליח. הבניין נפתח בלי ועד — שלחו לראש הוועד את קוד ההצטרפות, ומנו אותו מהדף שלו אחרי שיצטרף.";
export const FOUNDER_SKIPPED_TEXT = "ראש הוועד לא מונה. מנו אותו מהדף שלו אחרי שיצטרף לבניין.";
export const FOUNDER_UNKNOWN_TEXT = "לא ידוע אם ראש הוועד מונה — בדקו בדף הבניין לפני שמנסים שוב.";

export type FounderOutcome = { ok: true } | { ok: false; code: string; message: string };
/** founder: 'ok' | 'failed' | 'skipped' (C1). כל ערך אחר — לא ידוע, ואף פעם לא "מונה". */
export function founderOutcome(d: Record<string, unknown>): FounderOutcome {
  const f = d.founder;
  if (f === "ok") return { ok: true };
  if (f === "failed") {
    // הקודים של panelFounder באותיות גדולות (NO_USER…); 'failed' — כש-founder נזרק. קוד שלא מכירים — כמו שהוא.
    const raw = typeof d.founder_code === "string" ? d.founder_code.trim() : "";
    const known = FOUNDER_TEXT[raw.toUpperCase()];
    return { ok: false, code: known ? raw.toUpperCase() : raw || "failed", message: known ?? FOUNDER_FAILED_TEXT };
  }
  if (f === "skipped") return { ok: false, code: "skipped", message: FOUNDER_SKIPPED_TEXT };
  return { ok: false, code: "unknown", message: FOUNDER_UNKNOWN_TEXT };
}

// ── 409 live_subscription (BILL-1b, החלטה 319 — עכשיו bloc מחליט) ──

export const LIVE_SUBSCRIPTION_CODE = "live_subscription";
/** תשובת כשל של bloc → המנוי שחלון האישור מציג, או null כשזה לא 409 live_subscription. */
export function liveConflictOf(
  r: { status: number; code?: string; data?: Record<string, unknown> }, fallback: LiveSubAction,
): { sub: LiveSub; action: LiveSubAction } | null {
  if (r.status !== 409 || r.code !== LIVE_SUBSCRIPTION_CODE) return null;
  const d = r.data ?? {};
  const s = obj(d.subscription);
  const action: LiveSubAction = d.action === "archive" || d.action === "suspend" ? d.action : fallback;
  return {
    action,
    sub: {
      status: strOrNull(s?.status) ?? "",
      plan_id: strOrNull(s?.plan_id) ?? "",
      // לא ידוע → כאילו יש הוראת קבע: עדיף להזהיר מיותר מאשר להשאיר חיוב רץ.
      has_recurring: s ? s.has_recurring !== false : true,
      period_end: strOrNull(s?.period_end),
    },
  };
}
