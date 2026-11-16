// src/lib/adsActions.ts — הכתיבות של הפרסומות דרך bloc (PANEL-PAY א2ב, החלטות 371–372, C3–C4). שרת, טהור (בלי I/O).
//
// הפאנל לא כותב יותר לטבלאות ad_* ולא לבאקט 'ads'. כל פעולה במסך הפרסומות נבדקת כאן (ads.manage + הסכמה עם המשפטים
// בעברית) ונשלחת חתומה ל-bloc (/api/internal/ads), שבודק שוב לפי ה-actor, מריץ את אותם כללים (סדר הבדיקות של הפעלת קמפיין,
// שכפול, מכשירי בדיקה לפי אימייל) ורושם ביומן שלו. bloc עונה בקודים בלבד — כאן כל קוד מקבל את המשפט שהפאנל הציג עד עכשיו;
// מה נחשב תשובה ברורה (ok === true והמזהה כשצריך); ומה נרשם ביומן הפאנל כשנכשל או כשלא ידוע אם בוצע.
// טבלת פעולות אחת (AD_ACTIONS) — פורמטים חדשים של פרסומות (ADS-2) מוסיפים שורה, בלי הנחות על הפורמט כאן.
import type { AdAction } from "./validation";
import { ADS_SQL_MISSING, AD_LOCKED_TEXT, AD_IN_USE_TEXT, AD_CHECK_FAILED_TEXT } from "./ads";
import { CONNECTION_CODES, hebrew, READ_FAILED_TEXT, INVALID_TEXT, UNEXPECTED_TEXT } from "./moneyActions";
import { IMAGE_NOT_OURS_TEXT, UPLOAD_FAILED_TEXT, type DuplicateCreatives } from "./adsUi";
import { FRAMES_MAX } from "./adsFormats";
import { parseReviewAnswer, type ReviewAnswer } from "./adsReports";

export type AdActionName = AdAction["action"];
type Entity = "advertiser" | "contract" | "campaign" | "creative" | "settings";
/** save — יוצר או עורך (מחזיר id); duplicate — יוצר עותק (id חדש + creatives); update / delete — רק ok; review (ADS-2ב1) — ok,
 *  ומצב הקמפיין אחרי ההחלטה וכמה דיווחים נסגרו. */
type Kind = "save" | "duplicate" | "update" | "delete" | "review";

/** כל פעולה: שם היומן בפאנל (AD_*), על מה היא, מה היא, והמשפט כשהכתיבה ב-bloc נכשלה (write_failed — כמו שהפאנל אמר עד עכשיו). */
export const AD_ACTIONS: Record<AdActionName, { audit: string; entity: Entity; kind: Kind; failed: string }> = {
  "advertiser.save":    { audit: "AD_ADVERTISER_SAVE",    entity: "advertiser", kind: "save",      failed: "שמירת המפרסם נכשלה. נסו שוב." },
  "advertiser.archive": { audit: "AD_ADVERTISER_ARCHIVE", entity: "advertiser", kind: "update",    failed: "העדכון נכשל. נסו שוב." },
  "advertiser.delete":  { audit: "AD_ADVERTISER_DELETE",  entity: "advertiser", kind: "delete",    failed: "המחיקה נכשלה. נסו שוב." },
  "contract.save":      { audit: "AD_CONTRACT_SAVE",      entity: "contract",   kind: "save",      failed: "שמירת החוזה נכשלה. נסו שוב." },
  "contract.delete":    { audit: "AD_CONTRACT_DELETE",    entity: "contract",   kind: "delete",    failed: "המחיקה נכשלה. נסו שוב." },
  "campaign.save":      { audit: "AD_CAMPAIGN_SAVE",      entity: "campaign",   kind: "save",      failed: "שמירת הקמפיין נכשלה. נסו שוב." },
  "campaign.status":    { audit: "AD_CAMPAIGN_STATUS",    entity: "campaign",   kind: "update",    failed: "העדכון נכשל. נסו שוב." },
  "campaign.duplicate": { audit: "AD_CAMPAIGN_DUPLICATE", entity: "campaign",   kind: "duplicate", failed: "השכפול נכשל. נסו שוב." },
  "campaign.delete":    { audit: "AD_CAMPAIGN_DELETE",    entity: "campaign",   kind: "delete",    failed: "המחיקה נכשלה. נסו שוב." },
  "creative.save":      { audit: "AD_CREATIVE_SAVE",      entity: "creative",   kind: "save",      failed: "שמירת הפרסומת נכשלה. נסו שוב." },
  "creative.active":    { audit: "AD_CREATIVE_ACTIVE",    entity: "creative",   kind: "update",    failed: "העדכון נכשל. נסו שוב." },
  "creative.delete":    { audit: "AD_CREATIVE_DELETE",    entity: "creative",   kind: "delete",    failed: "המחיקה נכשלה. נסו שוב." },
  "settings.save":      { audit: "AD_SETTINGS",           entity: "settings",   kind: "update",    failed: "שמירת ההגדרות נכשלה. נסו שוב." },
  // ADS-2ב1 (החלטות 387, 390): החלטה על הדיווחים של קמפיין (ad_reports_review); נרשמת על הקמפיין — מופיעה בהיסטוריה שלו.
  "reports.review":     { audit: "AD_REPORTS_REVIEW",     entity: "campaign",   kind: "review",    failed: "ההחלטה על הדיווחים לא נשמרה. נסו שוב." },
};

/** סוג הישות ביומן הפאנל (כמו עד עכשיו) ו"לא נמצא" שלה. */
export const AD_ENTITY: Record<Entity, { type: string; notFound: string }> = {
  advertiser: { type: "ad_advertiser", notFound: "המפרסם לא נמצא" },
  contract:   { type: "ad_contract",   notFound: "החוזה לא נמצא" },
  campaign:   { type: "ad_campaign",   notFound: "הקמפיין לא נמצא" },
  creative:   { type: "ad_creative",   notFound: "הפרסומת לא נמצאה" },
  settings:   { type: "ad_settings",   notFound: "ההגדרות לא נמצאו. צריך להריץ את SQL 175 של bloc." },
};

// ── הקודים של bloc → המשפט בעברית ──

export const ADS_FORBIDDEN_TEXT = "bloc סירב: ניהול פרסומות — למנהלים ולסופר-אדמין בלבד.";
/** 409 locked + which — מה שכבר הוצג נשמר ב-DB עצמו (הטריגרים של SQL 175); אותם משפטים כמו adsDbMessage. */
export const LOCKED_TEXT: Record<"contract" | "campaign" | "creative", string> = AD_LOCKED_TEXT;
export const LOCKED_OTHER_TEXT = "מה שכבר הוצג לדיירים נשמר כמו שהוא, ולכן אי אפשר לשנות את זה. רעננו את הדף.";
/** 409 in_use במחיקה (23503): יש היסטוריה או פריטים תלויים. */
export const IN_USE_TEXT = AD_IN_USE_TEXT;
/** 409 in_use בשמירה / שכפול (23503 על הכנסה): מה שהפריט מקושר אליו נמחק בינתיים — לא "אי אפשר למחוק". */
export const IN_USE_SAVE_TEXT = "מה שהפריט מקושר אליו (מפרסם, חוזה או קמפיין) כבר לא קיים — אולי נמחק בינתיים. רעננו את הדף ונסו שוב.";
export const CHECK_FAILED_TEXT = AD_CHECK_FAILED_TEXT;
/** campaign.status — אותו סדר בדיקות ואותם משפטים כמו שהיו בפאנל. */
export const CAMPAIGN_STATUS_TEXT: Record<string, string> = {
  campaign_ended: "קמפיין שהסתיים לא חוזר לפעול. אפשר לשכפל אותו לקמפיין חדש.",
  no_back_to_draft: "קמפיין שהופעל לא חוזר לטיוטה. אפשר להשהות אותו.",
  campaign_dates_passed: "תאריך הסיום של הקמפיין כבר עבר. עדכנו את התאריכים ושמרו.",
  contract_not_active: "החוזה של הקמפיין לא פעיל. קודם מפעילים את החוזה.",
  contract_ended: "החוזה של הקמפיין הסתיים.",
  // ADS-2א v2 (C5 v2): נספרות רק מודעות פעילות שכל התמונות שלהן מהבאקט של bloc (ההתאמה לפורמט — בתוך המודעה).
  no_active_creative: "אין בקמפיין מודעה פעילה עם תמונות שהועלו ל-bloc. מוסיפים מודעה, ואז מפעילים.",
  // bloc (א2ב): מישהו אחר שינה את הסטטוס בין הקריאה לכתיבה — לא נדרס.
  changed: "מישהו אחר שינה את הסטטוס של הקמפיין בינתיים. רעננו ונסו שוב.",
};
export const unknownEmailsText = (emails: string[]) => (emails.length
  ? `אין חשבון bloc עם האימייל: ${emails.join(", ")}`
  : "אחד האימיילים ברשימה לא שייך לחשבון bloc. בדקו אותם ונסו שוב.");
/** שגיאת רשת מול bloc — הבקשה אולי הגיעה (callBloc אומר רק "שגיאת רשת"). */
export const ADS_NETWORK_TEXT = "שגיאת רשת מול bloc — ייתכן שהפעולה בוצעה. רעננו לפני שמנסים שוב.";
/** שגיאת שרת של bloc בלי קוד מוכר — ייתכן שבוצע. */
export const ADS_UNKNOWN_TEXT = "bloc נכשל באמצע הפעולה — ייתכן שהיא בוצעה. רעננו את הדף ובדקו לפני שמנסים שוב.";

/** 400 invalid + field (הנתיב הראשון בשגיאה של bloc) → שם השדה כמו בטפסים. */
export const FIELD_LABEL: Record<string, string> = {
  name: "השם", legal_name: "השם הרשמי", business_id: "ח.פ / ע.מ", contact_name: "איש הקשר", contact_phone: "הטלפון",
  contact_email: "האימייל", website: "האתר", notes: "ההערות",
  advertiser_id: "המפרסם", reference: "מספר החוזה", pricing: "מודל התמחור", price_ils: "המחיר", impression_cap: "תקרת החשיפות",
  starts_on: "תאריך ההתחלה", ends_on: "תאריך הסיום", status: "המצב", document_url: "הקישור לחוזה",
  contract_id: "החוזה", days: "הימים", hour_from: "שעת ההתחלה", hour_to: "שעת הסיום", screens: "המסכים", goal_views: "היעד",
  daily_cap: "התקרה ליום", per_user_cap: "התקרה לאדם", plans: "המסלולים", roles: "הקהל", cities: "הערים", building_ids: "הבניינים",
  weight: "המשקל", campaign_id: "הקמפיין", image_url: "התמונה", image_alt: "תיאור התמונה", headline: "הכותרת", body: "המשפט",
  cta_label: "הכפתור", cta_url: "הקישור", archived: "הארכיון", active: "הפעלה / השבתה", enabled: "המתג",
  excluded_buildings: "בניינים בלי פרסומות", tester_emails: "מכשירי הבדיקה", id: "המזהה", type: "סוג התמונה", bytes: "גודל התמונה",
  // ADS-2א v2 (C5 v2) — banner_position ו-frames מקבלים משפט משלהם ב-invalidText (למטה)
  format: "הפורמט", banner_position: "מיקום הפס", theme: "הסגנון (בהיר / כהה)", frames: "התמונות", accent: "צבע הכפתור",
  focal_x: "נקודת המיקוד", focal_y: "נקודת המיקוד", logo_url: "הלוגו", brand_color: "צבע המותג",
  // ADS-2ב1 — coupon_code / offer_ends_on / report_pause_at / decision מקבלים משפט משלהם ב-invalidText (למטה)
  coupon_code: "קוד הקופון", offer_ends_on: "סוף המבצע", report_pause_at: "ההשהיה האוטומטית", decision: "ההחלטה",
  seen_until: "הדיווח האחרון שראיתם",
};
/** מפתח שבאמת ברשימה (לא constructor / toString של האובייקט). */
const own = (rec: Record<string, string>, k: unknown): string | undefined =>
  (typeof k === "string" && Object.prototype.hasOwnProperty.call(rec, k) ? rec[k] : undefined);

// ── ADS-2א (C5): מיקום הפס והתמונות של סטורי / קרוסלה — משפט משלהם, עם מספר התמונה ──

/** banner_position — חובה בפס, ואסור בשאר הפורמטים. */
export const BANNER_POSITION_INVALID_TEXT = "bloc דחה את מיקום הפס: בפס בוחרים למעלה או למטה, ובשאר הפורמטים אין מיקום. רעננו את הדף ונסו שוב.";
/** frames — לא מתאימות לפורמט של המודעה (סטורי / קרוסלה בלי תמונות, או תמונות בפורמט אחר), או מחוץ ל-2..5. */
export const FRAMES_INVALID_TEXT = "התמונות לא מתאימות לפורמט של המודעה: בסטורי ובקרוסלה — 2 עד 5 תמונות, ובשאר הפורמטים — תמונה אחת.";
export const FRAME_FIELD_TEXT: Record<string, (n: number) => string> = {
  cta_url: (n) => `bloc דחה את הקישור של תמונה ${n}: קישור לכל תמונה יש רק בקרוסלה, וכתובת מלאה שמתחילה ב-https://.`,
  image_url: (n) => `bloc דחה את תמונה ${n}. העלו אותה שוב בכפתור ההעלאה.`,
  image_alt: (n) => `bloc דחה את התיאור של תמונה ${n}: 2 עד 200 תווים.`,
  caption: (n) => `bloc דחה את הכיתוב של תמונה ${n}: עד 60 תווים.`,
  focal: (n) => `bloc דחה את נקודת המיקוד של תמונה ${n}. גררו אותה שוב ונסו שוב.`,
};
export const frameInvalidText = (n: number) => `bloc דחה את תמונה ${n}. בדקו אותה ונסו שוב.`;
/** image_not_ours על frames.N.image_url — התמונה הזו לא מהבאקט של bloc. */
export const frameNotOursText = (n: number) => `תמונה ${n} לא הועלתה ל-bloc — תמונה מאתר אחר לא מוצגת לדיירים. העלו אותה בכפתור ההעלאה.`;
/** invalid על accent — צבע לא בצורה #RRGGBB, או (סקירה #9) צבע שהטקסט עליו לא קריא: מתחת ל-4.5:1 גם עם לבן וגם עם כהה. */
export const ACCENT_INVALID_TEXT = "bloc דחה את צבע הכפתור: הטקסט עליו לא יהיה קריא (צריך ניגודיות של 4.5:1 לפחות). בחרו צבע כהה או בהיר יותר ונסו שוב.";
/** image_not_ours על logo_url (advertiser.save) — הלוגו לא מהבאקט של bloc. */
export const LOGO_NOT_OURS_TEXT = "העלו את הלוגו בכפתור ההעלאה — לוגו מאתר אחר לא מוצג לדיירים.";

// ── ADS-2ב1: קופון, סוף מבצע, השהיה אוטומטית, החלטה על דיווחים — משפט משלהם ──

/** invalid על coupon_code (החלטה 388): אחרי trim ואותיות גדולות — ^[A-Z0-9][A-Z0-9-]{1,23}$. */
export const COUPON_BLOC_INVALID_TEXT = "bloc דחה את קוד הקופון: 2 עד 24 תווים — אותיות באנגלית, ספרות ומקף, בלי רווחים, ולא מתחיל במקף. תקנו אותו ונסו שוב.";
/** invalid על offer_ends_on (החלטה 388): תאריך שכבר עבר (לפי שעון ישראל) או לא תקין. */
export const OFFER_BLOC_INVALID_TEXT = "bloc דחה את סוף המבצע: התאריך כבר עבר (לפי שעון ישראל) או לא תקין. בחרו היום או תאריך מאוחר יותר — או מחקו אותו.";
/** invalid על report_pause_at (החלטה 391): 0..20. */
export const REPORT_PAUSE_BLOC_INVALID_TEXT = "bloc דחה את ההשהיה האוטומטית: מספר שלם בין 0 ל-20 (0 — כבוי).";
/** invalid על decision (reports.review). */
export const DECISION_BLOC_INVALID_TEXT = "bloc לא הכיר את ההחלטה על הדיווחים. רעננו את הדף ונסו שוב.";
/** invalid על seen_until (reports.review, סקירה #10): הזמן של הדיווח האחרון שהוצג לא תקין. */
export const SEEN_UNTIL_BLOC_INVALID_TEXT = "bloc לא קיבל את זמן הדיווח האחרון שהוצג, ולכן שום דיווח לא נסגר. רעננו את הדף ונסו שוב.";
/** sql_missing בפעולות של ADS-2ב1 — לפני SQL 231 של bloc אין טבלת דיווחים ואין עמודות לקופון / למבצע / להשהיה. */
export const REPORTS_SQL_MISSING_ACTION_TEXT = "צריך להריץ קודם את SQL 231 של bloc (דיווחים על פרסומות). שום דבר לא השתנה.";
export const OFFER_SQL_MISSING_TEXT = "צריך להריץ קודם את SQL 231 של bloc (קופון וסוף מבצע). שום דבר לא נשמר.";
export const REPORT_PAUSE_SQL_MISSING_TEXT = "צריך להריץ קודם את SQL 231 של bloc (השהיה אוטומטית). שום דבר לא נשמר.";

/** הנתיב של bloc ("frames.2.cta_url" או ["frames", 2, "cta_url"]) → המקטעים. */
const pathOf = (field: unknown): string[] =>
  Array.isArray(field) ? field.map((x) => String(x)) : typeof field === "string" ? field.split(".") : [];
/** frames.N… → N (0..4); אחרת null. */
export function frameIndex(field: unknown): number | null {
  const p = pathOf(field);
  if (p[0] !== "frames" || p.length < 2 || !/^\d$/.test(p[1])) return null;
  const n = Number(p[1]);
  return n < FRAMES_MAX ? n : null;
}

export function invalidText(field: unknown): string {
  const p = pathOf(field);
  const head = p[0];
  if (head === "banner_position") return BANNER_POSITION_INVALID_TEXT;
  if (head === "accent") return ACCENT_INVALID_TEXT;
  if (head === "coupon_code") return COUPON_BLOC_INVALID_TEXT;
  if (head === "offer_ends_on") return OFFER_BLOC_INVALID_TEXT;
  if (head === "report_pause_at") return REPORT_PAUSE_BLOC_INVALID_TEXT;
  if (head === "decision") return DECISION_BLOC_INVALID_TEXT;
  if (head === "seen_until") return SEEN_UNTIL_BLOC_INVALID_TEXT;
  if (head === "frames") {
    const i = frameIndex(field);
    if (i === null) return FRAMES_INVALID_TEXT;
    const sub = p[2] !== undefined && Object.prototype.hasOwnProperty.call(FRAME_FIELD_TEXT, p[2]) ? FRAME_FIELD_TEXT[p[2]] : null;
    return sub ? sub(i + 1) : frameInvalidText(i + 1);
  }
  const label = own(FIELD_LABEL, head);
  return label ? `bloc דחה את הבקשה — שדה לא תקין: ${label}. בדקו אותו ונסו שוב.` : INVALID_TEXT;
}

/** frame — במסך: איזו תמונה בסטורי / בקרוסלה bloc דחה (0..4), כדי לסמן אותה. */
export type AdsFailure = { status: number; code: string; error: string; frame?: number };
type BlocFailure = { status: number; error: string; code?: string; data?: Record<string, unknown> };

const lockedKey = (which: unknown, entity: Entity): "contract" | "campaign" | "creative" | null => {
  const w = typeof which === "string" ? which.toLowerCase() : "";
  const hit = (["contract", "campaign", "creative"] as const).find((k) => w === k || w.includes(k));
  if (hit) return hit;
  return entity === "contract" || entity === "campaign" || entity === "creative" ? entity : null;
};

/**
 * sql_missing → איזה SQL חסר: reports.review — 231 תמיד; creative.save עם קוד או סוף מבצע / settings.save עם השהיה — 231 (העמודות
 * שלהם); כל השאר — 175 (כמו עד עכשיו).
 */
export function sqlMissingText(action: AdActionName, b?: AdAction): string {
  if (action === "reports.review") return REPORTS_SQL_MISSING_ACTION_TEXT;
  if (b && b.action === "creative.save" && (b.coupon_code || b.offer_ends_on)) return OFFER_SQL_MISSING_TEXT;
  if (b && b.action === "settings.save" && b.report_pause_at !== undefined) return REPORT_PAUSE_SQL_MISSING_TEXT;
  return ADS_SQL_MISSING;
}

/** תשובת כשל של bloc לפעולה → מה הפאנל מחזיר למסך. קודי החיבור של callBloc — כמו שהם (שגיאת רשת: "ייתכן שבוצע"). */
export function adsFailure(r: BlocFailure, action: AdActionName, b?: AdAction): AdsFailure {
  const code = r.code ?? "";
  const d = r.data ?? {};
  const a = AD_ACTIONS[action];
  const at = (error: string) => ({ status: r.status, code, error });
  if (code === "NETWORK") return at(ADS_NETWORK_TEXT);
  if (code && CONNECTION_CODES.has(code)) return at(r.error);
  const statusText = own(CAMPAIGN_STATUS_TEXT, code);
  if (statusText) return at(statusText);
  switch (code) {
    case "sql_missing": return at(sqlMissingText(action, b));
    case "locked": { const k = lockedKey(d.which, a.entity); return at(k ? LOCKED_TEXT[k] : LOCKED_OTHER_TEXT); }
    case "in_use": return at(a.kind === "save" || a.kind === "duplicate" ? IN_USE_SAVE_TEXT : IN_USE_TEXT);
    case "check_failed": return at(CHECK_FAILED_TEXT);
    case "not_found": return at(AD_ENTITY[a.entity].notFound);
    case "read_failed": return at(READ_FAILED_TEXT);
    case "write_failed": return at(a.failed);
    case "invalid": { const i = frameIndex(d.field); return i === null ? at(invalidText(d.field)) : { ...at(invalidText(d.field)), frame: i }; }
    case "image_not_ours": {
      if (pathOf(d.field)[0] === "logo_url") return at(LOGO_NOT_OURS_TEXT);
      const i = frameIndex(d.field);
      return i === null ? at(IMAGE_NOT_OURS_TEXT) : { ...at(frameNotOursText(i + 1)), frame: i };
    }
    case "unknown_emails": {
      const emails = Array.isArray(d.emails) ? d.emails.filter((e): e is string => typeof e === "string" && !!e.trim()).slice(0, 20) : [];
      return at(unknownEmailsText(emails));
    }
    case "forbidden": return at(ADS_FORBIDDEN_TEXT);
  }
  if (r.status === 403) return { status: 403, code: code || "forbidden", error: ADS_FORBIDDEN_TEXT };
  if (r.status === 404) return { status: 404, code: code || "not_found", error: AD_ENTITY[a.entity].notFound };
  if (r.status === 409) return { status: 409, code: code || "conflict", error: hebrew(r.error) ? r.error : UNEXPECTED_TEXT };
  if (r.status === 400) return { status: 400, code: code || "invalid", error: hebrew(r.error) ? r.error : INVALID_TEXT };
  if (r.status >= 500) return { status: r.status, code: "failed", error: ADS_UNKNOWN_TEXT };   // הקוד של bloc — ביומן
  return { status: r.status >= 400 ? r.status : 502, code: code || "failed", error: hebrew(r.error) ? r.error : UNEXPECTED_TEXT };
}

/** כשל ודאי ב-5xx (שום דבר לא השתנה): SQL חסר, קריאה שנכשלה, כתיבה אחת שנכשלה. */
const DEFINITE_5XX: ReadonlySet<string> = new Set(["sql_missing", "read_failed", "write_failed", "config_missing"]);

/** ייתכן שבוצע (bloc לא ענה בזמן / שגיאת רשת / שגיאת שרת בלי קוד מוכר) — או נדחה / לא הגיע. */
export function adsOutcome(r: { status: number; code?: string }): "unknown" | "failed" {
  if (r.code === "TIMEOUT" || r.code === "NETWORK") return "unknown";
  if (r.status < 500) return "failed";
  if (r.code && (CONNECTION_CODES.has(r.code) || DEFINITE_5XX.has(r.code))) return "failed";
  return "unknown";
}

/** שורת היומן של כשל: BLOC_ACTION_FAILED (נדחה / לא הגיע) או BLOC_ACTION_UNKNOWN (ייתכן שבוצע), עם פעולת ה-AD_* שנוסתה. */
export function adsFailureAudit(r: { status: number; code?: string }, audit: string): {
  name: "BLOC_ACTION_FAILED" | "BLOC_ACTION_UNKNOWN"; meta: Record<string, unknown>;
} {
  const outcome = adsOutcome(r);
  return { name: outcome === "unknown" ? "BLOC_ACTION_UNKNOWN" : "BLOC_ACTION_FAILED", meta: { action: audit, outcome, code: r.code ?? null, status: r.status } };
}

// ── תשובה ברורה ──

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type AdsDone = { id: string | null; creatives: DuplicateCreatives | null; skipped?: number; review?: ReviewAnswer };

/**
 * הצלחה רק עם ok === true; שמירה — עם id (ובעריכה — אותו id שנשלח); שכפול — עם id חדש, ו-creatives: 'ok' / 'failed'
 * (חסר — 'unknown': הקמפיין שוכפל, ולא ידוע אם הפרסומות — אף פעם לא "הועתקו"). אחרת null = לא ברור, ייתכן שבוצע.
 */
export function adsAnswer(b: AdAction, d: Record<string, unknown>): AdsDone | null {
  if (d.ok !== true) return null;
  const kind = AD_ACTIONS[b.action].kind;
  if (kind === "update" || kind === "delete") return { id: null, creatives: null };
  // ADS-2ב1: החלטה על דיווחים — result (כשנשלח) חייב להיות 'ok' (not_found — adsRefusal, לפני כן); המצב והמספר — כשתקינים
  if (kind === "review") return d.result === undefined || d.result === "ok" ? { id: null, creatives: null, review: parseReviewAnswer(d) } : null;
  const id = typeof d.id === "string" && UUID.test(d.id) ? d.id : null;
  if (!id) return null;
  const asked = "id" in b && typeof b.id === "string" ? b.id.toLowerCase() : null;
  if (kind === "save") return asked && asked !== id.toLowerCase() ? null : { id, creatives: null };
  if (asked === id.toLowerCase()) return null;   // עותק הוא קמפיין חדש, לא המקור
  const skipped = typeof d.skipped_outside === "number" && Number.isInteger(d.skipped_outside) && d.skipped_outside > 0 ? Math.min(d.skipped_outside, 1000) : 0;
  return { id, creatives: d.creatives === "ok" || d.creatives === "failed" ? d.creatives : "unknown", ...(skipped ? { skipped } : {}) };
}

/**
 * ADS-2ב1: bloc שעונה 200 עם result: 'not_found' (ad_reports_review לא מצא את הקמפיין) — זה סירוב ודאי, לא "לא ברור". אחרת null.
 * (bloc שממפה not_found ל-404 — adsFailure, כמו כל פעולה.)
 */
export function adsRefusal(b: AdAction, d: Record<string, unknown>): AdsFailure | null {
  if (b.action === "reports.review" && d.result === "not_found") return { status: 404, code: "not_found", error: AD_ENTITY.campaign.notFound };
  return null;
}

// ── היומן של הפאנל: אותן עובדות כמו עד עכשיו (בלי הערות ובלי פרטי קשר) ──

/** העובדות שהפאנל רושם על הבקשה (גם בכשל — מה נוסה). */
export function adFacts(b: AdAction): Record<string, unknown> {
  switch (b.action) {
    case "advertiser.save": return {
      name: b.name, created: !b.id,
      // ADS-2א v2: המותג — הצבע, והאם יש לוגו (לא הכתובת)
      ...(b.brand_color ? { brand_color: b.brand_color } : {}), ...(b.logo_url ? { logo: true } : {}),
    };
    case "advertiser.archive": return { archived: b.archived };
    case "contract.save": return {
      created: !b.id, advertiser_id: b.advertiser_id, pricing: b.pricing, price_ils: b.price_ils,
      impression_cap: b.impression_cap, starts_on: b.starts_on, ends_on: b.ends_on, status: b.status,
    };
    case "campaign.save": return {
      created: !b.id, name: b.name, contract_id: b.contract_id, starts_on: b.starts_on, ends_on: b.ends_on,
      goal_views: b.goal_views, plans: b.plans, screens: b.screens,
    };
    case "campaign.status": return { to: b.status };
    case "campaign.duplicate": return { from: b.id };
    // ADS-2א v2: הפורמט, המיקום, הסגנון, הצבע ומספר התמונות (לא הכתובות)
    case "creative.save": return {
      created: !b.id, campaign_id: b.campaign_id, headline: b.headline,
      ...(b.format ? { format: b.format } : {}), ...(b.banner_position ? { banner_position: b.banner_position } : {}),
      ...(b.theme ? { theme: b.theme } : {}), ...(b.accent ? { accent: b.accent } : {}),
      ...(Array.isArray(b.frames) ? { frames: b.frames.length } : {}),
      // ADS-2ב1: הקוד (טקסט שיווקי, לא פרט של אדם) וסוף המבצע
      ...(b.coupon_code ? { coupon_code: b.coupon_code } : {}), ...(b.offer_ends_on ? { offer_ends_on: b.offer_ends_on } : {}),
    };
    case "creative.active": return { active: b.active };
    case "settings.save": return {
      enabled: b.enabled, excluded: b.excluded_buildings?.length, testers: b.tester_emails?.length,
      ...(b.report_pause_at !== undefined ? { report_pause_at: b.report_pause_at } : {}),
    };
    case "reports.review": return { decision: b.decision, seen_until: b.seen_until };
    default: return {};   // advertiser / contract / campaign / creative .delete — המזהה ביומן
  }
}

/** השמות שהיומן של הפאנל רשם עד עכשיו מה-DB (שם / כותרת / מספר חוזה / המצב הקודם) — אם bloc מחזיר אותם בתשובה. */
export function answerFacts(d: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["name", "headline", "reference", "from"]) if (typeof d[k] === "string" && d[k]) out[k] = d[k] as string;
  return out;
}

/** על מה נרשמת השורה: ההגדרות — "1"; שמירה חדשה — אין עדיין מזהה (בהצלחה: המזהה החדש); שכפול שנכשל — המקור. */
export function adEntityId(b: AdAction): string | undefined {
  if (b.action === "settings.save") return "1";
  if (b.action === "reports.review") return b.campaign_id;
  return "id" in b && typeof b.id === "string" ? b.id : undefined;
}

// ── העלאת תמונה (C4): כתובת חתומה מ-bloc ──

export const UPLOAD_NO_ANSWER_TEXT = "bloc לא ענה, ולכן התמונה לא הועלתה. נסו שוב.";
export const UPLOAD_BAD_SHAPE_TEXT = "bloc ענה בצורה לא צפויה, ולכן התמונה לא הועלתה. נסו שוב.";
export const UPLOAD_INVALID_TEXT = "bloc לא קיבל את הקובץ. אפשר להעלות רק JPEG, PNG או WebP, עד 2MB.";

export type UploadTarget = { path: string; signed_url: string; public_url: string; anon_key: string | null };
export const UPLOAD_CONFIG_MISSING_TEXT = "ההעלאה לא זמינה כרגע — חסרה הגדרה ב-bloc. התמונה לא הועלתה.";
const httpsUrl = (u: string) => /^https:\/\/[^/\s]+\/\S*$/.test(u);
/** { ok, path, token, signed_url, public_url, anon_key } → לאן שולחים ומה הכתובת הציבורית; public_url — רק בבאקט 'ads'. אחרת null.
 *  anon_key — המפתח הציבורי של bloc, ל-PUT (כמו supabase-js); בלעדיו — PUT בלי מפתח. */
export function uploadTarget(d: Record<string, unknown>, supabaseUrl: string | null | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): UploadTarget | null {
  if (d.ok !== true) return null;
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string).trim() : "");
  const path = s("path"), signed = s("signed_url"), pub = s("public_url");
  if (!path || !httpsUrl(signed) || !httpsUrl(pub) || !pub.includes("/storage/v1/object/public/ads/")) return null;
  // סקירה א2ב (#10): כשהפאנל יודע מה הפרויקט — ה-PUT (עם המפתח הציבורי) רק לכתובת חתומה של הבאקט 'ads' באותו פרויקט,
  // והכתובת הציבורית — באותו פרויקט.
  const root = (supabaseUrl ?? "").trim().replace(/\/+$/, "");
  if (/^https:\/\/[^/\s]+$/i.test(root)) {
    let su: URL, pu: URL;
    try { su = new URL(signed); pu = new URL(pub); } catch { return null; }
    const origin = new URL(root).origin;
    if (su.origin !== origin || !su.pathname.startsWith("/storage/v1/object/upload/sign/ads/")) return null;
    if (pu.origin !== origin || !pu.pathname.startsWith("/storage/v1/object/public/ads/") || pu.search || pu.hash) return null;
  }
  return { path, signed_url: signed, public_url: pub, anon_key: s("anon_key") || null };
}

/** bloc סירב לתת כתובת → המשפט. כאן אין "ייתכן שבוצע": בלי הכתובת לא נשלח שום בייט. */
export function uploadUrlFailure(r: BlocFailure): AdsFailure {
  const code = r.code ?? "";
  const at = (error: string) => ({ status: r.status, code, error });
  if (code === "TIMEOUT" || code === "NETWORK") return at(UPLOAD_NO_ANSWER_TEXT);
  if (code && CONNECTION_CODES.has(code)) return at(r.error);
  if (code === "sql_missing") return at(ADS_SQL_MISSING);
  if (code === "config_missing") return { status: 503, code, error: UPLOAD_CONFIG_MISSING_TEXT };
  if (code === "forbidden" || r.status === 403) return { status: 403, code: code || "forbidden", error: ADS_FORBIDDEN_TEXT };
  if (code === "invalid" || r.status === 400) return { status: 400, code: code || "invalid", error: UPLOAD_INVALID_TEXT };
  return { status: r.status >= 400 ? r.status : 502, code: code || "failed", error: UPLOAD_FAILED_TEXT };
}
