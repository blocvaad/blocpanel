// src/lib/adsUi.ts — מה שמסכי הפרסומות צריכים מהתשובות של הפאנל (PANEL-PAY א2ב, החלטות 371–372). דפדפן, טהור (בלי I/O).
//
// הכתיבות של הפרסומות רצות עכשיו ב-bloc (/api/internal/ads). כאן: מתי תשובה היא הצלחה (רק ok === true), מתי היא "ייתכן
// שבוצע" (bloc לא ענה בזמן, שגיאת רשת, תשובה לא צפויה, שגיאת שרת בלי משפט) — ואז אין "שמירה" שנייה שיוצרת כפילות, אלא רענון;
// מה תיבת התמונה בעורך הפרסומת אומרת בכל מצב של העלאה; ומה דף הקמפיין אומר כשמגיעים אליו אחרי יצירה או שכפול.

// ── משפטים משותפים (גם השרת משתמש בהם — lib/adsActions) ──

/** creative.save עם תמונה שלא מהבאקט של bloc (החלטות 372–373): היא לא מוצגת לדיירים. */
export const IMAGE_NOT_OURS_TEXT = "העלו את התמונה בכפתור ההעלאה — תמונה מאתר אחר לא מוצגת לדיירים.";
/** ההעלאה עצמה (PUT לכתובת החתומה) לא הצליחה — שום דבר לא נשמר, אפשר לנסות שוב. */
export const UPLOAD_FAILED_TEXT = "ההעלאה נכשלה. נסו שוב.";

export const ADS_FAILED_TEXT = "הפעולה נכשלה. נסו שוב.";
/** 2xx בלי ok === true, או שגיאת שרת בלי משפט (למשל 504 של Vercel כשהפונקציה חרגה מהזמן) — ייתכן שהפעולה בוצעה. */
export const ADS_UNCLEAR_TEXT = "התשובה מהשרת לא ברורה — ייתכן שהפעולה בוצעה. רעננו את הדף ובדקו לפני שמנסים שוב.";
/** הבקשה מהדפדפן נקטעה — אולי אחרי שהשרת כבר קיבל אותה. */
export const ADS_CONNECTION_TEXT = "החיבור לשרת נקטע — ייתכן שהפעולה בוצעה. רעננו את הדף ובדקו לפני שמנסים שוב.";

/** קודים שבהם ייתכן שהפעולה בוצעה — המסך מציע רענון, ואחרי יצירה לא מאפשר "שמירה" שנייה. */
export const ADS_REFRESH_CODES: ReadonlySet<string> = new Set(["TIMEOUT", "NETWORK", "bad_shape", "failed", "unclear", "connection"]);

// ── תשובה של /api/ads ──

export type AdsResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code: string; unclear: boolean };

const obj = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : null);
const issueText = (j: Record<string, unknown> | null) => {
  const first = j && Array.isArray(j.issues) ? obj(j.issues[0]) : null;
  return first && typeof first.message === "string" && first.message ? first.message : null;
};

/** התשובה של POST /api/ads → הצלחה רק עם ok === true; כל השאר — שגיאה, עם unclear כשייתכן שבוצע. */
export function readAdsAnswer<T = Record<string, unknown>>(res: { ok: boolean; status: number }, body: unknown): AdsResult<T> {
  const j = obj(body);
  const code = j && typeof j.code === "string" ? j.code : "";
  if (res.ok && j && j.ok === true) return { ok: true, data: j as T };
  if (res.ok) return { ok: false, status: res.status, error: ADS_UNCLEAR_TEXT, code: "unclear", unclear: true };
  const text = (j && typeof j.error === "string" && j.error ? j.error : null) ?? issueText(j);
  if (!text && res.status >= 500) return { ok: false, status: res.status, error: ADS_UNCLEAR_TEXT, code: code || "unclear", unclear: true };
  return { ok: false, status: res.status, error: text ?? ADS_FAILED_TEXT, code, unclear: ADS_REFRESH_CODES.has(code) };
}

/** fetch עצמו נזרק (אין חיבור / נקטע באמצע). */
export function connectionFailure(): { ok: false; status: number; error: string; code: string; unclear: boolean } {
  return { ok: false, status: 0, error: ADS_CONNECTION_TEXT, code: "connection", unclear: true };
}

/** אחרי תשובה לא ברורה לפעולה שיוצרת משהו (מפרסם / חוזה / קמפיין / פרסומת חדשים, שכפול) — אין "שמירה" שנייה עד רענון. */
export const lockedAfter = (r: { ok: boolean; unclear?: boolean }, creates: boolean): boolean => creates && !r.ok && r.unclear === true;

/** ההודעה אחרי "רענון" בעקבות תשובה לא ברורה ליצירה. */
export const RECHECK_TEXT = {
  advertiser: "הרשימה רועננה. בדקו אם המפרסם נוסף לפני שמוסיפים אותו שוב.",
  contract: "הרשימה רועננה. בדקו אם החוזה נוסף לפני שמוסיפים אותו שוב.",
  creative: "הרשימה רועננה. בדקו אם הפרסומת נוספה לפני שמוסיפים אותה שוב.",
} as const;

// ── העלאת תמונה ──

export type UploadAnswer = { ok: true; url: string } | { ok: false; error: string; code: string };
/** התשובה של POST /api/ads/upload → הכתובת הציבורית רק עם ok === true ו-url של https; אחרת המשפט של השרת. */
export function readUploadAnswer(res: { ok: boolean; status: number }, body: unknown): UploadAnswer {
  const j = obj(body);
  if (res.ok && j && j.ok === true && typeof j.url === "string" && /^https:\/\/\S+$/.test(j.url)) return { ok: true, url: j.url };
  const code = j && typeof j.code === "string" ? j.code : res.ok ? "bad_shape" : "";
  const error = !res.ok && j && typeof j.error === "string" && j.error ? j.error : UPLOAD_FAILED_TEXT;
  return { ok: false, error, code };
}

/** הכתובת הציבורית של הבאקט 'ads' (אותו פרויקט Supabase כמו bloc) — רק תמונה שמתחילה בה מוצגת לדיירים (החלטה 373). */
export function adsImageBase(supabaseUrl: string | null | undefined): string | null {
  const u = (supabaseUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+$/i.test(u)) return null;
  return `${u}/storage/v1/object/public/ads/`;
}

/** התמונה שמורה ב-bloc? null — לא ידוע (אין כתובת בסיס). */
export function isOurAdImage(url: string | null | undefined, base: string | null): boolean | null {
  if (!base) return null;
  // סקירה א2ב (#11): אותו כלל כמו isOwnAdImage של bloc — https, אותו origin, מתחת ל-/storage/v1/object/public/ads/,
  // בלי פרמטרים ו-#, בלי .. // \ (גם מקודדים), ושם קובץ אחרי הקידומת. אחרת — מאתר אחר (bloc לא ישמור ולא יציג).
  let u: URL; let b: URL;
  try { u = new URL((url ?? "").trim()); b = new URL(base); } catch { return false; }
  if (u.protocol !== "https:" || u.origin !== b.origin || u.search || u.hash || u.username || u.password) return false;
  let path: string;
  try { path = decodeURIComponent(u.pathname); } catch { return false; }
  if (path.includes("..") || path.includes("//") || path.includes("\\")) return false;
  return path.startsWith(b.pathname) && path.length > b.pathname.length;
}

export type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; name: string }
  | { phase: "done"; name: string }
  | { phase: "failed"; error: string };

export type ImageBox = {
  tone: "empty" | "busy" | "ok" | "warn" | "error";
  title: string;
  /** שורה שנייה בעברית (בלי בידוד — כיוון הפסקה). */
  detail: string | null;
  /** שם הקובץ שהועלה — מוצג מבודד (<bdi>), כדי ששם באנגלית לא יהפוך את סדר המילים. */
  file: string | null;
  button: string;
  busy: boolean;
};

export const IMAGE_EMPTY_TEXT = "עוד לא הועלתה תמונה";
/** המידות בתוך LRI…PDI: בלי זה "1080×1350" מוצג הפוך בשורה מימין לשמאל. */
export const IMAGE_EMPTY_HINT = "JPEG, PNG או WebP, עד 2MB. הכי טוב \u20661080×1350\u2069 (4:5).";
export const IMAGE_UPLOADING_TEXT = "מעלים את התמונה…";
export const IMAGE_DONE_TEXT = "התמונה הועלתה";
export const IMAGE_OURS_TEXT = "התמונה שמורה ב-bloc";
export const IMAGE_FOREIGN_TEXT = "התמונה הזו מאתר אחר, ולכן היא לא מוצגת לדיירים.";
export const IMAGE_FOREIGN_HINT = "העלו את התמונה בכפתור ההעלאה, ואז שמרו.";
export const IMAGE_KEPT_TEXT = "התמונה הקודמת לא השתנתה.";

/**
 * מה תיבת התמונה אומרת. סדר: מעלים → bloc סירב לתמונה (image_not_ours) → ההעלאה נכשלה → תמונה מאתר אחר (פרסומת ישנה)
 * → הועלתה עכשיו → שמורה ב-bloc → אין תמונה.
 */
export function imageBoxState(o: { url: string; upload: UploadState; refusal: string | null; base: string | null }): ImageBox {
  const has = !!o.url.trim();
  const button = o.upload.phase === "uploading" ? "מעלים…" : has ? "החלפת התמונה" : "העלאת תמונה";
  const busy = o.upload.phase === "uploading";
  if (o.upload.phase === "uploading") return { tone: "busy", title: IMAGE_UPLOADING_TEXT, detail: null, file: o.upload.name || null, button, busy };
  if (o.refusal) return { tone: "error", title: o.refusal, detail: null, file: null, button, busy };
  if (o.upload.phase === "failed") return { tone: "error", title: o.upload.error, detail: has ? IMAGE_KEPT_TEXT : null, file: null, button, busy };
  if (has && isOurAdImage(o.url, o.base) === false) return { tone: "warn", title: IMAGE_FOREIGN_TEXT, detail: IMAGE_FOREIGN_HINT, file: null, button, busy };
  if (has && o.upload.phase === "done") return { tone: "ok", title: IMAGE_DONE_TEXT, detail: null, file: o.upload.name || null, button, busy };
  if (has) return { tone: "ok", title: IMAGE_OURS_TEXT, detail: null, file: null, button, busy };
  return { tone: "empty", title: IMAGE_EMPTY_TEXT, detail: IMAGE_EMPTY_HINT, file: null, button, busy };
}

// ── שכפול ויצירה של קמפיין: מה דף הקמפיין אומר כשמגיעים אליו ──

export type DuplicateCreatives = "ok" | "failed" | "unknown";
export const DUPLICATE_OK_TEXT = "הקמפיין שוכפל כטיוטה, עם הפרסומות הפעילות שלו.";
export const DUPLICATE_NO_CREATIVES_TEXT = "הקמפיין שוכפל כטיוטה, אבל בלי הפרסומות שלו — ההעתקה שלהן נכשלה. הוסיפו פרסומת לפני שמפעילים.";
export const DUPLICATE_CREATIVES_UNKNOWN_TEXT = "הקמפיין שוכפל כטיוטה. לא ידוע אם הפרסומות הועתקו — בדקו ברשימת הפרסומות למטה.";
export const CREATED_TEXT = "הקמפיין נשמר כטיוטה. עכשיו מוסיפים פרסומת עם תמונה, ואז מפעילים.";

/** אחרי שכפול: הכתובת של הקמפיין החדש — עם מה שקרה לפרסומות כשלא הכל הועתק. */
export function duplicateHref(id: string, creatives: unknown, skipped?: unknown): string {
  const c: DuplicateCreatives = creatives === "ok" || creatives === "failed" ? creatives : "unknown";
  const n = typeof skipped === "number" && Number.isInteger(skipped) && skipped > 0 ? Math.min(skipped, 1000) : 0;
  return `/ads/campaigns/${encodeURIComponent(id)}?copied=1${c === "ok" ? "" : `&creatives=${c}`}${n ? `&skipped=${n}` : ""}`;
}
/** סקירה א2ב (#6): bloc לא מעתיק פרסומת עם תמונה מאתר אחר (היא לא מוצגת לדיירים). */
export const duplicateSkippedText = (n: number) => (n === 1
  ? "פרסומת אחת עם תמונה מאתר אחר לא הועתקה — היא לא מוצגת לדיירים. העלו לה תמונה והוסיפו אותה כאן."
  : `${n} פרסומות עם תמונה מאתר אחר לא הועתקו — הן לא מוצגות לדיירים. העלו להן תמונה והוסיפו אותן כאן.`);

/** ?created=1 / ?copied=1 (&creatives=failed|unknown) → ההודעה בראש דף הקמפיין. */
export function campaignArrival(q: Record<string, string | string[] | undefined>): { tone: "ok" | "warn"; text: string } | null {
  const one = (k: string) => { const v = q[k]; return Array.isArray(v) ? v[0] : v; };
  if (one("copied") === "1") {
    const c = one("creatives");
    // בלי creatives — הכל הועתק (duplicateHref לא מוסיף אותו); כל ערך אחר שאינו failed — לא ידוע, אף פעם לא "הועתקו".
    const sk = Number(one("skipped"));
    const skippedText = Number.isInteger(sk) && sk > 0 && sk <= 1000 ? ` ${duplicateSkippedText(sk)}` : "";
    if (c === undefined) return skippedText ? { tone: "warn", text: `${DUPLICATE_OK_TEXT}${skippedText}` } : { tone: "ok", text: DUPLICATE_OK_TEXT };
    return { tone: "warn", text: `${c === "failed" ? DUPLICATE_NO_CREATIVES_TEXT : DUPLICATE_CREATIVES_UNKNOWN_TEXT}${skippedText}` };
  }
  if (one("created") === "1") return { tone: "ok", text: CREATED_TEXT };
  return null;
}
