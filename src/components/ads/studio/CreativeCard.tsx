"use client";
// studio/CreativeCard — מודעה שמורה ברשימה (bloc ADS-2א v2): תמונה קטנה בחיתוך של הפורמט (נקודת המיקוד), הפורמט, הכותרת,
// כמה תמונות / סגנון, הכפתור והאתר, כמה פעמים הוצגה; מתג פעילה / מושבתת; עריכה — רק כשעוד לא הוצגה; הוצגה — "נעולה — שכפלו
// כדי לשנות" ושכפול כמודעה חדשה. תמונה מאתר אחר לא נטענת (ומסומנת: "לא מוצגת"). תצוגה בלבד.
// ADS-2ב1 (החלטה 388): הקוד ("קוד: SAVE20") וסוף המבצע; מבצע שהסתיים — "המבצע הסתיים — לא מוצגת". במודעה שהוצגה הקוד וסוף המבצע
// עדיין משתנים (ad_creative_guard מתיר אותם) — "קופון וסוף מבצע" / "הארכת המבצע" (onOffer).
import { Pencil, Copy, Trash2, Gift } from "lucide-react";
import { ghostBtn, Tag } from "@/components/ui/panelKit";
import { fmtInt } from "@/lib/ads";
import { CREATIVE_LOCKED_TEXT, FORMAT_INFO, allImagesOurs, creativeMetaText, formatText, objectPosition } from "@/lib/adsFormats";
import { isOurAdImage } from "@/lib/adsUi";
import type { AdCreativeRow } from "@/lib/adsServer";
import { COUPON_PREFIX, OFFER_ENDED_TEXT, offerEnded, offerLine } from "@/lib/adsOffer";
import { ilTodayKey } from "@/lib/broadcasts";
import { ctaKindOf, ctaShort } from "@/lib/adsCta";
import { FormatGlyph } from "./kit";

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export default function CreativeCard({ c, served, imageBase, canManage, busy, onToggle, onEdit, onDuplicate, onDelete, best = false, today, onOffer }: {
  c: AdCreativeRow; served: number; imageBase: string | null; canManage: boolean; busy: boolean;
  onToggle: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; best?: boolean;
  /** ADS-2ב1: היום לפי שעון ישראל (ברירת מחדל — עכשיו); onOffer — שינוי הקוד / סוף המבצע במודעה שהוצגה. */
  today?: string; onOffer?: () => void;
}) {
  const info = FORMAT_INFO[c.format];
  const ours = allImagesOurs(c.image_url, c.frames, imageBase);
  const coverOk = !!c.image_url && /^https:\/\//.test(c.image_url) && isOurAdImage(c.image_url, imageBase) !== false;
  const h = 64;
  const w = Math.max(40, Math.min(110, Math.round((h * info.image.w) / info.image.h)));
  const meta = creativeMetaText(c.format, c.frames, c.theme);
  const locked = served > 0;
  const day = today ?? ilTodayKey();
  const ended = offerEnded(c.offer_ends_on, day);
  const line = offerLine(c.offer_ends_on, day);
  return (
    <div data-creative-card={c.id} data-creative-active={c.active ? "on" : "off"} className="card"
      style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", opacity: c.active ? 1 : 0.75 }}>
      {/* the picture and the words on top; the actions under both — the whole width (one row on a phone) */}
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
        <div style={{ position: "relative", width: `${w}px`, height: `${h}px`, borderRadius: "10px", overflow: "hidden", flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border)" }}>
          {coverOk
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={c.image_url} alt={c.image_alt} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: objectPosition(c.focal_x, c.focal_y) }} data-creative-thumb="ours" />
            : <span data-creative-thumb="foreign" style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: "10.5px", color: "var(--text-3)", lineHeight: 1.3 }}>מאתר<br />אחר</span>}
          {c.frames && c.frames.length > 1 && (
            <span className="studio-num" data-creative-frames={c.frames.length} style={{ position: "absolute", bottom: "3px", left: "3px", minWidth: "18px", height: "18px", padding: "0 5px", borderRadius: "99px", background: "rgba(11,18,32,.85)", color: "#fff", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)" }}>{c.frames.length}</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <span data-creative-format={c.format} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 8px 2px 6px", borderRadius: "99px", background: "#3b82f614", color: "#93c5fd", fontSize: "12px", fontWeight: 600 }}>
              <FormatGlyph format={c.format} size={13} />{formatText(c.format, c.banner_position)}
            </span>
            {best && <span data-creative-best=""><Tag tone="ok">הכי טובה</Tag></span>}
            {!c.active && <Tag tone="muted">מושבתת</Tag>}
            {!ours && <span data-creative-foreign={c.id}><Tag tone="danger">תמונה מאתר אחר — לא מוצגת</Tag></span>}
            {ended && <span data-creative-offer-ended={c.id}><Tag tone="danger">{OFFER_ENDED_TEXT} — לא מוצגת</Tag></span>}
          </div>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", lineHeight: 1.35, overflowWrap: "anywhere" }}>{c.headline}</span>
          <span style={{ fontSize: "12.5px", color: "var(--text-2)", lineHeight: 1.45 }}>
            {meta ? <span data-creative-meta={c.id}>{meta} · </span> : null}{c.cta_label} · <bdi data-creative-cta-kind={ctaKindOf(c.cta_url)} style={{ display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>{ctaKindOf(c.cta_url) === "link" ? hostOf(c.cta_url) : ctaShort(c.cta_url)}</bdi>
            {locked ? <span className="studio-num" data-creative-served={served}> · הוצגה {fmtInt(served)} פעמים</span> : null}
          </span>
          {(c.coupon_code || line) && (
            <span style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", fontSize: "12.5px", color: "var(--text-2)" }} data-creative-offer={c.id}>
              {c.coupon_code && (
                <span data-creative-coupon={c.coupon_code} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "1px 8px", borderRadius: "8px", border: "1.5px dashed var(--border-2)", color: "var(--text)" }}>
                  {COUPON_PREFIX} <bdi dir="ltr" style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{c.coupon_code}</bdi>
                </span>
              )}
              {line && <span data-creative-offer-line="">{line}</span>}
            </span>
          )}
          {locked && <span style={{ fontSize: "12.5px", color: "var(--yellow)" }} data-creative-locked-chip="">{CREATIVE_LOCKED_TEXT}{onOffer && canManage ? " · הקוד וסוף המבצע — עדיין משתנים" : ""}</span>}
        </div>
      </div>
      {canManage && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button type="button" role="switch" aria-checked={c.active} disabled={busy} onClick={onToggle} data-creative-toggle={c.id}
            style={{ ...ghostBtn, minHeight: "40px", gap: "8px" }}>
            <span aria-hidden="true" style={{ width: "34px", height: "20px", borderRadius: "99px", background: c.active ? "var(--green)" : "var(--border-2)", position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: "3px", right: c.active ? "17px" : "3px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff" }} />
            </span>
            {c.active ? "פעילה" : "מושבתת"}
          </button>
          {!locked && <button type="button" style={{ ...ghostBtn, minHeight: "40px" }} disabled={busy} onClick={onEdit} data-creative-edit={c.id}><Pencil size={14} />עריכה</button>}
          {locked && onOffer && (
            <button type="button" style={{ ...ghostBtn, minHeight: "40px" }} disabled={busy} onClick={onOffer} data-creative-offer-edit={c.id}><Gift size={14} />{ended ? "הארכת המבצע" : "קופון וסוף מבצע"}</button>
          )}
          <button type="button" style={{ ...ghostBtn, minHeight: "40px" }} disabled={busy} onClick={onDuplicate} data-creative-dup={c.id}><Copy size={14} />{locked ? "שכפול כדי לשנות" : "שכפול"}</button>
          {!locked && <button type="button" style={{ ...ghostBtn, minHeight: "40px", color: "var(--red)" }} disabled={busy} onClick={onDelete} data-creative-delete={c.id} aria-label="מחיקת המודעה"><Trash2 size={14} /></button>}
        </div>
      )}
    </div>
  );
}
