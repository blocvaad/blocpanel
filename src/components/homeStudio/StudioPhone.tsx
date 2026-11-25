"use client";
// homeStudio/StudioPhone — התצוגה החיה של כרטיס במסך הבית (bloc HOME-STUDIO-1, החלטה 684): טלפון ברוחב 390 / 320, דייר / ועד, עם
// המפה של מסך הבית — השורות הקיימות כפסים אפורים עם השם שלהן — והכרטיס במקום שנבחר, כמו שהוא ייראה ב-bloc: אותן שש צורות, אותם
// צבעים (הטוקנים של bloc), אותן מידות ואותם כללים (תמונה בלבד = הכרטיס הוא התמונה; כפתור רק עם קישור; X; "נשארו עוד N ימים").
// האייקונים בטלפון האמיתי — של bloc; כאן הקרובים להם. תצוגה בלבד: לחיצה לא פותחת קישור.
import { useEffect, useRef, useState } from "react";
import {
  Sparkles, Star, Crown, Gift, Lightbulb, Calendar, MessageCircle, Shield, Heart, Home, Wrench, Bell, Megaphone, Vote, Clock, Leaf,
  Flame, Smile, Zap, Users, X, ChevronRight, ChevronLeft, CheckCircle2,
} from "lucide-react";
import {
  ACCENT_INFO, HOME_MAP, countdownText, itemAlt, type PreviewCard, type StudioAccent, type StudioIcon, type StudioItem, type StudioSlot,
} from "@/lib/homeStudio";
import { isOurAdImage } from "@/lib/adsUi";
import { STUDIO_IMAGE_BASE } from "@/components/ads/studio/kit";

/** הטוקנים של bloc (globals.css שם). */
const T = { ink: "#0F172A", mute: "#64748B", line: "#E6EAF0", surface: "#FFFFFF", bg: "#F0F4F8", brand: "#1D4ED8", onBrand: "#FFFFFF", brandLine: "#BFDBFE", watchLine: "#FDE68A", watchInk: "#B45309" };
const SURFACE: React.CSSProperties = { background: T.surface, border: `1px solid ${T.line}`, borderRadius: "20px" };
type Lucide = typeof Sparkles;
export const STUDIO_ICON: Record<StudioIcon, Lucide> = {
  spark: Sparkles, star: Star, crown: Crown, gift: Gift, bulb: Lightbulb, calendar: Calendar, chat: MessageCircle, shield: Shield,
  heart: Heart, home: Home, wrench: Wrench, bell: Bell, megaphone: Megaphone, vote: Vote, clock: Clock, leaf: Leaf, flame: Flame,
  smile: Smile, bolt: Zap, users: Users,
};
const accentOf = (a: StudioAccent | null | undefined) => ACCENT_INFO[a && a in ACCENT_INFO ? a : "brand"];
const imageOnly = (i: StudioItem) => !!i.image_url && !i.title;
const clamp = (lines: number): React.CSSProperties => ({ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" });

export function IconTile({ item, size = 40 }: { item: Pick<StudioItem, "icon" | "accent">; size?: number }) {
  const a = accentOf(item.accent);
  const Icon = STUDIO_ICON[item.icon ?? "spark"] ?? Sparkles;
  return (
    <span aria-hidden="true" data-phone-icon={item.icon ?? "spark"}
      style={{ width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "12px", background: a.light, border: `1px solid ${a.line}`, color: a.ink }}>
      <Icon size={size >= 48 ? 28 : 22} />
    </span>
  );
}

function PImage({ item, cardTitle, ratio, rounded = 0 }: { item: StudioItem; cardTitle: string | null; ratio: string; rounded?: number }) {
  const a = accentOf(item.accent);
  const ok = !!item.image_url && isOurAdImage(item.image_url, STUDIO_IMAGE_BASE) !== false;
  const [failed, setFailed] = useState(false);
  const alt = itemAlt(item, cardTitle);
  return (
    <span data-phone-image="" style={{ display: "block", position: "relative", overflow: "hidden", aspectRatio: ratio, borderRadius: rounded, background: a.light }}>
      {ok && !failed
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={item.image_url as string} alt={alt} draggable={false} onError={() => setFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px", textAlign: "center", fontSize: "14px", color: T.ink }}>{alt}</span>}
    </span>
  );
}

function Tag({ tone, children }: { tone: "brand" | "watch"; children: React.ReactNode }) {
  const c = tone === "brand" ? { line: T.brandLine, ink: T.brand } : { line: T.watchLine, ink: T.watchInk };
  return <span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", borderRadius: "99px", border: `1px solid ${c.line}`, background: "#fff", padding: "1px 10px", fontSize: "13px", fontWeight: 900, lineHeight: "20px", color: c.ink }}>{children}</span>;
}
function Cta({ text, solid = false }: { text: string; solid?: boolean }) {
  return (
    <span data-phone-cta="" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "40px", padding: "0 16px", borderRadius: "12px", fontSize: "15px", fontWeight: 900,
      ...(solid ? { background: T.surface, color: T.brand } : { background: T.brand, color: T.onBrand }) }}>{text}</span>
  );
}
function CloseX({ dismiss, onBrand = false }: { dismiss: PreviewCard["dismiss"]; onBrand?: boolean }) {
  const label = dismiss === "daily" ? "סגירה עד מחר" : "סגירה";
  return (
    <span role="img" aria-label={label} title={label} data-phone-close={dismiss}
      style={{ width: "44px", height: "44px", margin: "-8px -8px -8px 0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "99px", color: onBrand ? T.onBrand : T.mute }}>
      <X size={18} strokeWidth={2} />
    </span>
  );
}
function Tags({ card, now }: { card: PreviewCard; now: Date }) {
  const left = countdownText(card.countdown_to, now);
  if (!card.test && !left) return null;
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: "6px" }} data-phone-tags="">
      {card.test && <Tag tone="watch">בבדיקה · רק אצלך</Tag>}
      {left && <span data-phone-countdown=""><Tag tone="brand">{left}</Tag></span>}
    </span>
  );
}
function Head({ card, now }: { card: PreviewCard; now: Date }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "0 4px" }} data-phone-head="">
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
        {card.title && <h3 style={{ fontSize: "20px", fontWeight: 900, lineHeight: 1.25, color: T.ink, margin: 0 }}>{card.title}</h3>}
        {card.subtitle && <p style={{ fontSize: "14.5px", lineHeight: 1.4, color: T.mute, margin: 0 }}>{card.subtitle}</p>}
        <Tags card={card} now={now} />
      </div>
      <CloseX dismiss={card.dismiss} />
    </div>
  );
}

function Banner({ card, now }: { card: PreviewCard; now: Date }) {
  const item = card.items[0];
  const head = !!(card.title || card.subtitle);
  if (imageOnly(item)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {head && <Head card={card} now={now} />}
        <div style={{ position: "relative" }}>
          <PImage item={item} cardTitle={card.title} ratio="2 / 1" rounded={20} />
          {!head && <span style={{ position: "absolute", top: "8px", left: "8px", borderRadius: "99px", background: "rgba(255,255,255,.92)" }}><CloseX dismiss={card.dismiss} /></span>}
          {!head && <span style={{ position: "absolute", bottom: "8px", right: "8px" }}><Tags card={card} now={now} /></span>}
        </div>
      </div>
    );
  }
  const solid = card.style === "solid";
  const a = accentOf(item.accent);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {head && <Head card={card} now={now} />}
      <div style={{ position: "relative" }}>
        <div style={{ overflow: "hidden", ...(solid ? { background: T.brand, borderRadius: "24px", color: T.onBrand } : { background: a.light, border: `1px solid ${a.line}`, borderRadius: "20px" }) }}>
          {item.image_url && <PImage item={item} cardTitle={card.title} ratio="16 / 7" />}
          <span style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: head ? "16px" : "16px 16px 16px 48px" }}>
            {!item.image_url && item.icon && <IconTile item={solid ? { icon: item.icon, accent: "brand" } : item} size={44} />}
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
              {item.badge && (solid
                ? <span style={{ alignSelf: "flex-start", padding: "2px 8px", borderRadius: "99px", fontSize: "13px", fontWeight: 900, background: T.surface, color: T.brand }}>{item.badge}</span>
                : <span style={{ alignSelf: "flex-start" }}><Tag tone="brand">{item.badge}</Tag></span>)}
              {item.title && <span style={{ fontSize: "18px", fontWeight: 900, lineHeight: 1.35, color: solid ? T.onBrand : T.ink }}>{item.title}</span>}
              {item.body && <span style={{ fontSize: "15px", lineHeight: 1.6, whiteSpace: "pre-line", color: solid ? T.onBrand : T.ink }}>{item.body}</span>}
              {item.cta && <span style={{ paddingTop: "4px" }}><Cta text={item.cta} solid={solid} /></span>}
              {!head && <Tags card={card} now={now} />}
            </span>
          </span>
        </div>
        {!head && <span style={{ position: "absolute", top: "8px", left: "4px" }}><CloseX dismiss={card.dismiss} onBrand={solid} /></span>}
      </div>
    </div>
  );
}

function Tiles({ card, now }: { card: PreviewCard; now: Date }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Head card={card} now={now} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {card.items.map((item) => (
          <div key={item.id} style={{ ...SURFACE, overflow: "hidden", aspectRatio: "1 / 1", display: "flex", flexDirection: "column" }} data-phone-item={item.id}>
            {imageOnly(item) ? <PImage item={item} cardTitle={card.title} ratio="1 / 1" /> : (
              <>
                {/* like bloc (review #12): with an image — a 2:1 image with the badge on it, one line of title and the button, no body */}
                {item.image_url
                  ? <span style={{ position: "relative", display: "block" }}><PImage item={item} cardTitle={card.title} ratio="2 / 1" />{item.badge && <span style={{ position: "absolute", top: "8px", right: "8px" }}><Tag tone="brand">{item.badge}</Tag></span>}</span>
                  : <span style={{ padding: "12px 12px 0" }}><IconTile item={item} /></span>}
                <span style={{ flex: 1, minHeight: 0, padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {item.badge && !item.image_url && <span style={{ alignSelf: "flex-start" }}><Tag tone="brand">{item.badge}</Tag></span>}
                  <span style={{ fontSize: "16px", fontWeight: 900, lineHeight: 1.35, color: T.ink, ...clamp(item.image_url ? 1 : 2) }}>{item.title}</span>
                  {item.body && !item.image_url && <span style={{ fontSize: "13.5px", lineHeight: 1.35, color: T.ink, ...clamp(2) }}>{item.body}</span>}
                  {item.cta && <span style={{ marginTop: "auto", fontSize: "14px", fontWeight: 900, color: T.brand }}>{item.cta}</span>}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Carousel({ card, now }: { card: PreviewCard; now: Date }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Head card={card} now={now} />
      <div style={{ display: "flex", gap: "12px", overflowX: "auto", margin: "0 -16px", padding: "0 16px 4px", scrollbarWidth: "none" }} data-phone-scroll="">
        {card.items.map((item) => (
          <div key={item.id} style={{ ...SURFACE, overflow: "hidden", width: "168px", flexShrink: 0, display: "flex", flexDirection: "column" }} data-phone-item={item.id}>
            {imageOnly(item) ? <PImage item={item} cardTitle={card.title} ratio="4 / 5" /> : (
              <>
                {item.image_url ? <PImage item={item} cardTitle={card.title} ratio="4 / 3" /> : <span style={{ padding: "12px 12px 0" }}><IconTile item={item} /></span>}
                <span style={{ padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {item.badge && <span style={{ alignSelf: "flex-start" }}><Tag tone="brand">{item.badge}</Tag></span>}
                  <span style={{ fontSize: "15px", fontWeight: 900, lineHeight: 1.35, color: T.ink, ...clamp(2) }}>{item.title}</span>
                  {item.body && <span style={{ fontSize: "13.5px", lineHeight: 1.35, color: T.ink, ...clamp(3) }}>{item.body}</span>}
                  {item.cta && <span style={{ fontSize: "14px", fontWeight: 900, color: T.brand, paddingTop: "2px" }}>{item.cta}</span>}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function List({ card, now }: { card: PreviewCard; now: Date }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Head card={card} now={now} />
      <div style={{ ...SURFACE, overflow: "hidden" }}>
        {card.items.map((item, i) => (
          <div key={item.id} style={i ? { borderTop: `1px solid ${T.line}` } : undefined} data-phone-item={item.id}>
            {imageOnly(item) ? <div style={{ padding: "12px" }}><PImage item={item} cardTitle={card.title} ratio="3 / 1" rounded={12} /></div> : (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", minHeight: "60px" }}>
                {item.image_url ? <span style={{ width: "48px", flexShrink: 0 }}><PImage item={item} cardTitle={card.title} ratio="1 / 1" rounded={12} /></span> : <IconTile item={item} />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "15.5px", fontWeight: 900, lineHeight: 1.35, color: T.ink }}>{item.title}</span>
                    {item.badge && <Tag tone="brand">{item.badge}</Tag>}
                  </span>
                  {item.body && <span style={{ display: "block", fontSize: "13.5px", lineHeight: 1.35, color: T.ink, ...clamp(2) }}>{item.body}</span>}
                </span>
                {item.cta && <span style={{ flexShrink: 0, fontSize: "14px", fontWeight: 900, color: T.brand }}>{item.cta}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Circles({ card, now }: { card: PreviewCard; now: Date }) {
  const [open, setOpen] = useState<number | null>(null);
  const item = open === null ? null : card.items[open] ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Head card={card} now={now} />
      <div style={{ display: "flex", gap: "12px", overflowX: "auto", margin: "0 -16px", padding: "0 16px 4px", scrollbarWidth: "none" }} data-phone-scroll="">
        {card.items.map((it, i) => {
          const a = accentOf(it.accent);
          return (
            <button key={it.id} type="button" onClick={() => setOpen(i)} data-phone-circle={it.id} aria-label={`${it.title || it.badge || itemAlt(it, card.title)}, פתיחה`}
              style={{ width: "72px", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: "none", border: "none", padding: 0, fontFamily: "inherit" }}>
              <span aria-hidden="true" style={{ width: "68px", height: "68px", borderRadius: "99px", padding: "3px", background: a.ink, display: "block" }}>
                <span style={{ width: "100%", height: "100%", borderRadius: "99px", padding: "3px", background: T.surface, display: "block" }}>
                  <span style={{ width: "100%", height: "100%", borderRadius: "99px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: a.light }}>
                    {it.image_url ? <span style={{ width: "100%" }}><PImage item={it} cardTitle={card.title} ratio="1 / 1" /></span> : <IconTile item={it} size={40} />}
                  </span>
                </span>
              </span>
              <span style={{ fontSize: "12.5px", fontWeight: 900, lineHeight: 1.2, textAlign: "center", color: T.ink, ...clamp(2) }}>{it.title || it.badge || ""}</span>
            </button>
          );
        })}
      </div>
      {item && open !== null && (
        <div data-phone-viewer={item.id} style={{ ...SURFACE, padding: "14px", display: "flex", flexDirection: "column", gap: "12px", boxShadow: "0 12px 30px rgba(15,23,42,.18)" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: "6px" }} aria-hidden="true">
            {card.items.map((it, i) => <span key={it.id} style={{ height: "6px", borderRadius: "99px", width: i === open ? 22 : 8, background: i === open ? T.brand : T.line }} />)}
          </div>
          {item.title && <p style={{ fontSize: "17px", fontWeight: 900, color: T.ink, textAlign: "center", margin: 0 }}>{item.title}</p>}
          {item.image_url ? <PImage item={item} cardTitle={card.title} ratio="4 / 5" rounded={20} /> : <span style={{ display: "flex", justifyContent: "center" }}><IconTile item={item} size={64} /></span>}
          {item.badge && <span style={{ alignSelf: "flex-start" }}><Tag tone="brand">{item.badge}</Tag></span>}
          {item.body && <span style={{ fontSize: "16px", lineHeight: 1.6, whiteSpace: "pre-line", color: T.ink }}>{item.body}</span>}
          {item.cta && <span><Cta text={item.cta} /></span>}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button type="button" disabled={open === 0} onClick={() => setOpen(open - 1)} style={whiteBtn(open === 0)}>הקודם</button>
            <span style={{ fontSize: "14px", color: T.ink, flexShrink: 0 }}>{open + 1} מתוך {card.items.length}</span>
            {open < card.items.length - 1
              ? <button type="button" onClick={() => setOpen(open + 1)} style={whiteBtn(false)}>הבא</button>
              : <button type="button" onClick={() => setOpen(null)} style={whiteBtn(false)}>סגירה</button>}
          </div>
        </div>
      )}
    </div>
  );
}
const whiteBtn = (dim: boolean): React.CSSProperties => ({ flex: 1, minHeight: "44px", borderRadius: "12px", border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: "15px", fontWeight: 900, fontFamily: "inherit", opacity: dim ? 0.4 : 1 });

function Deck({ card, now }: { card: PreviewCard; now: Date }) {
  const [i, setI] = useState(0);
  const items = card.items;
  const done = i >= items.length;
  const item = items[i];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }} data-phone-deck={done ? "done" : String(i)}>
      <Head card={card} now={now} />
      <div style={{ position: "relative", minHeight: "300px" }}>
        {!done && items.length - i > 2 && <div aria-hidden="true" style={{ ...SURFACE, position: "absolute", inset: 0, transform: "translate(-12px, 12px) rotate(-3.5deg) scale(.94)", opacity: 0.55 }} />}
        {!done && items.length - i > 1 && <div aria-hidden="true" style={{ ...SURFACE, position: "absolute", inset: 0, transform: "translate(-6px, 6px) rotate(-1.75deg) scale(.97)", opacity: 0.85 }} />}
        {done ? (
          <div data-phone-finish="" style={{ ...SURFACE, position: "relative", minHeight: "300px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", textAlign: "center", padding: "0 24px" }}>
            <CheckCircle2 size={52} color="#16A34A" />
            <p style={{ fontSize: "18px", fontWeight: 900, color: T.ink, margin: 0 }}>זהו, ראית הכל</p>
            <p style={{ fontSize: "15px", color: T.ink, margin: 0 }}>{card.source === "whats_new" ? "כשיהיה משהו חדש ב-bloc, הוא יופיע כאן." : "אפשר לסגור את הכרטיס."}</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => setI(0)} data-phone-again="" style={{ minHeight: "44px", padding: "0 16px", borderRadius: "12px", border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: "15px", fontWeight: 900, fontFamily: "inherit" }}>מההתחלה</button>
              <span style={{ minHeight: "44px", padding: "0 16px", borderRadius: "12px", background: T.brand, color: T.onBrand, fontSize: "15px", fontWeight: 900, display: "inline-flex", alignItems: "center" }}>סגירה</span>
            </div>
          </div>
        ) : item && (
          <div style={{ ...SURFACE, position: "relative", overflow: "hidden", minHeight: "300px" }} data-phone-top={item.id}>
            {imageOnly(item) ? <PImage item={item} cardTitle={card.title} ratio="4 / 5" /> : (
              <>
                {item.image_url ? <PImage item={item} cardTitle={card.title} ratio="16 / 9" />
                  : <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "120px", background: accentOf(item.accent).light }}><IconTile item={item} size={56} /></span>}
                <span style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 16px 16px" }}>
                  {item.badge && <span style={{ alignSelf: "flex-start" }}><Tag tone="brand">{item.badge}</Tag></span>}
                  <span style={{ fontSize: "19px", fontWeight: 900, lineHeight: 1.35, color: T.ink }}>{item.title}</span>
                  {item.body && <span style={{ fontSize: "15px", lineHeight: 1.6, whiteSpace: "pre-line", color: T.ink }}>{item.body}</span>}
                  {item.cta && <span style={{ paddingTop: "4px" }}><Cta text={item.cta} /></span>}
                </span>
              </>
            )}
          </div>
        )}
      </div>
      {!done && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
          <button type="button" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="הכרטיס הקודם" data-phone-prev=""
            style={{ width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "99px", border: "none", background: "none", color: T.ink, opacity: i === 0 ? 0.3 : 1 }}><ChevronRight size={20} /></button>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }} aria-hidden="true">
            {items.map((it, n) => <span key={it.id} style={{ height: "6px", borderRadius: "99px", width: n === i ? 18 : 7, background: n === i ? T.brand : T.line }} />)}
          </span>
          <button type="button" onClick={() => setI((x) => x + 1)} aria-label="הכרטיס הבא" data-phone-next=""
            style={{ width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "99px", border: "none", background: "none", color: T.ink }}><ChevronLeft size={20} /></button>
        </div>
      )}
    </div>
  );
}

/** הכרטיס עצמו, בצורה שלו (כמו StudioCard של bloc). */
export function PhoneCard({ card, now }: { card: PreviewCard; now: Date }) {
  if (card.items.length === 0) return null;
  const P = { card, now };
  return (
    <div data-phone-card={card.shape} data-phone-style={card.style}>
      {card.shape === "banner" ? <Banner {...P} /> : card.shape === "tile" ? <Tiles {...P} /> : card.shape === "carousel" ? <Carousel {...P} />
        : card.shape === "list" ? <List {...P} /> : card.shape === "circles" ? <Circles {...P} /> : <Deck {...P} />}
    </div>
  );
}

const WAVES = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='420' height='150' viewBox='0 0 420 150' preserveAspectRatio='none'%3E%3Cpath d='M0 12 H300 C230 30 160 34 100 60 S30 104 0 112Z' fill='%231D4ED8' fill-opacity='0.045'/%3E%3Cpath d='M0 150 V92 C80 62 140 104 220 70 S350 8 420 14 V150Z' fill='%23fff' fill-opacity='0.55'/%3E%3Cpath d='M0 150 V124 C100 98 170 132 260 102 S370 58 420 64 V150Z' fill='%23fff' fill-opacity='0.75'/%3E%3C/svg%3E\")";
function Row({ label }: { label: string }) {
  return (
    <div aria-hidden="true" data-phone-row={label}
      style={{ height: "40px", borderRadius: "14px", background: "rgba(15,23,42,.05)", border: `1px dashed ${T.line}`, display: "flex", alignItems: "center", padding: "0 14px", fontSize: "12.5px", color: T.mute, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
      {label}
    </div>
  );
}

/**
 * הטלפון: הכותרת של מסך הבית, השורות לפי הסדר, והכרטיס אחרי השורה שנבחרה (top — מיד אחרי הכותרת; end — בסוף). note — שורה מעל
 * הכרטיס כשהוא לא יוצג לתפקיד שנבחר (קהל / אין מה להציג).
 */
export function PhoneFrame({ width, slot, children, note }: { width: 320 | 390; slot: StudioSlot; children: React.ReactNode; note?: string | null }) {
  const box = useRef<HTMLDivElement | null>(null);
  const here = useRef<HTMLDivElement | null>(null);
  // the card in view when the place / the content changes (the phone scrolls inside itself, never the page)
  useEffect(() => {
    const b = box.current, h = here.current;
    if (b && h) { try { b.scrollTop = Math.max(0, h.offsetTop - 96); } catch { /* */ } }
  }, [slot, width]);
  const card = (
    <div ref={here} data-phone-slot={slot} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {note && <div data-phone-note="" style={{ fontSize: "12.5px", fontWeight: 700, color: T.watchInk, background: "#FFFBEB", border: `1px solid ${T.watchLine}`, borderRadius: "12px", padding: "6px 10px" }}>{note}</div>}
      <div style={{ opacity: note ? 0.45 : 1 }}>{children}</div>
    </div>
  );
  return (
    <div data-phone={width} style={{ width: width + 20, maxWidth: "100%", borderRadius: "40px", padding: "10px", background: "#0b0b0e", border: "1px solid #27272a", flexShrink: 0 }}>
      <div ref={box} dir="rtl" style={{ height: "640px", overflowY: "auto", borderRadius: "30px", background: T.bg, color: T.ink, fontFamily: "Heebo, Rubik, system-ui, sans-serif", position: "relative" }}>
        <div style={{ backgroundColor: T.bg, backgroundImage: WAVES, backgroundSize: "100% 100%", padding: "34px 16px 26px" }} aria-hidden="true">
          <div style={{ fontSize: "22px", fontWeight: 900 }}>ערב טוב, נועה</div>
          <span style={{ display: "inline-flex", marginTop: "8px", padding: "6px 12px", borderRadius: "12px", background: T.surface, border: `1px solid ${T.line}`, fontSize: "14px", fontWeight: 900 }}>הרצל 12, רמת גן</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "12px 16px 24px" }}>
          {slot === "top" && card}
          {HOME_MAP.slice(1).map((r) => (
            <div key={r.slot} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Row label={r.row} />
              {slot === r.slot && card}
            </div>
          ))}
          {slot === "end" && card}
          <Row label="שורת החירום (תמיד אחרונה)" />
        </div>
      </div>
    </div>
  );
}
