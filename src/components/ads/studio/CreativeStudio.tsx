"use client";
// studio/CreativeStudio — סטודיו המודעה (bloc ADS-2א v2, החלטה 383): תוכן אחד → מודעה בכל פורמט שנבחר.
//   • פורמטים: הגלריה (בחירה מרובה). תמונה אחת לכל הפורמטים (או נפרדת לפורמט), נקודת מיקוד עם החיתוך של כל פורמט;
//     סטורי / קרוסלה — פס של 2–5 תמונות. תמונה רק דרך כפתור ההעלאה (bloc מקבל רק את הבאקט שלו; מאתר אחר — לא נטענת).
//   • טקסטים עם תבניות ("מבצע", "אירוע", "שירות חדש", "הטבה לדיירים"), הקישור הסופי עם תגי ה-utm, סגנון, צבע הכפתור (עם
//     הניגודיות), מיקום הפס; תצוגה חיה לכל פורמט.
//   • "צור מודעה בכל פורמט שבחרתי": creative.save לכל פורמט, אחד אחרי השני, עם תוצאה לכל אחד — נכשל: המשפט בעברית ו"נסו שוב";
//     שום פורמט לא מדולג בשקט; תשובה לא ברורה (ייתכן שנוצרה) — עוצרים: אין יצירה שנייה, רק רענון.
//   • עריכה — רק למודעה שעוד לא הוצגה; מודעה שהוצגה: "נעולה — שכפלו כדי לשנות" ושכפול כמודעה חדשה.
//   • ADS-2ב1 (החלטה 388): "קופון ומבצע (לא חובה)" — קוד קופון (אותיות גדולות, ^[A-Z0-9][A-Z0-9-]{1,23}$) וסוף המבצע (היום או אחריו,
//     שעון ישראל), משותפים לכל הפורמטים; אזהרה כשהפס בין הפורמטים ("בפס הקוד לא מוצג"); בתצוגה — השבב ושורת המבצע כמו ב-bloc.
// CreativeStudio — המצב והבקשות; CreativeStudioView — התצוגה (טהורה, נבדקת בלי DOM).
import { useRef, useState } from "react";
import { Check, X, RefreshCw, AlertTriangle, Copy, Clock, Gift } from "lucide-react";
import { Banner, solidBtn, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { postAds, uploadAdImage, Field } from "../adsKit";
import CreativeImageField from "../CreativeImageField";
import FormatGallery from "./FormatGallery";
import FocalPicker from "./FocalPicker";
import AccentPicker from "./AccentPicker";
import FramesStrip, { indexOfKey } from "./FramesStrip";
import StudioPreview, { previewFromForm, SHOWS_BODY } from "./StudioPreview";
import { Segmented, linkBtn, STUDIO_IMAGE_BASE } from "./kit";
import { AD_IMAGE_MAX_BYTES } from "@/lib/ads";
import { imageBoxState, isOurAdImage, lockedAfter, RECHECK_TEXT, type ImageBox, type UploadState } from "@/lib/adsUi";
import {
  AD_THEMES, BANNER_POSITIONS, BANNER_POSITION_LABEL, CREATIVE_LOCKED_TEXT, FORMAT_INFO, THEME_LABEL, addFrame, imageHint, sizeText,
  type AdFormat, type FrameDraft,
} from "@/lib/adsFormats";
import {
  TEMPLATES, batchDone, batchStart, runBatch, creativePayloadFor, emptyCreativeForm, emptyImage, finalLink, formFromCreative,
  formIssues, imageFor, accentIssue, longAdvertiserName, longAdvertiserText, offerIssues, type BatchItem, type CreativeForm, type ImagePick,
} from "@/lib/adsStudio";
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
/** אחרי "צור": מה עוד צריך לרוץ — ההצלחות נשארות, נכשלו חוזרים לתור, ופורמט שנוסף בינתיים נכנס. */
export function batchResume(prev: BatchItem[] | null, formats: AdFormat[]): BatchItem[] {
  const fresh = batchStart(formats);
  if (!prev) return fresh;
  const ok = prev.filter((x) => x.state === "ok");
  const rest = fresh.filter((x) => !ok.some((o) => o.format === x.format));
  return [...ok, ...rest];
}
export const BATCH_TEXT: Record<BatchItem["state"], string> = {
  waiting: "בתור", saving: "יוצרים…", ok: "נוצרה", failed: "לא נוצרה", unclear: "ייתכן שנוצרה — רעננו לפני שממשיכים",
};

export interface CreativeStudioViewProps {
  mode: StudioMode["kind"]; served: boolean;
  form: CreativeForm; onForm: (f: CreativeForm) => void;
  advertiser: string; advertiserLogo: string | null; brandColor: string | null; imageBase: string | null;
  separate: boolean; onSeparate: (v: boolean) => void; editFormat: AdFormat; onEditFormat: (f: AdFormat) => void;
  boxes: Record<string, ImageBox>; onPick: (target: string) => void;
  frameSel: number; onFrameSel: (i: number) => void; refusedFrame: number | null; onAddFrame: () => void;
  batch: BatchItem[] | null; busy: boolean; err: string | null; stale: boolean;
  onCreate: () => void; onRetry: (i: number) => void; onSave: () => void; onDuplicate: () => void; onRecheck: () => void; onCancel?: () => void;
  animate?: boolean;
  /** לתצוגת הקישור הסופי (utm_campaign של bloc). */
  campaignId?: string | null;
  /** ADS-2ב1: היום לפי שעון ישראל (בדיקת סוף המבצע ושורת המבצע בתצוגה); ברירת מחדל — עכשיו. */
  today?: string;
  /** ADS-2ב1: סוף הקמפיין — סוף מבצע מאוחר ממנו מותר, אבל ההצגה נעצרת בסוף הקמפיין (נאמר ליד השדה). */
  campaignEndsOn?: string | null;
}

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
          aria-invalid={cIssue ? true : undefined} style={{ ...inputStyle, fontFamily: "var(--mono)", letterSpacing: ".04em", ...(cIssue ? { borderColor: "var(--red)" } : {}) }}
          data-creative-field="coupon_code" />
      </Field>
      {cIssue && <span role="alert" style={{ fontSize: "13px", color: "var(--red)", lineHeight: 1.5, marginTop: "-4px" }} data-offer-issue="coupon_code">{cIssue}</span>}
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="סוף המבצע (לא חובה)" style={{ flex: "1 1 180px" }}>
          <input type="date" value={offerEndsOn} min={today} disabled={disabled} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ coupon_code: coupon, offer_ends_on: e.target.value })}
            aria-invalid={oIssue ? true : undefined} style={{ ...inputStyle, ...(oIssue ? { borderColor: "var(--red)" } : {}) }} data-creative-field="offer_ends_on" />
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

export function CreativeStudioView(p: CreativeStudioViewProps) {
  const { form, onForm, boxes, imageBase } = p;
  const today = p.today ?? ilTodayKey();
  const singles = form.formats.filter((f) => !FORMAT_INFO[f].frames);
  const multis = form.formats.filter((f) => FORMAT_INFO[f].frames);
  const editing = p.mode === "edit";
  const locked = editing && p.served;
  const uploading = Object.values(boxes).some((b) => b.busy);
  const foreign = (u: string) => isOurAdImage(u, imageBase) === false;
  const issues = form.formats.map((f) => ({ f, list: formIssues(f, form, imageBase) })).filter((x) => x.list.length);
  // the accent is shared by every format — said once, and it blocks saving like bloc does (400 invalid, field accent)
  const accentProblem = accentIssue(form.accent);
  // ADS-2ב1: the coupon and the offer end are shared too — said once, and they block saving (bloc: invalid coupon_code / offer_ends_on)
  const offerProblems = offerIssues(form, today);
  const ready = issues.length === 0 && !accentProblem && offerProblems.length === 0 && !locked;
  const canSave = ready && !p.busy && !uploading && !p.stale;
  const running = p.batch?.some((x) => x.state === "saving") ?? false;
  const left = p.batch ? p.batch.filter((x) => x.state !== "ok").length : form.formats.length;
  const anyOk = p.batch?.some((x) => x.state === "ok") ?? false;
  const edit = singles.includes(p.editFormat) ? p.editFormat : singles[0];
  const target = p.separate && edit ? overrideKey(edit) : SHARED;
  const img: ImagePick = p.separate && edit ? imageFor(form, edit) : form.image;
  const setImg = (patch: Partial<ImagePick>) => {
    if (p.separate && edit) onForm({ ...form, overrides: { ...form.overrides, [edit]: { ...imageFor(form, edit), ...patch } } });
    else onForm({ ...form, image: { ...form.image, ...patch } });
  };
  const link = finalLink(form.cta_url, p.campaignId);
  const themed = form.formats.some((f) => FORMAT_INFO[f].theme);
  const bodyFormats = form.formats.filter((f) => SHOWS_BODY[f]);
  const createLabel = form.formats.length === 1 ? "יצירת המודעה" : anyOk ? `המשך — יצירת מה שנשאר (${left})` : `צור מודעה בכל פורמט שבחרתי (${form.formats.length})`;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }} data-creative-studio={p.mode}>
      <fieldset disabled={locked || p.busy} style={{ border: "none", padding: 0, margin: 0, flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
        {locked && (
          <Banner tone="info" action={<button type="button" style={ghostBtn} onClick={p.onDuplicate} data-creative-duplicate=""><Copy size={15} />שכפול כמודעה חדשה</button>}>
            <span data-creative-locked=""><b>{CREATIVE_LOCKED_TEXT}.</b> המודעה כבר הוצגה, ולכן הפורמט, התמונות והטקסטים שלה קבועים.</span>
          </Banner>
        )}
        {p.mode === "duplicate" && <Banner tone="info"><span data-creative-copy="">עותק של מודעה קיימת — משנים מה שרוצים, והיא תיווצר כמודעה חדשה. את הישנה אפשר להשבית אחר כך.</span></Banner>}

        <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="פורמטים">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
            <h3 style={h3}>{editing ? "הפורמט" : "1. באילו פורמטים?"}</h3>
            <a href="#creative-preview" className="studio-narrow-only" style={{ fontSize: "13px", color: "var(--blue)", textDecoration: "none", minHeight: "32px", display: "inline-flex", alignItems: "center" }} data-creative-preview-link="">לתצוגה המקדימה ↓</a>
          </div>
          {editing
            ? <span style={{ fontSize: "14px", color: "var(--text-2)" }} data-creative-format={form.formats[0]}>{FORMAT_INFO[form.formats[0]].label} — {FORMAT_INFO[form.formats[0]].line} פורמט של מודעה קיימת לא משתנה (משכפלים).</span>
            : <FormatGallery value={form.formats} onChange={(formats) => onForm({ ...form, formats })} bannerPosition={form.banner_position} animate={p.animate} />}
        </section>

        {singles.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="תמונה" data-creative-image-section={p.separate ? "separate" : "shared"}>
            <h3 style={h3}>{editing ? "התמונה" : "2. התמונה"}</h3>
            {singles.length > 1 && (
              <Segmented label="תמונה לפורמטים" testId="image-mode" value={p.separate ? "separate" : "shared"} onChange={(v) => p.onSeparate(v === "separate")}
                options={[{ key: "shared", label: "תמונה אחת לכולם" }, { key: "separate", label: "נפרדת לכל פורמט" }]} />
            )}
            {p.separate && singles.length > 1 && (
              <div role="tablist" aria-label="התמונה של איזה פורמט" className="studio-scroll" data-creative-image-tabs="">
                {singles.map((f) => (
                  <button key={f} type="button" role="tab" aria-selected={f === edit} data-image-tab={f} onClick={() => p.onEditFormat(f)}
                    style={{ minHeight: "40px", padding: "0 12px", borderRadius: "99px", flexShrink: 0, whiteSpace: "nowrap", fontSize: "13.5px", fontWeight: 600, fontFamily: "inherit",
                      border: `1px solid ${f === edit ? "var(--blue)" : "var(--border)"}`, background: f === edit ? "rgba(59,130,246,.14)" : "transparent", color: f === edit ? "var(--text)" : "var(--text-2)" }}>
                    {FORMAT_INFO[f].label}{form.overrides[f] ? " ·" : ""}
                  </button>
                ))}
              </div>
            )}
            {boxes[target] && (
              <CreativeImageField url={foreign(img.image_url) ? "" : img.image_url} box={boxes[target]} locked={locked} onPick={() => p.onPick(target)}
                shape={edit ? { w: 64, h: Math.max(36, Math.min(110, Math.round((64 * FORMAT_INFO[edit].image.h) / FORMAT_INFO[edit].image.w))), label: FORMAT_INFO[edit].image.ratio } : undefined} />
            )}
            {p.separate && edit && form.overrides[edit] && (
              <button type="button" style={{ ...linkBtn, alignSelf: "flex-start" }} data-image-back={edit}
                onClick={() => { const o = { ...form.overrides }; delete o[edit]; onForm({ ...form, overrides: o }); }}>
                חזרה לתמונה המשותפת
              </button>
            )}
            <FocalPicker url={img.image_url && !foreign(img.image_url) ? img.image_url : null} alt={img.image_alt} focal={img.focal} disabled={locked}
              formats={p.separate && edit ? [edit] : singles} onFocal={(focal) => setImg({ focal })} />
            <Field label="מה רואים בתמונה (לקורא מסך)">
              <input value={img.image_alt} maxLength={200} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setImg({ image_alt: e.target.value })} style={inputStyle} data-creative-field="image_alt" />
            </Field>
          </section>
        )}

        {multis.length > 0 && (
          <section aria-label="תמונות לסטורי ולקרוסלה">
            <FramesStrip formats={multis} frames={form.frames} selected={p.frameSel} onSelect={p.onFrameSel} imageBase={imageBase}
              onChange={(frames: FrameDraft[], sel?: number) => { onForm({ ...form, frames }); if (sel !== undefined) p.onFrameSel(sel); }}
              boxes={boxes} onPick={p.onPick} onAdd={p.onAddFrame} locked={locked} busy={p.busy} refusedFrame={p.refusedFrame} />
          </section>
        )}

        <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="טקסטים">
          <h3 style={h3}>{editing ? "הטקסטים" : "3. הטקסטים"}</h3>
          {!locked && (
            <div className="studio-scroll" role="group" aria-label="תבניות" data-creative-templates="">
              {TEMPLATES.map((t) => (
                <button key={t.key} type="button" data-template={t.key} onClick={() => onForm({ ...form, headline: t.headline, body: t.body, cta_label: t.cta_label })}
                  style={{ minHeight: "40px", padding: "0 14px", borderRadius: "99px", border: "1px dashed var(--border-2)", background: "transparent", color: "var(--text)", fontSize: "13.5px", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit" }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <Field label={`כותרת (${form.headline.length}/60)`}>
            <input value={form.headline} maxLength={60} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onForm({ ...form, headline: e.target.value })} style={inputStyle} data-creative-field="headline" />
          </Field>
          <Field label={`משפט (לא חובה, ${form.body.length}/180)`} hint={bodyFormats.length ? `מוצג ב: ${bodyFormats.map((f) => FORMAT_INFO[f].label).join(", ")}.` : "בפורמטים שנבחרו לא מוצג משפט — רק כותרת."}>
            <textarea value={form.body} maxLength={180} rows={2} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onForm({ ...form, body: e.target.value })}
              style={{ ...inputStyle, minHeight: "72px", padding: "10px 14px", lineHeight: 1.5, resize: "vertical" }} data-creative-field="body" />
          </Field>
          <Field label={`הכפתור (${form.cta_label.length}/24)`}>
            <input value={form.cta_label} maxLength={24} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onForm({ ...form, cta_label: e.target.value })} style={inputStyle} data-creative-field="cta_label" />
          </Field>
          <Field label={form.formats.includes("carousel") ? "לאן הכפתור מוביל (כשלכרטיס אין קישור משלו)" : "לאן הכפתור מוביל"}>
            <input value={form.cta_url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onForm({ ...form, cta_url: e.target.value })} placeholder="https://" dir="ltr" inputMode="url" style={inputStyle} data-creative-field="cta_url" />
          </Field>
          {link && (
            <div style={{ fontSize: "12.5px", color: "var(--text-2)", lineHeight: 1.5 }} data-creative-final-link={link.own ? "own" : "utm"}>
              הדייר יפתח: <bdi dir="ltr" style={{ overflowWrap: "anywhere", color: "var(--text)", fontFamily: "var(--mono)" }}>{link.href}</bdi>
              {link.own ? " — יש בקישור תגי utm משלכם, ולכן bloc לא מוסיף." : " — bloc מוסיף תגי utm כדי שתראו באנליטיקס שלכם מה הגיע מהמודעה."}
            </div>
          )}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "12px" }} aria-label="סגנון">
          <h3 style={h3}>{editing ? "הסגנון" : "4. הסגנון"}</h3>
          {themed && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }} data-creative-theme={form.theme}>
              <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>רקע ({form.formats.filter((f) => FORMAT_INFO[f].theme).map((f) => FORMAT_INFO[f].label).join(", ")})</span>
              <Segmented label="רקע" testId="theme" value={form.theme} onChange={(theme) => onForm({ ...form, theme })}
                options={AD_THEMES.map((t) => ({ key: t, label: THEME_LABEL[t] }))} />
            </div>
          )}
          <AccentPicker value={form.accent} brand={p.brandColor} ctaLabel={form.cta_label} onChange={(accent) => onForm({ ...form, accent })} disabled={locked} />
          {form.formats.includes("banner") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }} data-creative-banner-position={form.banner_position}>
              <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>איפה הפס מוצג</span>
              <Segmented label="מיקום הפס" testId="banner-position" value={form.banner_position} onChange={(banner_position) => onForm({ ...form, banner_position })}
                options={BANNER_POSITIONS.map((b) => ({ key: b, label: BANNER_POSITION_LABEL[b] }))} />
              <span style={{ fontSize: "12.5px", color: "var(--text-3)" }}>{form.banner_position === "top" ? "בראש מסך הבית — נגלל עם התוכן." : "קבוע בתחתית, מעל הניווט — נשאר גלוי גם בגלילה."}</span>
            </div>
          )}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="קופון ומבצע" data-creative-offer-section="">
          <h3 style={{ ...h3, display: "flex", alignItems: "center", gap: "6px" }}><Gift size={16} aria-hidden="true" />{editing ? "קופון ומבצע" : "5. קופון ומבצע (לא חובה)"}</h3>
          <OfferFields coupon={form.coupon_code} offerEndsOn={form.offer_ends_on} today={today} formats={form.formats} campaignEndsOn={p.campaignEndsOn ?? null}
            disabled={locked} onChange={(v) => onForm({ ...form, ...v })} />
        </section>

        {(issues.length > 0 || accentProblem || offerProblems.length > 0) && !locked && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }} data-creative-issues={issues.map((x) => x.f).join(",")}>
            {issues.map((x) => <span key={x.f}><b style={{ color: "var(--text)" }}>{FORMAT_INFO[x.f].label}:</b> {x.list.join(" ")}</span>)}
            {accentProblem && <span data-creative-accent-issue=""><b style={{ color: "var(--text)" }}>צבע הכפתור:</b> {accentProblem}</span>}
            {offerProblems.length > 0 && <span data-creative-offer-issue=""><b style={{ color: "var(--text)" }}>קופון ומבצע:</b> {offerProblems.join(" ")}</span>}
          </div>
        )}

        {p.batch && (
          <ul aria-label="התוצאה לכל פורמט" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }} data-creative-batch={p.batch.map((x) => `${x.format}:${x.state}`).join(",")}>
            {p.batch.map((x, i) => (
              <li key={x.format} data-batch-item={x.format} data-batch-state={x.state}
                style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${x.state === "failed" ? "#ef444466" : x.state === "unclear" ? "#eab30866" : "var(--border)"}` }}>
                <span aria-hidden="true" style={{ marginTop: "2px", color: x.state === "ok" ? "var(--green)" : x.state === "failed" ? "var(--red)" : x.state === "unclear" ? "var(--yellow)" : "var(--text-3)" }}>
                  {x.state === "ok" ? <Check size={17} /> : x.state === "failed" ? <X size={17} /> : x.state === "unclear" ? <AlertTriangle size={17} /> : x.state === "saving" ? <RefreshCw size={17} /> : <Clock size={15} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{FORMAT_INFO[x.format].label} — {BATCH_TEXT[x.state]}</span>
                  {x.error && <span role={x.state === "failed" ? "alert" : undefined} style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }} data-batch-error={x.format}>{x.error}</span>}
                </span>
                {x.state === "failed" && !p.stale && (
                  <button type="button" style={linkBtn} disabled={p.busy} onClick={() => p.onRetry(i)} data-batch-retry={x.format}>נסו שוב</button>
                )}
              </li>
            ))}
          </ul>
        )}

        {p.err && (
          <Banner tone="error" action={p.stale ? <button type="button" style={ghostBtn} onClick={p.onRecheck} data-creative-recheck="">סגירה ורענון</button> : undefined}>
            <span data-creative-error="">{p.err}</span>
          </Banner>
        )}
        {p.stale && !p.err && (
          <Banner tone="warn" action={<button type="button" style={ghostBtn} onClick={p.onRecheck} data-creative-recheck="">סגירה ורענון</button>}>
            <span data-creative-stale="">ייתכן שבוצע — רעננו. התשובה מ-bloc לא ברורה, ולכן לא יוצרים שוב עד שבודקים מה כבר נוצר.</span>
          </Banner>
        )}

        {!locked && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {editing ? (
              <button type="button" onClick={p.onSave} disabled={!canSave} style={{ ...solidBtn("var(--blue)"), opacity: canSave ? 1 : 0.6 }} data-creative-save="">
                {p.busy ? "שומרים…" : "שמירת המודעה"}
              </button>
            ) : (
              <button type="button" onClick={p.onCreate} disabled={!canSave || running || left === 0} style={{ ...solidBtn("var(--blue)"), opacity: canSave && !running && left > 0 ? 1 : 0.6 }} data-creative-create={form.formats.length}>
                {running ? "יוצרים…" : createLabel}
              </button>
            )}
            {p.onCancel && <button type="button" onClick={p.onCancel} disabled={p.busy} style={ghostBtn}>{anyOk ? "סגירה" : "ביטול"}</button>}
          </div>
        )}
      </fieldset>
      <div id="creative-preview" style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", minWidth: 0, position: "sticky", top: "12px", scrollMarginTop: "12px" }}>
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
const h3: React.CSSProperties = { fontSize: "15px", fontWeight: 800, color: "var(--text)" };

export default function CreativeStudio({ campaignId, advertiser, advertiserLogo = null, brandColor = null, mode: initialMode, imageBase = STUDIO_IMAGE_BASE, template, onDone, onCancel, animate = true, today, campaignEndsOn = null }: {
  campaignId: string; advertiser: string; advertiserLogo?: string | null; brandColor?: string | null; mode: StudioMode;
  /** ADS-2ב1: היום לפי שעון ישראל (בבדיקות); וסוף הקמפיין — להערה ליד סוף המבצע. */
  today?: string; campaignEndsOn?: string | null;
  /** בבדיקות בלבד — ברירת המחדל מ-NEXT_PUBLIC_SUPABASE_URL. */
  imageBase?: string | null;
  /** מילוי מוכן מתבנית (?template=sale). */
  template?: string | null;
  /** הצליח (או "סגירה ורענון") — ההורה סוגר ומרענן. */
  onDone: (msg: string) => void; onCancel?: () => void; animate?: boolean;
}) {
  const seq = useRef(0);
  const nextKey = () => `f${++seq.current}`;
  const [mode, setMode] = useState<StudioMode>(initialMode);
  const [form, setFormState] = useState<CreativeForm>(() => {
    if (initialMode.kind !== "new") return formFromCreative(initialMode.creative, nextKey);
    const f = emptyCreativeForm(nextKey, brandColor);
    const t = TEMPLATES.find((x) => x.key === template);
    return t ? { ...f, headline: t.headline, body: t.body, cta_label: t.cta_label } : f;
  });
  const formRef = useRef(form);
  const setForm = (f: CreativeForm) => { formRef.current = f; setFormState(f); };
  const [separate, setSeparate] = useState(false);
  const [editFormat, setEditFormat] = useState<AdFormat>(form.formats[0]);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [frameSel, setFrameSel] = useState(0);
  const [batch, setBatch] = useState<BatchItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pickFor = useRef<string | null>(null);

  const targetOf = (f: AdFormat) => (FORMAT_INFO[f].frames ? null : formRef.current.overrides[f] ? overrideKey(f) : SHARED);
  const refuse = (key: string, text: string) => setRefusals((m) => ({ ...m, [key]: text }));
  const setRefusal = (text: string) => { const f = formRef.current.formats[0]; refuse(targetOf(f) ?? SHARED, text); };

  async function pickImage(file: File | undefined) {
    const key = pickFor.current;
    pickFor.current = null;
    if (!file || !key) return;
    setErr(null);
    setRefusals((m) => { const o = { ...m }; delete o[key]; return o; });
    const mark = (s: UploadState) => setUploads((m) => ({ ...m, [key]: s }));
    if (file.size > AD_IMAGE_MAX_BYTES) { mark({ phase: "failed", error: TOO_BIG_TEXT }); return; }
    mark({ phase: "uploading", name: file.name });
    const r = await uploadAdImage(file);
    if (!r.ok) { mark({ phase: "failed", error: r.error }); return; }
    const f = formRef.current;
    const fresh = { image_url: r.url, focal: [0.5, 0.5] as [number, number] };
    if (key === SHARED) setForm({ ...f, image: { ...f.image, ...fresh } });
    else if (key.startsWith("img:")) { const fmt = key.slice(4) as AdFormat; setForm({ ...f, overrides: { ...f.overrides, [fmt]: { ...(f.overrides[fmt] ?? { ...emptyImage(), image_alt: f.image.image_alt }), ...fresh } } }); }
    else setForm({ ...f, frames: f.frames.map((x) => (x.key === key ? { ...x, ...fresh } : x)) });
    mark({ phase: "done", name: file.name });
  }

  /** "צור": אחד אחרי השני; נכשל — ממשיכים לבא בתור (ונסו שוב לכל אחד); לא ברור — עוצרים. */
  async function run(start: BatchItem[]) {
    setBusy(true); setErr(null);
    const list = await runBatch(start, async (format) => {
      const r = await postAds<{ id: string }>(creativePayloadFor(format, formRef.current, campaignId));
      if (r.ok) return { ok: true, id: r.data.id };
      // bloc דחה תמונה מסוימת — המשפט גם ליד התמונה הזו (בסטורי / בקרוסלה לפי המספר שלה).
      if (r.frame !== undefined && FORMAT_INFO[format].frames) { const k = formRef.current.frames[r.frame]?.key; if (k) refuse(k, r.error); }
      else if (r.code === "image_not_ours") refuse(targetOf(format) ?? SHARED, r.error);
      // לא ברור (ייתכן שנוצרה) — אין יצירה שנייה עד רענון
      if (lockedAfter(r, true)) setStale(true);
      return { ok: false, error: r.error, unclear: r.unclear };
    }, setBatch);
    setBusy(false);
    if (batchDone(list)) onDone(list.length === 1 ? "המודעה נוצרה." : `נוצרו ${list.length} מודעות — אחת לכל פורמט.`);
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
    <>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} data-creative-file="" />
      <CreativeStudioView campaignId={campaignId} today={today} campaignEndsOn={campaignEndsOn} mode={mode.kind} served={mode.kind === "edit" && mode.served} form={form} onForm={setForm}
        advertiser={advertiser} advertiserLogo={advertiserLogo} brandColor={brandColor} imageBase={imageBase}
        separate={separate} onSeparate={setSeparate} editFormat={editFormat} onEditFormat={setEditFormat}
        boxes={boxes} onPick={(key) => { pickFor.current = key; fileRef.current?.click(); }}
        frameSel={frameSel} onFrameSel={setFrameSel} refusedFrame={refusedFrame}
        onAddFrame={() => { const next = addFrame(formRef.current.frames, nextKey()); setForm({ ...formRef.current, frames: next }); setFrameSel(indexOfKey(next, next[next.length - 1]?.key, 0)); }}
        batch={batch} busy={busy} err={err} stale={stale} animate={animate}
        onCreate={() => void run(batchResume(batch, formRef.current.formats))}
        onRetry={(i) => { if (!batch) return; void run(batch.map((x, j) => (j === i ? { format: x.format, state: "waiting" as const } : x))); }}
        onSave={() => void saveEdit()}
        onDuplicate={() => { if (mode.kind === "edit") { setMode({ kind: "duplicate", creative: mode.creative }); setForm(formFromCreative(mode.creative, nextKey)); setBatch(null); setErr(null); setStale(false); } }}
        onRecheck={() => onDone(RECHECK_TEXT.creative)} onCancel={onCancel} />
    </>
  );
}
