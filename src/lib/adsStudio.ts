// src/lib/adsStudio.ts — הלוגיקה של "סטודיו הפרסום" (bloc ADS-2א v2, החלטה 383). דפדפן ושרת, טהור (בלי I/O).
//
// מסך הבית (לשוניות מצב, טווח, מדדים, כרטיס קמפיין עם קצב וקו קטן), האשף (שם מוצע, תבניות טקסט, תזמון מוכן, רשימת הבדיקה
// לפני פרסום), הבקשות שהאשף שולח (campaign.save / creative.save — C3 / C5 v2), ריצת "צור מודעה בכל פורמט" (אחת אחרי השנייה;
// לא ברור — עוצרים), מד הקהל (ad_estimate_reach), והמודעה הטובה ביותר בדוח.
import { pacing, addDaysKey, fmtInt, fmtCtr, type CampaignPhase, type CampaignLike, type AdScreen, type AdPlan, type AdRole, type Tone } from "./ads";
import {
  AD_FORMATS, FORMAT_INFO, accessibleAccent, contrastInfo, framesPayload, framesReady, framesToDrafts, roundFocal, isHexColor, type AdFormat, type AdTheme,
  type BannerPosition, type FrameDraft, type AdFrame,
} from "./adsFormats";
import { isOurAdImage } from "./adsUi";
import { couponIssue, normalizeCoupon, offerIssue } from "./adsOffer";

// ── מסך הבית: לשוניות, טווח, מדדים ──

export type StudioTab = "running" | "scheduled" | "draft" | "paused" | "ended" | "all";
export const STUDIO_TABS: Array<{ key: StudioTab; label: string }> = [
  { key: "running", label: "פעילים" }, { key: "scheduled", label: "מתוזמנים" }, { key: "draft", label: "טיוטות" },
  { key: "paused", label: "מושהים" }, { key: "ended", label: "הסתיימו" }, { key: "all", label: "הכל" },
];
/** המצב של קמפיין → הלשונית שלו (חוזה לא פעיל — עם המושהים: הוא לא רץ). */
export function tabOf(phase: CampaignPhase): Exclude<StudioTab, "all"> {
  switch (phase) {
    case "running": return "running";
    case "scheduled": return "scheduled";
    case "draft": return "draft";
    case "paused": case "blocked": return "paused";
    default: return "ended";
  }
}

export type StudioRange = "today" | "7d" | "30d";
export const RANGES: StudioRange[] = ["today", "7d", "30d"];
export const RANGE_LABEL: Record<StudioRange, string> = { today: "היום", "7d": "7 ימים", "30d": "30 יום" };
/** היום הראשון בטווח (כולל). */
export const rangeStart = (r: StudioRange, today: string) => (r === "today" ? today : addDaysKey(today, r === "7d" ? -6 : -29));

export interface DailyLike { days: Array<{ day: string; views: number; clicks: number }>; reach: number }
export interface StudioCampaignLike extends CampaignLike {
  id: string; name: string; advertiser: string; advertiser_id: string; phase: CampaignPhase; phase_label: string; tone: Tone;
  views: number; clicks: number; today_views: number; today_clicks: number; placements: AdFormat[];
  advertiser_logo: string | null; advertiser_color: string | null;
}
export interface StudioKpis { views: number | null; clicks: number | null; ctr: string; active: number; reach: number | null; partial: boolean }

/**
 * המדדים לטווח: היום — מ-ad_totals (מדויק תמיד); 7 / 30 יום — מסכום הימים של כל קמפיין. קמפיין שהימים שלו לא נקראו (null) —
 * partial, ואם אף אחד לא נקרא — "—" (לא 0). אנשים שונים — סכום לפי קמפיין (אדם שראה שני קמפיינים נספר פעמיים).
 */
export function studioKpis(campaigns: StudioCampaignLike[], daily: Record<string, DailyLike | null>, range: StudioRange, today: string): StudioKpis {
  const active = campaigns.filter((c) => c.phase === "running").length;
  const loaded = Object.keys(daily).filter((id) => daily[id]);
  const failed = Object.keys(daily).filter((id) => daily[id] === null);
  const reach = loaded.length ? loaded.reduce((s, id) => s + (daily[id]?.reach ?? 0), 0) : failed.length ? null : 0;
  if (range === "today") {
    const views = campaigns.reduce((s, c) => s + c.today_views, 0);
    const clicks = campaigns.reduce((s, c) => s + c.today_clicks, 0);
    return { views, clicks, ctr: fmtCtr(views, clicks), active, reach, partial: failed.length > 0 };
  }
  const from = rangeStart(range, today);
  if (failed.length && !loaded.length) return { views: null, clicks: null, ctr: "—", active, reach: null, partial: true };
  let views = 0, clicks = 0;
  for (const id of loaded) for (const d of daily[id]!.days) if (d.day >= from && d.day <= today) { views += d.views; clicks += d.clicks; }
  return { views, clicks, ctr: fmtCtr(views, clicks), active, reach, partial: failed.length > 0 };
}

/** מספר הימים מ-a עד b (מפתחות YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const t = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}
/** "מסתיים בעוד 5 ימים" / "מסתיים היום" / "מתחיל בעוד 3 ימים" / "הסתיים ב-12.11". טיוטה — null. */
export function whenText(c: { phase: CampaignPhase; starts_on: string; ends_on: string }, today: string): string | null {
  if (c.phase === "draft") return null;
  const short = (k: string) => `${Number(k.slice(8, 10))}.${Number(k.slice(5, 7))}`;
  if (c.phase === "ended" || c.phase === "goal") return `הסתיים ב-${short(c.ends_on)}`;
  if (c.phase === "scheduled" && c.starts_on > today) {
    const d = daysBetween(today, c.starts_on);
    return d === 1 ? "מתחיל מחר" : `מתחיל בעוד ${d} ימים`;
  }
  const d = daysBetween(today, c.ends_on);
  return d <= 0 ? "מסתיים היום" : d === 1 ? "מסתיים מחר" : `מסתיים בעוד ${d} ימים`;
}

export interface PaceView { state: "on_track" | "behind" | "ahead"; label: string; pct: number; expectedPct: number }
/** קצב מול היעד (אותה נוסחה כמו ad_next): "בקצב" / "מאחור" / "לפני הקצב"; בלי יעד — null. */
export function paceView(c: CampaignLike & { views: number }, now: number = Date.now()): PaceView | null {
  const p = pacing(c, c.views, now);
  if (p.state === "none" || !c.goal_views) return null;
  const label = p.state === "behind" ? "מאחור" : p.state === "ahead" ? "לפני הקצב" : "בקצב";
  return { state: p.state, label, pct: Math.min(100, Math.round((c.views / c.goal_views) * 100)), expectedPct: Math.round(p.frac * 100) };
}

/** 7 הימים האחרונים (מהישן לחדש), יום בלי נתונים = 0; הימים לא נקראו — null. */
export function sparkValues(d: DailyLike | null | undefined, today: string): number[] | null {
  if (!d) return null;
  const m = new Map(d.days.map((x) => [x.day, x.views]));
  return Array.from({ length: 7 }, (_, i) => m.get(addDaysKey(today, i - 6)) ?? 0);
}
/** קו SVG — הזמן מימין לשמאל (כמו הגרף של הפאנל: הישן מימין, היום משמאל); הערך הגבוה למעלה; הכל 0 — קו שטוח בתחתית. */
export function sparkPath(values: number[], w: number, h: number): string {
  if (!values.length) return "";
  const max = Math.max(...values);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values.map((v, i) => `${i ? "L" : "M"}${Math.round((w - i * step) * 10) / 10},${Math.round((max ? h - (v / max) * h : h) * 10) / 10}`).join(" ");
}

const PALETTE = ["#2563EB", "#16A34A", "#DC2626", "#D97706", "#7C3AED", "#0891B2", "#DB2777", "#4F46E5"];
/** הדמות של מפרסם: הלוגו אם יש; אחרת האות הראשונה על צבע המותג (או צבע קבוע לפי השם). */
export function avatarOf(name: string, logo: string | null, color: string | null): { logo: string | null; initial: string; color: string } {
  const t = name.trim();
  let hash = 0;
  for (let i = 0; i < t.length; i++) hash = (hash * 31 + t.charCodeAt(i)) >>> 0;
  return { logo, initial: t ? t.charAt(0).toUpperCase() : "?", color: isHexColor(color) ? color : PALETTE[hash % PALETTE.length] };
}

export function tabCounts(list: Array<{ phase: CampaignPhase }>): Record<StudioTab, number> {
  const out: Record<StudioTab, number> = { running: 0, scheduled: 0, draft: 0, paused: 0, ended: 0, all: list.length };
  for (const c of list) out[tabOf(c.phase)]++;
  return out;
}
export function filterCampaigns<T extends { phase: CampaignPhase; name: string; advertiser: string; advertiser_id: string }>(
  list: T[], f: { tab: StudioTab; q: string; advertiser: string },
): T[] {
  const q = f.q.trim().toLowerCase();
  return list.filter((c) => (f.tab === "all" || tabOf(c.phase) === f.tab)
    && (!f.advertiser || c.advertiser_id === f.advertiser)
    && (!q || c.name.toLowerCase().includes(q) || c.advertiser.toLowerCase().includes(q)));
}

// ── האשף ──

export const HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"] as const;
/** "פיצה השכונה · נובמבר 2026". */
export const suggestedName = (advertiser: string, today: string) =>
  `${advertiser.trim() || "קמפיין"} · ${HE_MONTHS[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}`;

export const TEMPLATES = [
  { key: "sale", label: "מבצע", headline: "מבצע לדיירי הבניין", body: "הנחה מיוחדת רק השבוע — מציגים את האפליקציה ומקבלים.", cta_label: "למבצע" },
  { key: "event", label: "אירוע", headline: "מוזמנים לאירוע בשכונה", body: "ערב פתוח לכל המשפחה, הכניסה חופשית. מספר המקומות מוגבל.", cta_label: "להרשמה" },
  { key: "new", label: "שירות חדש", headline: "חדש בשכונה", body: "פתחנו שירות חדש קרוב לבית — שירות מהיר, אישי ובמחיר הוגן.", cta_label: "לפרטים" },
  { key: "perk", label: "הטבה לדיירים", headline: "הטבה בלעדית לדיירים", body: "הטבה קבועה לכל דיירי הבניין, בלי קוד ובלי הרשמה.", cta_label: "לקבלת ההטבה" },
] as const;

export interface CampaignForm {
  name: string; contract_id: string; starts_on: string; ends_on: string; days: number[]; hour_from: number; hour_to: number;
  screens: AdScreen[]; plans: AdPlan[]; roles: AdRole[]; cities: string[]; building_ids: string[];
  goal: string; daily: string; per_user: number; weight: number;
}
export const SCHEDULE_PRESETS = [
  { key: "allday", label: "כל היום", hours: [0, 24] as [number, number] },
  { key: "evening", label: "ערב", hours: [17, 22] as [number, number] },
  { key: "weekend", label: "סופ״ש", days: [5, 6] },
] as const;
type Preset = typeof SCHEDULE_PRESETS[number];
export function applyPreset(f: CampaignForm, p: Preset): CampaignForm {
  if ("hours" in p) return { ...f, hour_from: p.hours[0], hour_to: p.hours[1] };
  return { ...f, days: [...p.days] };
}
export function presetOn(f: Pick<CampaignForm, "days" | "hour_from" | "hour_to">, p: Preset): boolean {
  if ("hours" in p) return f.hour_from === p.hours[0] && f.hour_to === p.hours[1];
  return [...f.days].sort().join() === [...p.days].sort().join();
}
/** טווח השעות מהסליידר — תמיד from < to, בתוך 0..24. */
export function setHours(from: number, to: number): { hour_from: number; hour_to: number } {
  const a = Math.min(23, Math.max(0, Math.round(from)));
  const b = Math.min(24, Math.max(1, Math.round(to)));
  return b > a ? { hour_from: a, hour_to: b } : { hour_from: a, hour_to: Math.min(24, a + 1) };
}
/** כמה ימי הצגה בתקופה (לפי הימים בשבוע שנבחרו). */
export function servingDays(starts: string, ends: string, days: number[]): number {
  if (!starts || !ends || ends < starts) return 0;
  const total = daysBetween(starts, ends) + 1;
  if (total > 800) return 0;
  let n = 0;
  for (let i = 0; i < total; i++) {
    const k = addDaysKey(starts, i);
    if (days.includes(new Date(`${k}T12:00:00Z`).getUTCDay())) n++;
  }
  return n;
}
/** "יעד של 10,000 חשיפות ב-30 ימים — כ-334 ביום." בלי יעד / בלי ימים — null. */
export function pacingHint(f: Pick<CampaignForm, "goal" | "starts_on" | "ends_on" | "days">): string | null {
  const goal = Number(f.goal.replace(/[,\s]/g, ""));
  if (!Number.isFinite(goal) || goal <= 0) return null;
  const d = servingDays(f.starts_on, f.ends_on, f.days);
  if (!d) return null;
  return `יעד של ${fmtInt(goal)} חשיפות ב-${fmtInt(d)} ימי הצגה — כ-${fmtInt(Math.ceil(goal / d))} ביום. הקמפיין מתפרס באופן אחיד עד הסוף.`;
}

// ── דף קמפיין: הלשוניות (?tab=) — כאן ולא ברכיב: דף השרת קורא את זה (פונקציה מקובץ "use client" לא רצה בשרת) ──
export const CAMPAIGN_TABS = [
  { key: "performance", label: "ביצועים" }, { key: "ads", label: "מודעות" }, { key: "audience", label: "קהל ותזמון" },
  { key: "why", label: "למה לא מוצג?" }, { key: "history", label: "היסטוריה" },
] as const;
export type CampaignTab = typeof CAMPAIGN_TABS[number]["key"];
export const campaignTabOf = (v: unknown): CampaignTab => (CAMPAIGN_TABS.some((t) => t.key === v) ? v as CampaignTab : "performance");

export const WIZARD_STEPS = ["מפרסם", "מודעות", "קהל", "תזמון ויעד", "סקירה ופרסום"] as const;
/** קמפיין חדש: היום עד עוד 29 יום, כל הימים 08:00–22:00, כל המסכים, התנסות ו-Core, דיירים וועד, 3 פעמים לאדם. */
export function newCampaignForm(today: string, contractId = "", name = ""): CampaignForm {
  return {
    name, contract_id: contractId, starts_on: today, ends_on: addDaysKey(today, 29), days: [0, 1, 2, 3, 4, 5, 6], hour_from: 8, hour_to: 22,
    screens: ["home", "market", "events"], plans: ["free", "building"], roles: ["tenant", "committee"], cities: [], building_ids: [],
    goal: "", daily: "", per_user: 3, weight: 1,
  };
}
export function formFromCampaign(c: {
  name: string; contract_id: string; starts_on: string; ends_on: string; days: number[]; hour_from: number; hour_to: number;
  screens: AdScreen[]; plans: AdPlan[]; roles: AdRole[]; cities: string[]; building_ids: string[];
  goal_views: number | null; daily_cap: number | null; per_user_cap: number; weight: number;
}): CampaignForm {
  return {
    name: c.name, contract_id: c.contract_id, starts_on: c.starts_on, ends_on: c.ends_on, days: [...c.days], hour_from: c.hour_from, hour_to: c.hour_to,
    screens: [...c.screens], plans: [...c.plans], roles: [...c.roles], cities: [...c.cities], building_ids: [...c.building_ids],
    goal: c.goal_views != null ? String(c.goal_views) : "", daily: c.daily_cap != null ? String(c.daily_cap) : "",
    per_user: c.per_user_cap || 3, weight: c.weight || 1,
  };
}
/** למה אי אפשר לשמור עכשיו (משפט אחד; null — אפשר). אותם כללים כמו הסכמה — כדי לא לשלוח שמירה שתידחה. */
export function formProblem(f: CampaignForm): string | null {
  if (f.name.trim().length < 2) return "חסר שם לקמפיין (לפחות 2 תווים).";
  if (!f.contract_id) return "לא נבחר חוזה.";
  if (!f.starts_on || !f.ends_on) return "חסרים תאריכים.";
  if (f.ends_on < f.starts_on) return "תאריך הסיום לפני תאריך ההתחלה.";
  if (!f.days.length) return "בחרו לפחות יום אחד.";
  if (f.hour_to <= f.hour_from) return "שעת הסיום צריכה להיות אחרי שעת ההתחלה.";
  const bad = (v: string) => { const t = v.trim().replace(/[,\s]/g, ""); return !!t && !/^[1-9][0-9]{0,8}$/.test(t); };
  if (bad(f.goal)) return "יעד החשיפות — מספר שלם חיובי (או ריק).";
  if (bad(f.daily)) return "התקרה ליום — מספר שלם חיובי (או ריק).";
  return null;
}
/** באיזה שלב פותחים טיוטה: ?step=N כשהוא תקין; בלי מודעות — "מודעות"; יש — "סקירה ופרסום". קמפיין חדש — 1. */
export function wizardStep(hasCampaign: boolean, creatives: number, q?: string | null): number {
  if (!hasCampaign) return 1;
  const n = Number(q);
  if (Number.isInteger(n) && n >= 1 && n <= WIZARD_STEPS.length) return n;
  return creatives ? 5 : 2;
}

const intOrNull = (v: string): number | null => { const t = v.trim().replace(/[,\s]/g, ""); if (!t) return null; const x = Number(t); return Number.isFinite(x) ? Math.trunc(x) : null; };
/** campaign.save (C3, בלי פורמט) מהטופס. */
export function campaignPayload(id: string | null, f: CampaignForm): Record<string, unknown> {
  return {
    action: "campaign.save", ...(id ? { id } : {}), contract_id: f.contract_id, name: f.name.trim(), starts_on: f.starts_on, ends_on: f.ends_on,
    days: f.days, hour_from: f.hour_from, hour_to: f.hour_to, screens: f.screens, plans: f.plans, roles: f.roles,
    cities: f.cities, building_ids: f.building_ids, goal_views: intOrNull(f.goal), daily_cap: intOrNull(f.daily),
    per_user_cap: f.per_user, weight: f.weight,
  };
}

// ── המודעה (C5 v2): טופס אחד לכמה פורמטים ──

export interface ImagePick { image_url: string; image_alt: string; focal: [number, number] }
export interface CreativeForm {
  formats: AdFormat[];
  /** התמונה המשותפת לפורמטים עם תמונה אחת; overrides — תמונה נפרדת לפורמט. */
  image: ImagePick;
  overrides: Partial<Record<AdFormat, ImagePick>>;
  /** תמונות לסטורי / לקרוסלה (משותפות לשניהם). */
  frames: FrameDraft[];
  headline: string; body: string; cta_label: string; cta_url: string;
  theme: AdTheme; accent: string | null; banner_position: BannerPosition;
  /** ADS-2ב1 (החלטה 388): קוד קופון וסוף המבצע (YYYY-MM-DD) — משותפים לכל הפורמטים; "" — אין. */
  coupon_code: string; offer_ends_on: string;
}
export const emptyImage = (): ImagePick => ({ image_url: "", image_alt: "", focal: [0.5, 0.5] });
/** brand — צבע המותג (ברירת המחדל של הכפתור); מותג שהטקסט עליו לא קריא — הגוון הקרוב שעובר (אחרת לא היה אפשר לשמור). */
export function emptyCreativeForm(key: (i: number) => string, brand: string | null = null): CreativeForm {
  return {
    formats: ["card"], image: emptyImage(), overrides: {}, frames: framesToDrafts(null, key),
    headline: "", body: "", cta_label: "לפרטים", cta_url: "", theme: "light", accent: accessibleAccent(brand), banner_position: "bottom",
    coupon_code: "", offer_ends_on: "",
  };
}
/** סקירה #9 — כמו ב-bloc: צבע כפתור שגם לבן וגם כהה לא מגיעים עליו ל-4.5:1 לא נשמר. */
export const ACCENT_LOW_TEXT = "צבע הכפתור לא קריא: גם טקסט לבן וגם כהה מגיעים עליו לפחות מ-4.5:1, ו-bloc לא שומר צבע כזה. בחרו צבע כהה או בהיר יותר.";
export const accentIssue = (accent: string | null): string | null => (isHexColor(accent) && !contrastInfo(accent).ok ? ACCENT_LOW_TEXT : null);

/** סקירה #12: "ממומן · <מפרסם>" היא שורה אחת — בפס, בסטורי ובמסך מלא שם ארוך מ-30 תווים נחתך. */
export const ADVERTISER_NAME_SHOWN = 30;
export const longAdvertiserName = (name: string): boolean => name.trim().length > ADVERTISER_NAME_SHOWN;
export const longAdvertiserText = (name: string) =>
  `שם ארוך ייחתך בפס: "ממומן · ${name.trim()}" היא שורה אחת, ושם של יותר מ-${ADVERTISER_NAME_SHOWN} תווים (כאן ${name.trim().length}) ייחתך בפס, בסטורי ובמסך מלא.`;
/** התמונה של פורמט עם תמונה אחת: נפרדת אם יש, אחרת המשותפת. */
export const imageFor = (f: CreativeForm, format: AdFormat): ImagePick => f.overrides[format] ?? f.image;

/** מודעה קיימת → טופס (לעריכה, או לשכפול כמודעה חדשה). */
export function formFromCreative(c: {
  format: AdFormat; image_url: string; image_alt: string; focal_x: number; focal_y: number; frames: AdFrame[] | null;
  headline: string; body: string | null; cta_label: string; cta_url: string; theme: AdTheme; accent: string | null; banner_position: BannerPosition | null;
  coupon_code?: string | null; offer_ends_on?: string | null;
}, key: (i: number) => string): CreativeForm {
  const cover = c.image_url ? [{ image_url: c.image_url, image_alt: c.image_alt, caption: null, cta_url: null, focal: [c.focal_x, c.focal_y] as [number, number] }] : null;
  return {
    formats: [c.format], image: { image_url: c.image_url, image_alt: c.image_alt, focal: [c.focal_x, c.focal_y] }, overrides: {},
    frames: framesToDrafts(c.frames ?? cover, key), headline: c.headline, body: c.body ?? "", cta_label: c.cta_label, cta_url: c.cta_url,
    theme: c.theme, accent: c.accent, banner_position: c.banner_position ?? "bottom",
    coupon_code: c.coupon_code ?? "", offer_ends_on: c.offer_ends_on ?? "",
  };
}

/**
 * ADS-2ב1: הקוד וסוף המבצע — משותפים לכל הפורמטים, ולכן נאמרים פעם אחת (כמו צבע הכפתור) ועוצרים את השמירה, כמו ב-bloc (400 invalid,
 * field coupon_code / offer_ends_on). today — היום לפי שעון ישראל.
 */
export function offerIssues(f: Pick<CreativeForm, "coupon_code" | "offer_ends_on">, today: string): string[] {
  return [couponIssue(f.coupon_code), offerIssue(f.offer_ends_on, today)].filter((x): x is string => !!x);
}
/** מה נשלח: הקוד אחרי trim ואותיות גדולות, סוף המבצע — כמו שהוא; ריק — null (נשלחים תמיד, כך שניקוי מנקה גם ב-bloc). */
export function offerFields(f: Pick<CreativeForm, "coupon_code" | "offer_ends_on">): { coupon_code: string | null; offer_ends_on: string | null } {
  return { coupon_code: normalizeCoupon(f.coupon_code) || null, offer_ends_on: f.offer_ends_on.trim() || null };
}

const httpsOk = (u: string) => /^https:\/\/\S+$/.test(u.trim());
/** למה הפורמט עוד לא מוכן — במשפטים (ריק = מוכן). */
export function formIssues(format: AdFormat, f: CreativeForm, base: string | null): string[] {
  const out: string[] = [];
  if (FORMAT_INFO[format].frames) {
    // התמונות משותפות לסטורי ולקרוסלה: בסטורי הקישור של כל תמונה לא נשלח (framesPayload), ולכן גם לא נבדק.
    const frames = format === "carousel" ? f.frames : f.frames.map((x) => ({ ...x, cta_url: "" }));
    if (!framesReady(frames, format, base)) out.push(format === "carousel"
      ? "כל כרטיס צריך תמונה שהועלתה ותיאור (2 עד 200 תווים); קישור לכרטיס — כתובת מלאה שמתחילה ב-https://."
      : "כל תמונה צריכה תמונה שהועלתה ותיאור (2 עד 200 תווים).");
  } else {
    const img = imageFor(f, format);
    if (!img.image_url) out.push("חסרה תמונה.");
    else if (isOurAdImage(img.image_url, base) === false) out.push("התמונה מאתר אחר — מעלים אותה בכפתור ההעלאה.");
    if (img.image_alt.trim().length < 2) out.push("חסר תיאור של התמונה (לקורא מסך).");
  }
  if (f.headline.trim().length < 2) out.push("חסרה כותרת.");
  if (f.cta_label.trim().length < 2) out.push("חסר טקסט לכפתור.");
  if (!httpsOk(f.cta_url)) out.push("חסר קישור מלא שמתחיל ב-https://.");
  return out;
}

/** creative.save (C5 v2) לפורמט אחד מהטופס. סטורי / קרוסלה — image_url / image_alt / focal = התמונה הראשונה. */
export function creativePayloadFor(format: AdFormat, f: CreativeForm, campaignId: string, id?: string): Record<string, unknown> {
  const multi = FORMAT_INFO[format].frames;
  const frames = multi ? framesPayload(f.frames, format) : null;
  const img = multi ? { image_url: frames![0]?.image_url ?? "", image_alt: frames![0]?.image_alt ?? "", focal: f.frames[0]?.focal ?? [0.5, 0.5] } : imageFor(f, format);
  return {
    action: "creative.save", ...(id ? { id } : {}), campaign_id: campaignId, format,
    banner_position: format === "banner" ? f.banner_position : null,
    image_url: img.image_url.trim(), image_alt: img.image_alt.trim(), focal_x: roundFocal(img.focal[0]), focal_y: roundFocal(img.focal[1]),
    headline: f.headline.trim(), body: f.body.trim(), cta_label: f.cta_label.trim(), cta_url: f.cta_url.trim(),
    theme: f.theme, accent: f.accent, frames, ...offerFields(f),
  };
}

/**
 * ADS-2ב1 (החלטה 388): מודעה שכבר הוצגה — רק הקוד וסוף המבצע משתנים (ad_creative_guard של bloc נועל את השאר, ומתיר את שני אלה:
 * הארכת מבצע היא דבר רגיל). creative.save עם אותו id ובדיוק הערכים השמורים — מהשורה עצמה, לא מהטופס — ועוד הקוד והתאריך החדשים.
 * כל ערך אחר שהיה שונה היה נדחה ב-bloc (409 locked) — לכן גם התמונות בסטורי / בקרוסלה נשלחות כמו ששמורות (focal כשיש).
 */
export function offerPayloadFor(c: {
  id: string; campaign_id: string; format: AdFormat; banner_position: BannerPosition | null; image_url: string; image_alt: string;
  focal_x: number; focal_y: number; headline: string; body: string | null; cta_label: string; cta_url: string; theme: AdTheme;
  accent: string | null; frames: AdFrame[] | null;
}, offer: Pick<CreativeForm, "coupon_code" | "offer_ends_on">): Record<string, unknown> {
  const frames = FORMAT_INFO[c.format].frames && c.frames
    ? c.frames.map((x) => ({
      image_url: x.image_url, image_alt: x.image_alt,
      ...(x.caption ? { caption: x.caption } : {}), ...(x.cta_url ? { cta_url: x.cta_url } : {}), ...(x.focal ? { focal: x.focal } : {}),
    }))
    : null;
  return {
    action: "creative.save", id: c.id, campaign_id: c.campaign_id, format: c.format,
    banner_position: c.format === "banner" ? c.banner_position : null,
    image_url: c.image_url, image_alt: c.image_alt, focal_x: c.focal_x, focal_y: c.focal_y,
    headline: c.headline, body: c.body ?? "", cta_label: c.cta_label, cta_url: c.cta_url, theme: c.theme, accent: c.accent, frames,
    ...offerFields(offer),
  };
}

/**
 * הקישור הסופי שהדייר יפתח — אותו כלל כמו ctaHref ב-bloc (src/lib/ads.ts): כשאין בקישור utm_source, bloc מוסיף
 * utm_source=bloc, utm_medium=sponsored ו-utm_campaign=c-<8 התווים הראשונים של מזהה הקמפיין>; כשיש — לא נוגע.
 */
export const UTM_PARAMS: ReadonlyArray<[string, string]> = [["utm_source", "bloc"], ["utm_medium", "sponsored"]];
const CAMPAIGN_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function finalLink(url: string, campaignId?: string | null): { href: string; own: boolean } | null {
  if (!httpsOk(url)) return null;
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  const own = u.searchParams.has("utm_source");
  if (!own) {
    for (const [k, v] of UTM_PARAMS) u.searchParams.set(k, v);
    if (campaignId && CAMPAIGN_UUID.test(campaignId)) u.searchParams.set("utm_campaign", `c-${campaignId.slice(0, 8).toLowerCase()}`);
  }
  return { href: u.toString(), own };
}

// ── "צור מודעה בכל פורמט שבחרתי": אחת אחרי השנייה ──

export type BatchState = "waiting" | "saving" | "ok" | "failed" | "unclear";
export interface BatchItem { format: AdFormat; state: BatchState; error?: string; id?: string }
export const batchStart = (formats: AdFormat[]): BatchItem[] => AD_FORMATS.filter((f) => formats.includes(f)).map((format) => ({ format, state: "waiting" as const }));
/** הבא בתור — רק כשאין תשובה לא ברורה (ייתכן שבוצע): אז עוצרים. */
export function batchNext(items: BatchItem[]): number | null {
  if (items.some((i) => i.state === "unclear")) return null;
  const i = items.findIndex((x) => x.state === "waiting");
  return i < 0 ? null : i;
}
export const batchDone = (items: BatchItem[]) => items.length > 0 && items.every((i) => i.state === "ok");
export const batchStopped = (items: BatchItem[]) => items.some((i) => i.state === "unclear");
export type BatchAnswer = { ok: true; id: string } | { ok: false; error: string; unclear: boolean };
/**
 * הריצה עצמה: אחד אחרי השני (אף פעם לא במקביל); נכשל — מסומן, וממשיכים לבא בתור (לכל אחד "נסו שוב"); לא ברור (ייתכן שנוצר) —
 * עוצרים: אף בקשה נוספת. onUpdate — אחרי כל שינוי (המסך מראה תוצאה לכל פורמט).
 */
export async function runBatch(start: BatchItem[], send: (format: AdFormat) => Promise<BatchAnswer>, onUpdate: (items: BatchItem[]) => void): Promise<BatchItem[]> {
  let list = start;
  onUpdate(list);
  for (let i = batchNext(list); i !== null; i = batchNext(list)) {
    const idx = i;
    list = list.map((x, j) => (j === idx ? { format: x.format, state: "saving" as const } : x));
    onUpdate(list);
    const r = await send(list[idx].format);
    list = list.map((x, j) => (j !== idx ? x : r.ok
      ? { format: x.format, state: "ok" as const, id: r.id }
      : { format: x.format, state: r.unclear ? "unclear" as const : "failed" as const, error: r.error }));
    onUpdate(list);
  }
  return list;
}

// ── שמירה אוטומטית של הטיוטה (האשף) ──

export type SaveState = "idle" | "saving" | "saved" | "error" | "unclear";
export interface Autosave<F> { change(f: F): void; flush(): Promise<boolean>; retry(): Promise<boolean>; dispose(): void }
/**
 * כל שינוי — שמירה אחרי השהיה (delay); flush — עכשיו (מעבר שלב, פרסום). השמירות רצות אחת אחרי השנייה, תמיד עם הטופס האחרון;
 * טופס שהסכמה תדחה — לא נשלח ("לא נשמר — <הסיבה>"); נכשל — "לא נשמר" ונשאר "מלוכלך" (נסו שוב); לא ברור — "ייתכן שנשמר — רעננו".
 */
export function createAutosave<F>(initial: F, o: {
  delay: number; problem: (f: F) => string | null;
  send: (f: F) => Promise<{ ok: true } | { ok: false; error: string; unclear?: boolean }>;
  onState: (s: SaveState, error: string | null) => void;
  setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (t: unknown) => void;
}): Autosave<F> {
  let latest = initial;
  let dirty = false;
  let timer: unknown = null;
  let chain: Promise<boolean> = Promise.resolve(true);
  const setT = o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = o.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const stop = () => { if (timer !== null) { clearT(timer); timer = null; } };
  async function saveNow(): Promise<boolean> {
    if (!dirty) return true;
    const problem = o.problem(latest);
    if (problem) { o.onState("error", problem); return false; }
    dirty = false;
    o.onState("saving", null);
    const r = await o.send(latest);
    if (!r.ok) { dirty = true; o.onState(r.unclear ? "unclear" : "error", r.error); return false; }
    o.onState(dirty ? "saving" : "saved", null);
    return true;
  }
  const api: Autosave<F> = {
    change(f) { latest = f; dirty = true; stop(); timer = setT(() => { timer = null; void api.flush(); }, o.delay); },
    flush() { stop(); chain = chain.then(saveNow, saveNow); return chain; },
    retry() { dirty = true; return api.flush(); },
    dispose: stop,
  };
  return api;
}

// ── הסקירה: מה חסר לפני פרסום ──

export interface CheckItem { key: "advertiser" | "contract" | "ads" | "texts" | "audience" | "schedule"; ok: boolean; text: string; step: 1 | 2 | 3 | 4 }
export function reviewChecklist(i: {
  advertiserId: string;
  contract: { status: string; starts_on: string; ends_on: string } | null;
  form: Pick<CampaignForm, "starts_on" | "ends_on" | "days" | "hour_from" | "hour_to" | "screens" | "plans" | "roles">;
  /** ended (ADS-2ב1) — המבצע של המודעה הסתיים: היא לא מוגשת, ולכן לא נספרת כמוכנה. */
  creatives: Array<{ active: boolean; ready: boolean; headline: string; image_alt: string; cta_label: string; ended?: boolean }>;
  today: string;
}): CheckItem[] {
  const f = i.form;
  const k = i.contract;
  const covers = !!k && k.starts_on <= f.starts_on && k.ends_on >= f.ends_on;
  const activeReady = i.creatives.filter((c) => c.active && c.ready && !c.ended);
  const activeEnded = i.creatives.filter((c) => c.active && c.ended).length;
  const textsOk = i.creatives.filter((c) => c.active).every((c) => c.headline.trim().length >= 2 && c.image_alt.trim().length >= 2 && c.cta_label.trim().length >= 2);
  const schedOk = !!f.starts_on && !!f.ends_on && f.ends_on >= f.starts_on && f.ends_on >= i.today && f.days.length > 0 && f.hour_to > f.hour_from;
  return [
    { key: "advertiser", step: 1, ok: !!i.advertiserId, text: i.advertiserId ? "מפרסם נבחר." : "לא נבחר מפרסם." },
    {
      key: "contract", step: 1, ok: !!k && k.status === "active" && covers,
      text: !k ? "לא נבחר חוזה." : k.status !== "active" ? "החוזה עדיין לא פעיל — מסמנים אותו כפעיל בדף המפרסם." : covers ? "החוזה פעיל ומכסה את התאריכים." : "החוזה לא מכסה את כל התאריכים של הקמפיין.",
    },
    {
      key: "ads", step: 2, ok: activeReady.length > 0,
      text: activeReady.length ? `${activeReady.length === 1 ? "מודעה פעילה אחת" : `${activeReady.length} מודעות פעילות`} עם תמונות שהועלו ל-bloc.`
        : activeEnded ? "המבצע הסתיים בכל המודעות הפעילות — מאריכים את סוף המבצע או מוסיפים מודעה." : "אין מודעה פעילה עם תמונות שהועלו ל-bloc.",
    },
    { key: "texts", step: 2, ok: textsOk, text: textsOk ? "לכל מודעה פעילה יש כותרת, כפתור ותיאור לתמונה." : "למודעה פעילה חסרים כותרת, כפתור או תיאור לתמונה." },
    { key: "audience", step: 3, ok: f.screens.length > 0 && f.plans.length > 0 && f.roles.length > 0, text: f.screens.length && f.plans.length && f.roles.length ? "נבחרו מסכים, מסלולים וקהל." : "חסר מסך, מסלול או קהל." },
    { key: "schedule", step: 4, ok: schedOk, text: schedOk ? "התאריכים, הימים והשעות תקינים." : "התזמון לא תקין: תאריך סיום שעבר, בלי ימים, או שעת סיום לפני ההתחלה." },
  ];
}

// ── הדוח: המודעה הטובה ביותר, לפי פורמט ──

export const BEST_MIN_VIEWS = 500;
/** הכי טובה: ה-CTR הגבוה ביותר — רק כשמשווים לפחות שתיים, ולכל אחת לפחות 500 חשיפות; שוויון בראש — אין. */
export function bestAd(rows: Array<{ creative_id: string; views: number; clicks: number }>): string | null {
  if (rows.length < 2 || rows.some((r) => r.views < BEST_MIN_VIEWS)) return null;
  const ctr = (r: { views: number; clicks: number }) => r.clicks / r.views;
  const sorted = [...rows].sort((a, b) => ctr(b) - ctr(a));
  return ctr(sorted[0]) > ctr(sorted[1]) ? sorted[0].creative_id : null;
}
export function byFormat(rows: Array<{ creative_id: string; serves: number; views: number; clicks: number; copies?: number }>, formatOf: (id: string) => AdFormat | undefined) {
  const m = new Map<AdFormat, { format: AdFormat; ads: number; serves: number; views: number; clicks: number; copies: number }>();
  for (const r of rows) {
    const f = formatOf(r.creative_id);
    if (!f) continue;
    const x = m.get(f) ?? { format: f, ads: 0, serves: 0, views: 0, clicks: 0, copies: 0 };
    x.ads++; x.serves += r.serves; x.views += r.views; x.clicks += r.clicks; x.copies += r.copies ?? 0;
    m.set(f, x);
  }
  return AD_FORMATS.filter((f) => m.has(f)).map((f) => m.get(f)!);
}

// ── מד הקהל (ad_estimate_reach, החלטה 382) ──

export type ReachState =
  | { kind: "idle" } | { kind: "loading" } | { kind: "ok"; users: number; buildings: number; under10: boolean }
  | { kind: "sql_missing" } | { kind: "failed" };
/** התשובה של ad_estimate_reach: {users, buildings, under_10?} — מספרים בלבד. אחרת null. */
export function parseEstimate(raw: unknown): { users: number; buildings: number; under10: boolean } | null {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  if (!r) return null;
  const u = Number(r.users), b = Number(r.buildings);
  if (!Number.isInteger(u) || !Number.isInteger(b) || u < 0 || b < 0) return null;
  const under10 = r.under_10 === true;
  return { users: under10 ? 0 : u, buildings: b, under10 };
}
/** התשובה של /api/ads/estimate → מצב המד: 503 sql_missing — "אחרי SQL 230"; רק ok === true עם מספרים תקינים — הערכה; כל השאר — נכשל (לא 0). */
export function estimateAnswer(status: number, body: unknown): ReachState {
  const b = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  if (status === 503 && b?.code === "sql_missing") return { kind: "sql_missing" };
  if (status < 200 || status > 299 || !b || b.ok !== true) return { kind: "failed" };
  const e = parseEstimate({ users: b.users, buildings: b.buildings, under_10: b.under10 });
  return e ? { kind: "ok", ...e } : { kind: "failed" };
}
/** מה נשלח להערכה — רק שדות הקהל (ממוינים, בלי כפילויות: אותו קהל = אותה בקשה). */
export function estimateBody(a: Pick<CampaignForm, "screens" | "plans" | "roles" | "cities" | "building_ids">): Record<string, string[]> {
  const u = (x: readonly string[]) => [...new Set(x)].sort();
  return { screens: u(a.screens), plans: u(a.plans), roles: u(a.roles), cities: u(a.cities), building_ids: u(a.building_ids) };
}
export const ESTIMATE_SQL_MISSING_TEXT = "ההערכה תופיע אחרי SQL 230";
/** bloc סופר רק בניינים עם 10 מתאימים לפחות (k = 10 לכל בניין, החלטה 382 אחרי הסקירה) — נאמר מתחת למד. */
export const ESTIMATE_K_TEXT = "בניינים עם פחות מ-10 מתאימים לא נספרים.";
export const ESTIMATE_FAILED_TEXT = "לא הצלחנו להעריך כרגע";
export function reachText(s: ReachState): string {
  switch (s.kind) {
    case "ok": return s.under10 ? "פחות מ-10 משתמשים" : `כ-${fmtInt(s.users)} משתמשים ב-${fmtInt(s.buildings)} ${s.buildings === 1 ? "בניין" : "בניינים"}`;
    case "loading": return "מעריכים…";
    case "sql_missing": return ESTIMATE_SQL_MISSING_TEXT;
    case "failed": return ESTIMATE_FAILED_TEXT;
    default: return "";
  }
}

