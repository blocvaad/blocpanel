// src/lib/blocActionsUi.ts — מה שהמסכים של בניין וספק צריכים מהפעולות דרך bloc (PANEL-PAY א2, החלטות 367–369).
// בחבילת הדפדפן: בלי crypto, בלי next/server, בלי supabase. טהור — נבדק בלי DOM.
import { STEPUP_REQUIRED_CODE, STEPUP_CANCELLED_TEXT } from "./stepUpShared";

const q = (s: string) => `"${s}"`;

/** מה חלון הקוד אומר שמאשרים (החלטה 369; יצירה עם ראש ועד — החלטה 364). */
export const STEP_UP_WHAT = {
  archive: (name: string) => `העברה לארכיון: ${q(name)}`,
  suspend: (name: string) => `השעיית הבניין ${q(name)}`,
  activate: (name: string) => `הפעלה מחדש של ${q(name)}`,
  create: (name: string) => `בניין חדש ומינוי ראש ועד: ${q(name)}`,
  verify: (biz: string) => `אימות הספק ${q(biz)}`,
  reject: (biz: string) => `דחיית בקשת האימות של ${q(biz)}`,
  revoke: (biz: string) => `הסרת האימות של ${q(biz)}`,
} as const;

/** שורה בחלונות האישור (ארכוב, השעיה / הפעלה, אימות ספק): האישור הבא — בקוד מהמייל. */
export const STEP_UP_NOTE = "אחרי האישור נבקש קוד חד-פעמי מהמייל שלך — אלא אם אישרת בקוד ב-10 הדקות האחרונות.";

/** כשלים שבהם ייתכן שהפעולה בוצעה, או שהמצב השתנה — המסך מציע "רענון" ולא "נסו שוב". */
export const REFRESH_CODES: ReadonlySet<string> = new Set(["changed", "bad_shape", "TIMEOUT", "NETWORK", "failed"]);

type Answer = { error?: unknown; code?: unknown } | null | undefined;
const codeOf = (j: Answer) => (j && typeof j.code === "string" ? j.code : "");
const textOf = (j: Answer, fallback: string) => {
  if (codeOf(j) === STEPUP_REQUIRED_CODE) return STEPUP_CANCELLED_TEXT;   // חלון הקוד בוטל — הפעולה לא בוצעה
  return j && typeof j.error === "string" && j.error ? j.error : fallback;
};

// ── אימות ספק ──

export type SupplierAction = "verify" | "reject" | "revoke";
export type SupplierNotice = { tone: "ok" | "error"; text: string; refresh: boolean };

export const SUPPLIER_DONE_TEXT: Record<SupplierAction, (biz: string) => string> = {
  verify: (biz) => `${q(biz)} אומת — תג "ספק מאומת" מוצג עכשיו לוועדים.`,
  reject: (biz) => `בקשת האימות של ${q(biz)} נדחתה.`,
  revoke: (biz) => `האימות של ${q(biz)} הוסר.`,
};
/** ההודעה לספק (bloc שולח, best effort): נשמרה / לא נשמרה / לא ידוע. */
export const SUPPLIER_NOTIFIED_TEXT: Record<SupplierAction, string> = {
  verify: "הספק קיבל הודעה.",
  reject: "הספק קיבל הודעה עם הסיבה.",
  revoke: "הספק קיבל הודעה עם הסיבה.",
};
export const SUPPLIER_NOT_NOTIFIED_TEXT = "ההודעה לספק לא נשלחה — עדכנו אותו בדרך אחרת.";
export const SUPPLIER_FAILED_TEXT = "הפעולה לא בוצעה. נסו שוב.";

/** התשובה של PATCH /api/suppliers → מה הכרטיס / הדף אומרים. הצלחה רק עם ok === true; כל השאר — שגיאה (לעולם לא "בוצע"). */
export function afterSupplierAction(res: { ok: boolean }, body: unknown, action: SupplierAction, biz: string): { done: boolean; notice: SupplierNotice } {
  const j = (body && typeof body === "object" ? body : null) as { ok?: unknown; notified?: unknown; error?: unknown; code?: unknown } | null;
  if (res.ok && j && j.ok === true) {
    const tail = j.notified === true ? ` ${SUPPLIER_NOTIFIED_TEXT[action]}` : j.notified === false ? ` ${SUPPLIER_NOT_NOTIFIED_TEXT}` : "";
    return { done: true, notice: { tone: "ok", text: SUPPLIER_DONE_TEXT[action](biz) + tail, refresh: false } };
  }
  if (res.ok) return { done: false, notice: { tone: "error", text: "התשובה מהשרת לא ברורה — ייתכן שהפעולה בוצעה. רעננו את הרשימה ובדקו.", refresh: true } };
  return { done: false, notice: { tone: "error", text: textOf(j, SUPPLIER_FAILED_TEXT), refresh: REFRESH_CODES.has(codeOf(j)) } };
}

// ── בניין חדש ──

export const CREATE_FAILED_TEXT = "יצירת הבניין נכשלה. נסו שוב.";
export const CREATE_UNCLEAR_TEXT = "התשובה מהשרת לא ברורה — ייתכן שהבניין נוצר. בדקו ברשימת הבניינים לפני שמנסים שוב.";
export const CREATE_NETWORK_TEXT = "החיבור לשרת נקטע — ייתכן שהבניין נוצר. בדקו ברשימת הבניינים לפני שמנסים שוב.";

/** סקירה א2 (#3): אחרי ראש ועד שלא מונה, או תשובה לא ברורה — אין "צור בניין" שני (בניין שני). */
export const createLocked = (o: NewBuildingOutcome | null): boolean => o?.kind === "founder_failed" || (o?.kind === "error" && o.unclear);
export const FOUNDER_DEFAULT_TEXT = "ראש הוועד לא מונה.";

export type NewBuildingOutcome =
  | { kind: "created"; id: string }
  | { kind: "founder_failed"; id: string; name: string; inviteCode: string | null; message: string }
  | { kind: "error"; text: string; unclear: boolean };

/** התשובה של POST /api/buildings → מה הטופס עושה: לעבור לדף הבניין, להראות שראש הוועד לא מונה, או שגיאה. */
export function newBuildingOutcome(res: { ok: boolean }, j: unknown, name: string): NewBuildingOutcome {
  const o = (j && typeof j === "object" ? j : {}) as { data?: { id?: unknown; name?: unknown; invite_code?: unknown }; founder?: { ok?: unknown; message?: unknown }; error?: unknown; code?: unknown };
  if (!res.ok) return { kind: "error", text: textOf(o, CREATE_FAILED_TEXT), unclear: REFRESH_CODES.has(codeOf(o)) };
  const id = o.data && typeof o.data.id === "string" ? o.data.id : "";
  if (!id) return { kind: "error", text: CREATE_UNCLEAR_TEXT, unclear: true };
  if (o.founder && o.founder.ok !== true) {
    return {
      kind: "founder_failed", id,
      name: typeof o.data?.name === "string" && o.data.name ? o.data.name : name,
      inviteCode: typeof o.data?.invite_code === "string" ? o.data.invite_code : null,
      message: typeof o.founder.message === "string" && o.founder.message ? o.founder.message : FOUNDER_DEFAULT_TEXT,
    };
  }
  return { kind: "created", id };
}
