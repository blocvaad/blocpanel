"use client";
// studio/kit — חלקים קטנים של "סטודיו הפרסום" (bloc ADS-2א v2, החלטה 383): הניווט של האזור, דמות מפרסם, אייקוני מיקום,
// קו קטן (SVG), אריח מדד, מצב שמירה, בחירה מקטעים, לשוניות, גיליון מלמטה, כפתורים צמודים לתחתית, פס השלבים של האשף.
// תצוגה בלבד — בלי state (הגיליון — רק מיקוד ו-Escape); מגעים של 44px לפחות.
import { useEffect, useRef } from "react";
import Link from "next/link";
import { Check, AlertTriangle, RefreshCw, X } from "lucide-react";
import { FORMAT_INFO, type AdFormat } from "@/lib/adsFormats";
import { avatarOf, sparkPath, type SaveState } from "@/lib/adsStudio";
import { isOurAdImage, adsImageBase } from "@/lib/adsUi";

/** הכתובת הציבורית של הבאקט 'ads' — אותו פרויקט Supabase כמו bloc (NEXT_PUBLIC_SUPABASE_URL נכנס לחבילת הדפדפן). */
export const STUDIO_IMAGE_BASE = adsImageBase(process.env.NEXT_PUBLIC_SUPABASE_URL);

export const STUDIO_CSS = `
.studio-scroll { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.studio-scroll::-webkit-scrollbar { display: none; }
.studio-num { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .studio-anim, .studio-anim * { animation: none !important; transition: none !important; } }
@media (min-width: 720px) { .studio-narrow-only { display: none !important; } }
`;

const NAV = [
  { href: "/ads", key: "campaigns", label: "קמפיינים" },
  { href: "/ads/advertisers", key: "advertisers", label: "מפרסמים" },
  { href: "/ads/settings", key: "settings", label: "הגדרות" },
] as const;

/** הניווט של אזור הפרסום (ראש כל עמוד בסטודיו). */
export function StudioNav({ active }: { active: "campaigns" | "advertisers" | "settings" }) {
  return (
    <nav aria-label="סטודיו הפרסום" className="studio-scroll" data-studio-nav={active}>
      <style>{STUDIO_CSS}</style>
      {NAV.map((n) => (
        <Link key={n.key} href={n.href} aria-current={n.key === active ? "page" : undefined} data-studio-nav-item={n.key}
          style={{
            minHeight: "44px", padding: "0 16px", borderRadius: "99px", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
            fontSize: "14.5px", fontWeight: 600, textDecoration: "none",
            border: `1px solid ${n.key === active ? "var(--text)" : "var(--border)"}`,
            background: n.key === active ? "var(--text)" : "transparent", color: n.key === active ? "var(--bg)" : "var(--text-2)",
          }}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

/** הדמות של מפרסם: הלוגו (רק מהבאקט של bloc) או האות הראשונה על צבע המותג. */
export function AdvertiserAvatar({ name, logo, color, size = 40, imageBase = null }: {
  name: string; logo: string | null; color: string | null; size?: number; imageBase?: string | null;
}) {
  const a = avatarOf(name, logo && isOurAdImage(logo, imageBase) !== false && /^https:\/\//.test(logo) ? logo : null, color);
  return (
    <span aria-hidden="true" data-avatar={a.logo ? "logo" : "initial"} style={{
      width: `${size}px`, height: `${size}px`, borderRadius: `${Math.round(size * 0.3)}px`, flexShrink: 0, overflow: "hidden",
      display: "inline-flex", alignItems: "center", justifyContent: "center", background: a.logo ? "var(--surface)" : a.color,
      color: "#fff", fontWeight: 800, fontSize: `${Math.round(size * 0.45)}px`, border: "1px solid var(--border)",
    }}>
      {a.logo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={a.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : a.initial}
    </span>
  );
}

/** סימן קטן לכל פורמט — טלפון עם המקום של המודעה. */
export function FormatGlyph({ format, size = 16, color = "#60a5fa" }: { format: AdFormat; size?: number; color?: string }) {
  const w = Math.round(size * 0.64);
  const fills: React.CSSProperties[] =
    format === "fullscreen" || format === "story" ? [{ inset: "1px" }]
    : format === "card" ? [{ top: "28%", right: "1px", left: "1px", height: "38%" }]
    : format === "dialog" ? [{ top: "30%", right: "1px", left: "1px", height: "30%" }, { inset: 0, background: "rgba(96,165,250,.25)" }]
    : format === "banner" ? [{ bottom: "1px", right: "1px", left: "1px", height: "18%" }]
    : format === "native" ? [{ top: "36%", right: "1px", left: "1px", height: "26%" }]
    : [{ top: "36%", right: "1px", width: "34%", height: "24%" }, { top: "36%", left: "1px", width: "30%", height: "24%" }];
  return (
    <span aria-hidden="true" style={{ position: "relative", display: "inline-block", width: `${w}px`, height: `${size}px`, borderRadius: "3px", border: `1.5px solid ${color}`, boxSizing: "border-box", overflow: "hidden", flexShrink: 0 }}>
      {fills.map((f, i) => <span key={i} style={{ position: "absolute", background: color, borderRadius: "1px", ...f }} />)}
    </span>
  );
}

/** איפה הקמפיין מוצג — הפורמטים של המודעות הפעילות; אין — "אין מודעה פעילה". */
export function PlacementIcons({ formats }: { formats: AdFormat[] }) {
  if (!formats.length) return <span style={{ fontSize: "12.5px", color: "var(--yellow)" }} data-placements="none">אין מודעה פעילה</span>;
  return (
    <span style={{ display: "inline-flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }} data-placements={formats.join(",")}
      aria-label={`מוצג כ: ${formats.map((f) => FORMAT_INFO[f].label).join(", ")}`} role="img">
      {formats.map((f) => (
        <span key={f} title={FORMAT_INFO[f].label} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px 2px 6px", borderRadius: "99px", background: "#3b82f614", color: "#93c5fd", fontSize: "12px", fontWeight: 600 }}>
          <FormatGlyph format={f} size={14} />{FORMAT_INFO[f].label}
        </span>
      ))}
    </span>
  );
}

/** קו של 7 ימים (הישן מימין). אין נתונים — כלום. */
export function Sparkline({ values, w = 96, h = 28, label }: { values: number[] | null; w?: number; h?: number; label: string }) {
  if (!values) return <span style={{ fontSize: "12px", color: "var(--text-3)" }} data-spark="none">—</span>;
  const d = sparkPath(values, w, h - 2);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} data-spark={values.join(",")} style={{ overflow: "visible", flexShrink: 0 }}>
      <path d={d} fill="none" stroke="var(--blue)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" transform="translate(0,1)" />
    </svg>
  );
}

/** prefix — מילה קטנה לפני המספר ("עד" — סקירה #7), כדי שהמספר עצמו לא יישבר בין שורות במשבצת צרה. */
export function KpiTile({ label, value, sub, testId, prefix }: { label: string; value: string; sub?: string | null; testId?: string; prefix?: string | null }) {
  return (
    <div className="card" style={{ padding: "12px 14px", minWidth: 0 }} data-kpi={testId}>
      <div style={{ fontSize: "12.5px", color: "var(--text-2)" }}>{label}</div>
      <div className="studio-num" style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", marginTop: "4px", fontFamily: "var(--mono)" }}>
        {prefix && <span data-kpi-prefix="" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-2)", fontFamily: "inherit", marginInlineEnd: "5px" }}>{prefix}</span>}
        <span>{value}</span>
      </div>
      {sub && <div style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: "2px", lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

export type { SaveState };
/** "נשמר" / "שומרים…" / "לא נשמר — נסו שוב" / "ייתכן שנשמר — רעננו". */
export function SaveIndicator({ state, error, onRetry, onRefresh }: { state: SaveState; error?: string | null; onRetry?: () => void; onRefresh?: () => void }) {
  if (state === "idle") return null;
  const base: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", minHeight: "32px" };
  if (state === "saving") return <span role="status" style={{ ...base, color: "var(--text-2)" }} data-save="saving"><RefreshCw size={14} />שומרים…</span>;
  if (state === "saved") return <span role="status" style={{ ...base, color: "var(--green)" }} data-save="saved"><Check size={14} />נשמר</span>;
  if (state === "unclear") return (
    <span role="alert" style={{ ...base, color: "var(--yellow)", flexWrap: "wrap" }} data-save="unclear">
      <AlertTriangle size={14} />ייתכן שנשמר — רעננו לפני שממשיכים
      {onRefresh && <button type="button" onClick={onRefresh} style={linkBtn}>רענון</button>}
    </span>
  );
  return (
    <span role="alert" style={{ ...base, color: "var(--red)", flexWrap: "wrap" }} data-save="error">
      <AlertTriangle size={14} />לא נשמר{error ? ` — ${error}` : ""}
      {onRetry && <button type="button" onClick={onRetry} style={linkBtn}>נסו שוב</button>}
    </span>
  );
}
export const linkBtn: React.CSSProperties = { minHeight: "32px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontSize: "13px", fontWeight: 600 };

/** בחירה אחת מכמה (radiogroup). */
export function Segmented<T extends string | number>({ label, options, value, onChange, testId, disabled }: {
  label: string; options: Array<{ key: T; label: string }>; value: T; onChange: (v: T) => void; testId?: string; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-segmented={testId} style={{ display: "inline-flex", padding: "3px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface)", gap: "2px", maxWidth: "100%", overflowX: "auto" }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={String(o.key)} type="button" role="radio" aria-checked={on} disabled={disabled} data-segment={String(o.key)} onClick={() => { if (!on) onChange(o.key); }}
            style={{ minHeight: "40px", padding: "0 14px", borderRadius: "9px", border: `1px solid ${on ? "var(--border-2)" : "transparent"}`, whiteSpace: "nowrap", fontSize: "14px", fontWeight: 600, fontFamily: "inherit",
              background: on ? "var(--card)" : "transparent", color: on ? "var(--text)" : "var(--text-2)" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * גיליון מלמטה (בטלפון) / חלון במרכז (במסך רחב): Escape סוגר (לא באמצע פעולה), המיקוד נכנס פנימה וחוזר לכפתור שפתח.
 * אותו דפוס כמו Modal של הפאנל, אבל נצמד לתחתית בטלפון — האגודל מגיע.
 */
export function Sheet({ title, onClose, children, busy = false, testId, wide = false }: {
  title: string; onClose: () => void; children: React.ReactNode; busy?: boolean; testId?: string; wide?: boolean;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const live = useRef({ busy, onClose });
  live.current = { busy, onClose };
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !live.current.busy) live.current.onClose(); };
    window.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLElement>("input, textarea, button:not([data-sheet-close])")?.focus();
    return () => { window.removeEventListener("keydown", onKey); if (back && document.contains(back)) back.focus(); };
  }, []);
  return (
    <div className="studio-sheet-wrap" onClick={() => { if (!busy) onClose(); }} data-sheet={testId}>
      <style>{SHEET_CSS}</style>
      <div ref={box} dir="rtl" role="dialog" aria-modal="true" aria-label={title} className={`studio-sheet${wide ? " studio-sheet-wide" : ""}`} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", position: "sticky", top: 0, background: "var(--surface)", padding: "14px 16px 10px", zIndex: 2, borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: "17px", fontWeight: 800, color: "var(--text)" }}>{title}</h2>
          <button type="button" data-sheet-close="" onClick={onClose} disabled={busy} aria-label="סגירה"
            style={{ width: "44px", height: "44px", margin: "-6px -10px -6px 0", background: "none", border: "none", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: "14px 16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>{children}</div>
      </div>
    </div>
  );
}
const SHEET_CSS = `
.studio-sheet-wrap { position: fixed; inset: 0; z-index: 100; display: flex; align-items: flex-end; justify-content: center; background: rgba(0,0,0,.72); }
.studio-sheet { width: 100%; max-height: 94dvh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 20px 20px 0 0; padding-bottom: env(safe-area-inset-bottom); }
@media (min-width: 720px) { .studio-sheet-wrap { align-items: center; padding: 16px; } .studio-sheet { max-width: 560px; border-radius: 16px; } .studio-sheet-wide { max-width: 980px; } }
`;

/** הכפתורים בתחתית — נשארים גלויים בגלילה (בטלפון), עם שטח בטוח. */
export function StickyBar({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div data-sticky-bar={testId} style={{
      position: "sticky", bottom: 0, zIndex: 5, margin: "0 -16px", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
      background: "var(--bg)", borderTop: "1px solid var(--border)", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap",
    }}>
      {children}
    </div>
  );
}

/** לשוניות בגלילה לצד (tablist): הנבחרת מסומנת; מספר ליד השם כשיש. */
export function ScrollTabs<T extends string>({ label, tabs, value, onChange, testId }: {
  label: string; tabs: Array<{ key: T; label: string; count?: number }>; value: T; onChange: (t: T) => void; testId?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="studio-scroll" data-tabs={testId}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} data-tab={t.key} onClick={() => { if (!on) onChange(t.key); }}
            style={{ minHeight: "44px", padding: "0 14px", borderRadius: "99px", whiteSpace: "nowrap", fontSize: "14px", fontWeight: 600, fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0,
              border: `1px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "rgba(59,130,246,.14)" : "transparent", color: on ? "var(--text)" : "var(--text-2)" }}>
            {t.label}
            {t.count !== undefined && <span className="studio-num" data-tab-count={t.count} style={{ fontSize: "12.5px", color: on ? "var(--text)" : "var(--text-3)", fontFamily: "var(--mono)" }}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** פס השלבים של האשף: שם לכל שלב; שלב שאפשר להגיע אליו — לחיץ. */
export function StepBar({ steps, current, reachable, onStep }: { steps: string[]; current: number; reachable: (i: number) => boolean; onStep: (i: number) => void }) {
  return (
    <ol aria-label="שלבים" data-stepbar={current} style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, 1fr)`, gap: "4px", listStyle: "none", padding: 0, margin: 0 }}>
      {steps.map((s, i) => {
        const n = i + 1;
        const on = n === current;
        const done = n < current;
        const can = reachable(n) && !on;
        return (
          <li key={s} style={{ minWidth: 0 }}>
            <button type="button" disabled={!can} onClick={() => onStep(n)} aria-current={on ? "step" : undefined} data-step={n}
              style={{ width: "100%", minHeight: "44px", padding: "4px 2px", border: "none", background: "transparent", display: "flex", flexDirection: "column", alignItems: "stretch", gap: "6px", fontFamily: "inherit", cursor: can ? "pointer" : "default" }}>
              <span style={{ height: "4px", borderRadius: "99px", background: done || on ? "var(--blue)" : "var(--border)" }} />
              <span style={{ fontSize: "11.5px", lineHeight: 1.25, fontWeight: on ? 800 : 600, color: on ? "var(--text)" : done ? "var(--text-2)" : "var(--text-3)", overflowWrap: "anywhere" }}>
                {n}. {s}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
