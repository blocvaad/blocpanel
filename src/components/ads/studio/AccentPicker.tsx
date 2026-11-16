"use client";
// studio/AccentPicker — צבע הכפתור של המודעה (bloc ADS-2א v2, החלטה 380): הצבע של bloc (ברירת המחדל, null), צבע המותג של
// המפרסם, כמה צבעים מוכנים, או כל צבע אחר. הטקסט על הכפתור — לבן או כהה לפי הניגודיות (ctaTextColor, אותה פונקציה כמו ב-bloc),
// והניגודיות מוצגת. צבע שגם לבן וגם כהה לא מגיעים עליו ל-4.5:1 — לא נשמר (כמו ב-bloc, סקירה #9): למה, והגוון הקרוב שעובר בלחיצה.
// תצוגה בלבד.
import { Check, AlertTriangle } from "lucide-react";
import { ghostBtn } from "@/components/ui/panelKit";
import { BLOC_ACCENT, accessibleAccent, contrastInfo, isHexColor } from "@/lib/adsFormats";
import { ACCENT_LOW_TEXT } from "@/lib/adsStudio";

const PRESETS = ["#16A34A", "#DC2626", "#D97706", "#7C3AED", "#DB2777", "#0F172A", "#FACC15"];
export type Swatch = { key: string; value: string | null; color: string; label: string };
/** הצבעים לבחירה: bloc, המותג (אם יש ושונה), המוכנים (בלי כפילויות). */
export function swatches(brand: string | null): Swatch[] {
  const out: Swatch[] = [{ key: "bloc", value: null, color: BLOC_ACCENT, label: "הצבע של bloc" }];
  const b = isHexColor(brand) ? brand.toUpperCase() : null;
  if (b && b !== BLOC_ACCENT) out.push({ key: "brand", value: b, color: b, label: "צבע המותג" });
  for (const c of PRESETS) if (c !== b) out.push({ key: c, value: c, color: c, label: c });
  return out;
}

export default function AccentPicker({ value, brand, onChange, disabled = false, ctaLabel = "לפרטים" }: {
  value: string | null; brand: string | null; onChange: (v: string | null) => void; disabled?: boolean; ctaLabel?: string;
}) {
  const list = swatches(brand);
  const v = isHexColor(value) ? value.toUpperCase() : null;
  const known = list.some((s) => s.value === v);
  const c = contrastInfo(v);
  const accent = v ?? BLOC_ACCENT;
  const fix = v && !c.ok ? accessibleAccent(v) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-accent-picker={v ?? "bloc"}>
      <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>צבע הכפתור</span>
      <div role="radiogroup" aria-label="צבע הכפתור" style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
        {list.map((s) => {
          const on = s.value === v;
          return (
            <button key={s.key} type="button" role="radio" aria-checked={on} aria-label={s.label} title={s.label} disabled={disabled} data-accent={s.key}
              onClick={() => { if (!on) onChange(s.value); }}
              style={{ width: "44px", height: "44px", borderRadius: "12px", border: `2px solid ${on ? "var(--text)" : "transparent"}`, background: "transparent", padding: "4px", fontFamily: "inherit" }}>
              <span style={{ display: "flex", width: "100%", height: "100%", borderRadius: "8px", background: s.color, alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.15)" }}>
                {on && <Check size={16} strokeWidth={3} color={contrastInfo(s.value).text} />}
                {!on && s.key === "brand" && <span style={{ fontSize: "10px", fontWeight: 800, color: contrastInfo(s.value).text }}>מותג</span>}
              </span>
            </button>
          );
        })}
        <label title="צבע אחר" style={{ position: "relative", width: "44px", height: "44px", borderRadius: "12px", border: `2px ${!known && v ? "solid var(--text)" : "dashed var(--border-2)"}`, display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxSizing: "border-box", background: !known && v ? v : "transparent" }}>
          <span style={{ fontSize: "18px", fontWeight: 700, color: !known && v ? c.text : "var(--text-2)" }} aria-hidden="true">+</span>
          <input type="color" aria-label="צבע אחר" disabled={disabled} value={accent.toLowerCase()} data-accent-custom=""
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value.toUpperCase())}
            style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span data-accent-sample="" style={{ minHeight: "40px", padding: "0 18px", borderRadius: "12px", background: accent, color: c.text, fontSize: "14.5px", fontWeight: 800, display: "inline-flex", alignItems: "center" }}>
          {ctaLabel || "לפרטים"}
        </span>
        <span className="studio-num" data-accent-contrast={c.ok ? "ok" : "low"} style={{ fontSize: "13px", color: c.ok ? "var(--text-2)" : "var(--yellow)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          {!c.ok && <AlertTriangle size={14} />}
          ניגודיות <bdi>{c.ratio}:1</bdi> · טקסט {c.text === "#FFFFFF" ? "לבן" : "כהה"}
        </span>
      </div>
      {fix && (
        <div role="alert" data-accent-low="" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 12px", borderRadius: "12px", border: "1px solid rgba(234,179,8,.45)", background: "rgba(234,179,8,.08)" }}>
          <span style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.55 }}>{ACCENT_LOW_TEXT}</span>
          <button type="button" disabled={disabled} onClick={() => onChange(fix)} data-accent-suggest={fix} style={{ ...ghostBtn, alignSelf: "flex-start", minHeight: "44px", gap: "8px" }}>
            <span aria-hidden="true" style={{ width: "22px", height: "22px", borderRadius: "7px", background: fix, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.2)", flexShrink: 0 }} />
            הגוון הקרוב שעובר: <bdi dir="ltr" className="studio-num">{fix}</bdi> <span className="studio-num" style={{ color: "var(--text-2)", fontWeight: 500 }}>({contrastInfo(fix).ratio}:1)</span>
          </button>
        </div>
      )}
    </div>
  );
}
