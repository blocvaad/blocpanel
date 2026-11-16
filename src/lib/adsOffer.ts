// src/lib/adsOffer.ts — קוד קופון וסוף מבצע של מודעה (bloc ADS-2ב1, החלטה 388). דפדפן ושרת, טהור (בלי I/O).
//
// לכל מודעה: coupon_code — טקסט, ^[A-Z0-9][A-Z0-9-]{1,23}$ אחרי trim ואותיות גדולות (ריק = אין); offer_ends_on — תאריך (ריק = אין;
// בשמירה — היום לפי שעון ישראל או אחריו; מותר אחרי סוף הקמפיין — ההגשה נעצרת בסוף הקמפיין בכל מקרה). המנוע של bloc לא מגיש
// מודעה שהמבצע שלה הסתיים (offer_ends_on לפני היום, שעון ישראל) — גם לא בתצוגה המקדימה של מכשיר בדיקה.
// באפליקציה (bloc): שבב מקווקו "קוד: SAVE20" עם "העתקה" (← "הועתק ✓" לשתי שניות), ושורה "המבצע עד 30/11" / "המבצע מסתיים
// היום" / "המבצע מסתיים מחר" — בכרטיס, בחלון הקופץ, במסך מלא, בתמונה האחרונה של הסטורי, בכרטיס ברשימה ובקרוסלה; בפס — לא (אין
// מקום), והפאנל מזהיר. כאן: אותם משפטים ואותה פונקציה (offerLine — עותק של bloc, נבדק מול הקובץ שלו), הבדיקות של הטופס עם משפט
// בעברית לכל בעיה, והמצב של מודעה שמורה ("המבצע הסתיים" — לא מוצגת).
import { addDaysKey, isDateKey } from "./broadcasts";

/** החלטה 388 — אותו ביטוי כמו ה-CHECK של ad_creatives.coupon_code (SQL 231) והסכמה של bloc. */
export const COUPON_RE = /^[A-Z0-9][A-Z0-9-]{1,23}$/;
export const COUPON_MAX = 24;

/** מה שנשמר: בלי רווחים בקצוות, באותיות גדולות. */
export const normalizeCoupon = (v: string | null | undefined): string => (v ?? "").trim().toUpperCase();
/** קוד תקין (אחרי הנרמול) — או ריק. */
export const couponOk = (v: string | null | undefined): boolean => { const c = normalizeCoupon(v); return !c || COUPON_RE.test(c); };

export const COUPON_INVALID_TEXT = "קוד הקופון: 2 עד 24 תווים — אותיות באנגלית, ספרות ומקף, בלי רווחים, ולא מתחיל במקף.";
export const OFFER_PAST_TEXT = "סוף המבצע: היום או תאריך מאוחר יותר (לפי שעון ישראל).";
export const OFFER_INVALID_TEXT = "סוף המבצע: תאריך לא תקין.";

/** למה הקוד לא יישמר (null — תקין או ריק). */
export function couponIssue(v: string | null | undefined): string | null {
  return couponOk(v) ? null : COUPON_INVALID_TEXT;
}
/** למה סוף המבצע לא יישמר (null — תקין או ריק). today — היום לפי שעון ישראל (YYYY-MM-DD). */
export function offerIssue(v: string | null | undefined, today: string): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  if (!isDateKey(t)) return OFFER_INVALID_TEXT;
  return t < today ? OFFER_PAST_TEXT : null;
}

// ── מה שהאפליקציה מציגה (bloc src/lib/ads.ts — אותם משפטים; src/lib/__tests__/adsOffer.test.ts בודק מול הקובץ של bloc) ──

/** השבב: "קוד: SAVE20". */
export const COUPON_PREFIX = "קוד:";
export const couponChipText = (code: string) => `${COUPON_PREFIX} ${code}`;
/** הכפתור בשבב, ומה הוא אומר שתי שניות אחרי העתקה. */
export const COUPON_COPY_TEXT = "העתקה";
export const COUPON_COPIED_TEXT = "הועתק ✓";

/**
 * השורה מתחת לשבב (החלטה 388): "המבצע מסתיים היום" / "המבצע מסתיים מחר" / "המבצע עד 30/11" (בשנה אחרת — "המבצע עד 5/1/2027"). אין
 * תאריך, תאריך לא תקין או מבצע שהסתיים — null (bloc לא מגיש מודעה כזו, ולכן אין לה שורה). today — היום לפי שעון ישראל.
 * המקרים — tests/fixtures/ads2b/helpers.json (offerLine), אותו קובץ כמו ב-bloc.
 */
export function offerLine(offerEndsOn: string | null | undefined, today: string): string | null {
  if (!offerEndsOn || !isDateKey(offerEndsOn) || offerEndsOn < today) return null;
  if (offerEndsOn === today) return "המבצע מסתיים היום";
  if (offerEndsOn === addDaysKey(today, 1)) return "המבצע מסתיים מחר";
  const dm = `${Number(offerEndsOn.slice(8, 10))}/${Number(offerEndsOn.slice(5, 7))}`;
  return `המבצע עד ${offerEndsOn.slice(0, 4) === today.slice(0, 4) ? dm : `${dm}/${offerEndsOn.slice(0, 4)}`}`;
}

// ── מודעה שמורה ──

/** המבצע הסתיים — לפני היום (שעון ישראל). מודעה כזו לא מוגשת. */
export const offerEnded = (offerEndsOn: string | null | undefined, today: string): boolean =>
  !!offerEndsOn && isDateKey(offerEndsOn) && offerEndsOn < today;
export const OFFER_ENDED_TEXT = "המבצע הסתיים";
/** ליד מודעה שהמבצע שלה הסתיים — למה היא לא מוצגת ומה עושים. */
export const OFFER_ENDED_HINT = "המבצע הסתיים, ולכן המודעה לא מוצגת. מאריכים את סוף המבצע (או מוחקים אותו) — והיא חוזרת.";

/** מה שה-DB החזיר: קוד תקין באותיות גדולות, אחרת null (לפני SQL 231 העמודה לא קיימת). */
export function parseCoupon(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = normalizeCoupon(v);
  return COUPON_RE.test(c) ? c : null;
}
/** YYYY-MM-DD של תאריך אמיתי, אחרת null (Postgres מחזיר date כ-"2026-11-30"). */
export const parseOfferEnd = (v: unknown): string | null => (typeof v === "string" && isDateKey(v.slice(0, 10)) ? v.slice(0, 10) : null);

/** פס: אין מקום לשבב — באפליקציה הקוד לא מוצג (הפאנל מזהיר כשבחרו פס ויש קוד). */
export const BANNER_COUPON_SHORT = "בפס הקוד לא מוצג";
export const BANNER_COUPON_TEXT = "בפס הקוד לא מוצג — אין בו מקום לשבב. בשאר הפורמטים שבחרתם הקוד יופיע עם כפתור העתקה.";
export const BANNER_ONLY_COUPON_TEXT = "בפס הקוד לא מוצג — אין בו מקום לשבב. כדי שהדיירים יראו את הקוד, הוסיפו פורמט נוסף (למשל כרטיס ברשימה).";
/** מה כתוב בטופס כשיש קוד והפס בין הפורמטים (null — אין מה להזהיר). */
export function bannerCouponWarning(formats: readonly string[], coupon: string | null | undefined): string | null {
  if (!normalizeCoupon(coupon) || !formats.includes("banner")) return null;
  return formats.some((f) => f !== "banner") ? BANNER_COUPON_TEXT : BANNER_ONLY_COUPON_TEXT;
}
