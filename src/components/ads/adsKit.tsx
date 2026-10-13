"use client";
// adsKit — חלקים משותפים למסכי הפרסומות (bloc ADS-1): בקשה ל-/api/ads, צ'יפים לבחירה מרובה, שדה עם תווית,
// פס התקדמות, ומספרים. אותו סגנון כמו panelKit (כהה, 48px, טקסט 15px).
import { Check } from "lucide-react";
import type { ApiResult } from "@/components/ui/panelKit";

/** פעולה ב-/api/ads. שגיאה — המשפט מהשרת (או מה-zod), בעברית. */
export async function postAds<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    const r = await fetch("/api/ads", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: j.error ?? j.issues?.[0]?.message ?? "הפעולה נכשלה. נסו שוב." };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, status: 0, error: "אין חיבור לשרת. בדקו את החיבור ונסו שוב." };
  }
}

/** העלאת תמונה (FormData) → הכתובת הציבורית. */
export async function uploadAdImage(file: File): Promise<ApiResult<{ url: string }>> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/ads/upload", { method: "POST", credentials: "include", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: j.error ?? "ההעלאה נכשלה. נסו שוב." };
    return { ok: true, data: { url: String(j.url) } };
  } catch {
    return { ok: false, status: 0, error: "אין חיבור לשרת. בדקו את החיבור ונסו שוב." };
  }
}

export const TONE_COLOR: Record<string, string> = { ok: "#22c55e", wait: "#eab308", danger: "#ef4444", muted: "#a1a1aa", info: "#3b82f6" };

/**
 * בחירה מרובה כצ'יפים (ימים, מסכים, מסלולים, קהל). לפחות אחד — אם min=1, האחרון לא יורד.
 * ADS-1b: מסומן — עם וי בתוכו (לא רק צבע: ב-13.10 ימים ומסכים "נבחרו" בלחיצה, ובעצם בוטלו — הכל מסומן מראש),
 * "הכל" כשלא הכל מסומן, ושורה שאומרת מה לא נבחר.
 */
export function ChipSet<T extends string | number>({ label, options, value, onChange, min = 1, name, hint, allLabel = "הכל" }: {
  label: string; options: Array<{ key: T; label: string }>; value: T[]; onChange: (v: T[]) => void; min?: number; name: string; hint?: string;
  allLabel?: string;
}) {
  const off = options.filter((o) => !value.includes(o.key));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }} data-chipset={name}>
      <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{label}</span>
      <div className="chips" role="group" aria-label={label} style={{ gap: "6px" }}>
        {options.map((o) => {
          const on = value.includes(o.key);
          return (
            <button key={String(o.key)} type="button" aria-pressed={on} data-chip={String(o.key)}
              className={`chip${on ? " active" : ""}`}
              style={{ minHeight: "44px", display: "inline-flex", alignItems: "center", gap: "6px", ...(on ? {} : { color: "var(--text-2)" }) }}
              onClick={() => {
                if (on && value.length <= min) return;
                onChange(on ? value.filter((v) => v !== o.key) : [...value, o.key]);
              }}>
              {on && <Check size={15} strokeWidth={2.6} aria-hidden="true" />}
              {o.label}
            </button>
          );
        })}
        {off.length > 0 && (
          <button type="button" data-chip-all="" onClick={() => onChange(options.map((o) => o.key))}
            style={{ minHeight: "44px", padding: "0 14px", borderRadius: "99px", border: "1px dashed var(--border-2)", background: "transparent", color: "var(--blue)", fontSize: "14px", fontWeight: 600 }}>
            {allLabel}
          </button>
        )}
      </div>
      {off.length > 0 && (
        <span style={{ fontSize: "13px", color: "var(--text-2)" }} data-chip-off="">לא נבחרו: {off.map((o) => o.label).join(", ")}</span>
      )}
      {hint && <span style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>{hint}</span>}
    </div>
  );
}

export function Field({ label, children, hint, style }: { label: string; children: React.ReactNode; hint?: string; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13.5px", color: "var(--text-2)", minWidth: 0, ...style }}>
      {label}
      {children}
      {hint && <span style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.5 }}>{hint}</span>}
    </label>
  );
}

/** פס התקדמות דק. */
export function Progress({ value, max, color = "var(--blue)", label }: { value: number; max: number; color?: string; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}
      style={{ height: "6px", borderRadius: "99px", background: "var(--border)", overflow: "hidden", minWidth: "80px" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color }} />
    </div>
  );
}

/** מספר שלם מתוך שדה (ריק = null). */
export function intOrNull(v: string): number | null {
  const t = v.trim().replace(/[,\s]/g, "");
  if (!t) return null;
  const x = Number(t);
  return Number.isFinite(x) ? Math.trunc(x) : null;
}
