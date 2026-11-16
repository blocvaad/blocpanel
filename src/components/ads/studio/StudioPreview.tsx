"use client";
// studio/StudioPreview — התצוגה החיה של הסטודיו (bloc ADS-2א v2, החלטה 383): טלפון עם לשונית לכל פורמט שנבחר, רוחב 320 / 390
// (טלפון קטן / רגיל), והאפליקציה בהירה / כהה מאחור. כל שינוי בטופס — מיד בטלפון; בדיוק הרכיבים של bloc (AdPreview).
// previewFromForm / previewFromCreative — אותו מיפוי לטופס ולמודעה שמורה (גם בסקירה ובלשונית המודעות).
import { useState } from "react";
import { FORMAT_INFO, type AdFormat } from "@/lib/adsFormats";
import { imageFor, type CreativeForm } from "@/lib/adsStudio";
import type { AdCreativeRow } from "@/lib/adsServer";
import AdPreview, { type AdPreviewProps } from "./AdPreview";
import { Segmented, STUDIO_CSS } from "./kit";
import { FormatGlyph } from "./kit";

/** פורמטים שמראים משפט מתחת לכותרת (בשאר — רק כותרת). */
export const SHOWS_BODY: Record<AdFormat, boolean> = { card: true, dialog: true, fullscreen: true, story: false, banner: false, native: true, carousel: false };
type Base = Pick<AdPreviewProps, "advertiser" | "advertiserLogo" | "imageBase">;

export function previewFromForm(format: AdFormat, f: CreativeForm, base: Base): AdPreviewProps {
  const multi = FORMAT_INFO[format].frames;
  const img = imageFor(f, format);
  return {
    ...base, format, headline: f.headline, body: SHOWS_BODY[format] ? f.body.trim() || null : null, ctaLabel: f.cta_label,
    imageUrl: multi ? null : img.image_url || null, imageAlt: img.image_alt, focal: img.focal,
    bannerPosition: f.banner_position, theme: f.theme, accent: f.accent,
    frames: multi ? f.frames.map((x) => ({ imageUrl: x.image_url || null, imageAlt: x.image_alt, caption: x.caption.trim() || null, ctaUrl: format === "carousel" ? x.cta_url.trim() || null : null, focal: x.focal })) : null,
  };
}
export function previewFromCreative(c: AdCreativeRow, base: Base): AdPreviewProps {
  return {
    ...base, format: c.format, headline: c.headline, body: SHOWS_BODY[c.format] ? c.body : null, ctaLabel: c.cta_label,
    imageUrl: c.image_url || null, imageAlt: c.image_alt, focal: [c.focal_x, c.focal_y], bannerPosition: c.banner_position, theme: c.theme, accent: c.accent,
    frames: c.frames ? c.frames.map((x) => ({ imageUrl: x.image_url || null, imageAlt: x.image_alt, caption: x.caption, ctaUrl: c.format === "carousel" ? x.cta_url : null, focal: x.focal })) : null,
  };
}

export interface StudioPreviewViewProps {
  formats: AdFormat[]; active: AdFormat; onActive: (f: AdFormat) => void;
  width: 320 | 390; onWidth: (w: 320 | 390) => void; app: "light" | "dark"; onApp: (a: "light" | "dark") => void;
  frame: number; onFrame: (i: number) => void;
  props: (f: AdFormat) => AdPreviewProps;
}

export function StudioPreviewView({ formats, active, onActive, width, onWidth, app, onApp, frame, onFrame, props }: StudioPreviewViewProps) {
  const cur = formats.includes(active) ? active : formats[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", minWidth: 0, width: "100%" }} data-studio-preview={cur}>
      <style>{STUDIO_CSS}</style>
      {formats.length > 1 && (
        <div role="tablist" aria-label="תצוגה לפי פורמט" className="studio-scroll" style={{ maxWidth: "100%" }} data-preview-tabs="">
          {formats.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={f === cur} data-preview-tab={f} onClick={() => { if (f !== cur) onActive(f); }}
              style={{ minHeight: "40px", padding: "0 12px", borderRadius: "99px", whiteSpace: "nowrap", flexShrink: 0, fontSize: "13.5px", fontWeight: 600, fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: "6px",
                border: `1px solid ${f === cur ? "var(--blue)" : "var(--border)"}`, background: f === cur ? "rgba(59,130,246,.14)" : "transparent", color: f === cur ? "var(--text)" : "var(--text-2)" }}>
              <FormatGlyph format={f} size={14} />{FORMAT_INFO[f].label}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
        <Segmented label="רוחב המסך" testId="width" value={width} onChange={onWidth}
          options={[{ key: 320, label: "קטן · 320" }, { key: 390, label: "רגיל · 390" }]} />
        <Segmented label="האפליקציה" testId="app" value={app} onChange={onApp}
          options={[{ key: "light", label: "בהירה" }, { key: "dark", label: "כהה" }]} />
      </div>
      <AdPreview {...props(cur)} width={width} appTheme={app} frame={frame} onFrame={onFrame} scale={0.6} />
    </div>
  );
}

export default function StudioPreview({ formats, props }: { formats: AdFormat[]; props: (f: AdFormat) => AdPreviewProps }) {
  const [active, setActive] = useState<AdFormat>(formats[0]);
  const [width, setWidth] = useState<320 | 390>(390);
  const [app, setApp] = useState<"light" | "dark">("light");
  const [frame, setFrame] = useState(0);
  return (
    <StudioPreviewView formats={formats} active={active} onActive={(f) => { setActive(f); setFrame(0); }} width={width} onWidth={setWidth}
      app={app} onApp={setApp} frame={frame} onFrame={setFrame} props={props} />
  );
}
