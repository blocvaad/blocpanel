// src/lib/encryptionKeys.ts — מפתחות ההצפנה של bloc לפי סוג (KEYS-1, החלטות 358–360): מה הפאנל מציג, שולח ובודק.
//
// הפאנל לא רואה מפתח לעולם. bloc (/api/internal/keys, חתום) מחזיר רק מזהי מפתח (kid) וספירות, והפאנל מעביר לדפדפן
// רק שדות מרשימה לבנה: שדה אחר, גם אם יגיע בטעות, לא יוצא מה-route. kid מוצג רק בצורה [a-z0-9]{1,8}, כך שמפתח
// (64 תווי hex) לא יכול להופיע במקום מזהה.
//
// הצפנה מחדש: סבב של עד 200 שורות, רק אחרי ריצת ניסיון טרייה (פחות מ-10 דקות, אותו מפתח, אותן ספירות) ועם הערה.
// סודות הסליקה (payment) לא זזים מכאן: הם נשארים על המפתח הישן עד שהבעלים מעביר את הקובץ שלו (החלטת בעלים).
import { PANEL_SESSION_CODE } from "./panelSession";

export type EncKind = "supplier_bank" | "payment";

export const KIND_LABELS: Record<EncKind, string> = {
  supplier_bank: "פרטי בנק של ספקים",
  payment: "סודות הסליקה של הבניינים",
};
/** שם משתנה הסביבה ב-Vercel של bloc. שם בלבד — אף פעם לא ערך. */
export const KIND_ENV: Record<EncKind, string> = {
  supplier_bank: "ENCRYPTION_KEYS_SUPPLIER_BANK",
  payment: "ENCRYPTION_KEYS_PAYMENT",
};
export const LEGACY_ENV = "MESHULAM_ENCRYPTION_KEY";

/** סבב אחד ב-bloc: עד 200 שורות (החלטה 360). הפאנל שולח תמיד את המקסימום. */
export const BATCH_MAX = 200;
export const NOTE_MIN = 10;
export const NOTE_MAX = 500;
/** ריצת ניסיון ישנה מזה — מריצים שוב לפני הצפנה מחדש. */
export const DRY_RUN_TTL_MS = 10 * 60_000;
const KID_RE = /^[a-z0-9]{1,8}$/;

/** מחרוזת LTR בתוך משפט בעברית (FSI / PDI) — כמו הכתובות ב-blocApi. */
export const ltr = (s: string) => `⁨${s}⁩`;

export type KeyCounts = { rows: number; legacy: number; oldKid: number; current: number; unreadable: number };
export type KindStatus = {
  kind: EncKind;
  configured: boolean;
  valid: boolean;
  currentKid: string | null;
  kids: string[];
  /** null = bloc לא החזיר ספירה תקינה. לא מציגים 0 במקומה. */
  counts: KeyCounts | null;
};
export type KeysStatus = { supplierBank: KindStatus; payment: KindStatus | null };
/** changed = wouldUpdate בריצת ניסיון, updated בסבב אמיתי. */
export type RunCounts = { scanned: number; changed: number; conflicts: number; unreadable: number; remaining: number };
/** dryRunToken — רק בריצת ניסיון (C5): אישור חתום של bloc שהסבב האמיתי חייב להחזיר. HMAC, לא מפתח — מותר בדפדפן. */
export type RunResult = { kind: EncKind; dryRun: boolean; counts: RunCounts; dryRunToken?: string };

/** C5: kd1.<kind>.<kid>.<13 ספרות ms>.<43 תווי base64url>. רק מחרוזת בצורה הזו עוברת (בשני הכיוונים). */
const DRY_RUN_TOKEN_RE = /^kd1\.[a-z_]+\.[a-z0-9]{1,8}\.\d{13}\.[A-Za-z0-9_-]{43}$/;
export const isDryRunToken = (v: unknown): v is string => typeof v === "string" && DRY_RUN_TOKEN_RE.test(v);
/** אישור של ריצת ניסיון לסוג הזה בלבד (הסוג שבתוך האישור = הסוג שנשאל). */
const tokenFor = (v: unknown, kind: EncKind): string | undefined =>
  isDryRunToken(v) && v.split(".")[1] === kind ? v : undefined;

// ── קריאת התשובות של bloc (רשימה לבנה) ──

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isKind = (v: unknown): v is EncKind => v === "supplier_bank" || v === "payment";

function parseCounts(v: unknown): KeyCounts | null {
  const c = obj(v);
  if (!c) return null;
  const { rows, legacy, oldKid, current, unreadable } = c;
  if (!isCount(rows) || !isCount(legacy) || !isCount(oldKid) || !isCount(current) || !isCount(unreadable)) return null;
  return { rows, legacy, oldKid, current, unreadable };
}

function parseKind(v: unknown): KindStatus | null {
  const k = obj(v);
  if (!k || !isKind(k.kind) || typeof k.configured !== "boolean" || typeof k.valid !== "boolean") return null;
  const currentKid = typeof k.currentKid === "string" && KID_RE.test(k.currentKid) ? k.currentKid : null;
  const kids = Array.isArray(k.kids)
    ? [...new Set(k.kids.filter((x): x is string => typeof x === "string" && KID_RE.test(x)))]
    : [];
  return { kind: k.kind, configured: k.configured, valid: k.valid, currentKid, kids, counts: parseCounts(k.counts) };
}

/** תשובת status של bloc (C3) → מה שהדפדפן מקבל. בלי supplier_bank תקין — null (תשובה לא צפויה). */
export function parseKeysStatus(data: unknown): KeysStatus | null {
  const d = obj(data);
  if (!d || !Array.isArray(d.kinds)) return null;
  const kinds = d.kinds.map(parseKind).filter((k): k is KindStatus => k !== null);
  const supplierBank = kinds.find((k) => k.kind === "supplier_bank");
  if (!supplierBank) return null;
  return { supplierBank, payment: kinds.find((k) => k.kind === "payment") ?? null };
}

/**
 * תשובת reencrypt של bloc (C3, C5). dryRun שלא תואם למה שנשלח — null: אסור להציג ניסיון שהיה אמיתי, או להפך.
 * dryRunToken — רק בריצת ניסיון, רק בצורה של C5 ולסוג שנשאל; אחרת לא עובר (והכרטיס לא יאפשר סבב אמיתי עליו).
 */
export function parseRunResult(data: unknown, kind: EncKind, dryRun: boolean): RunResult | null {
  const d = obj(data);
  const c = obj(d?.counts);
  if (!d || !c || d.dryRun !== dryRun) return null;
  const changed = dryRun ? c.wouldUpdate : c.updated;
  const { scanned, conflicts, unreadable, remaining } = c;
  if (!isCount(changed) || !isCount(scanned) || !isCount(conflicts) || !isCount(unreadable) || !isCount(remaining)) return null;
  const token = dryRun ? tokenFor(d.dryRunToken, kind) : undefined;
  return { kind, dryRun, counts: { scanned, changed, conflicts, unreadable, remaining }, ...(token ? { dryRunToken: token } : {}) };
}

// ── מצב המפתח ──

export const hasCurrentKey = (s: KindStatus) => s.configured && s.valid && s.currentKid !== null;

export function keyTag(s: KindStatus): { tone: "ok" | "wait" | "danger"; text: string } {
  if (hasCurrentKey(s)) return { tone: "ok", text: "מפתח נוכחי" };
  if (!s.configured) return { tone: "wait", text: "לא הוגדר מפתח" };
  if (!s.valid) return { tone: "danger", text: "הגדרה פגומה" };
  return { tone: "danger", text: "מזהה מפתח לא תקין" };
}

/** למה אין מפתח לכתיבה — ומה עושים. null כשיש מפתח נוכחי. */
export function noKeyText(s: KindStatus): string | null {
  if (hasCurrentKey(s)) return null;
  const env = ltr(KIND_ENV[s.kind]);
  if (!s.configured) {
    return `${env} לא מוגדר ב-Vercel של bloc. עד שמגדירים אותו כתיבות חדשות נשארות על המפתח הישן, ושום דבר לא נשבר — רק אין לאן להצפין מחדש.`;
  }
  if (!s.valid) {
    return `ההגדרה של ${env} פגומה, ולכן כתיבות חדשות נשארות על המפתח הישן. מתקנים ב-Vercel של bloc (רשימה של kid:64hex מופרדת בפסיקים, הראשון הוא הנוכחי) ואז Redeploy.`;
  }
  return "bloc החזיר מזהה מפתח לא תקין. לא מצפינים מחדש עד שזה מתברר.";
}

/** אחוז הערכים שעל המפתח הנוכחי (מתוך כל הערכים, כולל לא קריאים). מעוגל למטה: 100% רק כשהכול עליו. */
export function currentShare(c: KeyCounts): number | null {
  const total = c.legacy + c.oldKid + c.current + c.unreadable;
  return total === 0 ? null : Math.floor((c.current / total) * 100);
}

/** אין עדיין אף ערך שמור — אין מה להצפין מחדש. ספירה שלא הגיעה היא לא "ריק". */
export function isEmptyStatus(s: KindStatus): boolean {
  const c = s.counts;
  return !!c && c.rows === 0 && c.legacy + c.oldKid + c.current + c.unreadable === 0;
}

// ── ריצת ניסיון: מתי היא עדיין תקפה ──

/** token — האישור החתום של bloc לריצה הזו (C5); נשלח עם הסבב האמיתי. ניסיון שנמחק — האישור איתו. */
export type DryRun = { kind: EncKind; counts: RunCounts; at: number; currentKid: string | null; fingerprint: string; token: string | null };
export type DryRunState = "none" | "fresh" | "stale_time" | "stale_key" | "stale_counts";

/** טביעת המצב — אם השתנתה מאז ריצת הניסיון, המספרים שבחלון האישור כבר לא נכונים. */
export function fingerprint(s: KindStatus): string {
  const c = s.counts;
  return [s.configured, s.valid, s.currentKid ?? "-", s.kids.join(","), c ? [c.rows, c.legacy, c.oldKid, c.current, c.unreadable].join(",") : "?"].join("|");
}

export function makeDryRun(result: RunResult, s: KindStatus, at: number): DryRun {
  return { kind: result.kind, counts: result.counts, at, currentKid: s.currentKid, fingerprint: fingerprint(s), token: result.dryRunToken ?? null };
}

export function dryRunState(dry: DryRun | null, s: KindStatus, now: number): DryRunState {
  if (!dry || dry.kind !== s.kind) return "none";
  if (dry.currentKid !== s.currentKid) return "stale_key";
  if (dry.fingerprint !== fingerprint(s)) return "stale_counts";
  if (now - dry.at > DRY_RUN_TTL_MS || now < dry.at) return "stale_time";
  return "fresh";
}

export const STALE_TEXT: Record<"stale_time" | "stale_key" | "stale_counts", string> = {
  stale_time: "ריצת הניסיון ישנה (יותר מ-10 דקות). מריצים ניסיון שוב.",
  stale_key: "המפתח הנוכחי השתנה מאז ריצת הניסיון. מריצים ניסיון שוב.",
  stale_counts: "המצב השתנה מאז ריצת הניסיון. מריצים ניסיון שוב.",
};
export const ONLY_SUPERADMIN_TEXT = "רק סופר-אדמין מריץ ניסיון והצפנה מחדש.";
export const NEED_DRY_RUN_TEXT = "קודם מריצים ניסיון — רואים מה ישתנה, ורק אז מצפינים מחדש.";
export const NOTHING_TO_DO_TEXT = "אין מה להצפין מחדש — ריצת הניסיון לא מצאה ערכים על מפתח ישן.";
export const NO_TOKEN_TEXT = "ריצת הניסיון חזרה בלי אישור חתום מ-bloc, ולכן אי אפשר להצפין מחדש. מריצים ניסיון שוב; אם זה חוזר — הגרסה של bloc לא מעודכנת.";
/** C5 — גם 400 של הפאנל (בלי אישור) וגם 409 של bloc (אישור ישן / מפתח אחר / מנהל אחר / שונה). */
export const DRY_RUN_REQUIRED_TEXT = "צריך ריצת ניסיון טרייה — עד 10 דקות, באותו מפתח. מריצים ניסיון ואז מאשרים.";

/** למה "הרצת ניסיון" חסומה (null = מותרת). */
export function dryRunBlock(s: KindStatus, canAct: boolean): string | null {
  if (!canAct) return ONLY_SUPERADMIN_TEXT;
  return noKeyText(s);
}

/** למה "הצפנה מחדש" חסומה (null = מותרת): בלי מפתח, בלי ניסיון, ניסיון ישן, אין מה לעשות, או ניסיון בלי אישור של bloc. */
export function reencryptBlock(s: KindStatus, dry: DryRun | null, now: number, canAct: boolean): string | null {
  const first = dryRunBlock(s, canAct);
  if (first) return first;
  const st = dryRunState(dry, s, now);
  if (st === "none") return NEED_DRY_RUN_TEXT;
  if (st !== "fresh") return STALE_TEXT[st];
  if (dry!.counts.changed === 0) return NOTHING_TO_DO_TEXT;
  if (!dry!.token) return NO_TOKEN_TEXT;
  return null;
}

/** גוף "הרצת ניסיון". */
export const dryRunBody = (): { action: "dry_run"; kind: "supplier_bank" } => ({ action: "dry_run", kind: "supplier_bank" });
/** גוף הסבב האמיתי: ההערה והאישור של ריצת הניסיון הטרייה (C5). בלי ניסיון — בלי אישור, וה-route עונה 400 dry_run_required. */
export function reencryptBody(note: string | undefined, dry: DryRun | null): { action: "reencrypt"; kind: "supplier_bank"; note?: string; dryRunToken?: string } {
  return { action: "reencrypt", kind: "supplier_bank", ...(note ? { note } : {}), ...(dry?.token ? { dryRunToken: dry.token } : {}) };
}

// ── ההערה ──

export const NOTE_REQUIRED_TEXT = `נדרשת הערה של ${NOTE_MIN} תווים לפחות — למה מצפינים מחדש עכשיו.`;
export const NOTE_TOO_LONG_TEXT = `ההערה ארוכה מדי (עד ${NOTE_MAX} תווים).`;
export const NOTE_SECRET_TEXT = "נראה שהודבק מפתח בהערה. מפתח לא נשלח לשום מקום — כתבו רק מה נעשה (למשל: הוגדר k2 ב-Vercel של bloc).";

const HEX_RUN = /[0-9a-f]{32,}/i;
const B64_RUN = /[A-Za-z0-9+/=_-]{40,}/g;
/** רצף שנראה כמו מפתח: 32+ תווי hex, או 40+ תווי base64 עם אותיות גדולות, קטנות וספרות. */
export function looksLikeSecret(s: string): boolean {
  if (HEX_RUN.test(s)) return true;
  for (const m of s.match(B64_RUN) ?? []) if (/[A-Z]/.test(m) && /[a-z]/.test(m) && /[0-9]/.test(m)) return true;
  return false;
}

export type NoteCheck = { ok: true; value: string | undefined } | { ok: false; error: string };
/** הערה: חובה (10+ תווים) בהצפנה מחדש, רשות בניסיון; עד 500 תווים; בלי מפתח מודבק. */
export function checkNote(raw: unknown, required: boolean): NoteCheck {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return required ? { ok: false, error: NOTE_REQUIRED_TEXT } : { ok: true, value: undefined };
  if (required && v.length < NOTE_MIN) return { ok: false, error: NOTE_REQUIRED_TEXT };
  if (v.length > NOTE_MAX) return { ok: false, error: NOTE_TOO_LONG_TEXT };
  if (looksLikeSecret(v)) return { ok: false, error: NOTE_SECRET_TEXT };
  return { ok: true, value: v };
}

// גוף ה-POST (zod) — ב-lib/validation (keysActionSchema), עם שאר הסכמות; כאן בלי zod, כי הכרטיס בדפדפן מייבא מהקובץ.

// ── השגיאות של bloc בעברית ──

export type KeysStep = "status" | "dry_run" | "reencrypt";
export type KeysFailure = { status: number; error: string; code?: string };

export const NO_CURRENT_KEY_TEXT = `אין מפתח נוכחי לפרטי הבנק של הספקים: מגדירים את ${ltr(KIND_ENV.supplier_bank)} ב-Vercel של bloc ועושים Redeploy. עד אז כתיבות חדשות נשארות על המפתח הישן ושום דבר לא נשבר — רק אין לאן להצפין מחדש.`;
export const PAYMENT_NOT_MOVABLE_TEXT = "סודות הסליקה של הבניינים נשארים על המפתח הישן עד שהבעלים מעביר את הקובץ שלו לממשק החדש. אין הצפנה מחדש שלהם מהפאנל.";
/** 503 read_failed: bloc קורא את כל הטבלה לפני שהוא כותב משהו — כשל קריאה = לא שונה דבר. */
export const READ_FAILED_TEXT: Record<KeysStep, string> = {
  status: "bloc לא הצליח לקרוא את מצב ההצפנה, ולכן לא מוצגים מספרים (גם לא 0). נסו שוב בעוד רגע.",
  dry_run: "ריצת הניסיון לא הושלמה: bloc לא הצליח לקרוא את הנתונים. שום דבר לא שונה — נסו שוב בעוד רגע.",
  reencrypt: "הסבב לא התחיל: bloc לא הצליח לקרוא את פרטי הבנק של הספקים. שום דבר לא שונה — נסו שוב בעוד רגע.",
};
/** 503 write_failed: נעצר באמצע כתיבה — חלק מהערכים כבר במפתח הנוכחי. */
export const WRITE_FAILED_TEXT = "הסבב נעצר באמצע: חלק מהערכים כבר הוצפנו מחדש. מרעננים את המצב ומריצים ניסיון כדי לראות מה נשאר.";
/** 503 אחר בסבב אמיתי — לא ידוע כמה רץ. */
export const REENCRYPT_UNAVAILABLE_TEXT = "הסבב לא הושלם: bloc לא היה זמין. ייתכן שחלק מהערכים כבר הוצפנו מחדש — מרעננים את המצב ומריצים ניסיון לפני סבב נוסף.";
export const STATUS_SHAPE_TEXT = "bloc החזיר תשובה בלי מצב ההצפנה (KEYS-1 עוד לא נפרסה ב-bloc?).";
export const RUN_SHAPE_TEXT: Record<"dry_run" | "reencrypt", string> = {
  dry_run: "bloc ענה על ריצת הניסיון בצורה לא צפויה, ולכן לא מוצגים מספרים. מרעננים ומנסים שוב.",
  reencrypt: "bloc ענה על הסבב בצורה לא צפויה — ייתכן שהסבב בוצע. מרעננים את המצב לפני שמנסים שוב.",
};
/** 503 של callBloc עצמו (החיבור לא מוגדר / הפאנל פונה לעצמו) — ההודעה שלו כבר אומרת מה לתקן. */
const CONNECTION_CODES = new Set(["NOT_CONFIGURED", "SELF_URL"]);

export function keysFailure(r: { status: number; error: string; code?: string }, step: KeysStep): KeysFailure {
  if (r.status === 409 && r.code === "dry_run_required") return { status: 409, code: r.code, error: DRY_RUN_REQUIRED_TEXT };
  if (r.status === 409 && r.code === "no_current_key") return { status: 409, code: r.code, error: NO_CURRENT_KEY_TEXT };
  if (r.status === 409 && r.code === "payment_not_movable") return { status: 409, code: r.code, error: PAYMENT_NOT_MOVABLE_TEXT };
  if (r.status === 503 && !(r.code && CONNECTION_CODES.has(r.code))) {
    if (step === "reencrypt" && r.code === "write_failed") return { status: 503, code: r.code, error: WRITE_FAILED_TEXT };
    if (step === "reencrypt" && r.code !== "read_failed") return { status: 503, code: r.code ?? "unavailable", error: REENCRYPT_UNAVAILABLE_TEXT };
    return { status: 503, code: r.code ?? "read_failed", error: READ_FAILED_TEXT[step] };
  }
  return { status: r.status, error: r.error, ...(r.code ? { code: r.code } : {}) };
}

/** קודים שאומרים שהבקשה לא הגיעה לקוד של bloc, או שנדחתה לפני כל כתיבה (callBloc / bloc). */
const NEVER_RAN = new Set(["NOT_CONFIGURED", "SELF_URL", "REDIRECT", "EDGE_BLOCKED", "ORIGIN_PROTECTED", "OLD_BLOC", "UPSTREAM_401", "REJECTED", "read_failed"]);
/**
 * סבב אמיתי שנכשל — האם ייתכן שמשהו נכתב (ליומן הפאנל, כדי שלא יחסיר סבב שאולי רץ)?
 * partial = נעצר באמצע כתיבה; unknown = לא ענה בזמן / שגיאת שרת בלי קוד מוכר; null = לא רץ (4xx, חתימה, חיבור, כשל קריאה).
 */
export function failedRunOutcome(r: { status: number; code?: string }): "partial" | "unknown" | null {
  if (r.code === "write_failed") return "partial";
  if (r.code === "TIMEOUT" || r.code === "NETWORK") return "unknown";
  if (r.status < 500 || (r.code && NEVER_RAN.has(r.code))) return null;
  return "unknown";
}

// ── מעברי מצב בכרטיס אחרי פעולה (טהורים — נבדקים בלי DOM) ──

export type KeysMsg = { ok: boolean; text: string; login?: boolean };
export type LastRun = RunResult & { at: number };
/** תשובת POST /api/keys כפי שהדפדפן קיבל אותה; null = אין חיבור לשרת. */
export type PostAnswer = { ok: boolean; status: number; j: { result?: RunResult; error?: string; code?: string } };

export const NET_ERROR_TEXT = "אין חיבור לשרת. בדקו את החיבור ונסו שוב.";
export const RUN_NET_ERROR_TEXT = "אין חיבור לשרת — ייתכן שהסבב רץ. מרעננים את המצב לפני שמנסים שוב.";
export const DRY_RUN_DONE_TEXT = "ריצת הניסיון הסתיימה. שום דבר לא שונה.";
const sessionEnded = (a: PostAnswer) => a.status === 401 && a.j.code === PANEL_SESSION_CODE;

/**
 * אחרי "הרצת ניסיון". הצלחה — הניסיון נקשר למצב שנקרא מיד אחריו (fresh; אם הקריאה נכשלה — למצב הקודם).
 * כשל — אין ניסיון (גם לא הקודם): לפני הצפנה מחדש צריך ניסיון שהצליח. no_current_key — המפתח השתנה, מרעננים.
 */
export function afterDryRun(a: PostAnswer | null, fresh: KindStatus | null, prev: KindStatus | null, now: number): { dry: DryRun | null; msg: KeysMsg; reload: boolean } {
  if (!a) return { dry: null, msg: { ok: false, text: NET_ERROR_TEXT }, reload: false };
  if (a.ok && a.j.result) {
    const base = fresh ?? prev;
    return { dry: base ? makeDryRun(a.j.result, base, now) : null, msg: { ok: true, text: DRY_RUN_DONE_TEXT }, reload: false };
  }
  return { dry: null, msg: { ok: false, text: a.j.error ?? "ריצת הניסיון נכשלה. נסו שוב.", login: sessionEnded(a) }, reload: a.j.code === "no_current_key" };
}

export type ReencryptOutcome = {
  last: LastRun | null; keepDry: boolean; confirmOpen: boolean; clearNote: boolean; noteError: string | null; msg: KeysMsg | null; reload: boolean;
};
/**
 * אחרי "הצפנה מחדש". הצלחה — הסבב מוצג, הניסיון נמחק (הבא צריך ניסיון חדש). 400 — ההערה: החלון נשאר פתוח, שום דבר
 * לא רץ. dry_run_required (400 של הפאנל / 409 של bloc) — הניסיון והאישור שלו נמחקים, כמו אחרי כל כשל אחר. כל כשל
 * אחר, ואין חיבור — ייתכן שחלק רץ: הניסיון נמחק, החלון נסגר, ומרעננים את המצב.
 */
export function afterReencrypt(a: PostAnswer | null, now: number): ReencryptOutcome {
  const failed = { last: null, keepDry: false, confirmOpen: false, clearNote: false, noteError: null, reload: true };
  if (!a) return { ...failed, msg: { ok: false, text: RUN_NET_ERROR_TEXT } };
  if (a.ok && a.j.result) return { last: { ...a.j.result, at: now }, keepDry: false, confirmOpen: false, clearNote: true, noteError: null, msg: null, reload: true };
  if (a.status === 400 && a.j.code !== "dry_run_required") return { last: null, keepDry: true, confirmOpen: true, clearNote: false, noteError: a.j.error ?? NOTE_REQUIRED_TEXT, msg: null, reload: false };
  return { ...failed, msg: { ok: false, text: a.j.error ?? "ההצפנה מחדש נכשלה. מרעננים את המצב ומנסים שוב.", login: sessionEnded(a) } };
}

// ── תצוגה ──

export const fmtCount = (n: number) => n.toLocaleString("he-IL");

export function agoText(at: number, now: number): string {
  const m = Math.floor((now - at) / 60_000);
  if (m < 1) return "עכשיו";
  if (m === 1) return "לפני דקה";
  if (m < 60) return `לפני ${m} דקות`;
  return "לפני יותר משעה";
}
