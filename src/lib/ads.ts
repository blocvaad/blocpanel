// src/lib/ads.ts — פרסומות ממומנות (bloc ADS-1, SQL 175; החלטות 74–75): מה הפאנל מציג ומחשב.
//
// ההגשה עצמה (תדירות, תזמון, מיקוד, תקרות, פריסה) — ב-DB של bloc (ad_next). כאן: השמות בעברית, המצב של
// קמפיין כמו שהמנהל צריך לראות אותו (פעיל / מתוזמן / הסתיים / היעד הושג / החוזה לא פעיל), הקצב מול היעד
// (אותה נוסחה כמו ב-SQL), השווי לפי החוזה, ה-CTR, והדוח למפרסם — מספרים מצטברים בלבד (החלטה 75).
import { ilTodayKey, addDaysKey, isDateKey } from "./broadcasts";
import { toCsv, type CsvValue } from "./csv";

export type Pricing = "cpm" | "cpc" | "flat";
export type ContractStatus = "draft" | "active" | "cancelled";
export type CampaignStatus = "draft" | "active" | "paused" | "ended";
export type AdScreen = "home" | "market" | "events";
export type AdPlan = "free" | "building" | "large" | "tower" | "company";
export type AdRole = "tenant" | "committee";

export const PRICINGS: Pricing[] = ["cpm", "cpc", "flat"];
export const SCREENS: AdScreen[] = ["home", "market", "events"];
export const AD_PLANS: AdPlan[] = ["free", "building", "large", "tower", "company"];
export const AD_ROLES: AdRole[] = ["tenant", "committee"];
export const DEFAULT_PLANS: AdPlan[] = ["free", "building"];

export const PRICING_LABEL: Record<Pricing, string> = { cpm: "לאלף חשיפות", cpc: "להקלקה", flat: "סכום קבוע" };
export const PRICING_HINT: Record<Pricing, string> = {
  cpm: "המחיר לכל 1,000 הצגות שנראו",
  cpc: "המחיר לכל לחיצה על הכפתור",
  flat: "סכום אחד לכל התקופה",
};
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = { draft: "טיוטה", active: "פעיל", cancelled: "בוטל" };
export const SCREEN_LABEL: Record<AdScreen, string> = { home: "מסך הבית", market: "הלוח הקהילתי", events: "לוח האירועים" };
export const PLAN_LABEL: Record<AdPlan, string> = { free: "התנסות", building: "Core", large: "Plus", tower: "Pro", company: "חברת ניהול" };
export const ROLE_LABEL: Record<AdRole, string> = { tenant: "דיירים", committee: "ועד הבית" };
/** 0 = ראשון (כמו extract(dow) ב-Postgres). */
export const DAY_LABEL = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;
export const DAY_NAME = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

/** גודל התמונה המומלץ (מסך מלא בטלפון): 1080×1350 (4:5). עד 2MB, JPEG / PNG / WebP. */
export const AD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const AD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export { ilTodayKey, addDaysKey, isDateKey };

// ── שגיאות של DB שעוד לא קיבל את SQL 175 ──────────────────────────────────
export type DbError = { code?: string; message?: string } | null | undefined;
/** הטבלה / הפונקציה עוד לא קיימות (SQL 175 לא רץ). */
export function adsSqlMissing(e: DbError): boolean {
  if (!e) return false;
  return ["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "")
    || /relation .* does not exist|could not find the (table|function)|function .* does not exist/i.test(e.message ?? "");
}
export const ADS_SQL_MISSING = "צריך להריץ קודם את SQL 175 של bloc (פרסומות).";

/** שגיאות ה-DB שיש להן משפט בעברית. */
export function adsDbMessage(e: DbError, fallback: string): string {
  const m = e?.message ?? "";
  if (adsSqlMissing(e)) return ADS_SQL_MISSING;
  if (/AD_CONTRACT_LOCKED/.test(m)) return "בחוזה הזה כבר הוצגו פרסומות: המפרסם, מודל התמחור והמחיר קבועים. לשינוי — חוזה חדש.";
  if (/AD_CAMPAIGN_LOCKED/.test(m)) return "הקמפיין כבר הוצג, ולכן הוא נשאר בחוזה שלו.";
  if (/AD_CREATIVE_LOCKED/.test(m)) return "הפרסומת הזו כבר הוצגה, ולכן התוכן שלה קבוע. מוסיפים פרסומת חדשה ומשביתים את הישנה.";
  if (e?.code === "23503") return "יש לזה היסטוריה או פריטים תלויים, ולכן אי אפשר למחוק. אפשר לעצור, לסיים או להעביר לארכיון.";
  if (e?.code === "23514") return "אחד הערכים לא תקין (טווח, תאריכים או כתובת).";
  return fallback;
}

// ── מצב קמפיין, כמו שהמנהל צריך לראות אותו ────────────────────────────────
export type Tone = "ok" | "wait" | "danger" | "muted" | "info";
export type CampaignPhase = "draft" | "scheduled" | "running" | "paused" | "ended" | "goal" | "blocked";

export interface CampaignLike {
  status: CampaignStatus;
  starts_on: string;
  ends_on: string;
  goal_views: number | null;
}
export interface ContractLike {
  status: ContractStatus;
  starts_on: string;
  ends_on: string;
  impression_cap?: number | null;
}

export function campaignPhase(
  c: CampaignLike, k: ContractLike | null | undefined, views: number, today: string = ilTodayKey(),
): { phase: CampaignPhase; label: string; tone: Tone } {
  if (c.status === "draft") return { phase: "draft", label: "טיוטה", tone: "muted" };
  if (c.status === "ended") return { phase: "ended", label: "הסתיים", tone: "muted" };
  if (today > c.ends_on) return { phase: "ended", label: "הסתיים", tone: "muted" };
  if (c.goal_views != null && views >= c.goal_views) return { phase: "goal", label: "היעד הושג", tone: "ok" };
  if (c.status === "paused") return { phase: "paused", label: "מושהה", tone: "wait" };
  if (!k || k.status !== "active") return { phase: "blocked", label: "החוזה לא פעיל", tone: "danger" };
  if (today > k.ends_on) return { phase: "blocked", label: "החוזה הסתיים", tone: "danger" };
  if (today < c.starts_on || today < k.starts_on) return { phase: "scheduled", label: "מתוזמן", tone: "info" };
  return { phase: "running", label: "פעיל", tone: "ok" };
}

// ── קצב מול היעד (אותה נוסחה כמו ad_next) ──────────────────────────────────
const MS_DAY = 86_400_000;
/** חצות של יום (YYYY-MM-DD) לפי שעון ישראל, כ-ms. */
export function ilMidnightMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // ההפרש בין ישראל ל-UTC באותו רגע (2 או 3 שעות) — לפי Intl, בלי ספרייה.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return guess - (asLocal - guess);
}

export function pacing(c: CampaignLike, views: number, now: number = Date.now()): {
  expected: number; frac: number; state: "none" | "on_track" | "behind" | "ahead"; label: string;
} {
  if (c.goal_views == null || c.goal_views <= 0) return { expected: 0, frac: 0, state: "none", label: "" };
  const start = ilMidnightMs(c.starts_on);
  const end = ilMidnightMs(addDaysKey(c.ends_on, 1));
  const frac = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  const expected = Math.ceil(c.goal_views * frac);
  if (frac <= 0) return { expected: 0, frac, state: "on_track", label: "עוד לא התחיל" };
  if (views < expected * 0.9) return { expected, frac, state: "behind", label: "מפגר אחרי הקצב" };
  if (views > expected * 1.1 + Math.max(10, c.goal_views * 0.02)) return { expected, frac, state: "ahead", label: "מקדים את הקצב" };
  return { expected, frac, state: "on_track", label: "בקצב" };
}

// ── כסף ומדדים ──────────────────────────────────────────────────────────────
/** השווי לפי החוזה: לאלף חשיפות — הנראות; להקלקה — ההקלקות; סכום קבוע — הסכום. */
export function contractValue(pricing: Pricing, price: number, t: { views: number; clicks: number }): number {
  const v = pricing === "cpm" ? (t.views / 1000) * price : pricing === "cpc" ? t.clicks * price : price;
  return Math.round(v * 100) / 100;
}

export function ctrPct(views: number, clicks: number): number | null {
  if (!views) return null;
  return Math.round((clicks / views) * 1000) / 10;
}
export function fmtCtr(views: number, clicks: number): string {
  const p = ctrPct(views, clicks);
  return p === null ? "—" : `${p.toLocaleString("he-IL", { maximumFractionDigits: 1 })}%`;
}
export const fmtInt = (n: number | null | undefined) => (n ?? 0).toLocaleString("he-IL");
export const fmtIls = (n: number) => `₪${n.toLocaleString("he-IL", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "13.10–31.10" — טווח תאריכים קצר. */
export function fmtRange(from: string, to: string): string {
  const d = (k: string) => { const [, m, day] = k.split("-"); return `${Number(day)}.${Number(m)}`; };
  const y = (k: string) => k.slice(0, 4);
  return y(from) === y(to) ? `${d(from)}–${d(to)}.${y(to)}` : `${d(from)}.${y(from)}–${d(to)}.${y(to)}`;
}

export function fmtDays(days: number[]): string {
  const s = [...new Set(days)].sort((a, b) => a - b);
  if (s.length === 7) return "כל הימים";
  if (s.join() === "0,1,2,3,4") return "ראשון עד חמישי";
  if (s.join() === "0,1,2,3,4,5") return "ראשון עד שישי";
  return s.map((d) => DAY_LABEL[d]).join(", ");
}
export function fmtHours(from: number, to: number): string {
  if (from === 0 && to === 24) return "כל השעות";
  const h = (n: number) => `${String(n % 24).padStart(2, "0")}:00`;
  return `${h(from)}–${to === 24 ? "24:00" : h(to)}`;
}

// ── הדוח ────────────────────────────────────────────────────────────────────
export interface AdTotals { serves: number; views: number; clicks: number; closes: number; reach: number }
export interface AdReport {
  totals: AdTotals;
  days: Array<AdTotals & { day: string }>;
  creatives: Array<{ creative_id: string; serves: number; views: number; clicks: number; closes: number }>;
  screens: Array<{ screen: AdScreen; views: number; clicks: number }>;
  cities: Array<{ city: string | null; views: number; clicks: number }>;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []);

/** מה ש-ad_report החזיר → דוח עם מספרים בלבד (שדה חסר = 0, לא NaN). */
export function parseReport(raw: unknown): AdReport {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t = (r.totals && typeof r.totals === "object" ? r.totals : {}) as Record<string, unknown>;
  const tot = (o: Record<string, unknown>): AdTotals => ({ serves: num(o.serves), views: num(o.views), clicks: num(o.clicks), closes: num(o.closes), reach: num(o.reach) });
  return {
    totals: tot(t),
    days: arr(r.days).filter((d) => isDateKey(d.day)).map((d) => ({ day: d.day as string, ...tot(d) })),
    creatives: arr(r.creatives).map((c) => ({ creative_id: String(c.creative_id ?? ""), serves: num(c.serves), views: num(c.views), clicks: num(c.clicks), closes: num(c.closes) })),
    screens: arr(r.screens).filter((s) => SCREENS.includes(s.screen as AdScreen)).map((s) => ({ screen: s.screen as AdScreen, views: num(s.views), clicks: num(s.clicks) })),
    cities: arr(r.cities).map((c) => ({ city: typeof c.city === "string" && c.city.trim() ? c.city : null, views: num(c.views), clicks: num(c.clicks) })),
  };
}

export interface ReportMeta {
  advertiser: string;
  campaign: string;
  starts_on: string;
  ends_on: string;
  creatives: Record<string, string>;
}

/** CSV למפרסם — מספרים מצטברים בלבד: סה"כ, לפי יום, לפי פרסומת, לפי מסך ולפי עיר. בלי משתמשים ובלי בניינים. */
export function reportCsv(meta: ReportMeta, rep: AdReport): string {
  const rows: CsvValue[][] = [];
  rows.push(["מפרסם", meta.advertiser, "", "", "", ""]);
  rows.push(["קמפיין", meta.campaign, "", "", "", ""]);
  rows.push(["תקופה", `${meta.starts_on} עד ${meta.ends_on}`, "", "", "", ""]);
  rows.push([]);
  rows.push(["סה\"כ", "חשיפות", "אנשים שונים", "הקלקות", "CTR", "סגירות"]);
  rows.push(["", rep.totals.views, rep.totals.reach, rep.totals.clicks, fmtCtr(rep.totals.views, rep.totals.clicks), rep.totals.closes]);
  rows.push([]);
  rows.push(["יום", "חשיפות", "אנשים שונים", "הקלקות", "CTR", "סגירות"]);
  for (const d of rep.days) rows.push([d.day, d.views, d.reach, d.clicks, fmtCtr(d.views, d.clicks), d.closes]);
  rows.push([]);
  rows.push(["פרסומת", "חשיפות", "", "הקלקות", "CTR", "סגירות"]);
  for (const c of rep.creatives) rows.push([meta.creatives[c.creative_id] ?? "פרסומת", c.views, "", c.clicks, fmtCtr(c.views, c.clicks), c.closes]);
  rows.push([]);
  rows.push(["מסך", "חשיפות", "", "הקלקות", "CTR", ""]);
  for (const s of rep.screens) rows.push([SCREEN_LABEL[s.screen], s.views, "", s.clicks, fmtCtr(s.views, s.clicks), ""]);
  rows.push([]);
  rows.push(["עיר", "חשיפות", "", "הקלקות", "CTR", ""]);
  for (const c of rep.cities) rows.push([c.city ?? "לא ידוע", c.views, "", c.clicks, fmtCtr(c.views, c.clicks), ""]);
  return toCsv(["דוח פרסומת — bloc", "", "", "", "", ""], rows);
}

/** שם קובץ בטוח: אותיות, ספרות ומקפים. */
export function reportFileName(campaign: string, today: string = ilTodayKey()): string {
  const slug = campaign.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "campaign";
  return `bloc-ad-report-${slug}-${today}.csv`;
}

// ── תמונה שהועלתה: לפי הבייטים עצמם, לא לפי מה שהדפדפן אמר ─────────────────
export type AdImageKind = { ext: "jpg" | "png" | "webp"; type: "image/jpeg" | "image/png" | "image/webp" };
export function sniffImage(b: Uint8Array): AdImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a)
    return { ext: "png", type: "image/png" };
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { ext: "webp", type: "image/webp" };
  return null;
}
