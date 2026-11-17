"use client";
// studio/CreativeStudio — סטודיו המודעה (bloc ADS-2א v2, החלטה 383): תוכן אחד → מודעה בכל פורמט שנבחר.
// ADS-2ב2 (החלטות 393–399): שלב אחר שלב —
//   • פורמטים → תוכן (טקסטים עם תבניות, הקישור הסופי עם תגי ה-utm, צבע הכפתור עם הניגודיות, קופון ומבצע) → עמוד לכל פורמט (התמונה
//     או התמונות שלו, הסגנון שלו, התצוגה החיה שלו, "מה חסר" — כל פריט קופץ לשדה — וכפתור העלאה משלו) → סיכום ("העלאת כל המוכנות").
//     כל שלב פתוח לביקור; רק ההעלאה דורשת שהכל מוכן. מעבר: הפס למעלה, הקודם / הבא, או החלקה (אצבע ימינה — הבא, שמאלה — הקודם).
//   • תמונה רק דרך כפתור ההעלאה (bloc מקבל רק את הבאקט שלו; מאתר אחר — לא נטענת). פורמט עם תמונה אחת — התמונה המשותפת (נקודת
//     המיקוד חותכת אותה לכל פורמט) או תמונה רק לו; סטורי / קרוסלה — פס של 2–5 תמונות (משותף לשניהם) עם סימן לכל תמונה, העלאת כמה
//     בבת אחת ומילוי תיאור חסר מהכותרת.
//   • העלאה: creative.save לפורמט אחד, או לכמה — אחד אחרי השני; נכשל — המשפט בעברית ו"נסו שוב" (השאר ממשיכים); תשובה לא ברורה
//     (ייתכן שנוצרה) — עוצרים: אין העלאה נוספת, רק רענון. פורמט שעלה — "עלתה": לא עולה שוב ולא יוצא מהבחירה. הכל עלה — onDone.
//   • בזמן העלאה הטופס נעול (כמו קודם), וכל העלאה נשלחת מתמונת מצב של הטופס מהרגע שלחצו; אחרי שהסטודיו נסגר — אין בקשה נוספת.
//   • יציאה (החלטה 399): עבודה שלא עלתה / לא נשמרה — קודם שואלים בשורה (אותו משפט כמו בגיליון); באמצע העלאה — אין יציאה.
//   • עריכה — רק למודעה שעוד לא הוצגה (תוכן → הפורמט → שמירה); מודעה שהוצגה: "נעולה — שכפלו כדי לשנות" ושכפול כמודעה חדשה.
//   • ADS-2ב1 (החלטה 388): "קופון ומבצע (לא חובה)" — קוד קופון (אותיות גדולות, ^[A-Z0-9][A-Z0-9-]{1,23}$) וסוף המבצע (היום או אחריו,
//     שעון ישראל), משותפים לכל הפורמטים; אזהרה כשהפס בין הפורמטים ("בפס הקוד לא מוצג"); בתצוגה — השבב ושורת המבצע כמו ב-bloc.
// CreativeStudio — המצב והבקשות; CreativeStudioView — התצוגה (טהורה, נבדקת בלי DOM).
import { useEffect, useRef, useState } from "react";
import { X, Copy, Gift, ChevronLeft, ArrowRight, AlertTriangle, CheckCircle2, Upload, RefreshCw, Clock } from "lucide-react";
import { Banner, solidBtn, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { postAds, uploadAdImage, Field } from "../adsKit";
import CreativeImageField from "../CreativeImageField";
import FormatGallery from "./FormatGallery";
import FocalPicker from "./FocalPicker";
import AccentPicker from "./AccentPicker";
import FramesStrip, { indexOfKey } from "./FramesStrip";
import StudioPreview, { StudioPreviewView, previewFromForm, SHOWS_BODY } from "./StudioPreview";
import WizardSteps, { type StepState } from "./WizardSteps";
import { Segmented, StickyBar, FormatGlyph, linkBtn, STUDIO_CSS, STUDIO_IMAGE_BASE } from "./kit";
import { AD_IMAGE_MAX_BYTES } from "@/lib/ads";
import { imageBoxState, isOurAdImage, lockedAfter, RECHECK_TEXT, type ImageBox, type UploadState } from "@/lib/adsUi";
import {
  AD_FORMATS, AD_THEMES, BANNER_POSITIONS, BANNER_POSITION_LABEL, CREATIVE_LOCKED_TEXT, FORMAT_INFO, FRAMES_MAX, THEME_LABEL, addFrame, emptyFrame, imageHint, sizeText,
  type AdFormat,
} from "@/lib/adsFormats";
import {
  TEMPLATES, runBatch, creativePayloadFor, emptyCreativeForm, emptyImage, finalLink, formFromCreative,
  formIssues, imageFor, accentIssue, longAdvertiserName, longAdvertiserText, offerIssues, type BatchItem, type CreativeForm, type ImagePick,
} from "@/lib/adsStudio";
import {
  MAYBE_ONE_MORE, NO_SWIPE, allUploaded, batchOf, checkSelector, contentChecks, doneText, exitPlan, fillMissingAlts, fillSource, finishText, formatChecks, formatMain, formatPill,
  frameIssues, hasMissingAlt, isFormatStep, leaveText, leaveYes, okFormats, publishStart, readyToUpload, shownStep, slotsForMany, stepBeside, stepLabel,
  summaryRow, swipeIntent, uploadedLine, wizardSteps, type Check as Missing, type CheckField, type StepKey, type StudioState,
} from "@/lib/adsWizard";
import type { AdCreativeRow } from "@/lib/adsServer";
import { COUPON_MAX, bannerCouponWarning, couponIssue, offerIssue, offerLine } from "@/lib/adsOffer";
import { ilTodayKey } from "@/lib/broadcasts";

const IDLE: UploadState = { phase: "idle" };
export const TOO_BIG_TEXT = "התמונה גדולה מ-2MB. הקטינו אותה ונסו שוב.";
const SHARED = "image";
/** היעד של העלאה / סירוב: התמונה המשותפת, תמונה נפרדת לפורמט, או תמונה בסטורי / בקרוסלה (לפי key). */
export const overrideKey = (f: AdFormat) => `img:${f}`;

export type StudioMode = { kind: "new" } | { kind: "edit"; creative: AdCreativeRow; served: boolean } | { kind: "duplicate"; creative: AdCreativeRow };

/** מה כתוב ליד התמונה המשותפת: פורמט אחד — המידות שלו; כמה — תמונה גדולה, והמיקוד חותך לכל אחד. */
export function sharedHint(singles: AdFormat[]): string {
  if (singles.length === 1) return imageHint(singles[0]);
  return `JPEG, PNG או WebP, עד 2MB. תמונה אחת לכל ${singles.length} הפורמטים — כדאי לפחות ${sizeText({ w: 1200, h: 1200, ratio: "" })}, ונקודת המיקוד תחתוך אותה לכל אחד.`;
}
export const BATCH_TEXT: Record<BatchItem["state"], string> = {
  waiting: "בתור", saving: "מעלים…", ok: "עלתה", failed: "לא עלתה", unclear: "ייתכן שעלתה — רעננו לפני שממשיכים",
};
/** ADS-2ב2: המשפט אחרי שחלק מהפורמטים עלו (החלטה 398). */
export const afterUploadText = (up: readonly AdFormat[]) => `${uploadedLine(up)} שינוי כאן חל רק על מה שעוד לא עלה.`;

const WIZARD_CSS = `
.wiz-cols { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
.wiz-main { flex: 1 1 340px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.wiz-side { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; scroll-margin-top: 12px; }
.wiz-preview-first { order: -1; }
@media (min-width: 720px) { .wiz-side { position: sticky; top: 12px; } .wiz-preview-first { order: 0; } }
@keyframes wiz-in-next { from { transform: translateX(-28px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes wiz-in-prev { from { transform: translateX(28px); opacity: 0; } to { transform: none; opacity: 1; } }
.wiz-in-next { animation: wiz-in-next .22s ease-out; }
.wiz-in-prev { animation: wiz-in-prev .22s ease-out; }
@keyframes wiz-flash { 0%, 100% { box-shadow: 0 0 0 0 rgba(234,179,8,0); } 25%, 60% { box-shadow: 0 0 0 4px rgba(234,179,8,.85); } }
.wiz-flash { animation: wiz-flash 1.3s ease-out; }
.wiz-lock { border: none; padding: 0; margin: 0; min-width: 0; min-inline-size: 0; display: flex; flex-direction: column; gap: 16px; }
@media (prefers-reduced-motion: reduce) {
  .wiz-in-next, .wiz-in-prev, .wiz-flash { animation: none !important; }
  .wiz-flash { box-shadow: 0 0 0 3px rgba(234,179,8,.85) !important; }
  [data-wizard-progress] { transition: none !important; }
}
`;
const col = (gap: number): React.CSSProperties => ({ display: "flex", flexDirection: "column", gap: `${gap}px`, minWidth: 0 });
const h3: React.CSSProperties = { fontSize: "15px", fontWeight: 800, color: "var(--text)" };
const lead: React.CSSProperties = { fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.55, margin: 0 };
const hint: React.CSSProperties = { fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5 };
const labels = (fs: readonly AdFormat[]) => fs.map((f) => FORMAT_INFO[f].label).join(", ");
const errText: React.CSSProperties = { fontSize: "13px", color: "var(--red)", lineHeight: 1.5, marginTop: "-4px" };
const red = (on: boolean): React.CSSProperties => ({ borderColor: on ? "var(--red)" : "var(--border)" });
/** ADS-2ב2: בזמן העלאה — רק מה שעורכים נעול (התצוגה, "מה חסר" והמעבר בין שלבים נשארים פתוחים). */
const Lock = ({ on, children }: { on: boolean; children: React.ReactNode }) => (
  <fieldset disabled={on} className="wiz-lock" data-studio-lock={on ? "on" : "off"}>{children}</fieldset>
);

/**
 * ADS-2ב1: "קופון ומבצע" — הקוד באותיות גדולות (כמו שנשמר), סוף המבצע עם תאריך מינימלי של היום, השורה שהדייר יראה, אזהרת הפס,
 * ומה קורה כשהמבצע נגמר. תצוגה בלבד.
 */
export function OfferFields({ coupon, offerEndsOn, onChange, today, formats, campaignEndsOn = null, disabled = false, testId = "creative" }: {
  coupon: string; offerEndsOn: string; onChange: (v: { coupon_code: string; offer_ends_on: string }) => void; today: string;
  formats: readonly AdFormat[]; campaignEndsOn?: string | null; disabled?: boolean; testId?: string;
}) {
  const cIssue = couponIssue(coupon);
  const oIssue = offerIssue(offerEndsOn, today);
  const line = oIssue ? null : offerLine(offerEndsOn || null, today);
  const banner = bannerCouponWarning(formats, coupon);
  const afterCampaign = !!offerEndsOn && !oIssue && !!campaignEndsOn && offerEndsOn > campaignEndsOn;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-offer-fields={testId}>
      <Field label="קוד קופון (לא חובה)" hint={cIssue ? undefined : "אותיות באנגלית, ספרות ומקף. הדייר יראה אותו בשבב עם כפתור העתקה."}>
        <input value={coupon} maxLength={COUPON_MAX + 4} disabled={disabled} dir="ltr" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="SAVE20"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ coupon_code: e.target.value.toUpperCase(), offer_ends_on: offerEndsOn })}
          aria-invalid={cIssue ? true : undefined} style={{ ...inputStyle, fontFamily: "var(--mono)", letterSpacing: ".04em", ...red(!!cIssue) }}
          data-creative-field="coupon_code" />
      </Field>
      {cIssue && <span role="alert" style={{ fontSize: "13px", color: "var(--red)", lineHeight: 1.5, marginTop: "-4px" }} data-offer-issue="coupon_code">{cIssue}</span>}
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="סוף המבצע (לא חובה)" style={{ flex: "1 1 180px" }}>
          <input type="date" value={offerEndsOn} min={today} disabled={disabled} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ coupon_code: coupon, offer_ends_on: e.target.value })}
            aria-invalid={oIssue ? true : undefined} style={{ ...inputStyle, ...red(!!oIssue) }} data-creative-field="offer_ends_on" />
        </Field>
        {offerEndsOn && !disabled && (
          <button type="button" style={{ ...linkBtn, minHeight: "44px" }} onClick={() => onChange({ coupon_code: coupon, offer_ends_on: "" })} data-offer-clear="">בלי סוף מבצע</button>
        )}
      </div>
      {oIssue && <span role="alert" style={{ fontSize: "13px", color: "var(--red)", lineHeight: 1.5 }} data-offer-issue="offer_ends_on">{oIssue}</span>}
      {line && (
        <span style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.55 }} data-offer-line={offerEndsOn}>
          הדייר יראה: <b style={{ color: "var(--text)" }}>{line}</b>. אחרי היום הזה המודעה מפסיקה להופיע — גם אם הקמפיין עוד פעיל.
        </span>
      )}
      {afterCampaign && (
        <span style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5 }} data-offer-after-campaign="">הקמפיין מסתיים לפני סוף המבצע — ההצגה נעצרת בסוף הקמפיין.</span>
      )}
      {banner && <Banner tone="warn"><span data-creative-banner-coupon="">{banner}</span></Banner>}
    </div>
  );
}

export interface CreativeStudioViewProps {
  mode: StudioMode["kind"]; served: boolean;
  form: CreativeForm; onForm: (f: CreativeForm) => void;
  advertiser: string; advertiserLogo: string | null; brandColor: string | null; imageBase: string | null;
  /** ADS-2ב2: השלב המוצג ומעבר בין שלבים (הפס, הקודם / הבא, החלקה). */
  step: StepKey; onStep: (s: StepKey) => void;
  boxes: Record<string, ImageBox>; onPick: (target: string) => void;
  /** ADS-2ב2: "העלאת כמה תמונות" לסטורי / לקרוסלה, ומה קרה. */
  onPickMany?: () => void; manyNote?: string | null;
  frameSel: number; onFrameSel: (i: number) => void; refusedFrame: number | null; onAddFrame: () => void;
  batch: BatchItem[] | null; busy: boolean; err: string | null; stale: boolean;
  /** ADS-2ב2: העלאת פורמט אחד או כמה (אחד אחרי השני). */
  onPublish: (formats: AdFormat[]) => void;
  /** ADS-2ב2: קפיצה לשדה שחסר (השלב, התמונה בסטורי, השדה). */
  onJump: (c: Missing) => void;
  /** ADS-2ב2: "סיום" כשרק חלק עלה (או כלום — סגירה). */
  onFinish: () => void;
  onSave: () => void; onDuplicate: () => void; onRecheck: () => void; onCancel?: () => void;
  animate?: boolean;
  /** לתצוגת הקישור הסופי (utm_campaign של bloc). */
  campaignId?: string | null;
  /** ADS-2ב1: היום לפי שעון ישראל (בדיקת סוף המבצע ושורת המבצע בתצוגה); ברירת מחדל — עכשיו. */
  today?: string;
  /** ADS-2ב1: סוף הקמפיין — סוף מבצע מאוחר ממנו מותר, אבל ההצגה נעצרת בסוף הקמפיין (נאמר ליד השדה). */
  campaignEndsOn?: string | null;
  /** ADS-2ב2: החלקה בין השלבים (מהרכיב עם המצב) והכיוון של המעבר האחרון (האנימציה). */
  touch?: { onTouchStart: (e: React.TouchEvent<HTMLElement>) => void; onTouchEnd: (e: React.TouchEvent<HTMLElement>) => void };
  slide?: "next" | "prev" | null;
  /** ADS-2ב2: התצוגה בעמוד של פורמט — רוחב והאפליקציה (נשמרים בין השלבים). */
  previewWidth?: 320 | 390; onPreviewWidth?: (w: 320 | 390) => void;
  previewApp?: "light" | "dark"; onPreviewApp?: (a: "light" | "dark") => void;
  /** ADS-2ב2: "ביטול" אחרי שמילאו משהו — שואלים בשורה (בלי חלון של הדפדפן); onKeepEditing — "המשך עריכה". */
  confirmCancel?: boolean; onKeepEditing?: () => void;
  /** ADS-2ב2: שדות שהמשתמש נשלח אליהם מ"מה חסר", או שיצא מהם — רק הם מסומנים באדום (לא תוך כדי הקלדה, ולא טופס שלא נגעו בו). */
  flagged?: readonly CheckField[]; onFlag?: (f: CheckField) => void;
  /** ADS-2ב2: "מילוי תיאור חסר" (מהכותרת או משם המפרסם) — המקור; ומה מולא אוטומטית (לפי התמונה), כדי לבקש לבדוק אותו. */
  onFillAlts?: (base: string) => void; autoAlts?: Record<string, string>;
}

/** "מה חסר": פריט לכל דבר, לחיצה מביאה לשדה (גם בשלב אחר); כשאין — "מוכן". */
export function Checklist({ checks, onJump, here, readyText, testId }: {
  checks: Missing[]; onJump: (c: Missing) => void; here: StepKey; readyText: string; testId: string;
}) {
  if (!checks.length) {
    return (
      <div role="status" data-checklist={testId} data-checklist-ready="" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "12px", border: "1px solid rgba(34,197,94,.4)", background: "rgba(34,197,94,.08)", color: "var(--text)", fontSize: "14px", fontWeight: 700 }}>
        <CheckCircle2 size={18} color="var(--green)" aria-hidden="true" />{readyText}
      </div>
    );
  }
  return (
    <section aria-label="מה חסר" data-checklist={testId} data-checklist-count={checks.length}
      style={{ ...col(6), padding: "10px 12px", borderRadius: "12px", border: "1px solid rgba(234,179,8,.45)", background: "rgba(234,179,8,.07)" }}>
      <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--text)" }}>
        {checks.length === 1 ? "חסר פרט אחד" : `חסרים ${checks.length} פרטים`} <span style={{ fontWeight: 500, color: "var(--text-2)", fontSize: "13px" }}>— לחיצה מביאה לשדה</span>
      </span>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
        {checks.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onJump(c)} data-check-jump={c.id}
              style={{ width: "100%", minHeight: "44px", display: "flex", alignItems: "center", gap: "8px", padding: "6px 4px", border: "none", background: "transparent", fontFamily: "inherit", textAlign: "right", cursor: "pointer", color: "var(--text)" }}>
              <AlertTriangle size={15} color="var(--yellow)" aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: "13.5px", lineHeight: 1.45 }}>
                {c.text}{c.step !== here && <span style={{ color: "var(--text-3)" }}> · בשלב {stepLabel(c.step)}</span>}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", color: "var(--blue)", fontSize: "13px", fontWeight: 700, flexShrink: 0 }}>לתיקון<ChevronLeft size={15} /></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CreativeStudioView(p: CreativeStudioViewProps) {
  const { form, boxes, imageBase } = p;
  const today = p.today ?? ilTodayKey();
  const editing = p.mode === "edit";
  const locked = editing && p.served;
  const uploading = Object.values(boxes).some((b) => b.busy);
  // the edit gate (one format): the old rule, word for word — every format ready, the shared accent and offer too
  const issues = form.formats.map((f) => ({ f, list: formIssues(f, form, imageBase) })).filter((x) => x.list.length);
  const accentProblem = accentIssue(form.accent);
  const offerProblems = offerIssues(form, today);
  const ready = issues.length === 0 && !accentProblem && offerProblems.length === 0 && !locked;
  const canSave = ready && !p.busy && !uploading && !p.stale;
  if (locked) return <LockedView p={p} today={today} />;

  const steps = wizardSteps(form.formats, editing ? "edit" : "new");
  const step = shownStep(p.step, steps);
  const running = p.batch?.some((x) => x.state === "saving") ?? false;
  // nothing in the way of an upload (each format still needs its own checks empty)
  const free = !p.busy && !uploading && !p.stale && !running;
  const uploaded = okFormats(p.batch).filter((f) => form.formats.includes(f));
  const content = contentChecks(form, today);
  const next = stepBeside(step, steps, 1);
  const prev = stepBeside(step, steps, -1);
  const notice = uploaded.length > 0 && uploaded.length < form.formats.length
    ? <Banner tone="info"><span data-creative-after-upload="">{afterUploadText(uploaded)}</span></Banner> : null;
  const stateOf = (s: StepKey): StepState => {
    if (s === "formats") return { kind: "info", text: String(form.formats.length), long: form.formats.length === 1 ? "נבחר פורמט אחד" : `נבחרו ${form.formats.length} פורמטים` };
    if (s === "content") return content.length ? { kind: "missing", count: content.length } : { kind: "ready" };
    if (s === "summary") return { kind: "info", text: `${uploaded.length}/${form.formats.length}`, long: `עלו ${uploaded.length} מתוך ${form.formats.length}` };
    // a format is "ready" only when it can go up — the shared content counts too (as on its page)
    return formatPill(s, formatChecks(s, form, imageBase, today), p.batch);
  };

  // ── the bar at the bottom: back (or cancel), the step's main action, next ──
  const back = prev
    ? <button type="button" style={ghostBtn} onClick={() => p.onStep(prev)} data-studio-back=""><ArrowRight size={16} />הקודם</button>
    : p.onCancel ? <button type="button" onClick={p.onCancel} disabled={p.busy} style={ghostBtn} data-creative-cancel="">{uploaded.length ? "סגירה" : "ביטול"}</button> : null;
  const nextBtn = (primary: boolean) => next && (
    <button type="button" style={primary ? solidBtn("var(--blue)") : ghostBtn} onClick={() => p.onStep(next)} data-studio-next={next}>
      הבא: {stepLabel(next)}<ChevronLeft size={16} />
    </button>
  );
  let main: React.ReactNode = nextBtn(true);
  let side: React.ReactNode = null;
  if (isFormatStep(step)) {
    const checks = formatChecks(step, form, imageBase, today);
    const m = formatMain(step, checks, p.batch, free);
    if (editing) {
      main = (
        <button type="button" onClick={p.onSave} disabled={!canSave} style={{ ...solidBtn("var(--blue)"), opacity: canSave ? 1 : 0.6 }} data-creative-save="">
          {p.busy ? "שומרים…" : "שמירת המודעה"}
        </button>
      );
    } else if (m.kind === "next") {
      main = nextBtn(true);
    } else if (m.kind === "complete") {
      main = (
        <button type="button" onClick={() => p.onJump(checks[0])} data-creative-complete={step}
          style={{ ...ghostBtn, borderColor: "rgba(234,179,8,.7)", color: "var(--text)", gap: "6px" }}>
          <AlertTriangle size={16} color="var(--yellow)" />להשלמה · {m.count === 1 ? "חסר פרט אחד" : `חסרים ${m.count}`}
        </button>
      );
      side = nextBtn(false);
    } else {
      main = (
        <button type="button" onClick={() => p.onPublish([step])} disabled={!m.enabled} data-creative-publish={step}
          style={{ ...solidBtn("var(--blue)"), opacity: m.enabled ? 1 : 0.6, gap: "6px" }}>
          <Upload size={17} />{m.label === "saving" ? "מעלים…" : m.label === "waiting" ? "בתור…" : m.label === "retry" ? "נסו שוב" : `העלאת ${FORMAT_INFO[step].label}`}
        </button>
      );
      side = nextBtn(false);
    }
  } else if (step === "summary") {
    const checksOf = (f: AdFormat) => formatChecks(f, form, imageBase, today);
    const readyNow = readyToUpload(form.formats, checksOf, p.batch);
    const missing = AD_FORMATS.find((f) => form.formats.includes(f) && summaryRow(f, checksOf(f), p.batch, p.stale).action === "complete");
    main = readyNow.length > 0
      ? (
        <button type="button" onClick={() => p.onPublish(readyNow)} disabled={!free} data-creative-publish-all={readyNow.length}
          style={{ ...solidBtn("var(--blue)"), opacity: free ? 1 : 0.6, gap: "6px" }}>
          <Upload size={17} />{running ? "מעלים…" : readyNow.length === 1 ? `העלאת ${FORMAT_INFO[readyNow[0]].label}` : `העלאת כל המוכנות (${readyNow.length})`}
        </button>
      )
      : missing
        ? <button type="button" onClick={() => p.onJump(formatChecks(missing, form, imageBase, today)[0])} data-creative-complete={missing}
          style={{ ...ghostBtn, borderColor: "rgba(234,179,8,.7)", gap: "6px" }}><AlertTriangle size={16} color="var(--yellow)" />להשלמה: {FORMAT_INFO[missing].label}</button>
        : null;
    side = (uploaded.length > 0 || p.onCancel) && (
      <button type="button" onClick={p.onFinish} disabled={p.busy} style={ghostBtn} data-creative-finish="">{uploaded.length ? "סיום" : "ביטול"}</button>
    );
  }

  return (
    <div style={col(14)} data-creative-studio={p.mode} data-studio-step={step}>
      <style>{STUDIO_CSS + WIZARD_CSS}</style>
      {p.mode === "duplicate" && <Banner tone="info"><span data-creative-copy="">עותק של מודעה קיימת — משנים מה שרוצים, והיא תיווצר כמודעה חדשה. את הישנה אפשר להשבית אחר כך.</span></Banner>}
      <WizardSteps steps={steps} current={step} state={stateOf} onStep={(s) => p.onStep(s)} />
      {steps.length > 2 && <span className="studio-narrow-only" style={hint} data-swipe-hint="">החלקה ימינה — לשלב הבא, שמאלה — לקודם.</span>}
      <div key={step} className={`studio-anim${p.slide ? ` wiz-in-${p.slide}` : ""}`} style={{ minWidth: 0 }} data-wizard-body={step}
        onTouchStart={p.touch?.onTouchStart} onTouchEnd={p.touch?.onTouchEnd}>
        {/* while an upload runs what is edited is locked (Lock, as before ADS-2ב2); the preview, "מה חסר" and the steps stay open */}
        {step === "formats" && <FormatsStep p={p} uploaded={uploaded} />}
        {step === "content" && <ContentStep p={p} today={today} content={content} notice={notice} />}
        {isFormatStep(step) && <FormatStep p={p} format={step} today={today} locked={locked} notice={batchOf(p.batch, step)?.state === "ok" ? null : notice} />}
        {step === "summary" && <SummaryStep p={p} today={today} free={free} />}
      </div>

      {p.err && (
        <Banner tone="error" action={p.stale ? <button type="button" style={ghostBtn} onClick={p.onRecheck} data-creative-recheck="">סגירה ורענון</button> : undefined}>
          <span data-creative-error="">{p.err}</span>
        </Banner>
      )}
      {p.stale && !p.err && (
        <Banner tone="warn" action={<button type="button" style={ghostBtn} onClick={p.onRecheck} data-creative-recheck="">סגירה ורענון</button>}>
          <span data-creative-stale="">ייתכן שבוצע — רעננו. התשובה מ-bloc לא ברורה, ולכן לא מעלים שוב עד שבודקים מה כבר נוצר.</span>
        </Banner>
      )}

      {p.confirmCancel ? (
        <StickyBar testId="studio-cancel">
          <span role="alert" style={{ flex: "1 1 100%", fontSize: "14px", fontWeight: 700, color: "var(--text)", lineHeight: 1.5 }} data-creative-cancel-ask="">
            {leaveText(p.mode, uploaded, form.formats.filter((f) => !uploaded.includes(f)))}
          </span>
          <button type="button" style={{ ...ghostBtn, color: "var(--red)", borderColor: "rgba(239,68,68,.5)", opacity: p.busy ? 0.5 : 1 }} onClick={p.onCancel} disabled={p.busy} data-creative-cancel-yes="">{leaveYes(p.mode)}</button>
          <button type="button" style={solidBtn("var(--blue)")} onClick={p.onKeepEditing} data-creative-cancel-no="">המשך עריכה</button>
        </StickyBar>
      ) : (
        <StickyBar testId="studio">{back}{main}{side}</StickyBar>
      )}
    </div>
  );
}

/** מודעה שכבר הוצגה: נעולה — רק התצוגה והשכפול. */
function LockedView({ p, today }: { p: CreativeStudioViewProps; today: string }) {
  return (
    <div style={col(14)} data-creative-studio={p.mode}>
      <style>{STUDIO_CSS + WIZARD_CSS}</style>
      <Banner tone="info" action={<button type="button" style={ghostBtn} onClick={p.onDuplicate} data-creative-duplicate=""><Copy size={15} />שכפול כמודעה חדשה</button>}>
        <span data-creative-locked=""><b>{CREATIVE_LOCKED_TEXT}.</b> המודעה כבר הוצגה, ולכן הפורמט, התמונות והטקסטים שלה קבועים.</span>
      </Banner>
      <div id="creative-preview" className="wiz-side" style={{ alignSelf: "stretch" }}>
        <StudioPreview formats={p.form.formats.slice(0, 1)} props={(f) => previewFromForm(f, p.form, { advertiser: p.advertiser, advertiserLogo: p.advertiserLogo, imageBase: p.imageBase, today })} />
      </div>
      {p.onCancel && <div><button type="button" onClick={p.onCancel} style={ghostBtn}>סגירה</button></div>}
    </div>
  );
}

/** שלב 1: באילו פורמטים. פורמט שכבר עלה נשאר מסומן. */
function FormatsStep({ p, uploaded }: { p: CreativeStudioViewProps; uploaded: AdFormat[] }) {
  const { form, onForm } = p;
  return (
    <section style={col(10)} aria-label="פורמטים" data-step-formats="">
      <h3 style={h3}>באילו פורמטים?</h3>
      <p style={lead}>בוחרים פורמט אחד או כמה. לכל פורמט נוצרת מודעה משלו, ובהמשך יש לכל אחד עמוד — עם התמונה, התצוגה וכפתור העלאה משלו.</p>
      <Lock on={p.busy}>
        <FormatGallery value={form.formats} onChange={(formats) => onForm({ ...form, formats })} bannerPosition={form.banner_position} animate={p.animate} locked={uploaded} />
      </Lock>
    </section>
  );
}

/** שלב 2: התוכן המשותף — טקסטים, קישור, צבע הכפתור, קופון ומבצע; תצוגה של כל הפורמטים. */
function ContentStep({ p, today, content, notice }: { p: CreativeStudioViewProps; today: string; content: Missing[]; notice: React.ReactNode }) {
  const { form, onForm, imageBase } = p;
  const link = finalLink(form.cta_url, p.campaignId);
  const bodyFormats = form.formats.filter((f) => SHOWS_BODY[f]);
  const flagged = p.flagged ?? [];
  // a field is marked once "מה חסר" sent the user to it, or once the user left it — never while typing, never on an untouched form
  const issue = (field: CheckField) => (flagged.includes(field) ? content.find((x) => x.field === field) ?? null : null);
  const head = issue("headline");
  const label = issue("cta_label");
  const url = issue("cta_url");
  const flag = (field: CheckField) => () => p.onFlag?.(field);
  // the reason as the list says it (no period: a sentence ending in "https://" would read as part of the address)
  const err = (field: CheckField, c: Missing | null) => c && <span id={`content-issue-${field}`} style={errText} data-content-issue={field}>{c.text}</span>;
  return (
    <div className="wiz-cols" data-step-content="">
      <div className="wiz-main">
        {notice}
        <Lock on={p.busy}>
        <section style={col(10)} aria-label="טקסטים">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
            <h3 style={h3}>הטקסטים</h3>
            <a href="#creative-preview" className="studio-narrow-only" style={{ fontSize: "13px", color: "var(--blue)", textDecoration: "none", minHeight: "32px", display: "inline-flex", alignItems: "center" }} data-creative-preview-link="">לתצוגה המקדימה ↓</a>
          </div>
          <p style={lead}>{form.formats.length > 1 ? `הטקסטים, הקישור וצבע הכפתור משותפים ל-${form.formats.length} הפורמטים.` : "הטקסטים, הקישור וצבע הכפתור של המודעה."}</p>
          <div className="studio-scroll" role="group" aria-label="תבניות" data-creative-templates="">
            {TEMPLATES.map((t) => (
              <button key={t.key} type="button" data-template={t.key} onClick={() => onForm({ ...form, headline: t.headline, body: t.body, cta_label: t.cta_label })}
                style={{ minHeight: "40px", padding: "0 14px", borderRadius: "99px", border: "1px dashed var(--border-2)", background: "transparent", color: "var(--text)", fontSize: "13.5px", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit" }}>
                {t.label}
              </button>
            ))}
          </div>
          <Field label={`כותרת (${form.headline.length}/60)`}>
            <input value={form.headline} maxLength={60} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onForm({ ...form, headline: e.target.value })} onBlur={flag("headline")}
              aria-invalid={head ? true : undefined} aria-describedby={head ? "content-issue-headline" : undefined} style={{ ...inputStyle, ...red(!!head) }} data-creative-field="headline" />
          </Field>
          {err("headline", head)}
          <Field label={`משפט (לא חובה, ${form.body.length}/180)`} hint={bodyFormats.length ? `מוצג ב: ${bodyFormats.map((f) => FORMAT_INFO[f].label).join(", ")}.` : "בפורמטים שנבחרו לא מוצג משפט — רק כותרת."}>
            <textarea value={form.body} maxLength={180} rows={2} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onForm({ ...form, body: e.target.value })}
              style={{ ...inputStyle, minHeight: "72px", padding: "10px 14px", lineHeight: 1.5, resize: "vertical" }} data-creative-field="body" />
          </Field>
          <Field label={`הכפתור (${form.cta_label.length}/24)`}>
            <input value={form.cta_label} maxLength={24} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onForm({ ...form, cta_label: e.target.value })} onBlur={flag("cta_label")}
              aria-invalid={label ? true : undefined} aria-describedby={label ? "content-issue-cta_label" : undefined} style={{ ...inputStyle, ...red(!!label) }} data-creative-field="cta_label" />
          </Field>
          {err("cta_label", label)}
          <Field label={form.formats.includes("carousel") ? "לאן הכפתור מוביל (כשלכרטיס אין קישור משלו)" : "לאן הכפתור מוביל"}>
            <input value={form.cta_url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onForm({ ...form, cta_url: e.target.value })} onBlur={flag("cta_url")} placeholder="https://" dir="ltr" inputMode="url"
              aria-invalid={url ? true : undefined} aria-describedby={url ? "content-issue-cta_url" : undefined} style={{ ...inputStyle, ...red(!!url) }} data-creative-field="cta_url" />
          </Field>
          {err("cta_url", url)}
          {link && (
            <div style={{ fontSize: "12.5px", color: "var(--text-2)", lineHeight: 1.5 }} data-creative-final-link={link.own ? "own" : "utm"}>
              הדייר יפתח: <bdi dir="ltr" style={{ overflowWrap: "anywhere", color: "var(--text)", fontFamily: "var(--mono)" }}>{link.href}</bdi>
              {link.own ? " — יש בקישור תגי utm משלכם, ולכן bloc לא מוסיף." : " — bloc מוסיף תגי utm כדי שתראו באנליטיקס שלכם מה הגיע מהמודעה."}
            </div>
          )}
        </section>

        <section style={col(10)} aria-label="צבע הכפתור">
          <h3 style={h3}>צבע הכפתור</h3>
          <AccentPicker value={form.accent} brand={p.brandColor} ctaLabel={form.cta_label} onChange={(accent) => onForm({ ...form, accent })} disabled={false} />
        </section>

        <section style={col(10)} aria-label="קופון ומבצע" data-creative-offer-section="">
          <h3 style={{ ...h3, display: "flex", alignItems: "center", gap: "6px" }}><Gift size={16} aria-hidden="true" />קופון ומבצע (לא חובה)</h3>
          <OfferFields coupon={form.coupon_code} offerEndsOn={form.offer_ends_on} today={today} formats={form.formats} campaignEndsOn={p.campaignEndsOn ?? null}
            onChange={(v) => onForm({ ...form, ...v })} />
        </section>
        </Lock>

        <Checklist checks={content} onJump={p.onJump} here="content" readyText="התוכן מוכן." testId="content" />
      </div>
      <div id="creative-preview" className="wiz-side">
        <StudioPreview formats={form.formats} props={(f) => previewFromForm(f, form, { advertiser: p.advertiser, advertiserLogo: p.advertiserLogo, imageBase, today })} />
        {longAdvertiserName(p.advertiser) && (
          <p data-creative-long-name={p.advertiser.trim().length} style={{ maxWidth: "340px", fontSize: "12.5px", color: "var(--text-2)", lineHeight: 1.55, padding: "8px 10px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)" }}>
            {longAdvertiserText(p.advertiser)} אפשר לקצר את השם בדף המפרסם.
          </p>
        )}
      </div>
    </div>
  );
}

/** עמוד של פורמט: התמונה (או התמונות), הסגנון שלו, התצוגה שלו, מה חסר, ומה קרה בהעלאה. */
function FormatStep({ p, format, today, locked, notice }: { p: CreativeStudioViewProps; format: AdFormat; today: string; locked: boolean; notice: React.ReactNode }) {
  const { form, onForm, boxes, imageBase } = p;
  const info = FORMAT_INFO[format];
  const b = batchOf(p.batch, format);
  const done = b?.state === "ok";
  const checks = formatChecks(format, form, imageBase, today);
  const singles = form.formats.filter((f) => !FORMAT_INFO[f].frames);
  const multis = form.formats.filter((f) => FORMAT_INFO[f].frames);
  const foreign = (u: string) => isOurAdImage(u, imageBase) === false;
  const own = !!form.overrides[format];
  const target = own ? overrideKey(format) : SHARED;
  const img: ImagePick = imageFor(form, format);
  const setImg = (patch: Partial<ImagePick>) => {
    if (own) onForm({ ...form, overrides: { ...form.overrides, [format]: { ...imageFor(form, format), ...patch } } });
    else onForm({ ...form, image: { ...form.image, ...patch } });
  };
  const sharing = singles.filter((f) => f !== format && !form.overrides[f]);
  const altBad = !!img.image_url && img.image_alt.trim().length < 2;
  const bannerCoupon = format === "banner" ? bannerCouponWarning(form.formats, form.coupon_code) : null;
  // "מילוי תיאור חסר": מהכותרת, ואם אין — משם המפרסם (הכפתור אומר מאיפה); "תמונה N" גם בקרוסלה — התמונות משותפות לשניהם
  const src = fillSource(form.headline, p.advertiser);
  const fill = src && hasMissingAlt(form.frames)
    ? () => (p.onFillAlts ? p.onFillAlts(src.base) : onForm({ ...form, frames: fillMissingAlts(form.frames, src.base, "תמונה").frames }))
    : null;
  return (
    <div style={col(14)} data-format-step={format}>
      <header style={col(4)}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FormatGlyph format={format} size={18} />
          <h3 style={{ ...h3, fontSize: "17px" }}>{info.label}</h3>
          <span className="studio-num" style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>{info.image.ratio}</span>
        </div>
        <p style={lead}>{info.line}</p>
      </header>
      <div className="wiz-cols">
      <div className="wiz-main">
        {notice}
        {done && (
          <Banner tone="ok"><span data-batch-item={format} data-batch-state="ok">המודעה ב{info.label} עלתה — היא ברשימת המודעות של הקמפיין.</span></Banner>
        )}
        {b && b.state !== "ok" && (
          <div data-batch-item={format} data-batch-state={b.state}
            style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${b.state === "failed" ? "#ef444466" : b.state === "unclear" ? "#eab30866" : "var(--border)"}` }}>
            <span aria-hidden="true" style={{ marginTop: "2px", color: b.state === "failed" ? "var(--red)" : b.state === "unclear" ? "var(--yellow)" : "var(--text-3)" }}>
              {b.state === "failed" ? <X size={17} /> : b.state === "unclear" ? <AlertTriangle size={17} /> : b.state === "saving" ? <RefreshCw size={17} /> : <Clock size={15} />}
            </span>
            <span style={{ flex: 1, minWidth: 0, ...col(2) }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>המודעה ב{info.label} — {BATCH_TEXT[b.state]}</span>
              {b.error && <span role={b.state === "failed" ? "alert" : undefined} style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }} data-batch-error={format}>{b.error}</span>}
            </span>
          </div>
        )}

        {!done && <Lock on={p.busy}>
        {!info.frames && (
          <section style={col(10)} aria-label="התמונה" data-creative-image-section={own ? "separate" : "shared"} data-image-format={format}>
            <h3 style={h3}>התמונה</h3>
            {singles.length > 1 && (
              <Segmented label={`התמונה של ${info.label}`} testId="image-mode" value={own ? "separate" : "shared"}
                onChange={(v) => {
                  if (v === "separate") onForm({ ...form, overrides: { ...form.overrides, [format]: { ...emptyImage(), image_alt: form.image.image_alt } } });
                  else { const o = { ...form.overrides }; delete o[format]; onForm({ ...form, overrides: o }); }
                }}
                options={[{ key: "shared", label: "המשותפת" }, { key: "separate", label: "רק לפורמט הזה" }]} />
            )}
            <span style={hint} data-image-share={own ? "own" : sharing.length}>
              {own ? `תמונה רק ל${info.label}. שאר הפורמטים ממשיכים עם המשותפת.`
                : sharing.length ? `אותה תמונה משמשת גם את: ${labels(sharing)} — לכל פורמט החיתוך שלו.` : imageHint(format)}
            </span>
            {boxes[target] && (
              <CreativeImageField url={foreign(img.image_url) ? "" : img.image_url} box={boxes[target]} locked={locked} onPick={() => p.onPick(target)}
                shape={{ w: 64, h: Math.max(36, Math.min(110, Math.round((64 * info.image.h) / info.image.w))), label: info.image.ratio }} />
            )}
            {own && (
              <button type="button" style={{ ...linkBtn, alignSelf: "flex-start" }} data-image-back={format}
                onClick={() => { const o = { ...form.overrides }; delete o[format]; onForm({ ...form, overrides: o }); }}>
                חזרה לתמונה המשותפת
              </button>
            )}
            <FocalPicker url={img.image_url && !foreign(img.image_url) ? img.image_url : null} alt={img.image_alt} focal={img.focal} disabled={locked || p.busy}
              formats={[format]} onFocal={(focal) => setImg({ focal })} />
            {!own && sharing.length > 0 && img.image_url && <span style={hint}>נקודת המיקוד משותפת לכל הפורמטים עם התמונה הזו.</span>}
            <Field label="מה רואים בתמונה (לקורא מסך)" hint={altBad ? "חובה — 2 עד 200 תווים. למשל: \"פיצה משפחתית על שולחן עץ\"." : undefined}>
              <input value={img.image_alt} maxLength={200} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setImg({ image_alt: e.target.value })}
                aria-invalid={altBad || undefined} style={{ ...inputStyle, ...red(altBad) }} data-creative-field="image_alt" />
            </Field>
          </section>
        )}

        {info.frames && (
          <section aria-label={format === "carousel" ? "הכרטיסים בקרוסלה" : "התמונות בסטורי"} data-frames-section={format}>
            <FramesStrip formats={multis} frames={form.frames} selected={p.frameSel} onSelect={p.onFrameSel} imageBase={imageBase}
              onChange={(frames, sel) => { onForm({ ...form, frames }); if (sel !== undefined) p.onFrameSel(sel); }}
              boxes={boxes} onPick={p.onPick} onAdd={p.onAddFrame} locked={locked} busy={p.busy} refusedFrame={p.refusedFrame}
              issues={frameIssues(format, form, imageBase)} onPickMany={p.onPickMany ?? null} manyNote={p.manyNote ?? null}
              onFillAlts={fill} fillLabel={src?.label} autoAlts={p.autoAlts ?? null} />
          </section>
        )}

        {(info.theme || format === "banner") && (
          <section style={col(12)} aria-label="הסגנון של הפורמט">
            <h3 style={h3}>הסגנון</h3>
            {info.theme && (
              <div style={col(6)} data-creative-theme={form.theme}>
                <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>
                  רקע{form.formats.filter((f) => f !== format && FORMAT_INFO[f].theme).length ? ` (משותף גם ל: ${labels(form.formats.filter((f) => f !== format && FORMAT_INFO[f].theme))})` : ""}
                </span>
                <Segmented label="רקע" testId="theme" value={form.theme} onChange={(theme) => onForm({ ...form, theme })}
                  options={AD_THEMES.map((t) => ({ key: t, label: THEME_LABEL[t] }))} />
              </div>
            )}
            {format === "banner" && (
              <div style={col(6)} data-creative-banner-position={form.banner_position}>
                <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>איפה הפס מוצג</span>
                <Segmented label="מיקום הפס" testId="banner-position" value={form.banner_position} onChange={(banner_position) => onForm({ ...form, banner_position })}
                  options={BANNER_POSITIONS.map((x) => ({ key: x, label: BANNER_POSITION_LABEL[x] }))} />
                <span style={hint}>{form.banner_position === "top" ? "בראש מסך הבית — נגלל עם התוכן." : "קבוע בתחתית, מעל הניווט — נשאר גלוי גם בגלילה."}</span>
              </div>
            )}
            {bannerCoupon && <Banner tone="warn"><span data-creative-banner-coupon="">{bannerCoupon}</span></Banner>}
          </section>
        )}
        </Lock>}

        {!done && <Checklist checks={checks} onJump={p.onJump} here={format} readyText={isEdit(p) ? "מוכן לשמירה." : "מוכן להעלאה."} testId={format} />}
      </div>
      <div id="creative-preview" className="wiz-side wiz-preview-first">
        <StudioPreviewView formats={[format]} active={format} onActive={() => {}} width={p.previewWidth ?? 390} onWidth={p.onPreviewWidth ?? (() => {})}
          app={p.previewApp ?? "light"} onApp={p.onPreviewApp ?? (() => {})} frame={info.frames ? p.frameSel : 0} onFrame={info.frames ? p.onFrameSel : () => {}}
          props={(f) => previewFromForm(f, form, { advertiser: p.advertiser, advertiserLogo: p.advertiserLogo, imageBase, today })} />
      </div>
      </div>
    </div>
  );
}
const isEdit = (p: CreativeStudioViewProps) => p.mode === "edit";

/** הסיכום: שורה לכל פורמט — עלתה / מוכנה / חסר / לא עלתה — עם הפעולה שלה. */
function SummaryStep({ p, today, free }: { p: CreativeStudioViewProps; today: string; free: boolean }) {
  const { form, imageBase } = p;
  const chosen = AD_FORMATS.filter((f) => form.formats.includes(f));
  return (
    <section style={col(12)} aria-label="סיכום והעלאה" data-wizard-summary="">
      <h3 style={h3}>סיכום והעלאה</h3>
      <p style={lead}>כל פורמט עולה כמודעה נפרדת. אפשר להעלות כל אחת לבד, או את כל המוכנות בבת אחת.</p>
      <ul aria-label="הפורמטים" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}
        data-creative-batch={(p.batch ?? []).map((x) => `${x.format}:${x.state}`).join(",")}>
        {chosen.map((f) => {
          const b = batchOf(p.batch, f);
          const checks = formatChecks(f, form, imageBase, today);
          const { state: st, action } = summaryRow(f, checks, p.batch, p.stale);
          const missingText = checks.length === 1 ? "חסר פרט אחד" : `חסרים ${checks.length}`;
          const text = b ? (b.state === "failed" && checks.length ? `${BATCH_TEXT.failed} · ${missingText}` : BATCH_TEXT[b.state]) : checks.length ? missingText : "מוכנה להעלאה";
          const tone = st === "ok" || st === "ready" ? "var(--green)" : st === "failed" ? "var(--red)" : st === "missing" || st === "unclear" ? "var(--yellow)" : "var(--text-3)";
          return (
            <li key={f} data-summary-row={f} data-summary-state={st} {...(b ? { "data-batch-item": f, "data-batch-state": b.state } : {})}
              style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", border: `1px solid ${st === "failed" ? "#ef444466" : "var(--border)"}`, background: "var(--card)" }}>
              <FormatGlyph format={f} size={18} />
              <span style={{ flex: "1 1 120px", minWidth: 0, ...col(2) }}>
                <span style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text)" }}>{FORMAT_INFO[f].label}</span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: tone }} data-summary-text={f}>{text}</span>
              </span>
              {action === "publish" && (
                <button type="button" style={{ ...solidBtn("var(--blue)"), minHeight: "44px", opacity: free ? 1 : 0.6 }} disabled={!free} onClick={() => p.onPublish([f])} data-summary-publish={f}>העלאה</button>
              )}
              {action === "complete" && <button type="button" style={{ ...ghostBtn, minHeight: "44px" }} onClick={() => p.onJump(checks[0])} data-summary-complete={f}>להשלמה</button>}
              {action === "retry" && (
                <button type="button" style={{ ...linkBtn, minHeight: "44px" }} disabled={!free} onClick={() => p.onPublish([f])} data-batch-retry={f}>נסו שוב</button>
              )}
              {b?.error && <span role={b.state === "failed" ? "alert" : undefined} style={{ flex: "1 1 100%", fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }} data-batch-error={f}>{b.error}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** הטופס בפתיחה: מודעה קיימת (עריכה / עותק) — ממנה; חדשה — ריקה עם צבע המותג, ומתבנית אם נבחרה (?template=perk). */
export function initialCreativeForm(mode: StudioMode, template: string | null | undefined, brandColor: string | null, key: (i: number) => string): CreativeForm {
  if (mode.kind !== "new") return formFromCreative(mode.creative, key);
  const f = emptyCreativeForm(key, brandColor);
  const t = TEMPLATES.find((x) => x.key === template);
  return t ? { ...f, headline: t.headline, body: t.body, cta_label: t.cta_label } : f;
}

export default function CreativeStudio({ campaignId, advertiser, advertiserLogo = null, brandColor = null, mode: initialMode, imageBase = STUDIO_IMAGE_BASE, template, onDone, onCancel, animate = true, today, campaignEndsOn = null, onState }: {
  campaignId: string; advertiser: string; advertiserLogo?: string | null; brandColor?: string | null; mode: StudioMode;
  /** ADS-2ב1: היום לפי שעון ישראל (בבדיקות); וסוף הקמפיין — להערה ליד סוף המבצע. */
  today?: string; campaignEndsOn?: string | null;
  /** בבדיקות בלבד — ברירת המחדל מ-NEXT_PUBLIC_SUPABASE_URL. */
  imageBase?: string | null;
  /** מילוי מוכן מתבנית (?template=sale). */
  template?: string | null;
  /** הצליח (או "סגירה ורענון") — ההורה סוגר ומרענן. */
  onDone: (msg: string) => void; onCancel?: () => void; animate?: boolean;
  /**
   * ADS-2ב2 (החלטה 399): המצב להורה — באמצע העלאה (הגיליון לא נסגר), יש עבודה שלא עלתה / לא נשמרה (שואלים לפני סגירה), מה עלה
   * ומה לא (המשפט, והרענון אחרי סגירה), ותשובה לא ברורה (רענון).
   */
  onState?: (s: StudioState) => void;
}) {
  const seq = useRef(0);
  const nextKey = () => `f${++seq.current}`;
  const [mode, setMode] = useState<StudioMode>(initialMode);
  const [form, setFormState] = useState<CreativeForm>(() => initialCreativeForm(initialMode, template, brandColor, nextKey));
  const formRef = useRef(form);
  const setForm = (f: CreativeForm) => { formRef.current = f; setFormState(f); };
  const initial = useRef(JSON.stringify(form));
  // ADS-2ב2: a new ad starts at its formats; a copy and an edit at the content (the format is already there)
  const [step, setStep] = useState<StepKey>(initialMode.kind === "new" ? "formats" : "content");
  const [slide, setSlide] = useState<"next" | "prev" | null>(null);
  const [focusReq, setFocusReq] = useState<{ sel: string; n: number } | null>(null);
  const [previewWidth, setPreviewWidth] = useState<320 | 390>(390);
  const [previewApp, setPreviewApp] = useState<"light" | "dark">("light");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [manyNote, setManyNote] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<CheckField[]>([]);
  const [autoAlts, setAutoAlts] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [frameSel, setFrameSel] = useState(0);
  const [batch, setBatch] = useState<BatchItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const manyRef = useRef<HTMLInputElement | null>(null);
  const manyUnit = useRef("תמונות");
  const pickFor = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const touchAt = useRef<{ x: number; y: number; t: number } | null>(null);
  // after the studio is gone (the sheet closed, the wizard left the step) no further request is sent
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const steps = wizardSteps(form.formats, mode.kind === "edit" ? "edit" : "new");
  const shown = shownStep(step, steps);
  /** ADS-2ב2: מעבר שלב — כיוון לאנימציה, ביטול השאלה של "ביטול", וחזרה לראש השלב. */
  const go = (s: StepKey) => {
    if (s === shown) return;
    setSlide(steps.indexOf(s) >= steps.indexOf(shown) ? "next" : "prev");
    setStep(s);
    setConfirmCancel(false);
    rootRef.current?.scrollIntoView?.({ block: "start" });
  };
  /** החלטה 396: אצבע ימינה — הבא, שמאלה — הקודם; לא כשהמגע התחיל בשדה, במחוון, בנקודת המיקוד או בשורה שגוללת לצד. */
  const touch = {
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
      const t = e.touches[0];
      const from = e.target as Element | null;
      touchAt.current = !t || e.touches.length > 1 || from?.closest?.(NO_SWIPE) ? null : { x: t.clientX, y: t.clientY, t: Date.now() };
    },
    onTouchEnd: (e: React.TouchEvent<HTMLElement>) => {
      const s = touchAt.current;
      touchAt.current = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      const intent = swipeIntent(t.clientX - s.x, t.clientY - s.y, Date.now() - s.t);
      const to = intent ? stepBeside(shown, steps, intent === "next" ? 1 : -1) : null;
      if (to) go(to);
    },
  };
  /** החלטה 395: הקפיצה לשדה — אחרי שהשלב מוצג: גלילה אליו, מיקוד, והבלטה קצרה. */
  useEffect(() => {
    if (!focusReq) return;
    const id = requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(focusReq.sel);
      if (!el) return;
      el.scrollIntoView?.({ block: "center" });
      el.focus?.({ preventScroll: true });
      el.classList.add("wiz-flash");
      window.setTimeout(() => el.classList.remove("wiz-flash"), 1400);
    });
    return () => cancelAnimationFrame(id);
  }, [focusReq]);
  // a new step: the "שלב X מתוך N" line takes the focus (a screen reader hears where it is; the button that was pressed is gone)
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    rootRef.current?.querySelector<HTMLElement>("[data-wizard-where]")?.focus?.({ preventScroll: true });
  }, [shown]);
  const jump = (c: Missing) => {
    go(c.step);
    if (c.frame !== undefined) setFrameSel(c.frame);
    setFlagged((xs) => (xs.includes(c.field) ? xs : [...xs, c.field]));
    setFocusReq({ sel: checkSelector(c), n: Date.now() });
  };
  // the exit question takes the focus on "המשך עריכה" (the "ביטול" button that was pressed is gone)
  useEffect(() => {
    if (confirmCancel) rootRef.current?.querySelector<HTMLElement>("[data-creative-cancel-no]")?.focus?.();
  }, [confirmCancel]);
  // an upload started under the question: the question is gone (as in the sheet and the campaign wizard — exitPlan: busy → none)
  useEffect(() => { if (busy) setConfirmCancel(false); }, [busy]);

  const done = allUploaded(form.formats, batch);
  const dirty = !done && JSON.stringify(form) !== initial.current;
  const upNow = okFormats(batch).filter((x) => form.formats.includes(x));
  const maybe = stale || (batch ?? []).some((x) => x.state === "unclear");
  // what the parent needs (the sheet: no closing mid-upload, ask when work would be lost, refresh after; the wizard: the same)
  const report: StudioState = { busy, dirty, up: upNow, rest: form.formats.filter((x) => !upNow.includes(x)), maybe };
  const reportKey = JSON.stringify(report);
  useEffect(() => { onState?.(JSON.parse(reportKey) as StudioState); }, [reportKey, onState]);

  const targetOf = (f: AdFormat) => (FORMAT_INFO[f].frames ? null : formRef.current.overrides[f] ? overrideKey(f) : SHARED);
  const refuse = (key: string, text: string) => setRefusals((m) => ({ ...m, [key]: text }));
  const setRefusal = (text: string) => { const f = formRef.current.formats[0]; refuse(targetOf(f) ?? SHARED, text); };

  /** העלאת קובץ ליעד אחד (התמונה המשותפת, תמונה של פורמט, או תמונה בסטורי / בקרוסלה). */
  async function uploadTo(key: string, file: File) {
    setErr(null);
    setRefusals((m) => { const o = { ...m }; delete o[key]; return o; });
    const mark = (s: UploadState) => setUploads((m) => ({ ...m, [key]: s }));
    if (file.size > AD_IMAGE_MAX_BYTES) { mark({ phase: "failed", error: TOO_BIG_TEXT }); return; }
    if (!alive.current) return;
    mark({ phase: "uploading", name: file.name });
    const r = await uploadAdImage(file);
    if (!alive.current) return;
    if (!r.ok) { mark({ phase: "failed", error: r.error }); return; }
    const f = formRef.current;
    const fresh = { image_url: r.url, focal: [0.5, 0.5] as [number, number] };
    if (key === SHARED) setForm({ ...f, image: { ...f.image, ...fresh } });
    else if (key.startsWith("img:")) { const fmt = key.slice(4) as AdFormat; setForm({ ...f, overrides: { ...f.overrides, [fmt]: { ...(f.overrides[fmt] ?? { ...emptyImage(), image_alt: f.image.image_alt }), ...fresh } } }); }
    else setForm({ ...f, frames: f.frames.map((x) => (x.key === key ? { ...x, ...fresh } : x)) });
    mark({ phase: "done", name: file.name });
  }
  async function pickImage(file: File | undefined) {
    const key = pickFor.current;
    pickFor.current = null;
    if (!file || !key) return;
    await uploadTo(key, file);
  }
  /** החלטה 397: כמה תמונות בבת אחת — לתמונות הריקות, ואחר כך תמונות חדשות עד 5; אחת אחרי השנייה. */
  async function pickMany(files: File[]) {
    if (!files.length) return;
    const plan = slotsForMany(formRef.current.frames, files.length);
    if (!plan.taken) { setManyNote(`אין מקום לעוד ${manyUnit.current} — עד ${FRAMES_MAX}.`); return; }
    const keys = [...plan.fill];
    if (plan.add) {
      const added = Array.from({ length: plan.add }, () => emptyFrame(nextKey()));
      keys.push(...added.map((x) => x.key));
      setForm({ ...formRef.current, frames: [...formRef.current.frames, ...added] });
    }
    setManyNote(plan.taken < files.length ? `נכנסו ${plan.taken} מתוך ${files.length} — עד ${FRAMES_MAX} ${manyUnit.current}.` : null);
    setFrameSel(Math.max(0, formRef.current.frames.findIndex((x) => x.key === keys[0])));
    for (let i = 0; i < keys.length; i++) { if (!alive.current) return; await uploadTo(keys[i], files[i]); }
  }

  /**
   * העלאה: אחד אחרי השני; נכשל — ממשיכים לבא בתור (ולכל אחד "נסו שוב"); לא ברור — עוצרים. הכל עלה — onDone. כל הבקשות נבנות
   * מתמונת מצב של הטופס מהרגע שלחצו (הטופס גם נעול בזמן הריצה); הסטודיו נסגר באמצע — לא נשלחת בקשה נוספת.
   */
  async function run(start: BatchItem[]) {
    const snap = formRef.current;
    setBusy(true); setErr(null);
    const list = await runBatch(start, async (format) => {
      if (!alive.current) return { ok: false, error: "הסטודיו נסגר לפני ההעלאה.", unclear: false };
      const r = await postAds<{ id: string }>(creativePayloadFor(format, snap, campaignId));
      if (r.ok) return { ok: true, id: r.data.id };
      // bloc דחה תמונה מסוימת — המשפט גם ליד התמונה הזו (בסטורי / בקרוסלה לפי המספר שלה).
      if (r.frame !== undefined && FORMAT_INFO[format].frames) { const k = snap.frames[r.frame]?.key; if (k) refuse(k, r.error); }
      else if (r.code === "image_not_ours") refuse(targetOf(format) ?? SHARED, r.error);
      // לא ברור (ייתכן שנוצרה) — אין העלאה נוספת עד רענון
      if (lockedAfter(r, true)) setStale(true);
      return { ok: false, error: r.error, unclear: r.unclear };
    }, setBatch);
    if (!alive.current) return;
    setBusy(false);
    if (allUploaded(snap.formats, list)) onDone(doneText(snap.formats.length));
  }

  async function saveEdit() {
    if (mode.kind !== "edit") return;
    const draft = { id: mode.creative.id };
    setBusy(true); setErr(null); setRefusals({});
    const r = await postAds(creativePayloadFor(formRef.current.formats[0], formRef.current, campaignId, draft.id));
    setBusy(false);
    if (!r.ok) {
      if (r.frame !== undefined && FORMAT_INFO[formRef.current.formats[0]].frames) { const k = formRef.current.frames[r.frame]?.key; if (k) refuse(k, r.error); setErr(r.error); return; }
      if (r.code === "image_not_ours") { setRefusal(r.error); return; }
      setErr(r.error);
      if (lockedAfter(r, !draft.id)) setStale(true);
      return;
    }
    onDone("המודעה עודכנה.");
  }

  /** "סיום" / "סגירה": מה שעלה נשאר — ההורה סוגר ומרענן, עם מה שעלה ומה לא. */
  const finishUploaded = (): boolean => {
    const chosen = formRef.current.formats;
    const up = okFormats(batch).filter((f) => chosen.includes(f));
    if (!up.length) return false;
    const text = finishText(up, chosen.filter((f) => !up.includes(f)));
    onDone(maybe ? `${text} ${MAYBE_ONE_MORE}` : text);
    return true;
  };
  /**
   * החלטה 399 — יציאה ("ביטול", "סגירה"): עבודה שלא עלתה / לא נשמרה — קודם שואלים בשורה (גם כשחלק כבר עלה, כמו ה-X של הגיליון);
   * אחר כך: משהו עלה — סיום (רענון והמשפט); תשובה לא ברורה — רענון; אחרת — סגירה. "סיום" בסיכום, כשמשהו כבר עלה, לא שואל —
   * הסיכום מראה מה לא עלה, והמשפט אחרי הסגירה אומר את זה.
   */
  const askFrom = useRef("[data-creative-cancel]");
  const leave = (ask: boolean) => {
    const plan = exitPlan({ busy, dirty: ask && dirty, asked: confirmCancel, up: upNow.length, maybe });
    if (plan === "ask") {
      // the button that asked ("ביטול" on the first step, or "ביטול" in the summary) gets the focus back on "המשך עריכה"
      askFrom.current = (document.activeElement as HTMLElement | null)?.hasAttribute?.("data-creative-finish") ? "[data-creative-finish]" : "[data-creative-cancel]";
      setConfirmCancel(true);
      return;
    }
    if (plan === "finish") { finishUploaded(); return; }
    if (plan === "recheck") { onDone(RECHECK_TEXT.creative); return; }
    if (plan === "close") onCancel?.();
  };
  const cancel = () => leave(true);
  const finish = () => leave(upNow.length === 0);

  const f = form;
  const hintFor = (key: string) => {
    if (key === SHARED) return sharedHint(f.formats.filter((x) => !FORMAT_INFO[x].frames));
    if (key.startsWith("img:")) return imageHint(key.slice(4) as AdFormat);
    return imageHint(f.formats.includes("story") ? "story" : "carousel");
  };
  const box = (key: string, url: string) => imageBoxState({ url, upload: uploads[key] ?? IDLE, refusal: refusals[key] ?? null, base: imageBase, hint: hintFor(key) });
  const boxes: Record<string, ImageBox> = { [SHARED]: box(SHARED, f.image.image_url) };
  for (const x of f.formats) if (!FORMAT_INFO[x].frames) boxes[overrideKey(x)] = box(overrideKey(x), f.overrides[x]?.image_url ?? "");
  for (const fr of f.frames) boxes[fr.key] = box(fr.key, fr.image_url);
  const refusedFrame = (() => { const i = f.frames.findIndex((x) => refusals[x.key]); return i < 0 ? null : i; })();

  return (
    <div ref={rootRef} style={{ scrollMarginTop: "72px", minWidth: 0 }}>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} data-creative-file="" />
      <input ref={manyRef} type="file" multiple accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { void pickMany(Array.from(e.target.files ?? [])); e.target.value = ""; }} data-creative-files="" />
      <CreativeStudioView campaignId={campaignId} today={today} campaignEndsOn={campaignEndsOn} mode={mode.kind} served={mode.kind === "edit" && mode.served} form={form} onForm={setForm}
        advertiser={advertiser} advertiserLogo={advertiserLogo} brandColor={brandColor} imageBase={imageBase}
        step={shown} onStep={go} touch={touch} slide={slide}
        boxes={boxes} onPick={(key) => { pickFor.current = key; fileRef.current?.click(); }}
        onPickMany={() => { manyUnit.current = shown === "carousel" ? "כרטיסים" : "תמונות"; manyRef.current?.click(); }} manyNote={manyNote}
        frameSel={frameSel} onFrameSel={setFrameSel} refusedFrame={refusedFrame}
        onAddFrame={() => { const next = addFrame(formRef.current.frames, nextKey()); setForm({ ...formRef.current, frames: next }); setFrameSel(indexOfKey(next, next[next.length - 1]?.key, 0)); }}
        batch={batch} busy={busy} err={err} stale={stale} animate={animate}
        onPublish={(formats) => void run(publishStart(batch, formats))} onJump={jump} onFinish={finish}
        onSave={() => void saveEdit()}
        onDuplicate={() => {
          if (mode.kind !== "edit") return;
          // the copy is re-keyed — it is the new starting point, so an untouched copy is not "dirty"
          const copy = formFromCreative(mode.creative, nextKey);
          initial.current = JSON.stringify(copy);
          setMode({ kind: "duplicate", creative: mode.creative }); setForm(copy); setBatch(null); setErr(null); setStale(false); setStep("content");
        }}
        onRecheck={() => onDone(RECHECK_TEXT.creative)} onCancel={onCancel ? cancel : undefined}
        previewWidth={previewWidth} onPreviewWidth={setPreviewWidth} previewApp={previewApp} onPreviewApp={setPreviewApp}
        confirmCancel={confirmCancel} flagged={flagged} onFlag={(x) => setFlagged((xs) => (xs.includes(x) ? xs : [...xs, x]))}
        onKeepEditing={() => {
          setConfirmCancel(false);
          requestAnimationFrame(() => (rootRef.current?.querySelector<HTMLElement>(askFrom.current) ?? rootRef.current?.querySelector<HTMLElement>("[data-wizard-where]"))?.focus?.());
        }}
        onFillAlts={(base) => { const r = fillMissingAlts(formRef.current.frames, base, "תמונה"); setForm({ ...formRef.current, frames: r.frames }); setAutoAlts((m) => ({ ...m, ...r.auto })); }}
        autoAlts={autoAlts} />
    </div>
  );
}
