// src/lib/adsFormats.ts — הפורמטים של המודעות (bloc ADS-2א v2, החלטות 376–380, 382–383). דפדפן ושרת, טהור (בלי I/O).
//
// v2: הפורמט שייך למודעה (ad_creatives.format), לא לקמפיין. קמפיין = קהל + תזמון + תקרות; הוא מופיע בכל מקום שהמודעות
// הפעילות שלו מתאימות לו. שבעה פורמטים: card / dialog / fullscreen / story — מעל המסך (slot full); banner — פס למעלה או למטה
// (banner); native / carousel — בתוך הרשימה (inline). סטורי וקרוסלה — 2 עד 5 תמונות (frames); כל השאר — תמונה אחת.
// ההתאמה פנימית לשורה (CHECK ב-DB): frames ⇔ story / carousel, banner_position ⇔ banner.
// כאן: השמות, המידות וקווי החיתוך; נקודת המיקוד (focal) — object-position עם object-fit: cover, כך שתמונה אחת נחתכת טוב בכל
// פורמט; צבע הכפתור (accent) והטקסט עליו — לבן או #0F172A לפי ניגודיות (אותה פונקציה כמו ב-bloc); העריכה של התמונות.
import { isOurAdImage } from "./adsUi";

export const AD_FORMATS = ["card", "dialog", "fullscreen", "story", "banner", "native", "carousel"] as const;
export type AdFormat = typeof AD_FORMATS[number];
export const AD_SLOTS = ["full", "banner", "inline"] as const;
export type AdSlot = typeof AD_SLOTS[number];
export const BANNER_POSITIONS = ["top", "bottom"] as const;
export type BannerPosition = typeof BANNER_POSITIONS[number];
export const AD_THEMES = ["light", "dark"] as const;
export type AdTheme = typeof AD_THEMES[number];

export const DEFAULT_FORMAT: AdFormat = "card";
/** פס חדש — למטה: קבוע מעל הניווט התחתון, ולכן נראה גם כשגוללים (למעלה — נגלל עם התוכן). */
export const DEFAULT_BANNER_POSITION: BannerPosition = "bottom";
export const DEFAULT_THEME: AdTheme = "light";

/** החלטה 376: איפה כל פורמט יכול להופיע (ad_next / ad_explain לפי slot). */
export const FORMAT_SLOT: Record<AdFormat, AdSlot> = {
  card: "full", dialog: "full", fullscreen: "full", story: "full", banner: "banner", native: "inline", carousel: "inline",
};
export const formatSlot = (f: AdFormat): AdSlot => FORMAT_SLOT[f];
/** ה-slots של רשימת פורמטים — בלי כפילות, לפי הסדר של AD_SLOTS. */
export const slotsOf = (formats: readonly AdFormat[]): AdSlot[] => AD_SLOTS.filter((s) => formats.some((f) => FORMAT_SLOT[f] === s));

export const SLOT_LABEL: Record<AdSlot, string> = { full: "מעל המסך", banner: "פס", inline: "ברשימה" };
export const SLOT_FORMATS_TEXT: Record<AdSlot, string> = {
  full: "כרטיס, חלון קופץ, מסך מלא וסטורי",
  banner: "פס למעלה או למטה",
  inline: "כרטיס ברשימה וקרוסלה",
};
export const BANNER_POSITION_LABEL: Record<BannerPosition, string> = { top: "למעלה", bottom: "למטה" };
export const THEME_LABEL: Record<AdTheme, string> = { light: "בהיר", dark: "כהה" };

export interface ImageSpec { w: number; h: number; ratio: string }
export interface FormatInfo {
  label: string;
  /** שורה אחת: איך ואיפה. */
  line: string;
  image: ImageSpec;
  /** סטורי / קרוסלה: 2 עד 5 תמונות. */
  frames: boolean;
  /** בהיר / כהה (פס, כרטיס ברשימה, קרוסלה, חלון קופץ). כרטיס / מסך מלא / סטורי — תמיד כהים מעל התמונה. */
  theme: boolean;
  /** קו החיתוך: מה מכסה את התמונה באפליקציה, ואיפה לשים את העיקר. */
  guide: string;
}

export const FORMAT_INFO: Record<AdFormat, FormatInfo> = {
  card: {
    label: "כרטיס במרכז", line: "כרטיס באמצע המסך, מעל התוכן.", image: { w: 1080, h: 1350, ratio: "4:5" }, frames: false, theme: false,
    guide: "המסגרת היא 4:5. נקודת המיקוד קובעת מה נשאר כשהתמונה ביחס אחר.",
  },
  dialog: {
    label: "חלון קופץ", line: "חלון מעל המסך הנוכחי, שנשאר גלוי מאחור.", image: { w: 1200, h: 675, ratio: "16:9" }, frames: false, theme: true,
    guide: "תמונה רחבה 16:9; בפינה השמאלית העליונה שלה התג \"ממומן\". הטקסט מתחת לתמונה.",
  },
  fullscreen: {
    label: "מסך מלא", line: "תמונה מקצה לקצה, והטקסט עליה בתחתית.", image: { w: 1080, h: 1920, ratio: "9:16" }, frames: false, theme: false,
    guide: "הכותרת, המשפט והכפתור יושבים על השליש התחתון — לא שמים שם טקסט או פנים.",
  },
  story: {
    label: "סטורי ממומן", line: "2 עד 5 תמונות שמתחלפות, עם פסים למעלה.", image: { w: 1080, h: 1920, ratio: "9:16" }, frames: true, theme: false,
    guide: "למעלה הפסים ו\"ממומן\", למטה הכפתור — את העיקר בכל תמונה שמים באמצע.",
  },
  banner: {
    label: "פס", line: "פס צר למעלה או למטה במסך, בלי להסתיר אותו.", image: { w: 1080, h: 1080, ratio: "1:1" }, frames: false, theme: true,
    guide: "התמונה מוצגת קטנה ליד הכותרת: לוגו או מוצר אחד ברור, בלי טקסט בתוך התמונה.",
  },
  native: {
    label: "כרטיס ברשימה", line: "כרטיס בתוך הרשימה, אחרי הפריט השלישי.", image: { w: 1200, h: 628, ratio: "1.91:1" }, frames: false, theme: true,
    guide: "תמונה רחבה, כמו תמונת קישור ברשתות. טקסט בתוך התמונה לא ייקרא בטלפון.",
  },
  carousel: {
    label: "קרוסלה", line: "2 עד 5 כרטיסים בגלילה לצד, בתוך הרשימה.", image: { w: 1080, h: 1080, ratio: "1:1" }, frames: true, theme: true,
    guide: "כל כרטיס ריבוע, עם כיתוב קצר מתחתיו (עד 60 תווים) — ואם רוצים, קישור משלו.",
  },
};

/** "1080×1350" בתוך LRI…PDI: בלי זה המידות מוצגות הפוך בשורה מימין לשמאל. */
export const sizeText = (s: ImageSpec) => `⁦${s.w}×${s.h}⁩`;
export function imageSpecText(f: AdFormat): string {
  const i = FORMAT_INFO[f];
  return `${i.frames ? "כל תמונה" : "תמונה"} ${sizeText(i.image)} (${i.image.ratio})`;
}
export const imageHint = (f: AdFormat) => `JPEG, PNG או WebP, עד 2MB. הכי טוב ${sizeText(FORMAT_INFO[f].image)} (${FORMAT_INFO[f].image.ratio}).`;
export function formatText(f: AdFormat, pos?: BannerPosition | null): string {
  return f === "banner" && pos ? `${FORMAT_INFO.banner.label} · ${BANNER_POSITION_LABEL[pos]}` : FORMAT_INFO[f].label;
}
/** היחס רוחב / גובה של התמונה בפורמט. */
export const formatRatio = (f: AdFormat) => FORMAT_INFO[f].image.w / FORMAT_INFO[f].image.h;

// ── מה שה-DB החזיר (לפני SQL 228 העמודות לא קיימות — ברירות המחדל של bloc) ──

const has = <T extends string>(all: readonly T[], v: unknown): v is T => typeof v === "string" && (all as readonly string[]).includes(v);
export const isFormat = (v: unknown): v is AdFormat => has(AD_FORMATS, v);
export const isSlot = (v: unknown): v is AdSlot => has(AD_SLOTS, v);
export const parseFormat = (v: unknown): AdFormat => (isFormat(v) ? v : DEFAULT_FORMAT);
export const parseBannerPosition = (v: unknown): BannerPosition | null => (has(BANNER_POSITIONS, v) ? v : null);
export const parseTheme = (v: unknown): AdTheme => (v === "dark" ? "dark" : DEFAULT_THEME);

// ── נקודת מיקוד (focal): 0..1, ברירת המחדל באמצע ──

export const clampFocal = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
export const parseFocal = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.5;
};
/** לשליחה: 3 ספרות אחרי הנקודה. */
export const roundFocal = (v: number) => Math.round(clampFocal(v) * 1000) / 1000;
/** object-position של CSS: "30% 70%", מעוגל ל-0.1% — כמו ב-bloc ("33.3% 70%"). */
const pct = (v: number) => `${Math.round(clampFocal(v) * 1000) / 10}%`;
export const objectPosition = (fx: number, fy: number) => `${pct(fx)} ${pct(fy)}`;
/**
 * מה רואים מהתמונה במסגרת ביחס boxRatio, עם object-fit: cover ו-object-position fx / fy — כחלקים של התמונה (0..1).
 * כמו ה-CSS: התמונה מוגדלת עד שהיא מכסה את המסגרת; מה שעודף בציר אחד מוזז לפי האחוז (העודף × האחוז).
 */
export function cropRect(imgRatio: number, boxRatio: number, fx: number, fy: number): { x: number; y: number; w: number; h: number } {
  const x0 = clampFocal(fx), y0 = clampFocal(fy);
  if (!(imgRatio > 0) || !(boxRatio > 0)) return { x: 0, y: 0, w: 1, h: 1 };
  if (imgRatio > boxRatio) {
    const w = boxRatio / imgRatio;
    return { x: (1 - w) * x0, y: 0, w, h: 1 };
  }
  const h = imgRatio / boxRatio;
  return { x: 0, y: (1 - h) * y0, w: 1, h };
}
/** הקשה / גרירה על התמונה → נקודת המיקוד (משמאל ומלמעלה, כמו object-position — גם בממשק מימין לשמאל). */
export function focalFromPoint(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): [number, number] {
  if (!(rect.width > 0) || !(rect.height > 0)) return [0.5, 0.5];
  return [roundFocal((clientX - rect.left) / rect.width), roundFocal((clientY - rect.top) / rect.height)];
}

// ── צבע הכפתור (accent) והטקסט עליו ──

export const HEX = /^#[0-9A-Fa-f]{6}$/;
export const isHexColor = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
export const parseHex = (v: unknown): string | null => (isHexColor(v) ? v.toUpperCase() : null);
/** הכפתור כשאין צבע משלכם — הצבע של bloc (AD_DEFAULT_ACCENT ב-bloc = ‎--brand‎ שלו). */
export const BLOC_ACCENT = "#1D4ED8";
export const CTA_DARK_TEXT = "#0F172A";
export const CTA_LIGHT_TEXT = "#FFFFFF";
/** בהירות יחסית (WCAG 2): 0 שחור, 1 לבן. */
export function luminance(hex: string): number {
  const c = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5);
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/**
 * החלטה 380 (v2): הטקסט על הכפתור — לבן או #0F172A, זה שנותן ניגודיות גבוהה יותר (≥ 4.5:1 כשאפשר; שני הצבעים לא יכולים לעבור
 * יחד). שוויון — לבן. אותו כלל ב-bloc. צבע לא תקין — הצבע של bloc.
 */
export function ctaTextColor(accent: string | null | undefined): string {
  const a = isHexColor(accent) ? accent : BLOC_ACCENT;
  return contrastRatio(a, CTA_LIGHT_TEXT) >= contrastRatio(a, CTA_DARK_TEXT) ? CTA_LIGHT_TEXT : CTA_DARK_TEXT;
}
export function contrastInfo(accent: string | null | undefined): { text: string; ratio: number; ok: boolean } {
  const a = isHexColor(accent) ? accent : BLOC_ACCENT;
  const text = ctaTextColor(a);
  const raw = contrastRatio(a, text);
  // "עובר" לפי הערך המדויק — 4.48 מוצג כ-4.5 אבל לא עובר את 4.5:1
  return { text, ratio: Math.round(raw * 10) / 10, ok: raw >= 4.5 };
}
/** ערבוב עם שחור (0) או לבן (255) בחלק t, כל ערוץ בנפרד. */
function mixHex(hex: string, target: number, t: number): string {
  const ch = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + target * t).toString(16).padStart(2, "0");
  return `#${ch(1)}${ch(3)}${ch(5)}`.toUpperCase();
}
/**
 * סקירה #9: צבע שגם טקסט לבן וגם כהה לא מגיעים עליו ל-4.5:1 — bloc לא שומר (400 invalid, field accent). ההצעה: הגוון הקרוב שעובר —
 * כהה יותר או בהיר יותר בצעדים של 2%, מה שקרוב יותר (שוויון — כהה). צבע שעובר — הוא עצמו; לא צבע — null. בסוף הדרך שחור תמיד עובר.
 */
export function accessibleAccent(accent: string | null | undefined): string | null {
  if (!isHexColor(accent)) return null;
  const a = accent.toUpperCase();
  if (contrastInfo(a).ok) return a;
  for (let k = 1; k <= 50; k++) {
    const dark = mixHex(a, 0, k / 50);
    if (contrastInfo(dark).ok) return dark;
    const light = mixHex(a, 255, k / 50);
    if (contrastInfo(light).ok) return light;
  }
  return "#000000";
}

// ── תמונות של סטורי / קרוסלה ──

export const FRAMES_MIN = 2;
export const FRAMES_MAX = 5;
export const CAPTION_MAX = 60;

export interface AdFrame { image_url: string; image_alt: string; caption: string | null; cta_url: string | null; focal: [number, number] | null }
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const focalPair = (v: unknown): [number, number] | null =>
  (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && n >= 0 && n <= 1) ? [v[0] as number, v[1] as number] : null);

/** ad_creatives.frames (jsonb) → רשימה בדוקה; לא מערך / ריק — null (מודעה עם תמונה אחת). */
export function parseFrames(v: unknown): AdFrame[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter(obj).slice(0, FRAMES_MAX).map((f) => ({
    image_url: str(f.image_url), image_alt: str(f.image_alt), caption: strOrNull(f.caption), cta_url: strOrNull(f.cta_url), focal: focalPair(f.focal),
  }));
  return out.length ? out : null;
}

/** v2: ההתאמה פנימית למודעה — סטורי / קרוסלה עם 2..5 תמונות, השאר בלי; פס עם מיקום, השאר בלי (כמו ה-CHECK של 228). */
export function creativeFits(format: AdFormat, frames: readonly unknown[] | null | undefined, bannerPosition?: BannerPosition | null): boolean {
  const okFrames = FORMAT_INFO[format].frames
    ? Array.isArray(frames) && frames.length >= FRAMES_MIN && frames.length <= FRAMES_MAX
    : frames == null;
  const okPos = bannerPosition === undefined || (format === "banner") === (bannerPosition !== null);
  return okFrames && okPos;
}

export function allImagesOurs(imageUrl: string, frames: readonly AdFrame[] | null, base: string | null): boolean {
  const urls = [imageUrl, ...(frames ?? []).map((f) => f.image_url)];
  return urls.every((u) => isOurAdImage(u, base) !== false);
}

export function framesCountText(format: AdFormat, n: number): string {
  if (format === "carousel") return n === 1 ? "כרטיס אחד" : `${n} כרטיסים`;
  return n === 1 ? "תמונה אחת" : `${n} תמונות`;
}
/** השורה של מודעה: "4 תמונות · כהה" — מספר התמונות בסטורי / קרוסלה, והסגנון בפורמטים שיש בהם. */
export function creativeMetaText(format: AdFormat, frames: readonly unknown[] | null | undefined, theme?: AdTheme | null): string {
  const i = FORMAT_INFO[format];
  return [
    i.frames && frames && frames.length ? framesCountText(format, frames.length) : null,
    i.theme ? THEME_LABEL[theme === "dark" ? "dark" : "light"] : null,
  ].filter(Boolean).join(" · ");
}

/** key — מזהה בדפדפן בלבד (לא נשלח). focal — נקודת המיקוד של התמונה הזו. */
export type FrameDraft = { key: string; image_url: string; image_alt: string; caption: string; cta_url: string; focal: [number, number] };
export const emptyFrame = (key: string): FrameDraft => ({ key, image_url: "", image_alt: "", caption: "", cta_url: "", focal: [0.5, 0.5] });
export const canAddFrame = (n: number) => n < FRAMES_MAX;
export const canRemoveFrame = (n: number) => n > FRAMES_MIN;

export function addFrame(list: readonly FrameDraft[], key: string): FrameDraft[] {
  return canAddFrame(list.length) ? [...list, emptyFrame(key)] : list.slice();
}
export function removeFrame(list: readonly FrameDraft[], i: number): FrameDraft[] {
  return canRemoveFrame(list.length) && i >= 0 && i < list.length ? list.filter((_, j) => j !== i) : list.slice();
}
/** delta -1 — מקום אחד קודם, 1 — מקום אחד אחר כך. מחוץ לגבולות — בלי שינוי. */
export function moveFrame(list: readonly FrameDraft[], i: number, delta: -1 | 1): FrameDraft[] {
  const j = i + delta;
  const out = list.slice();
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return out;
  const t = out[i]; out[i] = out[j]; out[j] = t;
  return out;
}
/** גרירה: התמונה ממקום from עוברת למקום to (השאר זזים). */
export function dropFrame(list: readonly FrameDraft[], from: number, to: number): FrameDraft[] {
  const out = list.slice();
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return out;
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
export function updateFrame(list: readonly FrameDraft[], i: number, patch: Partial<Omit<FrameDraft, "key">>): FrameDraft[] {
  return list.map((f, j) => (j === i ? { ...f, ...patch } : f));
}
export function framesToDrafts(frames: readonly AdFrame[] | null, key: (i: number) => string): FrameDraft[] {
  const list = (frames ?? []).map((f, i) => ({
    key: key(i), image_url: f.image_url, image_alt: f.image_alt, caption: f.caption ?? "", cta_url: f.cta_url ?? "", focal: f.focal ?? [0.5, 0.5] as [number, number],
  }));
  while (list.length < FRAMES_MIN) list.push(emptyFrame(key(list.length)));
  return list;
}

const httpsOk = (u: string) => /^https:\/\/\S+$/.test(u.trim());
export function frameReady(f: FrameDraft, format: AdFormat, base: string | null): boolean {
  const alt = f.image_alt.trim().length;
  const link = f.cta_url.trim();
  return !!f.image_url && isOurAdImage(f.image_url, base) !== false && alt >= 2 && alt <= 200
    && f.caption.trim().length <= CAPTION_MAX && (!link || (format === "carousel" && httpsOk(link)));
}
export function framesReady(list: readonly FrameDraft[] | null, format: AdFormat, base: string | null): boolean {
  return !!list && list.length >= FRAMES_MIN && list.length <= FRAMES_MAX && list.every((f) => frameReady(f, format, base));
}

export type FramePayload = { image_url: string; image_alt: string; caption?: string; cta_url?: string; focal?: [number, number] };
/** C5 v2: כיתוב / קישור ריקים — לא נשלחים (לא null); קישור לכל תמונה — רק בקרוסלה; focal — רק כשהוא לא באמצע. */
export function framesPayload(list: readonly FrameDraft[], format: AdFormat): FramePayload[] {
  return list.map((f) => {
    const caption = f.caption.trim();
    const link = f.cta_url.trim();
    const focal: [number, number] = [roundFocal(f.focal[0]), roundFocal(f.focal[1])];
    return {
      image_url: f.image_url.trim(), image_alt: f.image_alt.trim(),
      ...(caption ? { caption } : {}),
      ...(link && format === "carousel" ? { cta_url: link } : {}),
      ...(focal[0] !== 0.5 || focal[1] !== 0.5 ? { focal } : {}),
    };
  });
}

// ── המשפטים ──

/** החלטה 379: מתי המודעה נספרת כחשיפה, לפי איפה היא יושבת. */
export const VIEW_DEFINITION: Record<AdSlot, string> = {
  full: "חשיפה — המודעה הוצגה על המסך, עם התמונה.",
  banner: "חשיפה — לפחות חצי מהפס היה על המסך שנייה רצופה, כשהאפליקציה פתוחה.",
  inline: "חשיפה — לפחות חצי מהמודעה שברשימה היה על המסך שנייה רצופה, כשהאפליקציה פתוחה.",
};
/** מודעה שכבר הוצגה — הפורמט והתוכן קבועים (ad_creative_guard). */
export const CREATIVE_LOCKED_TEXT = "נעולה — שכפלו כדי לשנות";
