// ADS-2א v2 (החלטה 383) — "סטודיו הפרסום", מרונדר לשרת (בפאנל אין happy-dom ואין testing-library). תצוגות בלי hooks נקראות
// ישירות, ולחיצה היא קריאה אמיתית ל-handler שלהן; מכלים עם hooks — רק renderToStaticMarkup.
//   • התצוגה של כל אחד משבעת הפורמטים (גם החלון הקופץ), ה-X האטום בלי ספירה, הכפתור בצבע עם הטקסט לפי ניגודיות, החיתוך לפי המיקוד.
//   • הגלריה, נקודת המיקוד, צבע הכפתור, פס התמונות, התצוגה החיה (רוחב / האפליקציה).
//   • מסך הבית בכל מצב (טוען / ריק / נכשל / חסר SQL / רשימה), כרטיס קמפיין ופעולות מהירות; שלב 1 של האשף; הסקירה; קהל; תזמון.
//   • דף הקמפיין: ביצועים (גרף, "הכי טובה", לפי פורמט), היסטוריה; מפרסמים; הגדרות (מתג עם אישור); החלקים הקטנים.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
import AdPreview, { isClamped, type AdPreviewProps } from "../studio/AdPreview";
import FormatGallery, { MiniPhone, toggleFormat, GALLERY_CSS } from "../studio/FormatGallery";
import { FocalPickerView, nudgeFocal, focalText } from "../studio/FocalPicker";
import AccentPicker, { swatches } from "../studio/AccentPicker";
import FramesStrip, { indexOfKey } from "../studio/FramesStrip";
import { StudioPreviewView, previewFromForm, previewFromCreative, SHOWS_BODY } from "../studio/StudioPreview";
import { StudioHomeView, CampaignCard, StudioHomeSkeleton, type StudioHomeViewProps } from "../studio/StudioHome";
import { AdvertiserStepView, ReviewStepView, usableContracts, pickContract, dayMonth, type AdvertiserStepProps, type ReviewStepProps } from "../studio/CampaignWizard";
import { AudienceEditorView, ReachGauge, cityMatches, buildingMatches, useReach, type AudienceEditorViewProps } from "../studio/AudienceEditor";
import { ScheduleEditorView, WEIGHT_TEXT } from "../studio/ScheduleEditor";
import { PerformanceTabView, HistoryTabView, DailyChart, historyFacts } from "../studio/CampaignStudio";
import { AdvertisersListView } from "../studio/AdvertisersStudio";
import { KillSwitchView, FIXED_RULES } from "../studio/StudioSettings";
import { ExplainResultView, explainBody } from "../studio/ExplainBox";
import { advertiserPayload, AdvertiserForm } from "../studio/AdvertiserForms";
import { StepBar, SaveIndicator, Segmented, ScrollTabs, PlacementIcons, Sparkline, StickyBar, STUDIO_CSS } from "../studio/kit";
import { AD_FORMATS, FORMAT_INFO, cropRect, type AdFormat, type FrameDraft } from "@/lib/adsFormats";
import { emptyCreativeForm, newCampaignForm, reviewChecklist, type CreativeForm } from "@/lib/adsStudio";
import { parseReport } from "@/lib/ads";
import type { AdAdvertiserRow, AdCampaignRow, AdCreativeRow } from "@/lib/adsServer";

const html = (el: any) => renderToStaticMarkup(el);
type El = { type: any; props: any };
const kids = (n: any): any[] => (n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(kids) : [n]);
/** every element — through children and element-valued props; hook-free function components are expanded (a hook throws → left as is). */
function find(n: any, pred: (e: El) => boolean, out: El[] = []): El[] {
  for (const k of kids(n)) if (typeof k === "object" && k.props) {
    if (pred(k)) out.push(k);
    if (typeof k.type === "function") { try { find(k.type(k.props), pred, out); } catch { /* uses hooks */ } }
    for (const [name, v] of Object.entries(k.props)) if (name === "children" || (v && typeof v === "object" && ((v as any).props || Array.isArray(v)))) find(v, pred, out);
  }
  return out;
}
const byData = (tree: any, attr: string, value?: string | number) =>
  find(tree, (e) => e.props?.[attr] !== undefined && (value === undefined || String(e.props[attr]) === String(value)));
const noop = () => {};

const BASE = "https://abc.supabase.co/storage/v1/object/public/ads/";
const OURS = (n: number) => `${BASE}creatives/2026-11/${n}.webp`;
const FOREIGN = "https://cdn.example.com/x.jpg";
const TODAY = "2026-11-15";
const P = (o: Partial<AdPreviewProps> = {}): AdPreviewProps => ({
  format: "card", advertiser: "פיצה השכונה", headline: "פיצה ב-49", body: "משפחתית עם תוספת", ctaLabel: "להזמנה",
  imageUrl: OURS(1), imageAlt: "מגש", imageBase: BASE, ...o,
});
const fr = (i: number, o: Partial<FrameDraft> = {}): FrameDraft => ({ key: `f${i}`, image_url: OURS(i), image_alt: `תמונה ${i}`, caption: "", cta_url: "", focal: [0.5, 0.5], ...o });

// ── התצוגה ──
describe("AdPreview — an exact mirror of bloc's components, all seven formats", () => {
  it("every format: its phone, \"ממומן · <advertiser>\", the CTA in bloc's color with white text by default", () => {
    for (const f of AD_FORMATS) {
      const h = html(createElement(AdPreview, P({ format: f, frames: FORMAT_INFO[f].frames ? [{ imageUrl: OURS(1), imageAlt: "א", caption: null }, { imageUrl: OURS(2), imageAlt: "ב", caption: null }] : null })));
      expect(h, f).toContain(`data-ad-format-preview="${f}"`);
      expect(h, f).toContain("ממומן");
      expect(h, f).toContain("פיצה השכונה");
      expect(h, f).toMatch(/data-ad-preview-cta=""[^>]*background:#1D4ED8;color:#FFFFFF/);
      expect(h, f).toContain(`aria-label="תצוגה מקדימה של המודעה: ${FORMAT_INFO[f].label}"`);
    }
  });
  it("the overlays (card / dialog / fullscreen / story): ONE solid X at the screen's top-left (12px under the status bar), 44×44 — no countdown, no ring", () => {
    for (const f of ["card", "dialog", "fullscreen", "story"] as AdFormat[]) {
      const h = html(createElement(AdPreview, P({ format: f, frames: f === "story" ? [{ imageUrl: OURS(1), imageAlt: "א", caption: null }, { imageUrl: OURS(2), imageAlt: "ב", caption: null }] : null })));
      const x = h.slice(h.indexOf('data-ad-preview-close="solid"') - 400, h.indexOf('data-ad-preview-close="solid"') + 900);
      expect(h.match(/data-ad-preview-close="solid"/g), f).toHaveLength(1);
      expect(x, f).toMatch(/top:40px;left:12px;width:44px;height:44px/);
      expect(x, f).toContain("background:rgba(11,18,32,.92)");
      expect(x, f).toContain('title="סגירת הפרסומת"');
      expect(x, f).not.toMatch(/>\s*3\s*</);
      expect(h, f).not.toMatch(/countdown|stroke-dasharray|conic-gradient/);
    }
  });
  it("dialog: over the CURRENT screen (a mock home) behind a dark scrim rgba(0,0,0,.6), a 16:9 image with \"ממומן\" at its top-left, a full-width CTA", () => {
    const h = html(createElement(AdPreview, P({ format: "dialog" })));
    expect(h).toContain("שלום, טל");   // the screen behind stays visible
    expect(h).toMatch(/data-ad-preview-scrim=""[^>]*background:rgba\(0,0,0,.6\)/);
    expect(h).not.toContain("blur(");
    const d = h.slice(h.indexOf("data-ad-preview-dialog"));
    expect(d).toContain("aspect-ratio:16 / 9");
    expect(d).toMatch(/data-ad-preview-tag=""[^>]*top:10px;left:10px/);
    expect(d).toMatch(/data-ad-preview-cta=""[^>]*min-height:48px/);
    expect(h.indexOf("data-ad-preview-scrim")).toBeLessThan(h.indexOf("data-ad-preview-dialog"));
  });
  it("dialog: the body clamps to 3 lines; \"קרא עוד\" is MEASURED (scrollHeight > clientHeight, as bloc) — not a length rule; dark = #0B1220", () => {
    // the server render cannot measure: no "קרא עוד" yet, whatever the length; the clamp is there and the body is measurable
    const long = html(createElement(AdPreview, P({ format: "dialog", body: "א".repeat(400), theme: "dark" })));
    expect(long).not.toContain("קרא עוד");
    expect(long).toMatch(/-webkit-line-clamp:3[^>]*data-ad-preview-body=""/);
    expect(long).toContain("-webkit-line-clamp:2");
    expect(long).toMatch(/data-ad-preview-dialog=""[^>]*background:#0B1220/);
    // the rule itself: cut only when the whole text is taller than what shows
    expect(isClamped({ scrollHeight: 84, clientHeight: 63 })).toBe(true);
    expect(isClamped({ scrollHeight: 63, clientHeight: 63 })).toBe(false);
    expect(isClamped({ scrollHeight: 40, clientHeight: 63 })).toBe(false);
    expect(isClamped(null)).toBe(false);
  });
  it("the CTA's text by contrast: a yellow accent → the dark text; an invalid accent → bloc's color", () => {
    expect(html(createElement(AdPreview, P({ accent: "#FACC15" })))).toMatch(/data-ad-preview-cta=""[^>]*background:#FACC15;color:#0F172A/);
    expect(html(createElement(AdPreview, P({ accent: "red" })))).toMatch(/data-ad-preview-cta=""[^>]*background:#1D4ED8;color:#FFFFFF/);
  });
  it("the focal point is the image's object-position (object-fit: cover) — the same crop as the app", () => {
    const h = html(createElement(AdPreview, P({ format: "native", focal: [0.3, 0.7] })));
    expect(h).toMatch(/data-focal="30% 70%"[^>]*object-fit:cover;object-position:30% 70%/);
  });
  it("an outside image / logo is never loaded (the place for it instead); our logo shows beside \"ממומן\" in banner / native / dialog", () => {
    const out = html(createElement(AdPreview, P({ format: "card", imageUrl: FOREIGN, advertiserLogo: FOREIGN })));
    expect(out).not.toContain(FOREIGN);
    expect(out).toContain("התמונה תופיע כאן (⁦1080×1350⁩)");
    for (const f of ["banner", "native", "dialog"] as AdFormat[]) {
      expect(html(createElement(AdPreview, P({ format: f, bannerPosition: "top", advertiserLogo: OURS(9) }))), f).toContain(`data-ad-preview-logo="" style`);
    }
    expect(html(createElement(AdPreview, P({ format: "card", advertiserLogo: OURS(9) })))).not.toContain("data-ad-preview-logo");
  });
  it("banner: at the top of a mock home or fixed at the bottom above the navigation; an X with a 44px hit area; complementary", () => {
    const top = html(createElement(AdPreview, P({ format: "banner", bannerPosition: "top" })));
    expect(top).toContain('data-ad-preview-banner="top"');
    expect(top).toContain('role="complementary" aria-label="פרסומת ממומנת"');
    expect(top).toMatch(/data-ad-preview-close="banner"[^>]*width:44px;height:44px/);
    const bottom = html(createElement(AdPreview, P({ format: "banner", bannerPosition: null })));
    expect(bottom).toContain('data-ad-preview-banner="bottom"');
    expect(bottom).toMatch(/bottom:78px/);
  });
  it("native / carousel: inside a mock list, after the third item", () => {
    for (const f of ["native", "carousel"] as AdFormat[]) {
      const h = html(createElement(AdPreview, P({ format: f, frames: f === "carousel" ? [{ imageUrl: OURS(1), imageAlt: "א", caption: "ראשון" }, { imageUrl: OURS(2), imageAlt: "ב", caption: null }] : null })));
      const ad = h.indexOf(f === "native" ? "data-ad-preview-native" : "data-ad-preview-carousel");
      expect(h.indexOf('data-ad-preview-list-item="3"'), f).toBeLessThan(ad);
      expect(h.indexOf('data-ad-preview-list-item="4"'), f).toBeGreaterThan(ad);
    }
  });
  it("story: bars (one per frame, the current one in progress), the caption, the frame switcher", () => {
    const frames = [{ imageUrl: OURS(1), imageAlt: "א", caption: "ראשון" }, { imageUrl: OURS(2), imageAlt: "ב", caption: "שני" }, { imageUrl: OURS(3), imageAlt: "ג", caption: null }];
    const picked: number[] = [];
    const h = html(createElement(AdPreview, P({ format: "story", frames, frame: 1, onFrame: (i) => picked.push(i) })));
    expect(h).toContain('data-ad-preview-bars="3"');
    expect(h.match(/data-ad-preview-bar="(done|now|next)"/g)).toEqual(['data-ad-preview-bar="done"', 'data-ad-preview-bar="now"', 'data-ad-preview-bar="next"']);
    expect(h).toContain("שני");
    expect(h).toContain("תמונה 2 מתוך 3");
    byData(AdPreview(P({ format: "story", frames, frame: 1, onFrame: (i) => picked.push(i) })), "data-ad-preview-frame-btn", 2)[0].props.onClick();
    expect(picked).toEqual([2]);
  });
  it("the width (320 / 390) and the app's light / dark behind", () => {
    const h = html(createElement(AdPreview, P({ format: "native", width: 320, appTheme: "dark", scale: 0.5 })));
    expect(h).toContain('data-preview-width="320" data-preview-app="dark"');
    expect(h).toContain("width:170px;height:370px");   // (320 + 2×10) × 0.5 by (720 + 20) × 0.5
    expect(h).toContain("background:#0B1220");
  });
});

// ── הגלריה ──
describe("FormatGallery — seven tiles with a short animation, multi-select", () => {
  it("the seven in order, each with its phone, line and size; the chosen ones checked", () => {
    const h = html(createElement(FormatGallery, { value: ["dialog", "story"], onChange: noop }));
    expect(h.split("data-format-tile=").slice(1).map((t) => t.slice(1, t.indexOf('"', 1)))).toEqual([...AD_FORMATS]);
    for (const f of AD_FORMATS) expect(h, f).toContain(FORMAT_INFO[f].line);
    expect(h.match(/aria-checked="true"/g)).toHaveLength(2);
    expect(h).toContain('role="checkbox"');
    expect(h).toContain("⁦1200×675⁩ · 16:9");
    expect(h).toContain("נבחרו 2 פורמטים");
  });
  it("toggle: adds in the gallery's order, removes, never empties", () => {
    expect(toggleFormat(["story"], "card")).toEqual(["card", "story"]);
    expect(toggleFormat(["card", "story"], "card")).toEqual(["story"]);
    expect(toggleFormat(["card"], "card")).toEqual(["card"]);
    const got: AdFormat[][] = [];
    byData(FormatGallery({ value: ["card"], onChange: (v) => got.push(v) }), "data-format-tile", "carousel")[0].props.onClick();
    byData(FormatGallery({ value: ["card"], onChange: (v) => got.push(v), disabled: true }), "data-format-tile", "native")[0].props.onClick();
    expect(got).toEqual([["card", "carousel"]]);
  });
  it("the mini phones: the dialog with its scrim; animation classes only when allowed; reduced motion stops them", () => {
    expect(html(createElement(MiniPhone, { format: "dialog" }))).toContain("data-mini-scrim");
    expect(html(createElement(MiniPhone, { format: "card", animate: true }))).toContain("studio-anim-pop");
    expect(html(createElement(MiniPhone, { format: "card", animate: false }))).not.toContain("studio-anim-pop");
    expect(html(createElement(MiniPhone, { format: "banner", position: "top" }))).toContain('data-mini-banner="top"');
    expect(STUDIO_CSS).toContain("@media (prefers-reduced-motion: reduce) { .studio-anim, .studio-anim * { animation: none !important;");
    expect(GALLERY_CSS).toContain("@keyframes studio-rise");
  });
});

// ── נקודת המיקוד ──
describe("FocalPicker — tap / drag / arrows; every chosen format's crop updates live", () => {
  const view = (o: Partial<Parameters<typeof FocalPickerView>[0]> = {}) =>
    ({ url: OURS(1), ratio: 16 / 9, focal: [0.3, 0.6] as [number, number], formats: ["card", "native"] as AdFormat[], onFocal: noop, ...o });
  it("no image yet — says what it is for", () => {
    expect(html(createElement(FocalPickerView, view({ url: null })))).toContain('data-focal-picker="empty"');
  });
  it("the dot at the focal point; each format's frame on the image (cropRect) and its crop in small", () => {
    const h = html(createElement(FocalPickerView, view()));
    expect(h).toMatch(/data-focal-dot=""[^>]*left:30%;top:60%/);
    const c = cropRect(16 / 9, 4 / 5, 0.3, 0.6);
    expect(h).toContain(`data-crop-rect="card" data-crop="${c.x.toFixed(3)},${c.y.toFixed(3)},${c.w.toFixed(3)},${c.h.toFixed(3)}"`);
    expect(h).toContain('data-focal-crop="native"');
    expect(h).toContain("object-position:30% 60%");
    expect(h).toContain('aria-valuetext="30% משמאל, 60% מלמעלה"');
    expect(html(createElement(FocalPickerView, view({ ratio: null })))).not.toContain("data-crop-rect");   // the ratio is known on load
  });
  it("arrows move 5% (Shift 1%), clamped; a tap → the point; \"to the middle\"", () => {
    expect(nudgeFocal([0.3, 0.6], "ArrowRight")).toEqual([0.35, 0.6]);
    expect(nudgeFocal([0.3, 0.6], "ArrowUp", true)).toEqual([0.3, 0.59]);
    expect(nudgeFocal([1, 0], "ArrowRight")).toEqual([1, 0]);
    expect(nudgeFocal([0.3, 0.6], "Enter")).toBeNull();
    expect(focalText([0.255, 1])).toBe("26% משמאל, 100% מלמעלה");
    const got: Array<[number, number]> = [];
    const tree = FocalPickerView(view({ onFocal: (f) => got.push(f) }));
    const box = byData(tree, "data-focal-box")[0];
    let prevented = false;
    box.props.onKeyDown({ key: "ArrowLeft", shiftKey: false, preventDefault: () => { prevented = true; } });
    box.props.onPointerDown({ currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }), setPointerCapture: noop }, pointerId: 1, clientX: 50, clientY: 75 });
    box.props.onPointerMove({ buttons: 0, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }) }, clientX: 150, clientY: 10 });
    byData(tree, "data-focal-reset")[0].props.onClick();
    expect(got).toEqual([[0.25, 0.6], [0.25, 0.75], [0.5, 0.5]]);
    expect(prevented).toBe(true);
    expect(html(createElement(FocalPickerView, view({ focal: [0.5, 0.5] })))).toMatch(/disabled=""[^>]*data-focal-reset/);
  });
});

// ── צבע הכפתור ──
describe("AccentPicker — bloc's color, the brand's, presets, any color; the contrast shown", () => {
  it("the swatches: bloc first, the brand second (when it differs), presets without duplicates", () => {
    expect(swatches(null).map((s) => s.key).slice(0, 2)).toEqual(["bloc", "#16A34A"]);
    expect(swatches("#dc2626").map((s) => s.key)).toEqual(["bloc", "brand", "#16A34A", "#D97706", "#7C3AED", "#DB2777", "#0F172A", "#FACC15"]);
    expect(swatches("#1D4ED8").some((s) => s.key === "brand")).toBe(false);
    expect(swatches("#2563EB").some((s) => s.key === "brand")).toBe(true);
    expect(swatches("blue").some((s) => s.key === "brand")).toBe(false);
  });
  it("the chosen one checked; the sample button with its contrast text; a low contrast warned", () => {
    const h = html(createElement(AccentPicker, { value: "#FACC15", brand: null, onChange: noop, ctaLabel: "להזמנה" }));
    expect(h).toMatch(/aria-checked="true"[^>]*data-accent="#FACC15"/);
    expect(h).toMatch(/data-accent-sample=""[^>]*background:#FACC15;color:#0F172A/);
    expect(h).toContain('data-accent-contrast="ok"');
    expect(h).toContain("טקסט כהה");
    const low = html(createElement(AccentPicker, { value: "#777777", brand: null, onChange: noop }));
    expect(low).toContain('data-accent-contrast="low"');
    expect(h).not.toContain("data-accent-low");
    expect(html(createElement(AccentPicker, { value: null, brand: null, onChange: noop }))).toMatch(/aria-checked="true"[^>]*data-accent="bloc"/);
  });
  it("review #9 — a color bloc refuses: why (it is not saved) and the nearest shade that passes, one tap", () => {
    const got: Array<string | null> = [];
    const low = html(createElement(AccentPicker, { value: "#777777", brand: null, onChange: noop }));
    expect(low).toMatch(/role="alert" data-accent-low=""/);
    expect(low).toContain("bloc לא שומר צבע כזה");
    expect(low).toContain('data-accent-suggest="#757575"');
    expect(low).toContain("4.6:1");
    byData(AccentPicker({ value: "#0077FF", brand: null, onChange: (v) => got.push(v) }), "data-accent-suggest", "#0A7CFF")[0].props.onClick();
    expect(got).toEqual(["#0A7CFF"]);
  });
  it("a click picks; the color input picks any color (upper-case)", () => {
    const got: Array<string | null> = [];
    const tree = AccentPicker({ value: "#16A34A", brand: "#DC2626", onChange: (v) => got.push(v) });
    byData(tree, "data-accent", "brand")[0].props.onClick();
    byData(tree, "data-accent", "bloc")[0].props.onClick();
    byData(tree, "data-accent", "#16A34A")[0].props.onClick();   // already chosen — nothing
    byData(tree, "data-accent-custom")[0].props.onChange({ target: { value: "#abcdef" } });
    expect(got).toEqual(["#DC2626", null, "#ABCDEF"]);
  });
});

// ── פס התמונות ──
describe("FramesStrip — 2 to 5, drag or arrows; per frame: image, focal, alt, caption (+ link in a carousel)", () => {
  const strip = (o: Partial<Parameters<typeof FramesStrip>[0]> = {}) => ({
    formats: ["story"] as AdFormat[], frames: [fr(1), fr(2), fr(3)], selected: 1, onSelect: noop, onChange: noop, boxes: {}, onPick: noop, onAdd: noop,
    locked: false, busy: false, refusedFrame: null, imageBase: BASE, ...o,
  });
  it("the count, the thumbnails in the format's crop, the selected frame's editor", () => {
    const h = html(createElement(FramesStrip, strip()));
    expect(h).toContain('data-frames-count="3"');
    expect(h).toContain("(3/5)");
    expect(h).toMatch(/aria-selected="true"[^>]*data-frame-thumb="1"/);
    expect(h).toContain('data-frame="1"');
    expect(h).toContain('data-frame-field="1.image_alt"');
    expect(h).not.toContain(".cta_url");   // a story: no per-frame link
  });
  it("arrows move the selected frame and keep it selected; remove never below 2; add up to 5", () => {
    const got: Array<[string[], number | undefined]> = [];
    const tree = FramesStrip(strip({ onChange: (f, s) => got.push([f.map((x) => x.key), s]) }));
    byData(tree, "data-frame-up", 1)[0].props.onClick();
    byData(tree, "data-frame-down", 1)[0].props.onClick();
    byData(tree, "data-frame-remove", 1)[0].props.onClick();
    expect(got).toEqual([[["f2", "f1", "f3"], 0], [["f1", "f3", "f2"], 2], [["f1", "f3"], 1]]);
    expect(html(createElement(FramesStrip, strip({ frames: [fr(1), fr(2)], selected: 0 })))).toMatch(/disabled=""[^>]*data-frame-remove="0"/);
    const five = html(createElement(FramesStrip, strip({ frames: [fr(1), fr(2), fr(3), fr(4), fr(5)] })));
    expect(five).toMatch(/disabled=""[^>]*data-frame-add/);
    expect(five).toContain("data-frame-max");
  });
  it("drag: drop a frame on another place (the selected one stays selected by key)", () => {
    const got: Array<[string[], number | undefined]> = [];
    const tree = FramesStrip(strip({ onChange: (f, s) => got.push([f.map((x) => x.key), s]) }));
    byData(tree, "data-frame-thumb", 2)[0].props.onDrop({ preventDefault: noop, dataTransfer: { getData: () => "0" } });
    expect(got).toEqual([[["f2", "f3", "f1"], 0]]);
    expect(indexOfKey([fr(1), fr(2)], "f2", 0)).toBe(1);
    expect(indexOfKey([fr(1), fr(2)], "zz", 5)).toBe(1);
  });
  it("a carousel: each card may have its own link (a story alongside — said that the story does not send it); a refused frame marked", () => {
    const h = html(createElement(FramesStrip, strip({ formats: ["story", "carousel"], refusedFrame: 1 })));
    expect(h).toContain('data-frame-field="1.cta_url"');
    expect(h).toContain("בסטורי הקישור הזה לא נשלח");
    expect(h).toContain('data-frame-refused=""');
    expect(html(createElement(FramesStrip, strip({ formats: ["carousel"] })))).toContain("הכרטיסים בקרוסלה");
  });
});

// ── התצוגה החיה ──
describe("StudioPreview — format tabs, the width, the app's theme; the same mapping for the form and a saved ad", () => {
  const f: CreativeForm = { ...emptyCreativeForm((i) => `k${i}`), formats: ["card", "dialog", "carousel"], image: { image_url: OURS(1), image_alt: "מגש", focal: [0.2, 0.8] }, headline: "כותרת", body: "משפט", cta_url: "https://x.example", frames: [fr(1, { cta_url: "https://a.example" }), fr(2)] };
  it("a tab per chosen format; the width and app toggles; the phone at the chosen width", () => {
    const got: string[] = [];
    const v = { formats: f.formats, active: "dialog" as AdFormat, onActive: (x: AdFormat) => got.push(x), width: 320 as const, onWidth: noop, app: "dark" as const, onApp: noop, frame: 0, onFrame: noop,
      props: (x: AdFormat) => previewFromForm(x, f, { advertiser: "פיצה", advertiserLogo: null, imageBase: BASE }) };
    const h = html(createElement(StudioPreviewView, v));
    expect(h).toContain('data-studio-preview="dialog"');
    expect(h.match(/data-preview-tab="/g)).toHaveLength(3);
    expect(h).toContain('data-segmented="width"');
    expect(h).toContain('data-preview-width="320" data-preview-app="dark"');
    byData(StudioPreviewView(v), "data-preview-tab", "carousel")[0].props.onClick();
    byData(StudioPreviewView(v), "data-preview-tab", "dialog")[0].props.onClick();
    expect(got).toEqual(["carousel"]);
    expect(html(createElement(StudioPreviewView, { ...v, formats: ["card"] }))).not.toContain("data-preview-tab");
  });
  it("form → preview: body only where shown, frames for story / carousel (a card link only in the carousel), the focal", () => {
    expect(SHOWS_BODY).toEqual({ card: true, dialog: true, fullscreen: true, story: false, banner: false, native: true, carousel: false });
    const base = { advertiser: "פיצה", advertiserLogo: null, imageBase: BASE };
    expect(previewFromForm("card", f, base)).toMatchObject({ body: "משפט", focal: [0.2, 0.8], imageUrl: OURS(1), frames: null });
    expect(previewFromForm("story", f, base)).toMatchObject({ body: null, imageUrl: null });
    expect(previewFromForm("carousel", f, base).frames![0].ctaUrl).toBe("https://a.example");
    expect(previewFromForm("story", { ...f, formats: ["story"] }, base).frames![0].ctaUrl).toBeNull();
    const c: AdCreativeRow = { id: "c", campaign_id: "k", image_url: OURS(1), image_alt: "א", headline: "h", body: "b", cta_label: "לפרטים", cta_url: "https://x.example", active: true, created_at: "", format: "banner", banner_position: "top", theme: "dark", accent: "#FACC15", focal_x: 0.1, focal_y: 0.9, frames: null };
    expect(previewFromCreative(c, base)).toMatchObject({ format: "banner", body: null, bannerPosition: "top", theme: "dark", accent: "#FACC15", focal: [0.1, 0.9] });
  });
});

// ── מסך הבית ──
const CAMP = (o: Partial<AdCampaignRow> = {}): AdCampaignRow => ({
  id: "c1", name: "פיצה סתיו", status: "active", starts_on: "2026-11-01", ends_on: "2026-11-30", days: [0, 1, 2, 3, 4, 5, 6], hour_from: 0, hour_to: 24,
  screens: ["home"], plans: ["free"], roles: ["tenant"], cities: [], building_ids: [], goal_views: null, daily_cap: null, per_user_cap: 3, weight: 1,
  contract_id: "k1", advertiser: "פיצה השכונה", advertiser_id: "a1", contract_ref: null, serves: 0, views: 0, clicks: 0, closes: 0, today_views: 0, today_clicks: 0,
  creatives_active: 1, creatives_total: 1, creatives_ready: 1, placements: ["card", "native"], slots: ["full", "inline"], advertiser_logo: null, advertiser_color: "#DC2626",
  phase: "running", phase_label: "פעיל", tone: "ok", pace_state: "none", pace_label: "", pace_expected: 0, ...o,
});
const ADV = (o: Partial<AdAdvertiserRow> = {}): AdAdvertiserRow => ({
  id: "a1", name: "פיצה השכונה", legal_name: null, business_id: null, contact_name: null, contact_phone: null, contact_email: null, website: null, notes: null,
  archived_at: null, contracts: [], logo_url: null, brand_color: null, ...o,
});
const home = (o: Partial<StudioHomeViewProps> = {}): StudioHomeViewProps => ({
  state: "ok", today: TODAY, campaigns: [CAMP()], advertisers: [ADV()], daily: { c1: { days: [{ day: TODAY, views: 7, clicks: 1 }], reach: 5, frozenAt: null } },
  enabled: true, canManage: true, imageBase: BASE, range: "7d", onRange: noop, tab: "all", onTab: noop, q: "", onQ: noop, adv: "", onAdv: noop,
  busy: null, staleDup: false, notice: null, err: null, onRetry: noop, onPause: noop, onResume: noop, onDuplicate: noop, now: new Date("2026-11-15T12:00:00Z"), ...o,
});

describe("the studio home — loading, empty, failed, missing SQL, the list", () => {
  it("loading: skeletons (aria-busy)", () => {
    expect(html(createElement(StudioHomeSkeleton))).toContain('data-studio-home="loading" aria-busy="true"');
  });
  it("failed: a read failure with \"נסו שוב\" (never an empty list); missing SQL: said", () => {
    const retried: number[] = [];
    const h = html(createElement(StudioHomeView, home({ state: "error" })));
    expect(h).toContain('data-studio-home="error"');
    expect(h).toContain("לא הצלחנו לטעון את הקמפיינים");
    expect(h).not.toContain("data-studio-empty");
    byData(StudioHomeView(home({ state: "error", onRetry: () => retried.push(1) })), "data-studio-retry")[0].props.onClick();
    expect(retried).toEqual([1]);
    expect(html(createElement(StudioHomeView, home({ state: "missing" })))).toContain("data-ads-missing");
  });
  it("empty: a start card with \"קמפיין חדש\" and the templates (each opens the wizard with it)", () => {
    const h = html(createElement(StudioHomeView, home({ campaigns: [] })));
    expect(h).toContain("data-studio-empty");
    expect(h).toContain('href="/ads/new"');
    for (const k of ["sale", "event", "new", "perk"]) expect(h).toContain(`href="/ads/new?template=${k}"`);
    expect(h).not.toContain("data-studio-kpis");
  });
  it("the header, the nav, the KPIs for the range; a failed read is \"—\" with \"לא נטען\" (never 0); partial — said", () => {
    const h = html(createElement(StudioHomeView, home()));
    expect(h).toContain("סטודיו הפרסום");
    expect(h).toContain('data-studio-nav="campaigns"');
    expect(h).toContain('data-studio-kpis="7d"');
    expect(h).toMatch(/data-kpi="views"[\s\S]*?>7</);
    const failed = html(createElement(StudioHomeView, home({ daily: { c1: null } })));
    const tile = (h2: string, k: string) => h2.slice(h2.indexOf(`data-kpi="${k}"`), h2.indexOf("data-kpi=", h2.indexOf(`data-kpi="${k}"`) + 10));
    expect(tile(failed, "views")).toContain(">—<");
    expect(tile(failed, "views")).not.toContain(">0<");
    expect(failed).toContain("לא נטען");
    expect(failed).toContain("data-kpi-partial");
  });
  it("tabs with counts; a filter that matches nothing — said; the ads are off — a banner to the settings", () => {
    const list = [CAMP(), CAMP({ id: "c2", phase: "draft", status: "draft" }), CAMP({ id: "c3", phase: "paused", status: "paused" })];
    const h = html(createElement(StudioHomeView, home({ campaigns: list })));
    expect(h).toMatch(/data-tab="draft"[\s\S]*?data-tab-count="1"/);
    expect(h).toMatch(/data-tab="all"[\s\S]*?data-tab-count="3"/);
    expect(html(createElement(StudioHomeView, home({ campaigns: list, tab: "ended" })))).toContain("אין קמפיינים בלשונית הזו.");
    expect(html(createElement(StudioHomeView, home({ q: "zzz" })))).toContain("אין קמפיין שמתאים לחיפוש.");
    expect(html(createElement(StudioHomeView, home({ enabled: false })))).toContain("data-ads-off");
  });
  it("a card: the avatar on the brand color, status, where it shows, the 7-day line, CTR, \"מסתיים בעוד N ימים\"", () => {
    const h = html(createElement(CampaignCard, { c: CAMP({ views: 120, clicks: 6 }), daily: { days: [{ day: TODAY, views: 7, clicks: 1 }], reach: 5, frozenAt: null }, today: TODAY, canManage: true, busy: false, anyBusy: false, staleDup: false, imageBase: BASE, onPause: noop, onResume: noop, onDuplicate: noop, now: new Date("2026-11-15T12:00:00Z") }));
    expect(h).toContain('data-avatar="initial"');
    expect(h).toContain("background:#DC2626");
    expect(h).toContain('data-placements="card,native"');
    expect(h).toContain('data-spark="0,0,0,0,0,0,7"');
    expect(h).toContain(">5%<");
    expect(h).toContain("מסתיים בעוד 15 ימים");
  });
  it("pace on a running campaign with a goal: the bar, the expected marker, \"מאחור\"", () => {
    const h = html(createElement(CampaignCard, { c: CAMP({ goal_views: 1000, views: 100 }), daily: null, today: TODAY, canManage: true, busy: false, anyBusy: false, staleDup: false, imageBase: BASE, onPause: noop, onResume: noop, onDuplicate: noop, now: new Date("2026-11-15T22:00:00Z") }));
    expect(h).toContain('data-campaign-pace="behind"');
    expect(h).toContain("מאחור");
    expect(h).toContain('data-spark="none"');
  });
  it("quick actions: pause only for an active campaign, resume for a paused one, open (\"המשך עריכה\" for a draft); one action at a time; an unclear duplicate locks it", () => {
    const card = (c: AdCampaignRow, o: Record<string, unknown> = {}) => html(createElement(CampaignCard, { c, daily: null, today: TODAY, canManage: true, busy: false, anyBusy: false, staleDup: false, imageBase: BASE, onPause: noop, onResume: noop, onDuplicate: noop, ...o }));
    expect(card(CAMP())).toContain('data-quick="pause"');
    expect(card(CAMP())).not.toContain('data-quick="resume"');
    expect(card(CAMP({ status: "paused", phase: "paused" }))).toContain('data-quick="resume"');
    expect(card(CAMP({ status: "draft", phase: "draft" }))).toContain("המשך עריכה");
    expect(card(CAMP({ status: "draft", phase: "draft" }))).not.toContain('data-quick="pause"');
    expect(card(CAMP(), { anyBusy: true })).toMatch(/disabled=""[^>]*data-quick="pause"/);
    expect(card(CAMP(), { staleDup: true })).toMatch(/disabled=""[^>]*data-quick="duplicate"/);
    expect(card(CAMP(), { canManage: false })).not.toContain('data-quick="duplicate"');
    const got: string[] = [];
    const tree = StudioHomeView(home({ onPause: (c) => got.push(`p:${c.id}`), onDuplicate: (c) => got.push(`d:${c.id}`) }));
    byData(tree, "data-quick", "pause")[0].props.onClick();
    byData(tree, "data-quick", "duplicate")[0].props.onClick();
    expect(got).toEqual(["p:c1", "d:c1"]);
  });
});

// ── האשף ──
const K = (o: Record<string, unknown> = {}) => ({ id: "k1", label: "פיצה השכונה", advertiser: "פיצה השכונה", advertiser_id: "a1", pricing: "cpm" as const, price_ils: 50, status: "active" as const, starts_on: "2026-11-01", ends_on: "2026-12-31", ...o });
describe("the wizard, step 1 — advertiser, contract, name", () => {
  const step = (o: Partial<AdvertiserStepProps> = {}): AdvertiserStepProps => ({
    advertisers: [ADV(), ADV({ id: "a2", name: "פלאפל", logo_url: OURS(9), brand_color: "#16A34A" })], advertiserId: "a1", onAdvertiser: noop, q: "", onQ: noop,
    contracts: [K(), K({ id: "k2", status: "draft", label: "פיצה השכונה (2)" })], contractId: "k1", onContract: noop, name: "", onName: noop, suggestion: "פיצה השכונה · נובמבר 2026",
    onNewAdvertiser: noop, onNewContract: noop, contractLocked: false, imageBase: BASE, ...o,
  });
  it("advertisers as radios (logo or initial), \"מפרסם חדש\", the contracts of the chosen one, the suggested name", () => {
    const h = html(createElement(AdvertiserStepView, step()));
    expect(h).toMatch(/aria-checked="true"[^>]*data-wizard-adv="a1"/);
    expect(h).toContain('data-avatar="logo"');
    expect(h).toContain("data-wizard-new-adv");
    expect(h).toContain('data-wizard-contracts="2"');
    expect(h).toContain("data-wizard-new-contract");
    expect(h).toContain("הצעה: פיצה השכונה · נובמבר 2026");
    expect(html(createElement(AdvertiserStepView, step({ advertiserId: "" })))).not.toContain("data-wizard-contracts");
    expect(html(createElement(AdvertiserStepView, step({ contractId: "k2" })))).toContain("data-wizard-contract-draft");
  });
  it("clicks: another advertiser, a contract, the suggestion, new advertiser / contract", () => {
    const got: string[] = [];
    const tree = AdvertiserStepView(step({ onAdvertiser: (x) => got.push(`a:${x}`), onContract: (x) => got.push(`k:${x}`), onName: (x) => got.push(`n:${x}`), onNewAdvertiser: () => got.push("na"), onNewContract: () => got.push("nk") }));
    byData(tree, "data-wizard-adv", "a2")[0].props.onClick();
    byData(tree, "data-wizard-adv", "a1")[0].props.onClick();   // already chosen
    byData(tree, "data-wizard-contract", "k2")[0].props.onClick();
    byData(tree, "data-wizard-suggest")[0].props.onClick();
    byData(tree, "data-wizard-new-adv")[0].props.onClick();
    byData(tree, "data-wizard-new-contract")[0].props.onClick();
    expect(got).toEqual(["a:a2", "k:k2", "n:פיצה השכונה · נובמבר 2026", "na", "nk"]);
  });
  it("a served campaign keeps its contract (and advertiser): the others disabled, said", () => {
    const h = html(createElement(AdvertiserStepView, step({ contractLocked: true })));
    expect(h).toContain("data-wizard-contract-locked");
    expect(h).toContain('data-wizard-adv="a2" disabled=""');
    expect(h).not.toContain("data-wizard-new-contract");
  });
  it("usable contracts: the advertiser's, not cancelled, not ended (the current one always); the preselected: active covering the dates", () => {
    const all = [K(), K({ id: "k2", status: "cancelled" }), K({ id: "k3", ends_on: "2026-11-01" }), K({ id: "k4", advertiser_id: "a2" }), K({ id: "k5", status: "draft" })];
    expect(usableContracts(all, "a1", TODAY).map((k) => k.id)).toEqual(["k1", "k5"]);
    expect(usableContracts(all, "a1", TODAY, "k3").map((k) => k.id)).toEqual(["k1", "k3", "k5"]);
    expect(pickContract([K({ id: "d", status: "draft" }), K({ id: "short", ends_on: "2026-11-20" }), K({ id: "cover" })], TODAY, "2026-12-14")).toBe("cover");
    expect(pickContract([K({ id: "d", status: "draft" }), K({ id: "short", ends_on: "2026-11-20" })], TODAY, "2026-12-14")).toBe("short");
    expect(pickContract([K({ id: "d", status: "draft" })], TODAY, TODAY)).toBe("d");
    expect(pickContract([], TODAY, TODAY)).toBe("");
    expect(dayMonth("2026-11-16")).toBe("16.11");
  });
});

describe("the wizard, step 5 — the checklist links to its step; publish only when all green", () => {
  const form = newCampaignForm(TODAY, "k1", "פיצה סתיו");
  const CR: AdCreativeRow = { id: "cr1", campaign_id: "c1", image_url: OURS(1), image_alt: "מגש", headline: "פיצה", body: null, cta_label: "להזמנה", cta_url: "https://x.example", active: true, created_at: "", format: "dialog", banner_position: null, theme: "light", accent: null, focal_x: 0.5, focal_y: 0.5, frames: null };
  const review = (o: Partial<ReviewStepProps> = {}): ReviewStepProps => {
    const creatives = o.creatives ?? [CR];
    const f = o.form ?? form;
    return {
      checklist: reviewChecklist({ advertiserId: "a1", contract: K(), form: f, creatives: creatives.map((c) => ({ active: c.active, ready: true, headline: c.headline, image_alt: c.image_alt, cta_label: c.cta_label })), today: TODAY }),
      onStep: noop, advertiser: ADV(), contract: K(), form: f, creatives, reach: { kind: "ok", users: 1240, buildings: 38, under10: false }, today: TODAY, imageBase: BASE,
      busy: false, error: null, onDraft: noop, onPublish: noop, ...o,
    };
  };
  it("all green: \"הכל מוכן\", the summary cards, every ad in its format, publish enabled", () => {
    const h = html(createElement(ReviewStepView, review()));
    expect(h).toContain('data-review-ready="yes"');
    for (const k of ["advertiser", "ads", "audience", "schedule"]) expect(h).toContain(`data-review-card="${k}"`);
    expect(h).toContain('data-review-ads="1"');
    expect(h).toContain('data-ad-format-preview="dialog"');
    expect(h).toContain("כ-1,240 משתמשים ב-38 בניינים");
    expect(h).not.toMatch(/disabled=""[^>]*data-review-publish/);
  });
  it("a red item: \"לתיקון\" goes to its step; publish disabled", () => {
    const got: number[] = [];
    const r = review({ creatives: [{ ...CR, active: false }], onStep: (n) => got.push(n) });
    const h = html(createElement(ReviewStepView, r));
    expect(h).toContain('data-review-ready="no"');
    expect(h).toMatch(/disabled=""[^>]*data-review-publish/);
    byData(ReviewStepView(r), "data-check-fix", 2)[0].props.onClick();
    byData(ReviewStepView(r), "data-review-edit", 4)[0].props.onClick();
    expect(got).toEqual([2, 4]);
  });
  it("a future start: the button says when it starts, and it will show as scheduled", () => {
    const h = html(createElement(ReviewStepView, review({ form: { ...form, starts_on: "2026-11-20", ends_on: "2026-12-14" } })));
    expect(h).toContain('data-review-publish="scheduled"');
    expect(h).toContain("פרסום — יתחיל ב-20.11");
    expect(h).toContain("data-review-scheduled");
  });
  it("publish / keep as draft call through; bloc's refusal shown", () => {
    const got: string[] = [];
    const r = review({ onPublish: () => got.push("pub"), onDraft: () => got.push("draft"), error: "אין בקמפיין מודעה פעילה עם תמונות שהועלו ל-bloc. מוסיפים מודעה, ואז מפעילים." });
    byData(ReviewStepView(r), "data-review-publish")[0].props.onClick();
    byData(ReviewStepView(r), "data-review-draft")[0].props.onClick();
    expect(got).toEqual(["pub", "draft"]);
    expect(html(createElement(ReviewStepView, r))).toContain("data-review-error");
  });
});

describe("step 3 — the audience, with the live gauge", () => {
  const B = [{ id: "b1", name: "הרצל 5", city: "חיפה" }, { id: "b2", name: "הגפן 2", city: "תל אביב" }, { id: "b3", name: "הרצל 9", city: null }];
  const aud = (o: Partial<AudienceEditorViewProps> = {}): AudienceEditorViewProps => ({
    value: { screens: ["home"], plans: ["free"], roles: ["tenant"], cities: [], building_ids: [] }, onChange: noop, cities: ["חיפה", "חולון", "תל אביב"], buildings: B,
    cityQ: "", onCityQ: noop, bq: "", onBq: noop, reach: { kind: "ok", users: 1240, buildings: 38, under10: false }, ...o,
  });
  it("matches: cities containing what was typed (not chosen ones, up to 8); buildings by name or city from 2 letters", () => {
    expect(cityMatches(["חיפה", "חולון", "תל אביב"], ["חולון"], "ח")).toEqual(["חיפה"]);
    expect(cityMatches(["חיפה"], [], " ")).toEqual([]);
    expect(buildingMatches(B, [], "הר").map((b) => b.id)).toEqual(["b1", "b3"]);
    expect(buildingMatches(B, ["b1"], "חיפה").map((b) => b.id)).toEqual([]);
    expect(buildingMatches(B, [], "ה")).toEqual([]);
  });
  it("picking a city adds it and clears the search; both cities and buildings — said how they combine", () => {
    const got: string[][] = []; const q: string[] = [];
    const tree = AudienceEditorView(aud({ cityQ: "חי", onChange: (v) => got.push(v.cities), onCityQ: (x) => q.push(x) }));
    byData(tree, "data-city-option", "חיפה")[0].props.onClick();
    expect([got, q]).toEqual([[["חיפה"]], [""]]);
    expect(html(createElement(AudienceEditorView, aud({ value: { screens: ["home"], plans: ["free"], roles: ["tenant"], cities: ["חיפה"], building_ids: ["b1", "b2"] } })))).toContain("(1 כאלה)");
  });
  it("without the home screen — warned; the gauge first", () => {
    const h = html(createElement(AudienceEditorView, aud({ value: { screens: ["events"], plans: ["free"], roles: ["tenant"], cities: [], building_ids: [] } })));
    expect(h).toContain("data-audience-screens-warning");
    expect(h.indexOf("data-reach=")).toBeLessThan(h.indexOf('data-chipset="screens"'));
  });
  it("the gauge: an estimate / fewer than 10 / estimating / after SQL 230 / failed (never 0); buildings under k = 10 are said", () => {
    expect(html(createElement(ReachGauge, { state: { kind: "ok", users: 1240, buildings: 38, under10: false } }))).toContain("כ-1,240 משתמשים ב-38 בניינים");
    expect(html(createElement(ReachGauge, { state: { kind: "ok", users: 0, buildings: 1, under10: true } }))).toContain("פחות מ-10 משתמשים");
    expect(html(createElement(ReachGauge, { state: { kind: "loading" } }))).toContain("מעריכים…");
    expect(html(createElement(ReachGauge, { state: { kind: "sql_missing" } }))).toContain("ההערכה תופיע אחרי SQL 230");
    // bloc counts only buildings with 10 matches or more (and rounds down to tens) — the help line under every estimate
    for (const under10 of [false, true]) expect(html(createElement(ReachGauge, { state: { kind: "ok", users: under10 ? 0 : 1240, buildings: 38, under10 } }))).toContain("בניינים עם פחות מ-10 מתאימים לא נספרים.");
    expect(html(createElement(ReachGauge, { state: { kind: "failed" } }))).not.toContain("data-reach-help");
    const failed = html(createElement(ReachGauge, { state: { kind: "failed" } }));
    expect(failed).toContain("לא הצלחנו להעריך כרגע");
    expect(failed).not.toMatch(/>0</);
  });
  it("the first paint already says \"estimating\" (the request goes out at once) — not a bare \"—\"; switched off — nothing yet", () => {
    const a = { screens: ["home" as const], plans: ["free" as const], roles: ["tenant" as const], cities: [], building_ids: [] };
    function Probe({ on }: { on: boolean }) { return createElement(ReachGauge, { state: useReach(a, on) }); }
    expect(html(createElement(Probe, { on: true }))).toContain("מעריכים…");
    const off = html(createElement(Probe, { on: false }));
    expect(off).not.toContain("מעריכים…");
    expect(off).toContain("—");
  });
});

describe("step 4 — schedule and goal: days + ONE hour range, presets, priority", () => {
  const v = { starts_on: TODAY, ends_on: "2026-12-14", days: [0, 1, 2, 3, 4, 5, 6], hour_from: 8, hour_to: 22, goal: "10000", daily: "", per_user: 3, weight: 1 };
  it("presets pressed when they match; a click applies one; the hours text and the slider handles", () => {
    const got: Array<typeof v> = [];
    const h = html(createElement(ScheduleEditorView, { value: { ...v, hour_from: 17, hour_to: 22 }, onChange: noop, today: TODAY }));
    expect(h).toMatch(/aria-pressed="true"[^>]*data-preset="evening"/);
    expect(h).toMatch(/aria-pressed="false"[^>]*data-preset="allday"/);
    expect(h).toContain("17:00–22:00");
    expect(h).toContain('aria-valuetext="17:00"');
    expect(h).toContain('aria-valuetext="22:00"');
    byData(ScheduleEditorView({ value: v, onChange: (x) => got.push(x as typeof v), today: TODAY }), "data-preset", "weekend")[0].props.onClick();
    expect(got[0]).toMatchObject({ days: [5, 6], hour_from: 8, hour_to: 22 });
  });
  it("the sliders keep from < to; the weight 1–10 with words; the pacing hint", () => {
    const got: Array<typeof v> = [];
    const tree = ScheduleEditorView({ value: v, onChange: (x) => got.push(x as typeof v), today: TODAY });
    byData(tree, "data-schedule-field", "hour_from")[0].props.onChange({ target: { value: "23" } });
    byData(tree, "data-schedule-field", "hour_to")[0].props.onChange({ target: { value: "3" } });
    byData(tree, "data-schedule-field", "weight")[0].props.onChange({ target: { value: "7" } });
    expect(got.map((x) => [x.hour_from, x.hour_to, x.weight])).toEqual([[23, 24, 1], [2, 3, 1], [8, 22, 7]]);
    expect([WEIGHT_TEXT(1), WEIGHT_TEXT(3), WEIGHT_TEXT(5), WEIGHT_TEXT(8), WEIGHT_TEXT(10)]).toEqual(["רגילה", "מעט גבוהה", "גבוהה", "גבוהה מאוד", "הכי גבוהה"]);
    expect(html(createElement(ScheduleEditorView, { value: v, onChange: noop, today: TODAY }))).toContain("כ-334 ביום");
    // the priority track is filled from the right (RTL) up to the value: 1 → empty, 10 → full
    const fill = (w: number) => html(createElement(ScheduleEditorView, { value: { ...v, weight: w }, onChange: noop, today: TODAY })).match(/data-weight-fill="\d+" style="([^"]*)"/)?.[1];
    expect([fill(1), fill(10)]).toEqual(["right:0;width:0%", "right:0;width:100%"]);
  });
});

// ── דף הקמפיין ──
describe("the campaign page — performance and history", () => {
  const creatives: AdCreativeRow[] = [
    { id: "x1", campaign_id: "c1", image_url: OURS(1), image_alt: "א", headline: "מבצע", body: null, cta_label: "לפרטים", cta_url: "https://x.example", active: true, created_at: "", format: "card", banner_position: null, theme: "light", accent: null, focal_x: 0.2, focal_y: 0.4, frames: null },
    { id: "x2", campaign_id: "c1", image_url: FOREIGN, image_alt: "ב", headline: "ישן", body: null, cta_label: "לפרטים", cta_url: "https://x.example", active: true, created_at: "", format: "native", banner_position: null, theme: "light", accent: null, focal_x: 0.5, focal_y: 0.5, frames: null },
  ];
  const report = parseReport({
    totals: { serves: 2000, views: 1800, clicks: 54, closes: 300, reach: 900 }, reach_frozen_at: "2027-01-12T03:00:00Z",
    days: [{ day: "2026-11-13", views: 600, clicks: 20 }, { day: "2026-11-14", views: 0, clicks: 0 }, { day: "2026-11-15", views: 1200, clicks: 34 }],
    creatives: [{ creative_id: "x1", serves: 1100, views: 1000, clicks: 40, closes: 0 }, { creative_id: "x2", serves: 900, views: 800, clicks: 14, closes: 0, format: "native" }],
    screens: [{ screen: "home", views: 1800, clicks: 54 }], cities: [{ city: "חיפה", views: 1800, clicks: 54 }],
  });
  it("KPIs (served / viewed with the share / clicks / CTR / reach), the frozen note, the definition per slot", () => {
    const h = html(createElement(PerformanceTabView, { campaign: CAMP(), report, creatives, imageBase: BASE }));
    expect(h).toMatch(/data-kpi="serves"[\s\S]*?>2,000</);
    expect(h).toContain("90% מההגשות");
    expect(h).toContain("data-report-frozen");
    expect(h).toContain("נכון ל-12.01.2027");
    expect(h).toContain("חשיפה — המודעה הוצגה על המסך, עם התמונה.");
    expect(h).toContain("חצי מהמודעה שברשימה");
    expect(h).not.toContain("data-report-upper");
    expect(h).not.toContain("data-kpi-prefix");
    expect(h).toMatch(/data-kpi="reach"[\s\S]*?>900</);
  });
  it("reach_upper_bound (review #7): \"עד N\" with \"לכל היותר\" and the why", () => {
    const up = { ...report, reachUpperBound: true };
    const h = html(createElement(PerformanceTabView, { campaign: CAMP(), report: up, creatives, imageBase: BASE }));
    // "עד" — a small word before the number (the number never breaks across lines), then "לכל היותר" under it
    expect(h).toMatch(/data-kpi="reach"[\s\S]*?data-kpi-prefix=""[^>]*>עד<\/span><span[^>]*>900<\/span><\/div><div[^>]*>לכל היותר<\/div>/);
    expect(h).toContain("data-report-upper");
    expect(h).toContain("נספר פעמיים");
  });
  it("the daily chart (SVG, the oldest at the right), a bar per day with a title; the numbers behind a disclosure", () => {
    const h = html(createElement(DailyChart, { days: report.days, w: 300, h: 100 }));
    expect(h).toContain('data-daily-chart="3"');
    expect(h.match(/data-bar="/g)).toHaveLength(3);
    expect(h).toContain("15.11: 1,200 חשיפות");
    const first = h.indexOf('data-bar="2026-11-13"');
    const xOf = (day: string) => Number(new RegExp(`x="([\\d.]+)"[^>]*data-bar="${day}"`).exec(h)![1]);
    expect(first).toBeGreaterThan(-1);
    expect(xOf("2026-11-13")).toBeGreaterThan(xOf("2026-11-15"));
    expect(html(createElement(DailyChart, { days: [] }))).toBe("");
    expect(html(createElement(PerformanceTabView, { campaign: CAMP(), report, creatives, imageBase: BASE }))).toContain("המספרים לכל יום");
  });
  it("per ad: the format, the focal-cropped thumbnail (an outside one not loaded), views / clicks / CTR, \"הכי טובה\" by the rule", () => {
    const h = html(createElement(PerformanceTabView, { campaign: CAMP(), report, creatives, imageBase: BASE }));
    expect(h).toContain('data-report-creatives="2"');
    expect(h).toMatch(/data-report-creative="x1"[\s\S]*?data-report-best/);
    expect(h).not.toMatch(/data-report-creative="x2"[\s\S]*?data-report-best=""[\s\S]*?data-report-by-format/);
    expect(h).toContain("object-position:20% 40%");
    expect(h).not.toContain(FOREIGN);
    expect(h).toContain('data-report-by-format="card,native"');
    expect(h).toContain('href="/api/ads/report?campaign=c1&amp;format=csv"');
    expect(h).toContain('href="/ads/campaigns/c1/print"');
  });
  it("nothing shown yet — said; no chart", () => {
    const h = html(createElement(PerformanceTabView, { campaign: CAMP({ slots: [] }), report: parseReport({}), creatives: [], imageBase: BASE }));
    expect(h).toContain("data-report-empty");
    expect(h).not.toContain("data-daily-chart");
  });
  it("history: the panel's own AD_* rows with their Hebrew labels and what changed; failed — said; none — said", () => {
    const h = html(createElement(HistoryTabView, { history: [
      { action: "AD_CAMPAIGN_STATUS", admin_email: "tal@bloc.co.il", created_at: "2026-11-15T10:00:00Z", entity_type: "ad_campaign", metadata: { status: "active", noise: { a: 1 } } },
      { action: "AD_CREATIVE_SAVE", admin_email: null, created_at: "2026-11-14T10:00:00Z", entity_type: "ad_creative", metadata: { format: "dialog", frames: 2 } },
    ], now: new Date("2026-11-15T12:00:00Z") }));
    expect(h).toContain('data-history="2"');
    expect(h).toContain("מצב קמפיין");
    expect(h).toContain("פרסומת נשמרה");
    expect(h).toContain("מצב: פעיל");
    expect(h).toContain("פורמט: חלון קופץ · תמונות: 2");
    expect(h).toContain("tal@bloc.co.il");
    expect(html(createElement(HistoryTabView, { history: null }))).toContain("data-history-error");
    expect(html(createElement(HistoryTabView, { history: [] }))).toContain("data-history-empty");
    expect(historyFacts({ active: false, name: "x", theme: "dark", banner_position: "top" })).toBe("פעילה: לא · שם: x · סגנון: כהה");
    // the values are Hebrew too — never "active" / "dark" / "top" in the history; an unknown value stays as it is
    expect(historyFacts({ status: "active" })).toBe("מצב: פעיל");
    expect(historyFacts({ status: "paused", banner_position: "top" })).toBe("מצב: מושהה · מיקום: למעלה");
    expect(historyFacts({ format: "dialog", theme: "light" })).toBe("פורמט: חלון קופץ · סגנון: בהיר");
    expect(historyFacts({ status: "weird", theme: "constructor" })).toBe("מצב: weird · סגנון: constructor");
  });
});

// ── מפרסמים, הגדרות, בדיקה ──
describe("advertisers, settings and the user check", () => {
  it("advertisers: a card each (the brand color as an edge), active contracts and campaigns; archived hidden until asked; search", () => {
    const advs = [ADV({ brand_color: "#DC2626", contracts: [{ id: "k1", advertiser_id: "a1", reference: null, pricing: "cpm", price_ils: 50, impression_cap: null, starts_on: "2026-11-01", ends_on: "2026-12-31", status: "active", document_url: null, notes: null, campaigns: 1, views: 0, clicks: 0, value: 0 }] }), ADV({ id: "a2", name: "ישן", archived_at: "2026-10-01T00:00:00Z" })];
    const v = { advertisers: advs, campaigns: [CAMP()], canManage: true, q: "", onQ: noop, showArchived: false, onShowArchived: noop, onNew: noop, imageBase: BASE, today: TODAY };
    const h = html(createElement(AdvertisersListView, v));
    expect(h).toContain('data-advertisers="1"');
    expect(h).toContain("border-inline-start:4px solid #DC2626");
    expect(h).toContain("חוזה פעיל אחד · קמפיין אחד (1 רצים)");
    expect(h).toContain("(1)");   // archived count
    expect(html(createElement(AdvertisersListView, { ...v, showArchived: true }))).toContain('data-advertisers="2"');
    expect(html(createElement(AdvertisersListView, { ...v, q: "zz" }))).toContain('data-advertisers="0"');
  });
  it("advertiser.save always sends every field (the save replaces them all) — the brand color upper-case, junk → empty", () => {
    expect(advertiserPayload("a1", { name: "פיצה", brand_color: "#dc2626", logo_url: OURS(9) })).toEqual({
      action: "advertiser.save", id: "a1", name: "פיצה", legal_name: "", business_id: "", contact_name: "", contact_phone: "", contact_email: "", website: "", notes: "",
      logo_url: OURS(9), brand_color: "#DC2626",
    });
    expect(advertiserPayload(null, { name: "x", brand_color: "red" })).toMatchObject({ brand_color: "", logo_url: "" });
    expect(advertiserPayload(null, { name: "x" })).not.toHaveProperty("id");
  });
  it("review #12 — typing a name over 30 characters: a gentle note under the field (cut in the banner), not an error", () => {
    const A = (name: string) => ({ id: "a1", name, legal_name: null, business_id: null, contact_name: null, contact_phone: null, contact_email: null, website: null, notes: null, archived_at: null, contracts: [], logo_url: null, brand_color: null }) as unknown as AdAdvertiserRow;
    const long = html(createElement(AdvertiserForm, { initial: A("סטודיו היוגה והפילאטיס של השכונה הירוקה"), onSaved: noop, onCancel: noop, imageBase: BASE }));
    expect(long).toContain("data-advertiser-long-name");
    expect(long).toContain("שם ארוך ייחתך בפס");
    expect(html(createElement(AdvertiserForm, { initial: A("פיצה השכונה"), onSaved: noop, onCancel: noop, imageBase: BASE }))).not.toContain("data-advertiser-long-name");
  });
  it("the kill switch asks first, clearly: off → \"כן, לכבות\" (everything stops at once); on → \"כן, להדליק\"", () => {
    const got: string[] = [];
    const k = { enabled: true, canManage: true, confirming: false, busy: false, updatedBy: "tal@bloc.co.il", onAsk: () => got.push("ask"), onConfirm: () => got.push("yes"), onCancel: () => got.push("no") };
    const h = html(createElement(KillSwitchView, k));
    expect(h).toContain('data-kill-switch="on"');
    expect(h).toContain("כיבוי כל הפרסומות");
    expect(h).not.toContain("data-kill-confirm");
    byData(KillSwitchView(k), "data-kill-ask")[0].props.onClick();
    const c = html(createElement(KillSwitchView, { ...k, confirming: true }));
    expect(c).toContain('role="alertdialog"');
    expect(c).toContain("אף דייר בשום בניין לא יראה פרסומת");
    expect(c).toContain("כן, לכבות");
    expect(c).not.toContain("data-kill-ask");   // while asking — only the confirm and cancel
    byData(KillSwitchView({ ...k, confirming: true }), "data-kill-yes")[0].props.onClick();
    byData(KillSwitchView({ ...k, confirming: true }), "data-kill-no")[0].props.onClick();
    expect(got).toEqual(["ask", "yes", "no"]);
    expect(html(createElement(KillSwitchView, { ...k, enabled: false, confirming: true }))).toContain("כן, להדליק");
    expect(html(createElement(KillSwitchView, { ...k, canManage: false }))).not.toContain("data-kill-ask");
  });
  it("the fixed rules mention the dialog in the full-screen slot, and the X without a countdown", () => {
    expect(FIXED_RULES.find((r) => r.key === "full")!.text).toContain("חלון קופץ");
    expect(FIXED_RULES.find((r) => r.key === "close")!.text).toContain("בלי ספירה");
  });
  it("the user check: slot sent only when it is not full (the full request is exactly today's); the result view", () => {
    expect(explainBody(" a@b.co ", "home", "full")).toEqual({ email: "a@b.co", screen: "home" });
    expect(explainBody("a@b.co", "market", "inline")).toEqual({ email: "a@b.co", screen: "market", slot: "inline" });
    const h = html(createElement(ExplainResultView, { view: { title: "טל", who: "דייר", verdict: { tone: "ok", text: "יקבל" }, blockers: [], notes: [], tips: [], campaigns: [{ id: "c1", name: "פיצה", advertiser: "פיצה השכונה", eligible: true, failed: [], formats: ["dialog", "native"] }, { id: "c2", name: "ריק", advertiser: "יוגה", eligible: false, failed: ["אין בקמפיין פרסומת פעילה"], formats: [] }] }, focusCampaign: "c1" }));
    expect(h).toContain("data-ads-explain-focus");
    expect(h).toContain("(הקמפיין הזה)");
    // the formats of its active ads — a chip each, in order; none → no chips
    expect(h).toContain('data-ads-explain-formats="dialog,native"');
    expect(h).toMatch(/data-ads-explain-format="dialog"[^>]*>(?:<[^>]+>)*[^<]*<\/svg>חלון קופץ|data-ads-explain-format="dialog"[\s\S]*?חלון קופץ/);
    expect(h).toContain('data-ads-explain-format="native"');
    expect(h.match(/data-ads-explain-formats=/g)).toHaveLength(1);
  });
});

describe("the small parts (kit)", () => {
  it("StepBar: names, the current one, reachable steps clickable", () => {
    const got: number[] = [];
    const v = { steps: ["א", "ב", "ג"], current: 2, reachable: (n: number) => n !== 3, onStep: (n: number) => got.push(n) };
    const h = html(createElement(StepBar, v));
    expect(h).toMatch(/aria-current="step"[^>]*data-step="2"/);
    expect(h).toMatch(/disabled=""[^>]*data-step="3"/);
    byData(StepBar(v), "data-step", 1)[0].props.onClick();
    expect(got).toEqual([1]);
  });
  it("SaveIndicator: saving / \"נשמר\" / \"לא נשמר — <why>\" with retry / \"ייתכן שנשמר — רעננו\" with refresh; idle — nothing", () => {
    expect(html(createElement(SaveIndicator, { state: "idle" }))).toBe("");
    expect(html(createElement(SaveIndicator, { state: "saving" }))).toContain("שומרים…");
    expect(html(createElement(SaveIndicator, { state: "saved" }))).toContain("נשמר");
    const err = html(createElement(SaveIndicator, { state: "error", error: "חסר שם לקמפיין", onRetry: noop }));
    expect(err).toContain("לא נשמר — חסר שם לקמפיין");
    expect(err).toContain("נסו שוב");
    const un = html(createElement(SaveIndicator, { state: "unclear", onRefresh: noop }));
    expect(un).toContain("ייתכן שנשמר — רעננו");
    expect(un).toContain("רענון");
  });
  it("Segmented (radios), ScrollTabs (counts), placements (none — \"אין מודעה פעילה\"), the sparkline (none — \"—\"), the sticky bar", () => {
    const got: string[] = [];
    const s = { label: "x", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }], value: "a", onChange: (v: string) => got.push(v) };
    // Segmented is generic: createElement would infer T as its constraint (string | number) and refuse onChange (v: string) — TS2769
    // in the verify (16/11). Instantiated for string, like the screens use it.
    expect(html(createElement(Segmented<string>, s))).toMatch(/role="radio" aria-checked="true"[^>]*data-segment="a"/);
    byData(Segmented(s), "data-segment", "b")[0].props.onClick();
    byData(Segmented(s), "data-segment", "a")[0].props.onClick();
    expect(got).toEqual(["b"]);
    expect(html(createElement(ScrollTabs, { label: "t", tabs: [{ key: "x", label: "X", count: 4 }], value: "x", onChange: noop }))).toContain('data-tab-count="4"');
    expect(html(createElement(PlacementIcons, { formats: [] }))).toContain("אין מודעה פעילה");
    expect(html(createElement(PlacementIcons, { formats: ["dialog"] }))).toContain('aria-label="מוצג כ: חלון קופץ"');
    expect(html(createElement(Sparkline, { values: null, label: "x" }))).toContain('data-spark="none"');
    expect(html(createElement(StickyBar, { children: "x" }))).toContain("position:sticky;bottom:0");
  });
});
