"use client";
// studio/ScheduleEditor — "תזמון ויעד" (bloc ADS-2א v2, החלטה 383): תאריכים, ימים (צ'יפים) וטווח שעות אחד (סליידר עם שתי ידיות) —
// ב-DB יש days[] ו-hour_from / hour_to, בלי שינוי במודל; מוכנים: "כל היום", "ערב", "סופ״ש"; יעד חשיפות, תקרה ליום, תקרה לאדם,
// ועדיפות (משקל 1–10, סליידר); ומשפט קצב ("כ-334 ביום"). שעון ישראל. תצוגה בלבד.
import { ChipSet, Field } from "../adsKit";
import { inputStyle } from "@/components/ui/panelKit";
import { DAY_NAME, fmtDays, fmtHours } from "@/lib/ads";
import { SCHEDULE_PRESETS, applyPreset, presetOn, setHours, pacingHint, type CampaignForm } from "@/lib/adsStudio";

export type ScheduleValue = Pick<CampaignForm, "starts_on" | "ends_on" | "days" | "hour_from" | "hour_to" | "goal" | "daily" | "per_user" | "weight">;
const hh = (n: number) => `${String(n % 24).padStart(2, "0")}:00`.replace(/^00:00$/, n === 24 ? "24:00" : "00:00");
export const WEIGHT_TEXT = (w: number) => (w <= 1 ? "רגילה" : w <= 3 ? "מעט גבוהה" : w <= 6 ? "גבוהה" : w <= 9 ? "גבוהה מאוד" : "הכי גבוהה");

const RANGE_CSS = `
.studio-range { position: relative; height: 44px; direction: rtl; }
.studio-range-track { position: absolute; top: 19px; right: 0; left: 0; height: 6px; border-radius: 99px; background: var(--border); }
.studio-range-fill { position: absolute; top: 0; height: 6px; border-radius: 99px; background: var(--blue); }
.studio-range input[type=range] { position: absolute; inset: 0; width: 100%; height: 44px; margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
.studio-range input[type=range]::-webkit-slider-runnable-track { background: none; height: 44px; }
.studio-range input[type=range]::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; width: 28px; height: 28px; margin-top: 8px; border-radius: 50%; background: #fff; border: 3px solid var(--blue); cursor: pointer; }
.studio-range input[type=range]::-moz-range-thumb { pointer-events: auto; width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 3px solid var(--blue); cursor: pointer; }
.studio-range input[type=range]:focus-visible::-webkit-slider-thumb { outline: 3px solid rgba(59,130,246,.5); outline-offset: 2px; }
.studio-range.single input[type=range] { pointer-events: auto; }
`;

export function ScheduleEditorView({ value: v, onChange, disabled = false, today, note }: {
  value: ScheduleValue; onChange: (v: ScheduleValue) => void; disabled?: boolean; today: string; note?: string | null;
}) {
  const hint = pacingHint(v);
  const set = (patch: Partial<ScheduleValue>) => onChange({ ...v, ...patch });
  return (
    <fieldset disabled={disabled} style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "18px", minWidth: 0 }} data-schedule-editor="">
      <style>{RANGE_CSS}</style>
      {note && <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }} data-schedule-note="">{note}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "10px" }}>
        <Field label="מתאריך"><input type="date" className="input" value={v.starts_on} min={v.starts_on < today ? undefined : today} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ starts_on: e.target.value })} data-schedule-field="starts_on" /></Field>
        <Field label="עד תאריך (כולל)"><input type="date" className="input" value={v.ends_on} min={v.starts_on} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ ends_on: e.target.value })} data-schedule-field="ends_on" /></Field>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>מוכנים</span>
        <div className="studio-scroll" role="group" aria-label="תזמון מוכן" data-schedule-presets="">
          {SCHEDULE_PRESETS.map((p) => {
            const on = presetOn(v, p);
            return (
              <button key={p.key} type="button" aria-pressed={on} data-preset={p.key} onClick={() => onChange({ ...v, ...applyPreset(v as CampaignForm, p) })}
                style={{ minHeight: "44px", padding: "0 16px", borderRadius: "99px", whiteSpace: "nowrap", flexShrink: 0, fontSize: "14px", fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "rgba(59,130,246,.14)" : "transparent", color: on ? "var(--text)" : "var(--text-2)" }}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <ChipSet name="days" label={`ימים — ${fmtDays(v.days)}`} value={v.days} onChange={(days) => set({ days })} allLabel="כל הימים"
        options={DAY_NAME.map((d, i) => ({ key: i, label: d }))} />

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }} data-schedule-hours={`${v.hour_from}-${v.hour_to}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
          <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>שעות (שעון ישראל)</span>
          <span className="studio-num" style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)", fontFamily: "var(--mono)" }} data-schedule-hours-text="">{fmtHours(v.hour_from, v.hour_to)}</span>
        </div>
        <div className="studio-range">
          <div className="studio-range-track">
            <div className="studio-range-fill" style={{ right: `${(v.hour_from / 24) * 100}%`, width: `${((v.hour_to - v.hour_from) / 24) * 100}%` }} />
          </div>
          <input type="range" min={0} max={24} step={1} value={v.hour_from} aria-label="משעה" aria-valuetext={hh(v.hour_from)} data-schedule-field="hour_from"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set(setHours(Math.min(23, Number(e.target.value)), Math.max(v.hour_to, Number(e.target.value) + 1)))} />
          <input type="range" min={0} max={24} step={1} value={v.hour_to} aria-label="עד שעה" aria-valuetext={hh(v.hour_to)} data-schedule-field="hour_to"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const to = Math.max(1, Number(e.target.value)); set(setHours(Math.min(v.hour_from, to - 1), to)); }} />
        </div>
        <div className="studio-num" aria-hidden="true" style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>
          <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px" }}>
        <Field label="יעד חשיפות לכל הקמפיין" hint="ריק — בלי יעד (בלי פריסה)">
          <input value={v.goal} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ goal: e.target.value })} inputMode="numeric" style={inputStyle} dir="ltr" data-schedule-field="goal" />
        </Field>
        <Field label="תקרה ליום" hint="ריק — בלי תקרה ליום">
          <input value={v.daily} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ daily: e.target.value })} inputMode="numeric" style={inputStyle} dir="ltr" data-schedule-field="daily" />
        </Field>
        <Field label="לכל אדם, לכל הקמפיין">
          <select value={v.per_user} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set({ per_user: Number(e.target.value) })} style={inputStyle} data-schedule-field="per_user">
            {[1, 2, 3, 4, 5, 7, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n === 1 ? "פעם אחת" : `${n} פעמים`}</option>)}
          </select>
        </Field>
      </div>
      {hint && <p className="studio-num" style={{ fontSize: "13.5px", color: "var(--text)", lineHeight: 1.6, padding: "10px 12px", borderRadius: "10px", background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.25)" }} data-schedule-pacing="">{hint}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }} data-schedule-weight={v.weight}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>עדיפות</span>
          <span className="studio-num" style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{v.weight} · {WEIGHT_TEXT(v.weight)}</span>
        </div>
        {/* the same track as the hours (the native one is white on the dark theme); filled from the right — RTL */}
        <div className="studio-range single">
          <div className="studio-range-track">
            <div className="studio-range-fill" data-weight-fill={v.weight} style={{ right: 0, width: `${((v.weight - 1) / 9) * 100}%` }} />
          </div>
          <input type="range" min={1} max={10} step={1} value={v.weight} aria-label="עדיפות" aria-valuetext={`${v.weight} — ${WEIGHT_TEXT(v.weight)}`}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ weight: Number(e.target.value) })} data-schedule-field="weight" />
        </div>
        <span style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5 }}>כשכמה קמפיינים מתאימים לאותו רגע. קמפיין שמפגר אחרי היעד שלו — תמיד קודם.</span>
      </div>
    </fieldset>
  );
}

export default ScheduleEditorView;
