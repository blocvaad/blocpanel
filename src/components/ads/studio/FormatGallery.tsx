"use client";
// studio/FormatGallery — "באילו פורמטים?" (bloc ADS-2א v2, החלטה 383): שבעה אריחים, בכל אחד טלפון קטן עם אנימציה קצרה
// שמראה איפה המודעה יושבת ואיך היא נכנסת, השם, שורה אחת והמידות של התמונה. בחירה מרובה (לפחות אחד) — לכל פורמט נוצרת
// מודעה משלו. prefers-reduced-motion — בלי תנועה. תצוגה בלבד.
import { Check } from "lucide-react";
import { AD_FORMATS, FORMAT_INFO, sizeText, type AdFormat, type BannerPosition } from "@/lib/adsFormats";
import { STUDIO_CSS } from "./kit";

const AD = "var(--blue)";
const SKEL = "var(--border-2)";
const line = (top: number, w: string, o: React.CSSProperties = {}): React.CSSProperties =>
  ({ position: "absolute", top: `${top}px`, right: "5px", width: w, height: "4px", borderRadius: "2px", background: SKEL, ...o });
/** ה-X האטום (החלטה 377) — גם בטלפון הקטן: עיגול כהה בפינה השמאלית העליונה. */
const xDot: React.CSSProperties = {
  position: "absolute", top: "4px", left: "4px", width: "8px", height: "8px", borderRadius: "50%", background: "#0B1220", border: "1px solid rgba(255,255,255,.6)", zIndex: 3,
};

export const GALLERY_CSS = `
@keyframes studio-pop { 0%, 12% { transform: scale(.82); opacity: 0; } 26%, 88% { transform: scale(1); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }
@keyframes studio-fade { 0%, 10% { opacity: 0; } 22%, 88% { opacity: 1; } 100% { opacity: 0; } }
@keyframes studio-rise { 0%, 14% { transform: translateY(8px); opacity: 0; } 28%, 88% { transform: translateY(0); opacity: 1; } 100% { opacity: 0; } }
@keyframes studio-up { 0%, 10% { transform: translateY(100%); } 28%, 90% { transform: translateY(0); } 100% { transform: translateY(0); opacity: 0; } }
@keyframes studio-bar { 0% { width: 0; } 100% { width: 100%; } }
@keyframes studio-drop { 0%, 12% { transform: translateY(-140%); } 28%, 88% { transform: translateY(0); } 100% { transform: translateY(-140%); } }
@keyframes studio-lift { 0%, 12% { transform: translateY(160%); } 28%, 88% { transform: translateY(0); } 100% { transform: translateY(160%); } }
@keyframes studio-scroll { 0%, 15% { transform: translateY(10px); } 45%, 100% { transform: translateY(0); } }
@keyframes studio-strip { 0%, 30% { transform: translateX(0); } 50%, 80% { transform: translateX(18px); } 100% { transform: translateX(0); } }
.studio-anim-pop { animation: studio-pop 3.2s ease-out infinite; }
.studio-anim-fade { animation: studio-fade 3.2s ease-out infinite; }
.studio-anim-rise { animation: studio-rise 3.2s ease-out infinite; }
.studio-anim-up { animation: studio-up 3.2s ease-out infinite; }
.studio-anim-bar { animation: studio-bar 1.6s linear infinite; }
.studio-anim-drop { animation: studio-drop 3.2s ease-out infinite; }
.studio-anim-lift { animation: studio-lift 3.2s ease-out infinite; }
.studio-anim-scroll { animation: studio-scroll 3.2s ease-in-out infinite alternate; }
.studio-anim-strip { animation: studio-strip 3.2s ease-in-out infinite; }
`;

/** טלפון קטן (44×78): איפה המודעה יושבת במסך, עם תנועה קצרה (אם האנימציה מותרת). */
export function MiniPhone({ format, position = "bottom", animate = true }: { format: AdFormat; position?: BannerPosition; animate?: boolean }) {
  const a = (k: string) => (animate ? `studio-anim-${k}` : undefined);
  const content = (
    <>
      <span style={line(8, "60%")} /><span style={line(18, "75%")} /><span style={line(28, "50%")} /><span style={line(38, "70%")} />
      <span style={line(48, "55%")} /><span style={line(58, "65%")} />
    </>
  );
  let ad: React.ReactNode = null;
  switch (format) {
    case "card":
      ad = (
        <>
          {content}
          <span className={a("fade")} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.55)" }} />
          <span className={a("pop")} style={{ position: "absolute", top: "16px", right: "9px", left: "9px", height: "46px" }}>
            <span style={{ position: "absolute", top: 0, right: 0, left: 0, height: "34px", borderRadius: "4px", background: AD }} />
            <span style={{ position: "absolute", top: "38px", right: "3px", left: "3px", height: "5px", borderRadius: "2px", background: "#fff" }} />
          </span>
          <span style={xDot} />
        </>
      );
      break;
    case "dialog":
      ad = (
        <>
          {content}
          <span className={a("fade")} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)" }} data-mini-scrim="" />
          <span className={a("rise")} style={{ position: "absolute", top: "22px", right: "5px", left: "5px", height: "36px", borderRadius: "4px", background: "#fff", overflow: "hidden" }}>
            <span style={{ position: "absolute", top: 0, right: 0, left: 0, height: "17px", background: AD }} />
            <span style={{ position: "absolute", top: "2px", left: "2px", width: "8px", height: "4px", borderRadius: "2px", background: "#0B1220" }} />
            <span style={{ position: "absolute", top: "20px", right: "3px", width: "60%", height: "3px", borderRadius: "2px", background: SKEL }} />
            <span style={{ position: "absolute", bottom: "3px", right: "3px", left: "3px", height: "6px", borderRadius: "2px", background: AD }} />
          </span>
          <span style={xDot} />
        </>
      );
      break;
    case "fullscreen":
      ad = (
        <span className={a("up")} style={{ position: "absolute", inset: 0 }}>
          <span style={{ position: "absolute", inset: 0, background: AD }} />
          <span style={{ position: "absolute", bottom: "13px", right: "5px", width: "60%", height: "4px", borderRadius: "2px", background: "#fff" }} />
          <span style={{ position: "absolute", bottom: "5px", right: "5px", left: "5px", height: "5px", borderRadius: "2px", background: "#fff" }} />
          <span style={xDot} />
        </span>
      );
      break;
    case "story":
      ad = (
        <>
          <span style={{ position: "absolute", inset: 0, background: AD }} />
          <span style={{ position: "absolute", top: "2px", right: "4px", left: "4px", display: "flex", gap: "2px", direction: "rtl" }}>
            <span style={{ flex: 1, height: "2px", background: "#fff" }} />
            <span style={{ flex: 1, height: "2px", background: "rgba(255,255,255,.45)", overflow: "hidden" }}>
              <span className={a("bar")} style={{ display: "block", height: "100%", width: animate ? undefined : "45%", background: "#fff" }} />
            </span>
            <span style={{ flex: 1, height: "2px", background: "rgba(255,255,255,.45)" }} />
          </span>
          <span style={{ position: "absolute", bottom: "5px", right: "5px", left: "5px", height: "5px", borderRadius: "2px", background: "#fff" }} />
          <span style={{ ...xDot, top: "7px" }} />
        </>
      );
      break;
    case "banner":
      ad = (
        <>
          {content}
          <span className={a(position === "top" ? "drop" : "lift")} data-mini-banner={position} style={{ position: "absolute", right: "3px", left: "3px", height: "10px", borderRadius: "3px", background: AD, ...(position === "top" ? { top: "2px" } : { bottom: "9px" }) }} />
          {position === "bottom" && <span style={{ position: "absolute", bottom: 0, right: 0, left: 0, height: "6px", background: SKEL }} />}
        </>
      );
      break;
    case "native":
      ad = (
        <span className={a("scroll")} style={{ position: "absolute", inset: 0 }}>
          <span style={line(6, "70%")} /><span style={line(14, "55%")} /><span style={line(22, "65%")} />
          <span style={{ position: "absolute", top: "31px", right: "4px", left: "4px", height: "24px", borderRadius: "4px", background: AD }} />
          <span style={line(60, "60%")} /><span style={line(68, "50%")} />
        </span>
      );
      break;
    case "carousel":
      ad = (
        <>
          <span style={line(6, "70%")} /><span style={line(14, "55%")} /><span style={line(22, "65%")} />
          <span className={a("strip")} style={{ position: "absolute", top: "32px", right: "4px", display: "flex", gap: "3px" }}>
            <span style={{ width: "15px", height: "15px", borderRadius: "3px", background: AD }} />
            <span style={{ width: "15px", height: "15px", borderRadius: "3px", background: AD, opacity: 0.75 }} />
            <span style={{ width: "15px", height: "15px", borderRadius: "3px", background: AD, opacity: 0.5 }} />
          </span>
          <span style={line(53, "40%", { right: "15px", background: AD, opacity: 0.6, height: "3px" })} />
          <span style={line(62, "60%")} /><span style={line(70, "50%")} />
        </>
      );
      break;
  }
  return (
    <span aria-hidden="true" data-mini-phone={format} className="studio-anim" style={{
      position: "relative", display: "block", width: "44px", height: "78px", borderRadius: "9px", border: "2px solid var(--border-2)",
      background: "var(--surface)", overflow: "hidden", flexShrink: 0, boxSizing: "border-box",
    }}>
      {ad}
    </span>
  );
}

/** בחירה מרובה: לחיצה מוסיפה / מורידה; האחרון שנשאר לא יורד. */
export function toggleFormat(value: readonly AdFormat[], f: AdFormat): AdFormat[] {
  if (value.includes(f)) return value.length > 1 ? value.filter((x) => x !== f) : value.slice();
  return AD_FORMATS.filter((x) => x === f || value.includes(x));
}

export default function FormatGallery({ value, onChange, bannerPosition = "bottom", disabled = false, animate = true }: {
  value: AdFormat[]; onChange: (v: AdFormat[]) => void; bannerPosition?: BannerPosition; disabled?: boolean; animate?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-format-gallery={value.join(",")}>
      <style>{STUDIO_CSS + GALLERY_CSS}</style>
      <div role="group" aria-label="פורמטים — אפשר לבחור כמה" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(132px,1fr))", gap: "8px" }}>
        {AD_FORMATS.map((f) => {
          const info = FORMAT_INFO[f];
          const on = value.includes(f);
          return (
            <button key={f} type="button" role="checkbox" aria-checked={on} disabled={disabled} data-format-tile={f}
              onClick={() => { if (!disabled) onChange(toggleFormat(value, f)); }}
              style={{
                position: "relative", display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start", textAlign: "right", padding: "10px", borderRadius: "14px",
                minHeight: "44px", fontFamily: "inherit", cursor: disabled ? "default" : "pointer", color: "var(--text)",
                border: `${on ? 2 : 1}px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "rgba(59,130,246,.09)" : "var(--card)",
                opacity: disabled && !on ? 0.45 : 1,
              }}>
              <MiniPhone format={f} position={bannerPosition} animate={animate && !disabled} />
              <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0, width: "100%" }}>
                <span style={{ fontSize: "14.5px", fontWeight: 700, lineHeight: 1.3 }}>{info.label}</span>
                <span style={{ fontSize: "12px", color: "var(--text-2)", lineHeight: 1.4 }}>{info.line}</span>
                <span className="studio-num" style={{ fontSize: "11.5px", color: "var(--text-3)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }} data-format-size={f}>
                  {sizeText(info.image)} · {info.image.ratio}
                </span>
              </span>
              <span aria-hidden="true" style={{
                position: "absolute", top: "8px", left: "8px", width: "22px", height: "22px", borderRadius: "6px", boxSizing: "border-box",
                border: on ? "none" : "1.5px solid var(--border-2)", background: on ? "var(--blue)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {on && <Check size={14} strokeWidth={3} color="#fff" />}
              </span>
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: "13px", color: "var(--text-2)" }} data-format-count={value.length}>
        {value.length === 1 ? `נבחר פורמט אחד: ${FORMAT_INFO[value[0]].label}.` : `נבחרו ${value.length} פורמטים — לכל אחד תיווצר מודעה משלו, מאותו תוכן.`}
      </span>
    </div>
  );
}
