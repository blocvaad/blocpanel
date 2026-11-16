// src/lib/adsExplain.ts — "למה המשתמש הזה לא רואה פרסומת?" (bloc ADS-1b, SQL 176): מה bloc ענה, במשפטים.
//
// bloc (/api/internal/ads/explain) מריץ את אותו מסלול כמו בקשה אמיתית — החשבון לפי המייל, הבניין והתפקיד בו,
// המסלול האפקטיבי, השקט אחרי הודעה דחופה — ואז ad_explain: מה ad_next היה מחליט עכשיו, ולכל קמפיין איזה כלל
// עבר ואיזה לא. כאן: התשובה נבדקת שוב (שדה חסר — ריק, לא קריסה), ונהפכת למה שהמנהל קורא.
// ADS-2א (החלטות 376, 378): לכל slot (מעל המסך / פס / ברשימה) כללי תדירות משלו — הבדיקה נשלחת עם ה-slot, וההכרעות "כבר ראה
// היום" / "ראה לפני זמן קצר" נאמרות לפי ה-slot. bloc מחזיר את ה-slot שבדק (slot בראש התשובה, כמו screen); תשובה ל-slot אחר —
// נאמרת, לא מוסתרת. לכל קמפיין bloc מחזיר formats — מערך הפורמטים של המודעות הפעילות שלו ([] כשאין).
// ADS-2ב1 (SQL 232, החלטות 385, 388): בדיקה חדשה — hidden ("המשתמש בחר לא לראות את הפרסומת או את המפרסם" — ניטרלי, סקירה #9);
// creative נכשלת גם כשבכל המודעות
// הפעילות המבצע הסתיים (formats — רק מודעות שאפשר להגיש). bloc לפני 232 לא שולח hidden — חסר נקרא "עובר" (לא "נכשל").
import { DAY_NAME, PLAN_LABEL, SCREEN_IN, SCREEN_LABEL, type AdPlan, type AdScreen } from "./ads";
import { AD_FORMATS, isSlot, SLOT_LABEL, type AdFormat, type AdSlot } from "./adsFormats";

/** bloc לפני ADS-2א דוחה slot — אפשר לבדוק כרגע רק מעל המסך (כרטיס, חלון קופץ, מסך מלא, סטורי). */
export const EXPLAIN_SLOT_UNSUPPORTED_TEXT = "bloc עוד לא בודק פס או פרסומת ברשימה — כרגע אפשר לבדוק רק מודעות שמעל המסך (כרטיס, חלון קופץ, מסך מלא, סטורי). אחרי העדכון של bloc זה יעבוד.";

export const AD_CHECKS = [
  "status", "contract", "dates", "day", "hour", "screen", "plan", "role", "city", "building", "creative",
  "hidden", "user_cap", "daily_cap", "contract_cap", "pacing",
] as const;
export type AdCheck = typeof AD_CHECKS[number];
/** בדיקות שנוספו אחרי ADS-1b: bloc ישן לא שולח אותן — רק false מפורש הוא "נכשל" (אחרת קמפיין היה נראה חסום בלי סיבה). */
export const OPTIONAL_CHECKS: ReadonlySet<AdCheck> = new Set<AdCheck>(["hidden"]);

/** מה לא עבר — במשפט. */
export const CHECK_FAIL: Record<AdCheck, string> = {
  status: "הקמפיין לא פעיל (טיוטה או מושהה)",
  contract: "החוזה לא פעיל, או שהמפרסם בארכיון",
  dates: "היום מחוץ לתאריכים של הקמפיין או של החוזה",
  day: "היום לא בימים שנבחרו",
  hour: "השעה עכשיו מחוץ לשעות שנבחרו",
  screen: "המסך הזה לא נבחר",
  plan: "המסלול של הבניין לא נבחר",
  role: "התפקיד שלו (דייר / ועד) לא נבחר",
  city: "העיר של הבניין לא ברשימת הערים",
  building: "הבניין לא ברשימת הבניינים",
  creative: "אין בקמפיין מודעה שאפשר להציג: אין מודעה פעילה, או שהמבצע בכל המודעות הפעילות הסתיים",
  // סקירה #9: ניסוח ניטרלי, בלי פרטים נוספים
  hidden: "המשתמש בחר לא לראות את הפרסומת או את המפרסם",
  user_cap: "כבר ראה את הקמפיין כמספר הפעמים המרבי לאדם",
  daily_cap: "הקמפיין הגיע לתקרה של היום",
  contract_cap: "החוזה הגיע לתקרת החשיפות שלו",
  pacing: "הקמפיין הקדים את קצב היעד (או השיג אותו), וממתין",
};

export type ExplainBlocker = "deleted" | "no_building" | "no_role" | "not_approved" | "urgent";

export interface ExplainCampaign {
  id: string; name: string; advertiser: string; status: string; eligible: boolean; checks: Record<AdCheck, boolean>;
  /** ADS-2א: הפורמטים של המודעות הפעילות שלו (formats של bloc — מערך, [] כשאין או כשלא נשלח); לפי סדר הגלריה, בלי כפילויות. */
  formats: AdFormat[];
}
export interface ExplainResult {
  /** ADS-2א: ה-slot ש-bloc בדק (הוא מחזיר אותו כמו screen); לא החזיר — null. */
  slot: AdSlot | null;
  found: boolean;
  ambiguous: boolean;
  name: string | null;
  createdAt: string | null;
  management: boolean;
  building: { id: string; name: string | null; city: string | null } | null;
  role: "tenant" | "committee" | null;
  plan: AdPlan | null;
  urgentUntil: string | null;
  blockers: ExplainBlocker[];
  screen: AdScreen;
  sqlMissing: boolean;
  verdict: string | null;
  until: string | null;
  shownToday: number;
  lastShownAt: string | null;
  campaigns: ExplainCampaign[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");
const strOrNull = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
const BLOCKERS: ReadonlySet<string> = new Set(["deleted", "no_building", "no_role", "not_approved", "urgent"]);
const PLANS: ReadonlySet<string> = new Set(["free", "building", "large", "tower", "company"]);
const SCREENS: ReadonlySet<string> = new Set(["home", "market", "events"]);

/** formats של bloc → הפורמטים המוכרים, לפי סדר הגלריה, בלי כפילויות (לא מערך / ערך לא מוכר — לא נכנס). */
export function formatsOf(v: unknown): AdFormat[] {
  const got = Array.isArray(v) ? v : [];
  return AD_FORMATS.filter((f) => got.includes(f));
}

/** מה ש-bloc החזיר → צורה בדוקה. */
export function parseExplain(raw: unknown): ExplainResult {
  const r = isObj(raw) ? raw : {};
  const db = isObj(r.db) ? r.db : null;
  const person = isObj(r.person) ? r.person : {};
  const b = isObj(r.building) ? r.building : null;
  const shown = Number(db?.shownToday);
  return {
    slot: isSlot(r.slot) ? r.slot : null,
    found: r.found === true,
    ambiguous: r.ambiguous === true,
    name: strOrNull(person.name),
    createdAt: iso(person.createdAt),
    management: person.management === true,
    building: b && typeof b.id === "string" ? { id: b.id, name: strOrNull(b.name), city: strOrNull(b.city) } : null,
    role: r.role === "tenant" || r.role === "committee" ? r.role : null,
    plan: typeof r.plan === "string" && PLANS.has(r.plan) ? (r.plan as AdPlan) : null,
    urgentUntil: iso(r.urgentUntil),
    blockers: (Array.isArray(r.blockers) ? r.blockers : []).filter((x): x is ExplainBlocker => typeof x === "string" && BLOCKERS.has(x)),
    screen: typeof r.screen === "string" && SCREENS.has(r.screen) ? (r.screen as AdScreen) : "home",
    sqlMissing: r.sqlMissing === true,
    verdict: db && typeof db.verdict === "string" ? db.verdict : null,
    until: iso(db?.until),
    shownToday: Number.isFinite(shown) && shown > 0 ? Math.floor(shown) : 0,
    lastShownAt: iso(db?.lastShownAt),
    campaigns: (Array.isArray(db?.campaigns) ? (db!.campaigns as unknown[]) : []).filter(isObj).slice(0, 20).map((c) => {
      const ck = isObj(c.checks) ? c.checks : {};
      return {
        id: str(c.id, 40), name: str(c.name) || "קמפיין", advertiser: str(c.advertiser), status: str(c.status, 20),
        eligible: c.eligible === true,
        checks: Object.fromEntries(AD_CHECKS.map((k) => [k, OPTIONAL_CHECKS.has(k) ? ck[k] !== false : ck[k] === true])) as Record<AdCheck, boolean>,
        formats: formatsOf(c.formats),
      };
    }),
  };
}

/** זמן לפי שעון ישראל: "היום ב-14:05" / "מחר ב-00:00" / "16.10 ב-09:00". */
export function ilWhen(isoTime: string, now: Date = new Date()): string {
  const t = new Date(isoTime);
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", ...o }).format(d);
  const day = (d: Date) => fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  const time = fmt(t, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (day(t) === day(now)) return `היום ב-${time}`;
  if (day(t) === day(new Date(now.getTime() + 86_400_000))) return `מחר ב-${time}`;
  return `${fmt(t, { day: "numeric", month: "numeric" })} ב-${time}`;
}

export type Tone = "ok" | "wait" | "danger";
export interface ExplainView {
  title: string;
  /** מי ואיפה — שורה אחת. */
  who: string | null;
  verdict: { tone: Tone; text: string } | null;
  blockers: string[];
  notes: string[];
  campaigns: Array<{ id: string; name: string; advertiser: string; eligible: boolean; failed: string[]; formats: AdFormat[] }>;
  /** מה שהשרת לא רואה — הטלפון. */
  tips: string[];
}

const ROLE_ONE = { tenant: "דייר", committee: "ועד הבית" } as const;

/** החלטה 378: מה "יקבל", "כבר ראה היום" ו"ראה לפני זמן קצר" אומרים בכל slot. */
const SLOT_TEXT: Record<AdSlot, { what: string; had: string; it: string; none: string; capped: string; gap: string; next: string; soon: string }> = {
  full: {
    what: "פרסומת", had: "הייתה לו פרסומת", it: "אותה", none: "קמפיין",
    capped: "כבר ראה פרסומת היום.", gap: "ראה פרסומת לפני פחות מ-6 שעות.", next: "הבאה", soon: " בעוד כמה שעות",
  },
  banner: {
    what: "פס ממומן", had: "היה לו פס ממומן", it: "אותו", none: "קמפיין של פס",
    capped: "כבר ראה היום 4 פסים, המרבי ליום.", gap: "ראה פס לפני פחות מ-30 דקות.", next: "הבא", soon: " בעוד כמה דקות",
  },
  inline: {
    what: "פרסומת ברשימה", had: "הייתה לו פרסומת ברשימה", it: "אותה", none: "קמפיין ברשימה",
    capped: "כבר ראה היום 3 פרסומות ברשימה, המרבי ליום.", gap: "ראה פרסומת ברשימה לפני פחות מ-10 דקות.", next: "הבאה", soon: " בעוד כמה דקות",
  },
};
const CACHE_TIP = "הטלפון זוכר את התשובה הקודמת (עד שעה כשלא הייתה פרסומת). כדי לבדוק מיד: באפליקציה, הגדרות ← ניקוי מטמון ← רענון.";
const SLOT_TIP: Record<AdSlot, string> = {
  full: "גם כשהשרת אומר \"יקבל\", הטלפון שואל רק אחרי 2.5 שניות במסך, כשאין גיליון, תפריט או טופס פתוחים, ואחרי שהשאלה על התראות נענתה.",
  banner: "פס מוצג רק כשאין גיליון או תפריט פתוחים ולא מקלידים בשדה, ונספר כחשיפה רק אחרי שלפחות חצי ממנו היה על המסך שנייה רצופה. פס שנסגר ב-X לא חוזר אליו באותו קמפיין עד סוף היום.",
  inline: "פרסומת ברשימה מופיעה אחרי הפריט השלישי (או בסוף רשימה קצרה יותר), אחת לכל היותר בכל כניסה למסך, ונספרת כחשיפה רק אחרי שלפחות חצי ממנה היה על המסך שנייה רצופה.",
};

/** asked — ה-slot שהפאנל שאל עליו (ברירת המחדל: full — מעל המסך). */
export function explainView(r: ExplainResult, now: Date = new Date(), asked: AdSlot = "full"): ExplainView {
  // התשובה היא ל-slot ש-bloc בדק; לא אמר — לזה ששאלנו (full — כמו לפני ADS-2א).
  const slot: AdSlot = r.slot ?? asked;
  const st = SLOT_TEXT[slot];
  const tips = [SLOT_TIP[slot], CACHE_TIP];
  if (!r.found) return { title: "אין ב-bloc חשבון עם המייל הזה", who: null, verdict: null, blockers: [], notes: [], campaigns: [], tips: [] };
  if (r.ambiguous) return { title: "יש יותר מחשבון אחד עם המייל הזה", who: null, verdict: null, blockers: [], notes: ["אי אפשר לדעת על מי מדובר. בדקו את האדם מהדף שלו."], campaigns: [], tips: [] };

  const who = [
    r.name ?? "בלי שם",
    r.building ? `${r.building.name ?? "בניין"}${r.building.city ? `, ${r.building.city}` : ""}` : null,
    r.role ? ROLE_ONE[r.role] : null,
    r.plan ? `מסלול ${PLAN_LABEL[r.plan]}` : null,
  ].filter(Boolean).join(", ");

  const blockers = r.blockers.map((b) => {
    switch (b) {
      case "deleted": return "החשבון נמחק.";
      case "no_building": return "החשבון לא חבר באף בניין.";
      case "no_role": return "אין לו תפקיד של דייר או ועד בבניין (רק חברת ניהול או ספק). פרסומות מוצגות רק לדיירים ולוועד.";
      case "not_approved": return "הוא עוד לא אושר בבניין.";
      case "urgent": return `בבניין יש הודעה דחופה מ-24 השעות האחרונות, ולכן אין פרסומות${r.urgentUntil ? ` עד ${ilWhen(r.urgentUntil, now)}` : ""}.`;
    }
  });

  const notes: string[] = [];
  // ADS-2א: שאלנו על פס / ברשימה, ו-bloc ענה על slot אחר — או לא אמר על איזה. לא מציגים תשובה כאילו היא למה ששאלנו.
  if (r.slot !== null && r.slot !== asked) {
    notes.push(`התשובה של bloc היא ל"${SLOT_LABEL[r.slot]}", לא ל"${SLOT_LABEL[asked]}" — הגרסה של bloc עוד לא בודקת לפי סוג הפרסומת.`);
  } else if (r.slot === null && asked !== "full") {
    notes.push(`bloc לא אמר לאיזה סוג פרסומת התשובה — ייתכן שהיא ל"${SLOT_LABEL.full}" ולא ל"${SLOT_LABEL[asked]}".`);
  }
  if (r.management) notes.push("החשבון הוא גם חברת ניהול. במצב חברת ניהול אין פרסומות אף פעם, גם בתוך בניין. הן מוצגות רק כשהוא בבניין כוועד או כדייר.");

  const until = r.until ? ilWhen(r.until, now) : null;
  const where = SCREEN_IN[r.screen];
  let verdict: ExplainView["verdict"] = null;
  if (r.sqlMissing) {
    verdict = { tone: "danger", text: "צריך להריץ קודם את SQL 176 של bloc. בלעדיו אי אפשר לבדוק." };
  } else if (r.verdict) {
    const v = r.verdict;
    verdict =
      v === "ad" ? (blockers.length
        ? { tone: "danger", text: `לפי הקמפיינים ${st.had} ${where}, אבל מה שלמעלה עוצר ${st.it}.` }
        : { tone: "ok", text: `יקבל ${st.what} בכניסה הבאה ${where}.` })
      : v === "tester" ? { tone: "ok", text: "מכשיר בדיקה: יקבל תצוגה מקדימה של הקמפיין שעודכן אחרון, בלי כללים ובלי ספירה." }
      : v === "off" ? { tone: "danger", text: "הפרסומות כבויות לכל המערכת (בהגדרות, למטה)." }
      : v === "excluded" ? { tone: "danger", text: "הבניין ברשימה \"בניינים בלי פרסומות\" (בהגדרות, למטה)." }
      : v === "no_user" ? { tone: "danger", text: "החשבון נמחק או לא קיים." }
      : v === "new_user" ? { tone: "wait", text: `משתמש חדש: בלי פרסומות 3 ימים מההרשמה${until ? `, עד ${until}` : ""}.` }
      : v === "pending" ? { tone: "wait", text: `הוגשה לו פרסומת לפני רגע, והיא עוד לא הוצגה${until ? `. אם לא תוצג, הוא ישוחרר ${until}` : ""}.` }
      : v === "capped" ? { tone: "wait", text: `${st.capped} ${st.next}${until ? ` ${until}` : " מחר"}.` }
      : v === "gap" ? { tone: "wait", text: `${st.gap} ${st.next}${until ? ` ${until}` : st.soon}.` }
      : v === "none" ? { tone: "danger", text: `אין ${st.none} שמתאים לו עכשיו ${where}. למטה: מה לא מתאים בכל קמפיין.` }
      : { tone: "wait", text: "תשובה לא מוכרת מ-bloc." };
  }

  const campaigns = r.campaigns.map((c) => ({
    id: c.id, name: c.name, advertiser: c.advertiser, eligible: c.eligible, formats: c.formats,
    failed: AD_CHECKS.filter((k) => !c.checks[k]).map((k) => {
      if (k === "day") return `${CHECK_FAIL.day} (היום ${DAY_NAME[ilDow(now)]})`;
      if (k === "plan" && r.plan) return `${CHECK_FAIL.plan} (${PLAN_LABEL[r.plan]}${r.plan === "tower" ? ", למשל בניין שחברת ניהול מנהלת" : ""})`;
      if (k === "screen") return `${CHECK_FAIL.screen} (${SCREEN_LABEL[r.screen]})`;
      return CHECK_FAIL[k];
    }),
  }));

  return {
    title: r.name ?? "החשבון",
    who,
    verdict,
    blockers,
    notes,
    campaigns,
    tips: r.sqlMissing ? [] : tips,
  };
}

/** היום בשבוע לפי שעון ישראל (0 = ראשון). */
export function ilDow(now: Date = new Date()): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" }).format(now);
  return Math.max(0, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd));
}
