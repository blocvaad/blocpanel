"use client";
// studio/FocalPicker — נקודת המיקוד של תמונה (bloc ADS-2א v2, החלטה 380): הקשה או גרירה של הנקודה על התמונה (או חיצים
// במקלדת), ובכל פורמט שנבחר — המסגרת שלו על התמונה והחיתוך שלו בקטן, מתעדכנים מיד. כך תמונה אחת שהועלתה נחתכת טוב בכל
// פורמט: object-fit: cover עם object-position לפי הנקודה — בדיוק כמו באפליקציה. FocalPickerView — תצוגה בלבד.
import { useState } from "react";
import { ghostBtn } from "@/components/ui/panelKit";
import { FORMAT_INFO, cropRect, focalFromPoint, formatRatio, objectPosition, roundFocal, clampFocal, type AdFormat } from "@/lib/adsFormats";

const COLORS = ["#60A5FA", "#F472B6", "#34D399", "#FBBF24", "#A78BFA", "#F87171", "#22D3EE"];
/** "30% משמאל, 70% מלמעלה" — לקורא מסך. */
export const focalText = (f: [number, number]) => `${Math.round(clampFocal(f[0]) * 100)}% משמאל, ${Math.round(clampFocal(f[1]) * 100)}% מלמעלה`;
/** חיצים: 5% לכל לחיצה (Shift — 1%). */
export function nudgeFocal(f: [number, number], key: string, fine = false): [number, number] | null {
  const s = fine ? 0.01 : 0.05;
  const d: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] };
  const m = d[key];
  return m ? [roundFocal(f[0] + m[0]), roundFocal(f[1] + m[1])] : null;
}

export interface FocalPickerViewProps {
  url: string | null; alt?: string; ratio: number | null; focal: [number, number]; formats: AdFormat[]; disabled?: boolean;
  onFocal: (f: [number, number]) => void; onRatio?: (r: number) => void; testId?: string;
}

export function FocalPickerView({ url, alt = "", ratio, focal, formats, disabled = false, onFocal, onRatio, testId }: FocalPickerViewProps) {
  const r = ratio && ratio > 0 ? ratio : 1;
  const shown = formats;
  const point = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    onFocal(focalFromPoint(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY));
  };
  if (!url) {
    return (
      <div data-focal-picker="empty" style={{ fontSize: "13px", color: "var(--text-3)", padding: "10px 12px", borderRadius: "10px", border: "1px dashed var(--border-2)" }}>
        אחרי ההעלאה מסמנים כאן את נקודת המיקוד — מה חייב להישאר בכל חיתוך.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-focal-picker={testId ?? "image"} data-focal={`${focal[0]},${focal[1]}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>נקודת המיקוד — מקישים או גוררים על מה שחשוב בתמונה</span>
        <button type="button" style={{ ...ghostBtn, minHeight: "36px", fontSize: "13px" }} disabled={disabled || (focal[0] === 0.5 && focal[1] === 0.5)}
          onClick={() => onFocal([0.5, 0.5])} data-focal-reset="">
          למרכז
        </button>
      </div>
      <div style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
      <div role="slider" tabIndex={disabled ? -1 : 0} aria-label="נקודת המיקוד" aria-valuetext={focalText(focal)} aria-disabled={disabled || undefined}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(focal[0] * 100)} data-focal-box=""
        onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => { if (disabled) return; e.currentTarget.setPointerCapture?.(e.pointerId); point(e); }}
        onPointerMove={(e: React.PointerEvent<HTMLDivElement>) => { if (!disabled && e.buttons & 1) point(e); }}
        onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => { if (disabled) return; const n = nudgeFocal(focal, e.key, e.shiftKey); if (n) { e.preventDefault(); onFocal(n); } }}
        style={{ position: "relative", display: "inline-block", maxWidth: "100%", lineHeight: 0, borderRadius: "12px", overflow: "hidden",
          background: "var(--surface)", border: "1px solid var(--border)", touchAction: "none", cursor: disabled ? "default" : "crosshair" }}>
        {/* the box IS the image (its own aspect) — the dot and the frames are % of it, the same as object-position */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} draggable={false} onLoad={(e: { currentTarget: HTMLImageElement }) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) onRatio?.(i.naturalWidth / i.naturalHeight); }}
          style={{ display: "block", maxWidth: "100%", maxHeight: "360px", width: "auto", height: "auto", userSelect: "none", pointerEvents: "none" }} />
        {ratio && shown.map((f, i) => {
          const c = cropRect(r, formatRatio(f), focal[0], focal[1]);
          return (
            <span key={f} data-crop-rect={f} data-crop={`${c.x.toFixed(3)},${c.y.toFixed(3)},${c.w.toFixed(3)},${c.h.toFixed(3)}`} aria-hidden="true" style={{
              position: "absolute", left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%`,
              border: `2px solid ${COLORS[i % COLORS.length]}`, borderRadius: "4px", boxSizing: "border-box", pointerEvents: "none",
            }} />
          );
        })}
        <span aria-hidden="true" data-focal-dot="" style={{
          position: "absolute", left: `${focal[0] * 100}%`, top: `${focal[1] * 100}%`, width: "28px", height: "28px", margin: "-14px 0 0 -14px",
          borderRadius: "50%", border: "3px solid #fff", background: "rgba(37,99,235,.55)", boxSizing: "border-box", pointerEvents: "none",
        }} />
      </div>
      </div>
      {shown.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "flex-start" }} data-focal-crops="">
          {shown.map((f, i) => {
            const fr = formatRatio(f);
            const h = 72;
            return (
              <div key={f} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", flexShrink: 0 }} data-focal-crop={f}>
                <div style={{ position: "relative", height: `${h}px`, width: `${Math.round(h * fr)}px`, borderRadius: "8px", overflow: "hidden", border: `2px solid ${COLORS[i % COLORS.length]}`, background: "var(--surface)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: objectPosition(focal[0], focal[1]) }} />
                </div>
                <span style={{ fontSize: "11.5px", color: "var(--text-2)", whiteSpace: "nowrap" }}>{FORMAT_INFO[f].label} · {FORMAT_INFO[f].image.ratio}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** עם היחס של התמונה (נקרא כשהיא נטענת). */
export default function FocalPicker(p: Omit<FocalPickerViewProps, "ratio" | "onRatio">) {
  const [ratio, setRatio] = useState<{ url: string | null; r: number } | null>(null);
  return <FocalPickerView {...p} ratio={ratio && ratio.url === p.url ? ratio.r : null} onRatio={(r) => setRatio({ url: p.url, r })} />;
}
