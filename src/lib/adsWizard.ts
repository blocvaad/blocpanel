// src/lib/adsWizard.ts — ADS-2ב2: סטודיו המודעה שלב אחר שלב (החלטות 393–398). טהור (בלי I/O), דפדפן ושרת.
//
// השלבים (פורמטים → תוכן → עמוד לכל פורמט → סיכום), מה חסר לכל פורמט — כל פריט עם המקום שאליו קופצים (השלב, השדה, ובסטורי /
// בקרוסלה גם התמונה), כיוון ההחלקה בין השלבים (RTL: אצבע ימינה — לשלב הבא), תוכנית ההעלאה לפורמט אחד או לכמה, מילוי תיאור חסר
// לתמונות, ואיפה נכנסות כמה תמונות שהועלו בבת אחת. אותה מוכנות בדיוק כמו קודם: אין פריטים ⇔ formIssues ריק, צבע הכפתור
// תקין, והקופון / סוף המבצע תקינים (נבדק בבדיקה).
import { AD_FORMATS, CAPTION_MAX, FORMAT_INFO, FRAMES_MAX, FRAMES_MIN, type AdFormat, type FrameDraft } from "./adsFormats";
import { isOurAdImage, RECHECK_TEXT } from "./adsUi";
import { couponIssue, offerIssue } from "./adsOffer";
import { accentIssue, ctaDraftOf, imageFor, type BatchItem, type CreativeForm } from "./adsStudio";
import { ctaIssue } from "./adsCta";

// ── השלבים ──

export type StepKey = "formats" | "content" | "summary" | AdFormat;
export type WizardMode = "new" | "duplicate" | "edit";
const FIXED_LABEL = { formats: "פורמטים", content: "תוכן", summary: "סיכום" } as const;

export const isFormatStep = (s: StepKey): s is AdFormat => (AD_FORMATS as readonly string[]).includes(s);
export const stepLabel = (s: StepKey): string => (isFormatStep(s) ? FORMAT_INFO[s].label : FIXED_LABEL[s]);

/** החלטה 393: מודעה חדשה / עותק — פורמטים, תוכן, עמוד לכל פורמט (בסדר הקבוע), סיכום. עריכה — התוכן והפורמט שלה. */
export function wizardSteps(formats: readonly AdFormat[], mode: WizardMode): StepKey[] {
  const chosen = AD_FORMATS.filter((f) => formats.includes(f));
  if (mode === "edit") return ["content", ...chosen.slice(0, 1)];
  return ["formats", "content", ...chosen, "summary"];
}

/**
 * השלב שמוצג: שלב שלא קיים (פורמט שהוסר מהבחירה, או שלב שאין במצב הזה) — הראשון: במודעה חדשה / בעותק זו בחירת הפורמטים,
 * בעריכה — התוכן.
 */
export function shownStep(step: StepKey, steps: readonly StepKey[]): StepKey {
  return steps.includes(step) ? step : steps[0];
}

/** השלב הבא / הקודם (null בקצה). */
export function stepBeside(step: StepKey, steps: readonly StepKey[], dir: 1 | -1): StepKey | null {
  const i = steps.indexOf(shownStep(step, steps));
  const j = i + dir;
  return j >= 0 && j < steps.length ? steps[j] : null;
}

// ── מה חסר (החלטה 395) ──

export type CheckField =
  | "headline" | "cta_label" | "cta_url" | "accent" | "coupon_code" | "offer_ends_on"
  | "image" | "image_alt" | "frame_add" | "frame_image" | "frame_alt" | "frame_caption" | "frame_link";
export interface Check {
  /** מזהה יציב (לבדיקות ול-key). */
  id: string;
  /** המשפט — בלי נקודה בסוף, כך שאפשר לחבר אליו "לתיקון". */
  text: string;
  /** השלב שבו מתקנים: "content" (משותף לכל הפורמטים) או הפורמט עצמו. */
  step: "content" | AdFormat;
  field: CheckField;
  /** בסטורי / בקרוסלה: איזו תמונה (מ-0). */
  frame?: number;
}

const httpsOk = (u: string) => /^https:\/\/\S+$/.test(u.trim());
const foreign = (url: string, base: string | null) => isOurAdImage(url, base) === false;

/** התוכן המשותף: כותרת, טקסט לכפתור, קישור, צבע הכפתור, הקופון וסוף המבצע — כמו formIssues + accentIssue + offerIssues. */
export function contentChecks(f: CreativeForm, today: string): Check[] {
  const out: Check[] = [];
  const add = (field: CheckField, text: string) => out.push({ id: field, text, step: "content", field });
  const head = f.headline.trim().length, label = f.cta_label.trim().length;
  if (head < 2) add("headline", head ? "הכותרת קצרה מדי — לפחות 2 תווים" : "חסרה כותרת");
  if (label < 2) add("cta_label", label ? "הטקסט לכפתור קצר מדי — לפחות 2 תווים" : "חסר טקסט לכפתור");
  // ADS-2ג1: מה שחסר בכפתור לפי הסוג שלו (אתר — אותם משפטים כמו תמיד; שיחה / וואטסאפ / ניווט — ctaIssue)
  const cta = ctaIssue(ctaDraftOf(f));
  if (cta) add("cta_url", cta);
  if (accentIssue(f.accent)) add("accent", "צבע הכפתור לא קריא — צריך צבע כהה או בהיר יותר");
  const c = couponIssue(f.coupon_code);
  if (c) add("coupon_code", c.replace(/\.$/, ""));
  const o = offerIssue(f.offer_ends_on, today);
  if (o) add("offer_ends_on", o.replace(/\.$/, ""));
  return out;
}

/** "תמונה" בסטורי, "כרטיס" בקרוסלה. */
export const frameUnit = (format: AdFormat) => (format === "carousel" ? "כרטיס" : "תמונה");

/** התמונה של הפורמט (או התמונות בסטורי / בקרוסלה) — כמו formIssues / framesReady, פריט לכל דבר שחסר. */
export function imageChecks(format: AdFormat, f: CreativeForm, base: string | null): Check[] {
  const out: Check[] = [];
  const add = (field: CheckField, text: string, frame?: number) =>
    out.push({ id: frame === undefined ? `${format}:${field}` : `${format}:${frame}:${field}`, text, step: format, field, ...(frame === undefined ? {} : { frame }) });
  if (FORMAT_INFO[format].frames) {
    const unit = frameUnit(format);
    const n = f.frames.length;
    if (n < FRAMES_MIN) add("frame_add", `צריך לפחות ${FRAMES_MIN} ${format === "carousel" ? "כרטיסים" : "תמונות"} (יש ${n})`);
    if (n > FRAMES_MAX) add("frame_add", `יותר מ-${FRAMES_MAX} ${format === "carousel" ? "כרטיסים" : "תמונות"} — מסירים ${n - FRAMES_MAX}`);
    f.frames.forEach((x, i) => {
      const name = `${unit} ${i + 1}`;
      if (!x.image_url) add("frame_image", `${name}: חסרה תמונה`, i);
      else if (foreign(x.image_url, base)) add("frame_image", `${name}: התמונה מאתר אחר — מעלים אותה מחדש`, i);
      const alt = x.image_alt.trim().length;
      if (alt < 2) add("frame_alt", `${name}: חסר תיאור ("מה רואים בתמונה")`, i);
      else if (alt > 200) add("frame_alt", `${name}: התיאור ארוך מ-200 תווים`, i);
      if (x.caption.trim().length > CAPTION_MAX) add("frame_caption", `${name}: הכיתוב ארוך מ-${CAPTION_MAX} תווים`, i);
      // בסטורי הקישור של כל תמונה לא נשלח (framesPayload) — ולכן גם לא נבדק, כמו ב-formIssues
      const link = x.cta_url.trim();
      if (format === "carousel" && link && !httpsOk(link)) add("frame_link", `${name}: הקישור צריך להתחיל ב-https://`, i);
    });
    return out;
  }
  const own = !!f.overrides[format];
  const img = imageFor(f, format);
  if (!img.image_url) add("image", own ? "חסרה תמונה לפורמט הזה" : "חסרה תמונה");
  else if (foreign(img.image_url, base)) add("image", "התמונה מאתר אחר — מעלים אותה מחדש");
  if (img.image_alt.trim().length < 2) add("image_alt", "חסר תיאור לתמונה (\"מה רואים בתמונה\")");
  return out;
}

/** כל מה שחסר כדי להעלות את הפורמט: קודם מה שבעמוד שלו, אחר כך התוכן המשותף. */
export function formatChecks(format: AdFormat, f: CreativeForm, base: string | null, today: string): Check[] {
  return [...imageChecks(format, f, base), ...contentChecks(f, today)];
}

/** הבורר של השדה — לשם קופצים (מתמקדים ומבליטים) כשלוחצים על פריט ברשימה. */
export function checkSelector(c: Check): string {
  switch (c.field) {
    case "headline": case "cta_label": case "cta_url": case "coupon_code": case "offer_ends_on": case "image_alt":
      return `[data-creative-field="${c.field}"]`;
    case "accent": return "[data-accent-picker] [data-accent], [data-accent-picker] [data-accent-custom]";
    case "image": return "[data-creative-image-section] [data-creative-upload]";
    case "frame_add": return "[data-frame-add]";
    case "frame_image": return `[data-frame="${c.frame ?? 0}"] [data-creative-upload]`;
    case "frame_alt": return `[data-frame-field="${c.frame ?? 0}.image_alt"]`;
    case "frame_caption": return `[data-frame-field="${c.frame ?? 0}.caption"]`;
    case "frame_link": return `[data-frame-field="${c.frame ?? 0}.cta_url"]`;
  }
}

export type FrameIssue = { text: string; field: CheckField };
/** בסטורי / בקרוסלה: מה חסר בכל תמונה (לסימן על התמונה הקטנה ולשדה שמסומן באדום), לפי המספר שלה. */
export function frameIssues(format: AdFormat, f: CreativeForm, base: string | null): Record<number, FrameIssue[]> {
  const by: Record<number, FrameIssue[]> = {};
  for (const c of imageChecks(format, f, base)) if (c.frame !== undefined) (by[c.frame] = by[c.frame] || []).push({ text: c.text, field: c.field });
  return by;
}

// ── החלקה בין השלבים (החלטה 396) ──

export const SWIPE_MIN_PX = 56;
export const SWIPE_RATIO = 1.6;
export const SWIPE_MAX_MS = 800;
/** מגע שמתחיל באחד מאלה לא מחליף שלב: שדות, מחוונים, נקודת המיקוד, שורות שגוללים לצד. */
export const NO_SWIPE = 'input, textarea, select, [role="slider"], [data-no-swipe], .studio-scroll';
/**
 * RTL: השלב הבא נמצא משמאל, ולכן מושכים את הדף ימינה — אצבע ימינה (dx חיובי) = הבא, שמאלה = הקודם. מספיק רחוק (56px), הרבה יותר
 * לרוחב מלגובה (פי 1.6 — גלילה רגילה לא נחשבת) ומהר (עד 0.8 שניות).
 */
export function swipeIntent(dx: number, dy: number, ms: number): "next" | "prev" | null {
  if (!(ms >= 0 && ms <= SWIPE_MAX_MS)) return null;
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= SWIPE_RATIO * Math.abs(dy)) return null;
  return dx > 0 ? "next" : "prev";
}

// ── העלאה לכל פורמט לבד (החלטה 394) ──

export const okFormats = (batch: readonly BatchItem[] | null): AdFormat[] => (batch ?? []).filter((x) => x.state === "ok").map((x) => x.format);
export const batchOf = (batch: readonly BatchItem[] | null, format: AdFormat): BatchItem | null => (batch ?? []).find((x) => x.format === format) ?? null;
/** כל פורמט שנבחר כבר עלה. */
export const allUploaded = (formats: readonly AdFormat[], batch: readonly BatchItem[] | null) =>
  formats.length > 0 && formats.every((f) => batchOf(batch, f)?.state === "ok");

/**
 * הריצה להעלאת הפורמטים האלה: הם נכנסים לתור (גם מי שנכשל קודם); מה שעלה — נשאר "עלתה" ולא עולה שוב; פורמט שלא נבחר הפעם —
 * נשאר עם התוצאה שהייתה לו (או בלי). תור ישן שלא נבחר — יוצא (רק מה שביקשו עכשיו רץ). בסדר הקבוע של הפורמטים.
 */
export function publishStart(prev: readonly BatchItem[] | null, formats: readonly AdFormat[]): BatchItem[] {
  const by = new Map<AdFormat, BatchItem>();
  for (const x of prev ?? []) if (x.state !== "waiting" || formats.includes(x.format)) by.set(x.format, x);
  for (const f of formats) {
    const x = by.get(f);
    if (!x || x.state === "failed" || x.state === "waiting") by.set(f, { format: f, state: "waiting" });
  }
  return AD_FORMATS.filter((f) => by.has(f)).map((f) => by.get(f)!);
}

/** אפשר להעלות עכשיו: אין חסר, ולא עלה / לא באמצע / לא "ייתכן שנוצר". */
export function canUpload(format: AdFormat, checks: readonly Check[], batch: readonly BatchItem[] | null): boolean {
  const s = batchOf(batch, format)?.state;
  return checks.length === 0 && s !== "ok" && s !== "saving" && s !== "unclear";
}

/** הסימן של פורמט בפס השלבים — לפי כל מה שחסר כדי להעלות אותו (גם בתוכן המשותף), כמו הכפתור בעמוד שלו. */
export type FormatPill = { kind: "ready" } | { kind: "missing"; count: number } | { kind: "uploaded" } | { kind: "failed" } | { kind: "unclear" } | { kind: "saving" };
export function formatPill(format: AdFormat, checks: readonly Check[], batch: readonly BatchItem[] | null): FormatPill {
  const s = batchOf(batch, format)?.state;
  if (s === "ok") return { kind: "uploaded" };
  if (s === "saving" || s === "waiting") return { kind: "saving" };
  if (s === "failed") return { kind: "failed" };
  if (s === "unclear") return { kind: "unclear" };
  return checks.length ? { kind: "missing", count: checks.length } : { kind: "ready" };
}

/** הכפתור הראשי בעמוד של פורמט: עלה — הבא; חסר — "להשלמה"; אחרת — העלאה (פעילה רק כשאין עוד העלאה ואפשר להעלות). */
export type FormatMain =
  | { kind: "next" } | { kind: "complete"; count: number }
  | { kind: "publish"; enabled: boolean; label: "upload" | "retry" | "saving" | "waiting" };
export function formatMain(format: AdFormat, checks: readonly Check[], batch: readonly BatchItem[] | null, free: boolean): FormatMain {
  const s = batchOf(batch, format)?.state;
  if (s === "ok") return { kind: "next" };
  if (checks.length) return { kind: "complete", count: checks.length };
  const label = s === "saving" ? "saving" : s === "waiting" ? "waiting" : s === "failed" ? "retry" : "upload";
  return { kind: "publish", enabled: free && canUpload(format, checks, batch), label };
}

/** בסיכום: מה אפשר להעלות עכשיו (בסדר הקבוע). */
export const readyToUpload = (formats: readonly AdFormat[], checksOf: (f: AdFormat) => readonly Check[], batch: readonly BatchItem[] | null): AdFormat[] =>
  AD_FORMATS.filter((f) => formats.includes(f) && canUpload(f, checksOf(f), batch));

/** שורה בסיכום: המצב והפעולה. נכשל ועכשיו חסר בו משהו — "להשלמה" (לא כפתור "נסו שוב" נעול); אחרי תשובה לא ברורה — בלי פעולה. */
export type SummaryState = BatchItem["state"] | "ready" | "missing";
export function summaryRow(format: AdFormat, checks: readonly Check[], batch: readonly BatchItem[] | null, stale: boolean): { state: SummaryState; action: "publish" | "complete" | "retry" | null } {
  const s = batchOf(batch, format)?.state;
  const state: SummaryState = s ?? (checks.length ? "missing" : "ready");
  if (state === "ready") return { state, action: "publish" };
  if (state === "missing") return { state, action: "complete" };
  if (state === "failed" && !stale) return { state, action: checks.length ? "complete" : "retry" };
  return { state, action: null };
}

const labels = (fs: readonly AdFormat[]) => fs.map((f) => FORMAT_INFO[f].label).join(", ");
/** "סיום" כשרק חלק עלה: מה עלה ומה לא. */
export function finishText(uploaded: readonly AdFormat[], skipped: readonly AdFormat[]): string {
  const head = uploaded.length === 1 ? `נוצרה מודעה אחת (${labels(uploaded)}).` : `נוצרו ${uploaded.length} מודעות (${labels(uploaded)}).`;
  return skipped.length ? `${head} לא הועלו: ${labels(skipped)}.` : head;
}
/** כשהכל עלה (כמו קודם). */
export const doneText = (n: number) => (n === 1 ? "המודעה נוצרה." : `נוצרו ${n} מודעות — אחת לכל פורמט.`);

// ── מה נאמר אחרי העלאה וביציאה (החלטות 398–399) ──

/** "במסך מלא", "במסך מלא ובסטורי", "בכרטיס במרכז, במסך מלא ובסטורי". */
export function inFormats(fs: readonly AdFormat[]): string {
  const xs = fs.map((f) => `ב${FORMAT_INFO[f].label}`);
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} ו${xs[xs.length - 1]}`;
}
/** מה כבר עלה — המודעה היא הנושא (שמות הפורמטים בזכר): "המודעה במסך מלא כבר עלתה." / "המודעות במסך מלא ובסטורי כבר עלו." */
export const uploadedLine = (up: readonly AdFormat[]) => (up.length === 1 ? `המודעה ${inFormats(up)} כבר עלתה.` : `המודעות ${inFormats(up)} כבר עלו.`);

/**
 * השאלה ביציאה — אותו משפט בגיליון ובסטודיו: עריכה — שמירה; כשחלק עלה — מה עלה ומה עוד לא; אחרת — המודעה לא הועלתה. to — באשף
 * הקמפיין: "לעבור ל<שלב>" במקום "לצאת" (כמו הכפתור).
 */
export function leaveText(mode: WizardMode, up: readonly AdFormat[], rest: readonly AdFormat[], to?: string): string {
  if (mode === "edit") return "יש שינויים שעוד לא נשמרו. לצאת בלי לשמור? השינויים לא יישמרו.";
  const go = to ? `לעבור ל${to}` : "לצאת";
  if (up.length && rest.length) {
    const not = rest.length === 1 ? `המודעה ${inFormats(rest)} עוד לא הועלתה` : `המודעות ${inFormats(rest)} עוד לא הועלו`;
    return `${uploadedLine(up)} ${not}. ${go} בלי להעלות ${rest.length === 1 ? "אותה" : "אותן"}?`;
  }
  return `יש כאן מודעה שעוד לא הועלתה. ${go} בלי להעלות? מה שמילאתם לא יישמר.`;
}
export const leaveYes = (mode: WizardMode) => (mode === "edit" ? "יציאה בלי לשמור" : "יציאה בלי להעלות");

/**
 * החלטה 399 — יציאה מהסטודיו ("ביטול", "סגירה", "סיום"): באמצע העלאה — כלום; יש עבודה שלא עלתה / לא נשמרה ועוד לא שאלו — שואלים;
 * כבר עלה משהו — סיום (ההורה מרענן ואומר מה נוצר); תשובה לא ברורה — רענון; אחרת — סגירה.
 */
export type ExitPlan = "none" | "ask" | "finish" | "recheck" | "close";
export function exitPlan(s: { busy: boolean; dirty: boolean; asked: boolean; up: number; maybe: boolean }): ExitPlan {
  if (s.busy) return "none";
  if (s.dirty && !s.asked) return "ask";
  if (s.up > 0) return "finish";
  if (s.maybe) return "recheck";
  return "close";
}

/**
 * סגירת הגיליון מבחוץ (X, מחוץ לגיליון, Escape): null — כלום לא השתנה; אחרת — מרעננים את הרשימה ואומרים מה נוצר, באותו משפט
 * כמו "סיום" בסטודיו (מה עלה ומה לא).
 */
export function closeOutcome(up: readonly AdFormat[], rest: readonly AdFormat[], maybe: boolean): string | null {
  if (!up.length) return maybe ? RECHECK_TEXT.creative : null;
  const head = finishText(up, rest);
  return maybe ? `${head} ${MAYBE_ONE_MORE}` : head;
}
export const MAYBE_ONE_MORE = "ייתכן שנוצרה עוד אחת — בדקו ברשימה לפני שמעלים שוב.";

/**
 * ADS-2ב2: שאלת היציאה של אשף הקמפיין נשארת רק כל עוד היא נכונה — הסטודיו עוד מוצג, לא באמצע העלאה, ויש בו עבודה שלא עלתה.
 * התחילה העלאה, או שאין יותר מה לאבד — השאלה נעלמת.
 */
export const leaveAskStays = (s: StudioState | null): boolean => !!s && !s.busy && s.dirty;

/** ADS-2ב2: מה הסטודיו מדווח להורה (הגיליון / אשף הקמפיין): באמצע העלאה, יש עבודה שלא עלתה, מה עלה ומה לא, ותשובה לא ברורה. */
export interface StudioState { busy: boolean; dirty: boolean; up: AdFormat[]; rest: AdFormat[]; maybe: boolean }
export const STUDIO_IDLE: StudioState = { busy: false, dirty: false, up: [], rest: [], maybe: false };

// ── התמונות בסטורי / בקרוסלה (החלטה 397) ──

/**
 * מילוי תיאור רק לתמונות שיש בהן תמונה ואין תיאור: "<כותרת> — תמונה 2" ("תמונה" גם בקרוסלה — התיאור הוא של התמונה, והתמונות
 * משותפות לסטורי ולקרוסלה). בלי מקור (פחות מ-2 תווים) — כלום. auto — מה מולא לכל תמונה (לפי key), כדי לבקש לבדוק אותו.
 */
export function fillMissingAlts(frames: readonly FrameDraft[], base: string, unit: string): { frames: FrameDraft[]; filled: number; auto: Record<string, string> } {
  const head = base.trim();
  const auto: Record<string, string> = {};
  if (head.length < 2) return { frames: [...frames], filled: 0, auto };
  let filled = 0;
  const next = frames.map((x, i) => {
    if (!x.image_url || x.image_alt.trim().length >= 2) return x;
    filled++;
    const alt = `${head} — ${unit} ${i + 1}`.slice(0, 200);
    auto[x.key] = alt;
    return { ...x, image_alt: alt };
  });
  return { frames: next, filled, auto };
}
/** מאיפה ממלאים: הכותרת, ואם אין — שם המפרסם (והכפתור אומר את זה); בלי שניהם — אין כפתור. */
export function fillSource(headline: string, advertiser: string): { base: string; label: string } | null {
  if (headline.trim().length >= 2) return { base: headline.trim(), label: "מילוי תיאור חסר מהכותרת" };
  if (advertiser.trim().length >= 2) return { base: advertiser.trim(), label: "מילוי תיאור חסר משם המפרסם" };
  return null;
}
/** יש מה למלא: תמונה בלי תיאור. */
export const hasMissingAlt = (frames: readonly FrameDraft[]) => frames.some((x) => !!x.image_url && x.image_alt.trim().length < 2);

/**
 * כמה תמונות בבת אחת: קודם התמונות הריקות (לפי הסדר), אחר כך תמונות חדשות עד 5. fill — המפתחות של הריקות שיתמלאו; add — כמה
 * חדשות; taken — כמה מהקבצים נכנסו (השאר — אין מקום).
 */
export function slotsForMany(frames: readonly FrameDraft[], files: number): { fill: string[]; add: number; taken: number } {
  const empty = frames.filter((x) => !x.image_url).map((x) => x.key);
  const fill = empty.slice(0, files);
  const add = Math.max(0, Math.min(files - fill.length, FRAMES_MAX - frames.length));
  return { fill, add, taken: fill.length + add };
}
