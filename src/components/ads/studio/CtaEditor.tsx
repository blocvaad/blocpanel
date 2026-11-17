"use client";
// studio/CtaEditor — "הכפתור" בסטודיו המודעה (bloc ADS-2ג1, החלטות 402, 404): מה הכפתור עושה — אתר, שיחה, וואטסאפ או ניווט —
// לאן (קישור / מספר / מספר והודעה מוכנה / כתובת או קישור ניווט), ואיך הוא נקרא (כל שם, 2 עד 24 תווים; שמות מוכנים לכל סוג).
// במודעה נשמרת כתובת אחת (cta_url — withCta); מה שהוקלד בכל סוג נשאר כשעוברים בין הסוגים. מה חסר — contentChecks (השדה
// cta_url / cta_label, כמו תמיד: מסומן אחרי שעזבו את השדה או ש"מה חסר" שלח אליו). מה הדייר יקבל — במשפט (אתר — עם תגי ה-utm).
import { Globe, MessageCircle, Navigation, Phone } from "lucide-react";
import { inputStyle } from "@/components/ui/panelKit";
import { Field } from "../adsKit";
import {
  CTA_KINDS, CTA_KIND_HINT, CTA_KIND_LABEL, CTA_LABEL_SUGGESTIONS, WA_TEXT_MAX, ctaOutcome, switchCtaKind, type CtaDraft, type CtaKind,
} from "@/lib/adsCta";
import { ctaDraftOf, finalLink, withCta, type CreativeForm } from "@/lib/adsStudio";
import type { Check as Missing, CheckField } from "@/lib/adsWizard";

export const CTA_ICON: Record<CtaKind, typeof Globe> = { link: Globe, call: Phone, whatsapp: MessageCircle, navigate: Navigation };
export const CTA_CSS = `
.cta-kinds { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 420px) { .cta-kinds { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

const errText: React.CSSProperties = { fontSize: "13px", color: "var(--red)", lineHeight: 1.5, marginTop: "-4px" };
const red = (on: boolean): React.CSSProperties => ({ borderColor: on ? "var(--red)" : "var(--border)" });
const hint: React.CSSProperties = { fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5 };

export interface CtaEditorProps {
  form: CreativeForm;
  onForm: (f: CreativeForm) => void;
  campaignId: string | null;
  /** מה חסר בשם / ביעד — רק אחרי שהשדה סומן (נעזב, או ש"מה חסר" שלח אליו). */
  labelIssue: Missing | null;
  urlIssue: Missing | null;
  onFlag?: (field: CheckField) => void;
}

export default function CtaEditor({ form, onForm, campaignId, labelIssue, urlIssue, onFlag }: CtaEditorProps) {
  const d = ctaDraftOf(form);
  const set = (next: Partial<CtaDraft>) => onForm(withCta(form, { ...d, ...next }));
  const pick = (kind: CtaKind) => {
    if (kind === d.kind && form.cta) return;
    const r = switchCtaKind(d, form.cta_label, kind);
    onForm({ ...withCta(form, r.draft), cta_label: r.label });
  };
  const flag = (field: CheckField) => () => onFlag?.(field);
  const carousel = form.formats.includes("carousel");
  const link = d.kind === "link" ? finalLink(form.cta_url, campaignId) : null;
  const outcome = d.kind === "link" ? null : ctaOutcome(form.cta_url);
  const urlProps = {
    onBlur: flag("cta_url"), "aria-invalid": urlIssue ? true : undefined, "aria-describedby": urlIssue ? "content-issue-cta_url" : undefined,
    style: { ...inputStyle, ...red(!!urlIssue) }, "data-creative-field": "cta_url",
  } as const;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }} aria-label="הכפתור" data-creative-cta={d.kind}>
      <style>{CTA_CSS}</style>
      <h3 style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)" }}>הכפתור</h3>
      <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.55, margin: 0 }}>מה קורה כשהדייר לוחץ, ואיך הכפתור נקרא — לכל מודעה כפתור משלה.</p>
      <div role="radiogroup" aria-label="מה הכפתור עושה" className="cta-kinds" data-cta-kinds="">
        {CTA_KINDS.map((k) => {
          const on = d.kind === k;
          const Icon = CTA_ICON[k];
          return (
            <button key={k} type="button" role="radio" aria-checked={on} onClick={() => pick(k)} data-cta-kind={k}
              style={{ minHeight: "56px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", padding: "8px 6px",
                borderRadius: "12px", border: `1.5px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "rgba(59,130,246,.12)" : "var(--surface)",
                color: on ? "var(--text)" : "var(--text-2)", fontSize: "13.5px", fontWeight: on ? 800 : 600, fontFamily: "inherit" }}>
              <Icon size={18} aria-hidden="true" />{CTA_KIND_LABEL[k]}
            </button>
          );
        })}
      </div>
      <span style={hint} data-cta-kind-hint="">{CTA_KIND_HINT[d.kind]}</span>

      {d.kind === "link" && (
        <Field label={carousel ? "לאן הכפתור מוביל (כשלכרטיס אין קישור משלו)" : "לאן הכפתור מוביל"}>
          <input value={d.url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ url: e.target.value })} placeholder="https://" dir="ltr" inputMode="url" {...urlProps} />
        </Field>
      )}
      {d.kind === "call" && (
        <Field label="מספר הטלפון" hint="מספר ישראלי (נייד או קווי, גם 1-800) או כוכבית.">
          <input value={d.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ phone: e.target.value })} placeholder="050-1234567 או *2700" dir="ltr" inputMode="tel" autoComplete="off" {...urlProps} />
        </Field>
      )}
      {d.kind === "whatsapp" && (
        <>
          <Field label="מספר הוואטסאפ">
            <input value={d.waPhone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ waPhone: e.target.value })} placeholder="050-1234567" dir="ltr" inputMode="tel" autoComplete="off" {...urlProps} />
          </Field>
          <Field label={`הודעה מוכנה (לא חובה, ${d.waText.length}/${WA_TEXT_MAX})`} hint="הדייר רואה אותה כתובה, ושולח בלחיצה — או משנה לפני.">
            <textarea value={d.waText} maxLength={WA_TEXT_MAX} rows={2} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set({ waText: e.target.value })}
              placeholder="היי, ראיתי את המודעה ב-bloc ואשמח לפרטים" style={{ ...inputStyle, minHeight: "64px", padding: "10px 14px", lineHeight: 1.5, resize: "vertical" }} data-creative-field="cta_wa_text" />
          </Field>
        </>
      )}
      {d.kind === "navigate" && (
        <Field label="לאן מנווטים" hint="כתובת (רחוב, מספר ועיר) — נפתח ניווט ב-Waze. אפשר גם להדביק קישור של Waze, Google Maps או Apple Maps.">
          <input value={d.place} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ place: e.target.value })} placeholder="הרצל 1, חיפה" autoComplete="off" {...urlProps} />
        </Field>
      )}
      {urlIssue && <span id="content-issue-cta_url" style={errText} data-content-issue="cta_url">{urlIssue.text}</span>}
      {carousel && d.kind !== "link" && <span style={hint} data-cta-carousel-note="">בקרוסלה: כרטיס עם קישור משלו פותח את הקישור שלו; כרטיס בלי קישור — את הכפתור הזה.</span>}

      <Field label={`השם של הכפתור (${form.cta_label.length}/24)`}>
        <input value={form.cta_label} maxLength={24} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onForm({ ...form, cta_label: e.target.value })} onBlur={flag("cta_label")}
          aria-invalid={labelIssue ? true : undefined} aria-describedby={labelIssue ? "content-issue-cta_label" : undefined} style={{ ...inputStyle, ...red(!!labelIssue) }} data-creative-field="cta_label" />
      </Field>
      <div className="studio-scroll" role="group" aria-label="שמות מוכנים לכפתור" data-cta-suggestions={d.kind}>
        {CTA_LABEL_SUGGESTIONS[d.kind].map((t) => {
          const on = form.cta_label.trim() === t;
          return (
            <button key={t} type="button" aria-pressed={on} onClick={() => onForm({ ...form, cta_label: t })} data-cta-suggestion={t}
              style={{ minHeight: "36px", padding: "0 12px", borderRadius: "99px", border: `1px ${on ? "solid var(--blue)" : "dashed var(--border-2)"}`, background: on ? "rgba(59,130,246,.12)" : "transparent",
                color: "var(--text)", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit" }}>
              {t}
            </button>
          );
        })}
      </div>
      {labelIssue && <span id="content-issue-cta_label" style={errText} data-content-issue="cta_label">{labelIssue.text}</span>}

      {link && (
        <div style={{ fontSize: "12.5px", color: "var(--text-2)", lineHeight: 1.5 }} data-creative-final-link={link.own ? "own" : "utm"}>
          הדייר יפתח: <bdi dir="ltr" style={{ overflowWrap: "anywhere", color: "var(--text)", fontFamily: "var(--mono)" }}>{link.href}</bdi>
          {link.own ? " — יש בקישור תגי utm משלכם, ולכן bloc לא מוסיף." : " — bloc מוסיף תגי utm כדי שתראו באנליטיקס שלכם מה הגיע מהמודעה."}
        </div>
      )}
      {outcome && (
        <div style={{ fontSize: "12.5px", color: "var(--text-2)", lineHeight: 1.5, overflowWrap: "anywhere" }} data-creative-final-link="action">
          {outcome}.{d.kind === "navigate" ? "" : " המפרסם יראה את המספר של הדייר שפונה אליו, כמו בכל שיחה או הודעה."}
        </div>
      )}
    </section>
  );
}
