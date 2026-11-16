"use client";
// studio/AdPreview — איך המודעה תיראה אצל הדייר, בכל אחד משבעת הפורמטים (bloc ADS-2א v2, החלטות 376–380; מחליף את
// AdPhonePreview / AdFormatPreview). מראה בדיוק את הרכיבים של bloc כפי שהתוכנית מתארת:
//   • כרטיס / חלון קופץ / מסך מלא / סטורי — כפתור סגירה אחד, אטום, בפינה השמאלית העליונה של המסך (12px, מתחת לשורת המצב),
//     44×44, ‎#0B1220‎ ב-92% עם טבעת דקה ו-X לבן — פועל מיד: בלי ספירה ובלי "3" (החלטה 377).
//   • חלון קופץ — מעל המסך הנוכחי, שנשאר גלוי מאחורי מסך כהה (rgba(0,0,0,.6), בלי טשטוש); תמונה 16:9 עם "ממומן" בפינה
//     השמאלית העליונה שלה; כותרת (2 שורות), משפט (3 שורות; "קרא עוד" רק כשהוא באמת נחתך — נמדד אחרי הציור, scrollHeight >
//     clientHeight, כמו ב-bloc), וכפתור ברוחב מלא בצבע המודעה. רקע כהה — ‎#0B1220‎ כמו ב-bloc.
//   • פס — בראש מסך הבית או בתחתית מעל הניווט; כרטיס ברשימה / קרוסלה — בתוך רשימה אחרי הפריט השלישי.
//   • הכפתור: צבע המודעה (accent) או הצבע של bloc; הטקסט עליו לבן או #0F172A לפי ניגודיות (ctaTextColor — כמו ב-bloc).
//   • כל תמונה: object-fit: cover עם נקודת המיקוד (object-position); רק תמונות מהבאקט של bloc נטענות (isOurAdImage).
//   • "ממומן · המפרסם" בכל פורמט; בפס, בכרטיס ברשימה ובחלון — עם הלוגו של המפרסם (אם הוא שלנו).
// תצוגה בלבד; הבחירה בתמונה של סטורי / קרוסלה — frame + onFrame מבחוץ.
import { useEffect, useRef, useState } from "react";
import {
  FORMAT_INFO, sizeText, objectPosition, ctaTextColor, BLOC_ACCENT, isHexColor,
  type AdFormat, type AdTheme, type BannerPosition,
} from "@/lib/adsFormats";
import { isOurAdImage } from "@/lib/adsUi";

export type PreviewFrame = { imageUrl: string | null; imageAlt: string; caption: string | null; ctaUrl?: string | null; focal?: [number, number] | null };
export interface AdPreviewProps {
  format: AdFormat;
  advertiser: string; advertiserLogo?: string | null;
  headline: string; body: string | null; ctaLabel: string;
  imageUrl: string | null; imageAlt: string; focal?: [number, number];
  bannerPosition?: BannerPosition | null; theme?: AdTheme; accent?: string | null;
  frames?: PreviewFrame[] | null; frame?: number; onFrame?: (i: number) => void;
  /** רק תמונה מהבאקט של bloc נטענת; null — לא ידוע (https בלבד). */
  imageBase?: string | null;
  /** רוחב המסך המדומה (320 / 390 — טלפון קטן / רגיל). */
  width?: number;
  /** האפליקציה עצמה — בהירה או כהה (מאחורי החלון, הפס והרשימה). */
  appTheme?: "light" | "dark";
  scale?: number;
}

const BORDER = 10, IH = 720, SAFE = 28;
const FONT = "Heebo, Arial, sans-serif";
const clamp = (n: number): React.CSSProperties => ({ display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical", overflow: "hidden" });
const oneLine: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const THEMES: Record<AdTheme, { bg: string; text: string; muted: string; border: string }> = {
  light: { bg: "#FFFFFF", text: "#0F172A", muted: "#64748B", border: "#E2E8F0" },
  dark: { bg: "#0B1220", text: "#F8FAFC", muted: "rgba(248,250,252,.7)", border: "rgba(255,255,255,.14)" },
};
const APPS = {
  light: { bg: "#F3F5F9", card: "#FFFFFF", line: "#E5E9F0", strong: "#CBD5E1", text: "#0F172A" },
  dark: { bg: "#0B1220", card: "#111A2E", line: "#1E293B", strong: "#334155", text: "#F8FAFC" },
};
type App = typeof APPS.light;

function XIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
/** החלטה 377: עיגול אטום עם X — בלי ספרה, בלי טבעת ספירה. */
function CloseDisc({ top, left, size = 44, icon = 20 }: { top: number; left: number; size?: number; icon?: number }) {
  return (
    <span data-ad-preview-close="solid" title="סגירת הפרסומת" style={{
      position: "absolute", top: `${top}px`, left: `${left}px`, width: `${size}px`, height: `${size}px`, borderRadius: "50%", zIndex: 7,
      background: "rgba(11,18,32,.92)", border: "1px solid rgba(255,255,255,.25)", boxSizing: "border-box",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <XIcon size={icon} color="#FFFFFF" />
    </span>
  );
}
function Sponsored({ advertiser, color, strong, pill, logo }: { advertiser: string; color: string; strong: string; pill?: boolean; logo?: string | null }) {
  return (
    <span data-ad-preview-sponsored="" style={{
      display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color, maxWidth: "100%", minWidth: 0,
      ...(pill ? { padding: "5px 10px", borderRadius: "99px", background: "rgba(11,18,32,.72)" } : {}),
    }}>
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" data-ad-preview-logo="" style={{ width: "18px", height: "18px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
      )}
      <span style={oneLine}>ממומן · <b style={{ color: strong, fontWeight: 700 }}>{advertiser || "שם המפרסם"}</b></span>
    </span>
  );
}
function Placeholder({ f, dark, radius = 0, small }: { f: AdFormat; dark: boolean; radius?: number; small?: boolean }) {
  return (
    <div data-ad-preview-placeholder="" style={{
      position: "absolute", inset: 0, borderRadius: `${radius}px`, border: `2px dashed ${dark ? "rgba(255,255,255,.28)" : "#CBD5E1"}`,
      background: dark ? "rgba(255,255,255,.06)" : "#F8FAFC", color: dark ? "rgba(255,255,255,.7)" : "#64748B",
      display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 10px", fontSize: small ? "10px" : "14px", lineHeight: 1.4,
    }}>
      {small ? FORMAT_INFO[f].image.ratio : <>התמונה תופיע כאן ({sizeText(FORMAT_INFO[f].image)})</>}
    </div>
  );
}
/** נחתך? — הגובה של כל הטקסט גדול מהגובה שנראה (3 השורות). אותו כלל כמו ב-bloc. */
export const isClamped = (el: { scrollHeight: number; clientHeight: number } | null): boolean => !!el && el.scrollHeight > el.clientHeight;
/** המשפט של החלון הקופץ: 3 שורות, ו"קרא עוד" רק כשהוא באמת נחתך — נמדד אחרי הציור (ושוב כשהטקסט או הרוחב משתנים). */
function DialogBody({ body, color, strong, width }: { body: string; color: string; strong: string; width: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => { setMore(isClamped(ref.current)); }, [body, width]);
  return (
    <span style={{ fontSize: "14px", color, lineHeight: 1.5 }}>
      <span ref={ref} style={clamp(3)} data-ad-preview-body="">{body}</span>
      {more && <span data-ad-preview-more="" style={{ color: strong, fontWeight: 700 }}>קרא עוד</span>}
    </span>
  );
}
function Img({ src, alt, focal, style }: { src: string; alt: string; focal?: [number, number] | null; style?: React.CSSProperties }) {
  const [x, y] = focal ?? [0.5, 0.5];
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} data-focal={objectPosition(x, y)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: objectPosition(x, y), ...style }} />;
}
function StatusBar({ color }: { color: string }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", top: 0, right: 0, left: 0, height: `${SAFE}px`, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12.5px", fontWeight: 700, color, zIndex: 8 }}>
      <span>9:41</span>
      <span style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
        <span style={{ width: "16px", height: "8px", borderRadius: "2px", border: `1.5px solid ${color}`, boxSizing: "border-box" }} />
        <span style={{ width: "12px", height: "8px", borderRadius: "2px", background: color, opacity: 0.8 }} />
      </span>
    </div>
  );
}
const bar = (w: number | string, c: string, h = 8): React.CSSProperties => ({ width: typeof w === "number" ? `${w}px` : w, height: `${h}px`, borderRadius: "99px", background: c });
function ListItem({ n, app }: { n: number; app: App }) {
  return (
    <div data-ad-preview-list-item={n} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px", borderRadius: "14px", background: app.card, border: `1px solid ${app.line}` }}>
      <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: app.line, flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "7px" }}>
        <div style={bar(n % 2 ? "70%" : "55%", app.strong)} />
        <div style={bar(n % 2 ? "45%" : "60%", app.line)} />
      </div>
    </div>
  );
}
function BottomNav({ app }: { app: App }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", bottom: 0, right: 0, left: 0, height: "70px", background: app.card, borderTop: `1px solid ${app.line}`, display: "flex", justifyContent: "space-around", alignItems: "flex-start", paddingTop: "10px", zIndex: 3 }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
          <div style={{ width: "22px", height: "22px", borderRadius: "7px", background: i === 0 ? "#3B82F6" : app.line }} />
          <div style={bar(28, i === 0 ? "#93C5FD" : app.line, 6)} />
        </div>
      ))}
    </div>
  );
}
function AppHeader({ title, app }: { title: string; app: App }) {
  return (
    <div aria-hidden="true" style={{ padding: `${SAFE + 8}px 16px 10px`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        <span style={{ fontSize: "19px", fontWeight: 800, color: app.text }}>{title}</span>
        <span style={bar(90, app.line)} />
      </div>
      <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: app.card, border: `1px solid ${app.line}` }} />
    </div>
  );
}
/** מסך הבית המדומה (מאחורי החלון ומתחת לפס). */
function MockHome({ app, children }: { app: App; children?: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: app.bg }}>
      <AppHeader title="שלום, טל" app={app} />
      {children}
      <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ height: "92px", borderRadius: "16px", background: app.card, border: `1px solid ${app.line}`, padding: "14px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={bar("40%", app.strong)} /><div style={bar("75%", app.line)} /><div style={bar("55%", app.line)} />
        </div>
        {[1, 2, 3, 4].map((n) => <ListItem key={n} n={n} app={app} />)}
      </div>
      <BottomNav app={app} />
    </div>
  );
}

export default function AdPreview(p: AdPreviewProps) {
  const { format, advertiser, headline, body, ctaLabel, scale = 0.62 } = p;
  const IW = p.width ?? 360;
  const W = IW + 2 * BORDER, H = IH + 2 * BORDER;
  const theme = THEMES[p.theme ?? "light"];
  const app = APPS[p.appTheme ?? "light"];
  const safe = (u: string | null | undefined) => (u && /^https:\/\//.test(u) && isOurAdImage(u, p.imageBase ?? null) !== false ? u : null);
  const logo = safe(p.advertiserLogo ?? null);
  const frames = (p.frames ?? []).map((f) => ({ ...f, imageUrl: safe(f.imageUrl) }));
  const multi = FORMAT_INFO[format].frames;
  const cur = multi && frames.length ? Math.min(Math.max(0, p.frame ?? 0), frames.length - 1) : 0;
  const curFrame = multi ? frames[cur] ?? null : null;
  const image = multi ? curFrame?.imageUrl ?? null : safe(p.imageUrl);
  const alt = multi ? curFrame?.imageAlt ?? "" : p.imageAlt;
  const focal: [number, number] = (multi ? curFrame?.focal : p.focal) ?? [0.5, 0.5];
  const title = headline || "הכותרת של המודעה";
  const cta = ctaLabel || "לפרטים";
  const accent = isHexColor(p.accent) ? p.accent : BLOC_ACCENT;
  const ctaStyle: React.CSSProperties = { background: accent, color: ctaTextColor(accent) };
  const overlay = format === "card" || format === "fullscreen" || format === "story";

  let screen: React.ReactNode;
  if (format === "card") {
    const frameW = Math.min(IW - 32, Math.floor((IH - 280) * 0.8));
    screen = (
      <>
        {image && <Img src={image} alt="" focal={focal} style={{ transform: "scale(1.1)", filter: "blur(24px)", opacity: 0.5 }} />}
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.45), rgba(0,0,0,.3) 45%, rgba(0,0,0,.8))" }} />
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: `${SAFE + 64}px 16px 20px`, boxSizing: "border-box" }}>
          <div style={{ width: `${frameW}px`, display: "flex", flexDirection: "column" }} data-ad-preview-card="">
            <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 5", borderRadius: "22px", overflow: "hidden", background: "rgba(255,255,255,.1)" }} data-ad-preview-frame="">
              {image ? <Img src={image} alt={alt} focal={focal} /> : <Placeholder f="card" dark radius={22} />}
            </div>
            <div style={{ marginTop: "16px", fontSize: "20px", fontWeight: 900, lineHeight: 1.25, color: "#fff", ...clamp(2) }}>{title}</div>
            {body && <div style={{ marginTop: "6px", fontSize: "15px", lineHeight: 1.4, color: "rgba(255,255,255,.85)", ...clamp(2) }}>{body}</div>}
            <div data-ad-preview-cta="" style={{ marginTop: "16px", minHeight: "52px", borderRadius: "16px", ...ctaStyle, fontSize: "16px", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{cta}</div>
            <div style={{ marginTop: "12px", textAlign: "center" }}><Sponsored advertiser={advertiser} color="rgba(255,255,255,.7)" strong="rgba(255,255,255,.9)" /></div>
          </div>
        </div>
        <CloseDisc top={SAFE + 12} left={12} />
      </>
    );
  } else if (format === "dialog") {
    screen = (
      <>
        <MockHome app={app} />
        {/* המסך הנוכחי נשאר גלוי מאחור — מסך כהה, בלי טשטוש; הקשה עליו סוגרת */}
        <div aria-hidden data-ad-preview-scrim="" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 5 }} />
        <div data-ad-preview-dialog="" style={{ position: "absolute", top: "50%", right: "16px", left: "16px", transform: "translateY(-46%)", zIndex: 6, borderRadius: "20px", overflow: "hidden", background: theme.bg, border: `1px solid ${theme.border}` }}>
          <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: theme.border }}>
            {image ? <Img src={image} alt={alt} focal={focal} /> : <Placeholder f="dialog" dark={p.theme === "dark"} />}
            <span data-ad-preview-tag="" style={{ position: "absolute", top: "10px", left: "10px", padding: "3px 9px", borderRadius: "99px", background: "rgba(11,18,32,.82)", color: "#fff", fontSize: "11.5px", fontWeight: 700 }}>ממומן</span>
          </div>
          <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <Sponsored advertiser={advertiser} color={theme.muted} strong={theme.text} logo={logo} />
            <span style={{ fontSize: "17px", fontWeight: 800, color: theme.text, lineHeight: 1.3, ...clamp(2) }}>{title}</span>
            {body && <DialogBody body={body} color={theme.muted} strong={theme.text} width={IW} />}
            <div data-ad-preview-cta="" style={{ marginTop: "8px", minHeight: "48px", borderRadius: "14px", ...ctaStyle, fontSize: "15.5px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{cta}</div>
          </div>
        </div>
        <CloseDisc top={SAFE + 12} left={12} />
      </>
    );
  } else if (format === "fullscreen" || format === "story") {
    const n = frames.length;
    screen = (
      <>
        {image ? <Img src={image} alt={alt} focal={focal} /> : <div style={{ position: "absolute", top: `${SAFE + 70}px`, right: "16px", left: "16px", bottom: "190px" }}><Placeholder f={format} dark radius={18} /></div>}
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,.5), rgba(0,0,0,0) 22%, rgba(0,0,0,0) 48%, rgba(0,0,0,.6) 70%, rgba(0,0,0,.9))" }} />
        {format === "story" && (
          <div data-ad-preview-bars={n} style={{ position: "absolute", top: `${SAFE + 6}px`, right: "12px", left: "12px", display: "flex", gap: "4px", zIndex: 4 }}>
            {(n ? frames : [null]).map((_, i) => (
              <div key={i} data-ad-preview-bar={i < cur ? "done" : i === cur ? "now" : "next"} style={{ flex: 1, height: "3px", borderRadius: "2px", background: "rgba(255,255,255,.35)", overflow: "hidden" }}>
                <div style={{ width: i < cur ? "100%" : i === cur ? "45%" : "0%", height: "100%", background: "#fff" }} />
              </div>
            ))}
          </div>
        )}
        <div style={{ position: "absolute", top: `${SAFE + (format === "story" ? 18 : 20)}px`, right: "12px", maxWidth: "220px", zIndex: 4 }}>
          <Sponsored advertiser={advertiser} color="rgba(255,255,255,.8)" strong="#fff" pill />
        </div>
        <div style={{ position: "absolute", right: "16px", left: "16px", bottom: "24px", display: "flex", flexDirection: "column", gap: "8px", zIndex: 4 }}>
          {format === "story" && curFrame?.caption && <div data-ad-preview-caption="" style={{ fontSize: "15px", fontWeight: 600, color: "rgba(255,255,255,.92)", lineHeight: 1.4, ...clamp(2) }}>{curFrame.caption}</div>}
          <div style={{ fontSize: format === "fullscreen" ? "24px" : "20px", fontWeight: 900, lineHeight: 1.25, color: "#fff", ...clamp(2) }}>{title}</div>
          {format === "fullscreen" && body && <div style={{ fontSize: "15px", lineHeight: 1.4, color: "rgba(255,255,255,.85)", ...clamp(2) }}>{body}</div>}
          <div data-ad-preview-cta="" style={{ marginTop: "6px", minHeight: "52px", borderRadius: "16px", ...ctaStyle, fontSize: "16px", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{cta}</div>
        </div>
        <CloseDisc top={SAFE + 12} left={12} />
      </>
    );
  } else if (format === "banner") {
    const pos: BannerPosition = p.bannerPosition === "top" ? "top" : "bottom";
    const strip = (
      <div data-ad-preview-banner={pos} role="complementary" aria-label="פרסומת ממומנת" style={{
        display: "flex", alignItems: "center", gap: "10px", minHeight: "64px", padding: "8px 2px 8px 8px", boxSizing: "border-box",
        borderRadius: "16px", background: theme.bg, border: `1px solid ${theme.border}`,
      }}>
        <div style={{ position: "relative", width: "48px", height: "48px", borderRadius: "12px", overflow: "hidden", flexShrink: 0, background: theme.border }}>
          {image ? <Img src={image} alt={alt} focal={focal} /> : <Placeholder f="banner" dark={p.theme === "dark"} radius={12} small />}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "14.5px", fontWeight: 700, color: theme.text, ...oneLine }}>{title}</span>
          <Sponsored advertiser={advertiser} color={theme.muted} strong={theme.text} logo={logo} />
        </div>
        <span data-ad-preview-cta="" style={{ height: "32px", padding: "0 12px", borderRadius: "99px", ...ctaStyle, fontSize: "13px", fontWeight: 700, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", flexShrink: 0, maxWidth: "96px", overflow: "hidden" }}>{cta}</span>
        <span data-ad-preview-close="banner" title="סגירת הפרסומת" style={{ width: "44px", height: "44px", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <XIcon size={18} color={theme.muted} />
        </span>
      </div>
    );
    screen = (
      <MockHome app={app}>
        {pos === "top" && <div style={{ padding: "0 12px 10px" }}>{strip}</div>}
        {pos === "bottom" && <div style={{ position: "absolute", right: "12px", left: "12px", bottom: "78px", zIndex: 4 }}>{strip}</div>}
      </MockHome>
    );
  } else {
    const n = frames.length;
    const cardW = Math.round((IW - 24) * 0.6);
    const ad = format === "native" ? (
      <div data-ad-preview-native="" style={{ borderRadius: "16px", overflow: "hidden", background: theme.bg, border: `1px solid ${theme.border}` }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "1.91 / 1", background: theme.border }}>
          {image ? <Img src={image} alt={alt} focal={focal} /> : <Placeholder f="native" dark={p.theme === "dark"} />}
          <span data-ad-preview-tag="" style={{ position: "absolute", top: "8px", right: "8px", padding: "3px 9px", borderRadius: "99px", background: "rgba(11,18,32,.82)", color: "#fff", fontSize: "11.5px", fontWeight: 700, zIndex: 4 }}>ממומן</span>
          <CloseDisc top={4} left={4} size={34} icon={16} />
        </div>
        <div style={{ padding: "11px 12px 12px", display: "flex", flexDirection: "column", gap: "5px" }}>
          <span style={{ fontSize: "15px", fontWeight: 800, color: theme.text, lineHeight: 1.3, ...clamp(2) }}>{title}</span>
          {body && <span style={{ fontSize: "13px", color: theme.muted, lineHeight: 1.45, ...clamp(2) }}>{body}</span>}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "4px" }}>
            <Sponsored advertiser={advertiser} color={theme.muted} strong={theme.text} logo={logo} />
            <span data-ad-preview-cta="" style={{ height: "32px", padding: "0 12px", borderRadius: "99px", ...ctaStyle, fontSize: "13px", fontWeight: 700, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", flexShrink: 0 }}>{cta}</span>
          </div>
        </div>
      </div>
    ) : (
      <div data-ad-preview-carousel={n} style={{ borderRadius: "16px", background: theme.bg, border: `1px solid ${theme.border}`, padding: "10px 0 12px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 2px 0 12px" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
            <span style={{ fontSize: "14.5px", fontWeight: 800, color: theme.text, ...oneLine }}>{title}</span>
            <Sponsored advertiser={advertiser} color={theme.muted} strong={theme.text} />
          </div>
          <span data-ad-preview-close="inline" title="סגירת הפרסומת" style={{ width: "44px", height: "44px", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <XIcon size={18} color={theme.muted} />
          </span>
        </div>
        <div style={{ overflow: "hidden", marginTop: "8px" }}>
          <div data-ad-preview-strip={cur} style={{ display: "flex", gap: "8px", padding: "0 12px", transform: `translateX(${cur * (cardW + 8)}px)` }}>
            {(n ? frames : [null, null]).map((f, i) => (
              <div key={i} data-ad-preview-slide={i} style={{ width: `${cardW}px`, flexShrink: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: "12px", overflow: "hidden", background: theme.border }}>
                  {f?.imageUrl ? <Img src={f.imageUrl} alt={f.imageAlt} focal={f.focal} /> : <Placeholder f="carousel" dark={p.theme === "dark"} radius={12} />}
                </div>
                {f?.caption && <span style={{ fontSize: "13px", color: theme.text, lineHeight: 1.4, ...clamp(2) }}>{f.caption}</span>}
              </div>
            ))}
          </div>
        </div>
        <div data-ad-preview-dots="" style={{ display: "flex", justifyContent: "center", gap: "5px", marginTop: "10px" }}>
          {(n ? frames : [null, null]).map((_, i) => (
            <span key={i} style={{ width: i === cur ? "16px" : "6px", height: "6px", borderRadius: "99px", background: i === cur ? accent : theme.border }} />
          ))}
        </div>
        <div data-ad-preview-cta="" style={{ margin: "10px 12px 0", minHeight: "44px", borderRadius: "12px", ...ctaStyle, fontSize: "15px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{cta}</div>
      </div>
    );
    screen = (
      <div style={{ position: "absolute", inset: 0, background: app.bg }}>
        <AppHeader title="הלוח הקהילתי" app={app} />
        <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {/* the carousel is taller — the list is shown scrolled by one item, so its button is not under the navigation */}
          {(format === "carousel" ? [2, 3] : [1, 2, 3]).map((k) => <ListItem key={k} n={k} app={app} />)}
          {ad}
          <ListItem n={4} app={app} />
        </div>
        <BottomNav app={app} />
      </div>
    );
  }

  const switcher = multi && p.onFrame && frames.length > 1;
  const linkHost = format === "carousel" && curFrame?.ctaUrl ? hostOf(curFrame.ctaUrl) : null;
  return (
    <div data-ad-format-preview={format} data-preview-width={IW} data-preview-app={p.appTheme ?? "light"} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", flexShrink: 0 }}>
      <div aria-label={`תצוגה מקדימה של המודעה: ${FORMAT_INFO[format].label}`} role="img" data-ad-preview=""
        style={{ width: `${W * scale}px`, height: `${H * scale}px`, flexShrink: 0 }}>
        <div dir="rtl" style={{
          width: `${W}px`, height: `${H}px`, transform: `scale(${scale})`, transformOrigin: "top right", boxSizing: "border-box",
          borderRadius: "44px", border: `${BORDER}px solid #1f2937`, background: overlay ? "#0B1220" : app.bg, overflow: "hidden", position: "relative",
          fontFamily: FONT, textAlign: "right",
        }}>
          {screen}
          <StatusBar color={overlay || format === "dialog" || p.appTheme === "dark" ? "#FFFFFF" : APPS.light.text} />
        </div>
      </div>
      {switcher && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
          <div role="group" aria-label="מעבר בין התמונות בתצוגה" data-ad-preview-switcher="" style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" }}>
            {frames.map((_, i) => (
              <button key={i} type="button" aria-pressed={i === cur} aria-label={`${format === "carousel" ? "כרטיס" : "תמונה"} ${i + 1}`} data-ad-preview-frame-btn={i}
                onClick={() => p.onFrame?.(i)}
                style={{ width: "44px", height: "44px", borderRadius: "12px", border: `1px solid ${i === cur ? "var(--blue)" : "var(--border)"}`, background: i === cur ? "rgba(59,130,246,.14)" : "transparent", color: i === cur ? "var(--text)" : "var(--text-2)", fontSize: "15px", fontWeight: 700, fontFamily: "var(--mono)" }}>
                {i + 1}
              </button>
            ))}
          </div>
          <span style={{ fontSize: "12.5px", color: "var(--text-2)" }} data-ad-preview-which="">
            {format === "carousel" ? "כרטיס" : "תמונה"} {cur + 1} מתוך {frames.length}
            {linkHost ? <> · קישור משלו: <bdi>{linkHost}</bdi></> : null}
          </span>
        </div>
      )}
    </div>
  );
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
