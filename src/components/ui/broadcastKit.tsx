"use client";
// broadcastKit — חלקים משותפים לשליחת הודעה לבניינים ולניהול מה שנשלח (bloc UI-R5a):
// כרטיס עם כותרת, חלון, מתג, בחירת עדיפות, בחירת "כמה זמן תוצג", הודעה, ובקשה ל-API.
import { useEffect, useRef } from "react";
import { X, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { ilDateTime } from "@/lib/committee";
import {
  PRIORITIES, DURATIONS, MAX_DAYS, expiryFor, ilTodayKey, addDaysKey,
  type Priority, type DurationKey,
} from "@/lib/broadcasts";

export function Section({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="card" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "12px" }} aria-labelledby={id}>
      <div>
        <h2 id={id} style={{ fontSize: "15.5px", fontWeight: 700, color: "var(--text)" }}>{title}</h2>
        {hint && <p style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "3px", lineHeight: 1.6 }}>{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Modal({ title, onClose, children, width = 520, busy = false }: {
  title: string; onClose: () => void; children: React.ReactNode; width?: number; busy?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Escape לפי המצב העדכני (ref), בלי להריץ מחדש את ההתמקדות בכל רינדור.
  const live = useRef({ busy, onClose });
  live.current = { busy, onClose };
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !live.current.busy) live.current.onClose(); };
    window.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLElement>("input, textarea, button:not([data-modal-close])")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      // החלון נסגר — המיקוד חוזר לכפתור שפתח אותו.
      if (back && document.contains(back)) back.focus();
    };
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
      onClick={() => { if (!busy) onClose(); }}>
      <div ref={box} dir="rtl" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: `${width}px`, maxHeight: "92dvh", overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 800, color: "var(--text)" }}>{title}</h2>
          <button type="button" data-modal-close="" onClick={onClose} disabled={busy} aria-label="סגירה"
            style={{ width: "44px", height: "44px", margin: "-10px -10px 0 0", background: "none", border: "none", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, name }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; name: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} data-toggle={name} onClick={() => onChange(!checked)}
      style={{ width: "100%", minHeight: "48px", display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${checked ? "var(--blue)" : "var(--border)"}`, background: checked ? "#3b82f612" : "transparent", textAlign: "right", color: "var(--text)" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "14.5px", fontWeight: 600 }}>{label}</span>
        {hint && <span style={{ display: "block", fontSize: "13px", color: "var(--text-2)", marginTop: "2px", lineHeight: 1.5 }}>{hint}</span>}
      </span>
      <span aria-hidden style={{ width: "40px", height: "24px", borderRadius: "99px", background: checked ? "var(--blue)" : "var(--border-2)", position: "relative", flexShrink: 0, transition: "background .15s" }}>
        <span style={{ position: "absolute", top: "3px", right: checked ? "19px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: "white", transition: "right .15s" }} />
      </span>
    </button>
  );
}

export function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "8px" }} role="radiogroup" aria-label="עדיפות">
      {PRIORITIES.map((p) => {
        const on = value === p.key;
        return (
          <button key={p.key} type="button" role="radio" aria-checked={on} data-priority={p.key} onClick={() => onChange(p.key)}
            style={{ minHeight: "56px", padding: "10px 12px", borderRadius: "10px", border: `2px solid ${on ? p.color : "var(--border)"}`, background: on ? `${p.color}1f` : "transparent", textAlign: "right", color: "var(--text)" }}>
            <span style={{ display: "block", fontSize: "15px", fontWeight: 700, color: on ? p.color : "var(--text)" }}>{p.label}</span>
            <span style={{ display: "block", fontSize: "12.5px", color: "var(--text-2)", marginTop: "2px" }}>{p.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "כמה זמן תוצג" — הספירה מעכשיו. "בלי סיום" — רק אחרי אישור מפורש. */
export function DurationPicker({ value, date, keepNone, onChange, onDate, onKeepNone }: {
  value: DurationKey; date: string; keepNone: boolean;
  onChange: (d: DurationKey) => void; onDate: (d: string) => void; onKeepNone: (v: boolean) => void;
}) {
  const today = ilTodayKey();
  const end = expiryFor(value, date);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="chips" role="radiogroup" aria-label="כמה זמן תוצג" style={{ gap: "6px" }}>
        {DURATIONS.map((d) => (
          <button key={d.key} type="button" role="radio" aria-checked={value === d.key} data-duration={d.key}
            className={`chip${value === d.key ? " active" : ""}`} onClick={() => onChange(d.key)} style={{ minHeight: "44px", ...(value === d.key ? {} : { color: "var(--text-2)" }) }}>
            {d.label}
          </button>
        ))}
      </div>
      {value === "date" && (
        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13.5px", color: "var(--text-2)" }}>
          עד איזה יום (כולל)
          <input type="date" className="input" value={date} min={today} max={addDaysKey(today, MAX_DAYS)} onChange={(e) => onDate(e.target.value)} data-duration-date="" style={{ maxWidth: "220px" }} />
        </label>
      )}
      {value === "none" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 14px", borderRadius: "10px", background: "#eab30812", border: "1px solid #eab30835" }}>
          <div style={{ display: "flex", gap: "8px", fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>
            <AlertTriangle size={16} color="#eab308" style={{ flexShrink: 0, marginTop: "3px" }} />
            ההודעה תישאר אצל הדיירים עד שמורידים אותה כאן, בלשונית &quot;מוצגות עכשיו&quot;.
          </div>
          <label style={{ display: "flex", gap: "10px", alignItems: "center", minHeight: "44px", fontSize: "14px", color: "var(--text)", cursor: "pointer" }}>
            <input type="checkbox" checked={keepNone} onChange={(e) => onKeepNone(e.target.checked)} data-duration-keep="" style={{ width: "20px", height: "20px" }} />
            כן, בלי תאריך סיום
          </label>
        </div>
      ) : (
        <p style={{ fontSize: "13.5px", color: end ? "var(--text-2)" : "var(--yellow)" }} data-duration-end="">
          {end ? `ההודעה תרד ב-${ilDateTime(end)}` : "בחרו תאריך מהיום ועד שנה קדימה"}
        </p>
      )}
    </div>
  );
}

export function Banner({ tone, children, action }: { tone: "ok" | "error" | "warn" | "info"; children: React.ReactNode; action?: React.ReactNode }) {
  const c = tone === "ok" ? "#22c55e" : tone === "error" ? "#ef4444" : tone === "warn" ? "#eab308" : "#3b82f6";
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div role={tone === "error" ? "alert" : "status"} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "12px 14px", borderRadius: "10px", background: `${c}14`, border: `1px solid ${c}40`, fontSize: "14px", color: "var(--text)", lineHeight: 1.6 }}>
      <Icon size={17} color={c} style={{ flexShrink: 0, marginTop: "3px" }} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}{action && <div style={{ marginTop: "8px" }}>{action}</div>}</div>
    </div>
  );
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** בקשה ל-/api/broadcast: JSON פנימה והחוצה; שגיאה — המשפט מהשרת (או מה-zod), בעברית. */
export async function sendBroadcastApi<T = Record<string, unknown>>(method: "POST" | "PATCH" | "DELETE", body: unknown): Promise<ApiResult<T>> {
  try {
    const r = await fetch("/api/broadcast", { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: j.issues?.[0]?.message ?? j.error ?? "הפעולה נכשלה. נסו שוב." };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, status: 0, error: "אין חיבור לשרת. בדקו את החיבור ונסו שוב." };
  }
}

export const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", minHeight: "44px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontSize: "14px", fontWeight: 600 };
export const solidBtn = (bg: string, fg = "white"): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "48px", padding: "0 18px", borderRadius: "10px", border: "none", background: bg, color: fg, fontSize: "15px", fontWeight: 700 });
export const fieldLabel: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "6px", fontSize: "13.5px", color: "var(--text-2)" };
