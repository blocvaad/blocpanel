// ADS-2ב1 (החלטות 384–391) — המסכים של הסטודיו, מרונדרים לשרת (כמו studio.test.tsx: בלי happy-dom; תצוגות בלי hooks נקראות ישירות,
// ולחיצה היא קריאה אמיתית ל-handler שלהן):
//   • התצוגה: השבב "קוד: SAVE20" עם "העתקה" ושורת המבצע — בכל פורמט חוץ מפס; בסטורי רק בתמונה האחרונה.
//   • הסטודיו: "קופון ומבצע" — שדות, משפט לכל בעיה, השמירה נעצרת, אזהרת הפס, מה הדייר יראה; מודעה שהוצגה — הגיליון הקטן (רק שני השדות).
//   • רשימת המודעות: הקוד, שורת המבצע, "המבצע הסתיים — לא מוצגת", "קופון וסוף מבצע" / "הארכת המבצע" למודעה שהוצגה.
//   • תור הדיווחים: נכשל / חסר SQL / ריק (חדשים / הכל) / רשימה (מושהה בגלל דיווחים — ראשון, באדום); הסינון; ההחלטות והאישור; לקריאה בלבד;
//     אף פעם לא מי דיווח. מסך הבית — התג "3 דיווחים חדשים"; כרטיס — "הושהה בגלל דיווחים". הניווט — "דיווחים".
//   • ההגדרות — ההשהיה האוטומטית; הביצועים — העתקות קוד והדיווחים; "למה לא מוצג?" — hidden.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
import AdPreview, { CouponBlock, AD_COUPON_CLASSES, AD_COUPON_PLACE, BLOC_TOKENS, twStyle, type AdPreviewProps } from "../studio/AdPreview";
import { CreativeStudioView, OfferFields, type CreativeStudioViewProps } from "../studio/CreativeStudio";
import CreativeCard from "../studio/CreativeCard";
import { OfferSheetView, OFFER_LOCKED_TEXT, OFFER_SAVED_TEXT } from "../studio/OfferSheet";
import { ReportsQueueView, ReportGroupCard, ReportsQueueSkeleton, type ReportsQueueViewProps } from "../studio/ReportsQueue";
import { ReportPauseView, parsePause, pauseText, FIXED_RULES, REPORT_PAUSE_SQL_TEXT } from "../studio/StudioSettings";
import { StudioHomeView, CampaignCard, ReportsBadge, type StudioHomeViewProps } from "../studio/StudioHome";
import { PerformanceTabView, ReportsPausedBanner, RESUME_REPORTED_CONFIRM } from "../studio/CampaignStudio";
import { ExplainResultView } from "../studio/ExplainBox";
import { StudioNav } from "../studio/kit";
import { previewFromForm, previewFromCreative } from "../studio/StudioPreview";
import { AD_FORMATS, FORMAT_INFO, type AdFormat } from "@/lib/adsFormats";
import { emptyCreativeForm, offerPayloadFor, type CreativeForm } from "@/lib/adsStudio";
import { parseReport } from "@/lib/ads";
import { parseExplain, explainView, CHECK_FAIL } from "@/lib/adsExplain";
import { groupReports, parseReportRows, type ReportCampaign, type ReportGroup } from "@/lib/adsReports";
import { BANNER_COUPON_TEXT, BANNER_ONLY_COUPON_TEXT, COUPON_INVALID_TEXT, OFFER_PAST_TEXT } from "@/lib/adsOffer";
import type { AdAdvertiserRow, AdCampaignRow, AdCreativeRow } from "@/lib/adsServer";

const html = (el: any) => renderToStaticMarkup(el);
type El = { type: any; props: any };
const kids = (n: any): any[] => (n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(kids) : [n]);
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
/** the whole opening tag that carries attr (attribute order does not matter). */
const tag = (h: string, attr: string) => { const i = h.indexOf(attr); return i < 0 ? "" : h.slice(h.lastIndexOf("<", i), h.indexOf(">", i) + 1); };

const BASE = "https://abc.supabase.co/storage/v1/object/public/ads/";
const OURS = (n: number) => `${BASE}creatives/2026-11/${n}.webp`;
const TODAY = "2026-11-16";
const FIX = join(process.cwd(), "tests", "fixtures", "ads2b");
const fixture = (f: string) => JSON.parse(readFileSync(join(FIX, f), "utf8"));
const P = (o: Partial<AdPreviewProps> = {}): AdPreviewProps => ({
  format: "card", advertiser: "קפה השכונה", headline: "קפה ומאפה ב-20% הנחה", body: "כל הבוקר", ctaLabel: "לפרטים",
  imageUrl: OURS(1), imageAlt: "קפה", imageBase: BASE, coupon: "SAVE20", offerEndsOn: "2026-11-30", today: TODAY, ...o,
});
const twoFrames = [{ imageUrl: OURS(1), imageAlt: "א", caption: null }, { imageUrl: OURS(2), imageAlt: "ב", caption: null }];

// ── התצוגה ──
describe("the preview: the coupon chip and the offer line — exactly bloc's words", () => {
  it("card / dialog / fullscreen / native / carousel: \"קוד: SAVE20\" + \"העתקה\", and \"המבצע עד 30/11\", above the button", () => {
    for (const f of ["card", "dialog", "fullscreen", "native", "carousel"] as AdFormat[]) {
      const h = html(createElement(AdPreview, P({ format: f, frames: FORMAT_INFO[f].frames ? twoFrames : null })));
      expect(h, f).toContain('data-ad-preview-coupon="SAVE20"');
      expect(h, f).toMatch(/>קוד:<\/span><span dir="ltr" data-ad-preview-coupon-code=""[^>]*>SAVE20<\/span>/);
      expect(h, f).toContain(">העתקה</span>");
      expect(h, f).toContain("המבצע עד 30/11");
      expect(h.indexOf("data-ad-preview-coupon="), f).toBeLessThan(h.lastIndexOf("data-ad-preview-cta"));
    }
  });
  it("banner: never a chip or an offer line (no room) — even with both set", () => {
    const h = html(createElement(AdPreview, P({ format: "banner", bannerPosition: "bottom" })));
    expect(h).not.toContain("data-ad-preview-coupon");
    expect(h).not.toContain("המבצע");
  });
  it("story: only on the last frame — and a hint under the preview on the others", () => {
    const first = html(createElement(AdPreview, P({ format: "story", frames: twoFrames, frame: 0, onFrame: noop })));
    expect(first).not.toContain("data-ad-preview-coupon=");
    expect(first).toContain("בסטורי הקוד והמבצע מופיעים בתמונה האחרונה.");
    const last = html(createElement(AdPreview, P({ format: "story", frames: twoFrames, frame: 1, onFrame: noop })));
    expect(last).toContain('data-ad-preview-coupon="SAVE20"');
    expect(last).not.toContain("data-ad-preview-coupon-where");
  });
  it("today / tomorrow / another year (helpers.json); an ended offer — NOTHING, not even the code (388a, as bloc); an invalid code — no chip", () => {
    expect(html(createElement(AdPreview, P({ offerEndsOn: TODAY })))).toContain("המבצע מסתיים היום");
    expect(html(createElement(AdPreview, P({ offerEndsOn: "2026-11-17" })))).toContain("המבצע מסתיים מחר");
    expect(html(createElement(AdPreview, P({ offerEndsOn: "2027-01-05" })))).toContain("המבצע עד 5/1/2027");
    for (const f of ["card", "dialog", "fullscreen", "native"] as AdFormat[]) {
      const ended = html(createElement(AdPreview, P({ format: f, offerEndsOn: "2026-11-15" })));
      expect(ended, f).not.toContain("data-ad-preview-coupon");
      expect(ended, f).not.toContain("SAVE20");
    }
    expect(CouponBlock({ code: "SAVE20", offerEndsOn: "2026-11-15", today: TODAY, tone: "light" })).toBeNull();
    // and no room kept for it: the card's frame and the mock list are as without a coupon
    const cardW = (h: string) => /style="width:(\d+)px;display:flex;flex-direction:column" data-ad-preview-card=""/.exec(h)?.[1];
    expect(cardW(html(createElement(AdPreview, P({ offerEndsOn: "2026-11-15" }))))).toBe(cardW(html(createElement(AdPreview, P({ coupon: null, offerEndsOn: null })))));
    const list = (h: string) => [1, 2, 3, 4].filter((n) => h.includes(`data-ad-preview-list-item="${n}"`));
    expect(list(html(createElement(AdPreview, P({ format: "native", offerEndsOn: "2026-11-15" }))))).toEqual([1, 2, 3, 4]);
    expect(html(createElement(AdPreview, P({ coupon: "SAVE 20", offerEndsOn: null })))).not.toContain("data-ad-preview-coupon");
  });
  it("only an offer, no code: the line alone; nothing — nothing", () => {
    const h = html(createElement(AdPreview, P({ coupon: null })));
    expect(h).toContain('data-ad-preview-coupon=""');
    expect(h).not.toContain("data-ad-preview-coupon-chip");
    expect(h).toContain("המבצע עד 30/11");
    expect(html(createElement(AdPreview, P({ coupon: null, offerEndsOn: null })))).not.toContain("data-ad-preview-coupon");
    expect(CouponBlock({ code: null, offerEndsOn: null, today: TODAY, tone: "light" })).toBeNull();
  });
  it("bloc's AdCoupon, token for token: no fill; dark — white dashes / white-16% button; light — var(--ink-faint) dashes / brand-light button with brand text", () => {
    const dark = html(createElement(CouponBlock, { code: "A1", offerEndsOn: null, today: TODAY, tone: "dark" }));
    expect(tag(dark, "data-ad-preview-coupon-chip")).toContain("border:1.5px dashed rgba(255,255,255,0.6);color:#FFFFFF");
    expect(tag(dark, "data-ad-preview-coupon-chip")).not.toContain("background");
    expect(tag(dark, "data-ad-preview-coupon-copy")).toContain("background:rgba(255,255,255,0.16);color:#FFFFFF");
    const light = html(createElement(CouponBlock, { code: "A1", offerEndsOn: "2026-11-30", today: TODAY, tone: "light" }));
    expect(tag(light, "data-ad-preview-coupon-chip")).toContain("border:1.5px dashed var(--ink-faint);color:var(--ink)");
    expect(tag(light, "data-ad-preview-coupon-copy")).toContain("background:var(--brand-light);color:var(--brand)");
    // bloc's tokens on the root, so the var()s resolve exactly as in the app
    expect(tag(light, "data-ad-preview-coupon=")).toContain("--ink:#0F172A;--ink-soft:#475569;--ink-faint:#94A3B8;--ink-desc:#0F172A;--brand:#1D4ED8;--brand-light:#EFF6FF");
    // on a light background bloc's globals.css draws var(--ink-soft) text in the description voice: #0F172A, weight 400
    expect(tag(light, "data-ad-preview-offer")).toContain("font-size:13px;font-weight:400;line-height:1.375;color:var(--ink-desc);font-family:Assistant, Heebo");
    expect(light).toMatch(/font-size:15px;font-weight:400;color:var\(--ink-desc\);font-family:Assistant, Heebo[^"]*">קוד:</);
    // the tone follows bloc: card / fullscreen / story dark; dialog / native / carousel — the ad's theme
    expect(html(createElement(AdPreview, P({ format: "dialog", theme: "dark" })))).toContain("border:1.5px dashed rgba(255,255,255,0.6)");
    expect(html(createElement(AdPreview, P({ format: "native", theme: "light" })))).toContain("border:1.5px dashed var(--ink-faint)");
    expect(html(createElement(AdPreview, P({ format: "card", theme: "light" })))).toContain("border:1.5px dashed rgba(255,255,255,0.6)");
  });
  it("the sizes as the app draws them: chip ≥ 48px, radius 14; the code 16px mono 900, never cut (break-all); the button ≥ 44px, 15px 900; label 15px; line 13px", () => {
    const h = html(createElement(CouponBlock, { code: "WINTER-SALE-26-FAMILY-12", offerEndsOn: "2026-11-30", today: TODAY, tone: "dark" }));
    const chip = tag(h, "data-ad-preview-coupon-chip");
    expect(chip).toContain("min-height:48px");
    expect(chip).toContain("border-radius:14px");
    expect(chip).toContain("padding-top:4px;padding-bottom:4px;padding-left:4px;padding-right:12px");
    const code = tag(h, "data-ad-preview-coupon-code");
    expect(code).toContain("word-break:break-all");
    expect(code).toContain("font-size:16px");
    expect(code).toContain("font-weight:900");
    expect(code).toContain("text-align:end");
    expect(code).toContain("line-height:1.375");   // B1: a wrapped code keeps tight lines
    expect(h).toMatch(/flex-shrink:0;font-size:15px;font-weight:700[^"]*">קוד:</);   // B1: "קוד:" never squeezed by a long code
    expect(code).not.toMatch(/text-overflow|white-space:nowrap|overflow:hidden/);
    expect(h).toContain(">WINTER-SALE-26-FAMILY-12</span>");
    const btn = tag(h, "data-ad-preview-coupon-copy");
    expect(btn).toContain("min-height:44px");
    expect(btn).toContain("font-size:15px");
    expect(btn).toContain("border-radius:11px");
    expect(h).toMatch(/font-size:15px;font-weight:700[^"]*">קוד:</);
    expect(h).toMatch(/font-size:13px;font-weight:700;line-height:1.375[^"]*" data-ad-preview-offer=""|data-ad-preview-offer=""[^>]*font-size:13px/);
  });
  it("placement as bloc: mt-3 above the button (the preview's own gaps counted), mx-3.5 mt-2.5 under the carousel frames", () => {
    expect(tag(html(createElement(AdPreview, P({ format: "card" }))), "data-ad-preview-coupon=")).toContain("margin-top:12px");
    expect(tag(html(createElement(AdPreview, P({ format: "dialog" }))), "data-ad-preview-coupon=")).toContain("margin-top:6px");   // + gap 6
    expect(tag(html(createElement(AdPreview, P({ format: "fullscreen" }))), "data-ad-preview-coupon=")).toContain("margin-top:4px");  // + gap 8
    expect(tag(html(createElement(AdPreview, P({ format: "native" }))), "data-ad-preview-coupon=")).toContain("margin-top:7px");     // + gap 5
    expect(tag(html(createElement(AdPreview, P({ format: "carousel", frames: twoFrames }))), "data-ad-preview-coupon=")).toContain("margin-left:14px;margin-right:14px;margin-top:10px");
  });
  it("twStyle knows exactly AdCoupon's classes (an unknown one is an error, never a guess)", () => {
    for (const c of Object.values(AD_COUPON_CLASSES)) expect(() => twStyle(c)).not.toThrow();
    expect(() => twStyle("bg-red-500")).toThrow(/unknown class/);
    expect(twStyle("gap-1.5 mt-2.5 mx-3.5 text-[14px] text-[16px]")).toEqual({ gap: "6px", marginTop: "10px", marginLeft: "14px", marginRight: "14px", fontSize: "16px" });
  });
  it("native / carousel: the coupon makes the ad taller — the mock list scrolls one more item, so the button stays above the navigation", () => {
    const items = (h: string) => [1, 2, 3, 4].filter((n) => h.includes(`data-ad-preview-list-item="${n}"`));
    expect(items(html(createElement(AdPreview, P({ format: "native" }))))).toEqual([2, 3, 4]);
    expect(items(html(createElement(AdPreview, P({ format: "native", coupon: null, offerEndsOn: null }))))).toEqual([1, 2, 3, 4]);
    expect(items(html(createElement(AdPreview, P({ format: "carousel", frames: twoFrames }))))).toEqual([3, 4]);
    expect(items(html(createElement(AdPreview, P({ format: "carousel", frames: twoFrames, coupon: null, offerEndsOn: null }))))).toEqual([2, 3, 4]);
  });
  it("the card's frame gets smaller to make room (4:5 stays)", () => {
    const w = (h: string) => Number(/style="width:(\d+)px;display:flex;flex-direction:column" data-ad-preview-card=""/.exec(h)?.[1] ?? NaN);
    const withCode = html(createElement(AdPreview, P()));
    const without = html(createElement(AdPreview, P({ coupon: null, offerEndsOn: null })));
    expect(w(withCode)).toBeLessThan(w(without));
  });
});

// ── הסטודיו ──
const form = (o: Partial<CreativeForm> = {}): CreativeForm => ({
  ...emptyCreativeForm((i) => `k${i}`), image: { image_url: OURS(1), image_alt: "קפה ומאפה", focal: [0.5, 0.5] }, headline: "קפה ב-20%", cta_label: "לפרטים",
  cta_url: "https://cafe.example", ...o,
});
const SP = (o: Partial<CreativeStudioViewProps> = {}): CreativeStudioViewProps => ({
  mode: "new", served: false, form: form(), onForm: noop, advertiser: "קפה השכונה", advertiserLogo: null, brandColor: null, imageBase: BASE,
  separate: false, onSeparate: noop, editFormat: "card", onEditFormat: noop, boxes: {}, onPick: noop, frameSel: 0, onFrameSel: noop, refusedFrame: null, onAddFrame: noop,
  batch: null, busy: false, err: null, stale: false, onCreate: noop, onRetry: noop, onSave: noop, onDuplicate: noop, onRecheck: noop, today: TODAY, animate: false, ...o,
});

describe("the creative studio: \"קופון ומבצע (לא חובה)\"", () => {
  it("the section: both fields (the code LTR in capitals, the date with today as the minimum), and the preview shows the chip", () => {
    const h = html(createElement(CreativeStudioView, SP({ form: form({ coupon_code: "SAVE20", offer_ends_on: "2026-11-30" }) })));
    expect(h).toContain("5. קופון ומבצע (לא חובה)");
    expect(h).toContain("קוד קופון (לא חובה)");
    expect(h).toContain("סוף המבצע (לא חובה)");
    expect(h).toMatch(/dir="ltr" autoCapitalize="characters"[^>]*placeholder="SAVE20"[^>]*value="SAVE20"|value="SAVE20"[^>]*dir="ltr"/);
    expect(h).toMatch(/type="date"[^>]*min="2026-11-16"|min="2026-11-16"[^>]*type="date"/);
    expect(h).toContain("הדייר יראה: <b");
    expect(h).toContain("המבצע עד 30/11</b>. אחרי היום הזה המודעה מפסיקה להופיע");
    expect(h).toContain('data-ad-preview-coupon="SAVE20"');
    expect(tag(h, 'data-creative-create="1"')).toMatch(/opacity:1/);
    expect(tag(h, 'data-creative-create="1"')).not.toContain("disabled");
  });
  it("typing upper-cases the code; clearing the date", () => {
    const got: Array<Partial<CreativeForm>> = [];
    const tree = CreativeStudioView(SP({ form: form({ offer_ends_on: "2026-11-30" }), onForm: (f) => got.push({ coupon_code: f.coupon_code, offer_ends_on: f.offer_ends_on }) }));
    byData(tree, "data-creative-field", "coupon_code")[0].props.onChange({ target: { value: "save-20" } });
    byData(tree, "data-offer-clear")[0].props.onClick();
    expect(got).toEqual([{ coupon_code: "SAVE-20", offer_ends_on: "2026-11-30" }, { coupon_code: "", offer_ends_on: "" }]);
  });
  it("a bad code / an ended offer: the Hebrew sentence under the field AND once in the issues — and creating is blocked", () => {
    const h = html(createElement(CreativeStudioView, SP({ form: form({ coupon_code: "SAVE 20", offer_ends_on: "2026-11-15" }) })));
    expect(h).toContain(`data-offer-issue="coupon_code">${COUPON_INVALID_TEXT}`);
    expect(h).toContain(`data-offer-issue="offer_ends_on">${OFFER_PAST_TEXT}`);
    expect(h).toContain(`קופון ומבצע:</b> ${COUPON_INVALID_TEXT} ${OFFER_PAST_TEXT}`);
    expect(h).toMatch(/data-creative-create="1"[^>]*disabled=""|disabled=""[^>]*data-creative-create="1"/);
  });
  it("a banner with a code: the warning (\"בפס הקוד לא מוצג\") — banner alone says to add a format; saving is NOT blocked (bloc saves it)", () => {
    const both = html(createElement(CreativeStudioView, SP({ form: form({ formats: ["card", "banner"], coupon_code: "SAVE20" }) })));
    expect(both).toContain(BANNER_COUPON_TEXT);
    const alone = html(createElement(CreativeStudioView, SP({ form: form({ formats: ["banner"], coupon_code: "SAVE20" }) })));
    expect(alone).toContain(BANNER_ONLY_COUPON_TEXT);
    expect(alone).not.toContain("קופון ומבצע:</b>");
    expect(html(createElement(CreativeStudioView, SP({ form: form({ formats: ["banner"] }) })))).not.toContain("data-creative-banner-coupon");
  });
  it("an offer after the campaign's end: allowed, and said (serving stops at the campaign's end)", () => {
    const h = html(createElement(OfferFields, { coupon: "", offerEndsOn: "2026-12-20", onChange: noop, today: TODAY, formats: ["card"], campaignEndsOn: "2026-11-30" }));
    expect(h).toContain("הקמפיין מסתיים לפני סוף המבצע — ההצגה נעצרת בסוף הקמפיין.");
    expect(html(createElement(OfferFields, { coupon: "", offerEndsOn: "2026-11-20", onChange: noop, today: TODAY, formats: ["card"], campaignEndsOn: "2026-11-30" }))).not.toContain("data-offer-after-campaign");
  });
  it("edit mode: the heading without the step number; locked (served): the fields are disabled inside the locked form", () => {
    expect(html(createElement(CreativeStudioView, SP({ mode: "edit" })))).toContain(">קופון ומבצע</h3>");
    const locked = html(createElement(CreativeStudioView, SP({ mode: "edit", served: true })));
    expect(locked).toMatch(/<fieldset disabled=""/);
  });
});

// ── רשימת המודעות והגיליון של מודעה שהוצגה ──
const CR = (o: Partial<AdCreativeRow> = {}): AdCreativeRow => ({
  id: "cr1", campaign_id: "00000000-0000-4000-e000-000000000001", image_url: OURS(1), image_alt: "קפה", headline: "קפה ב-20%", body: null, cta_label: "לפרטים",
  cta_url: "https://cafe.example", active: true, created_at: "", format: "card", banner_position: null, theme: "light", accent: "#0E7C66", focal_x: 0.5, focal_y: 0.4,
  frames: null, coupon_code: "SAVE20", offer_ends_on: "2026-11-30", ...o,
});
const card = (c: AdCreativeRow, served = 0, o: Record<string, unknown> = {}) =>
  html(createElement(CreativeCard, { c, served, imageBase: BASE, canManage: true, busy: false, onToggle: noop, onEdit: noop, onDuplicate: noop, onDelete: noop, today: TODAY, ...o }));

describe("the creative list: the code, the offer line, \"המבצע הסתיים\"", () => {
  it("the code (dashed, LTR) and the line", () => {
    const h = card(CR());
    expect(h).toContain('data-creative-coupon="SAVE20"');
    expect(h).toMatch(/קוד: <bdi dir="ltr"[^>]*>SAVE20<\/bdi>/);
    expect(h).toContain("המבצע עד 30/11");
    expect(h).not.toContain("data-creative-offer-ended");
  });
  it("an ended offer: \"המבצע הסתיים — לא מוצגת\" (and no line)", () => {
    const h = card(CR({ offer_ends_on: "2026-11-15" }));
    expect(h).toContain("המבצע הסתיים — לא מוצגת");
    expect(h).not.toContain("data-creative-offer-line");
  });
  it("served + can manage: \"קופון וסוף מבצע\" (ended: \"הארכת המבצע\") instead of edit; not served — edit, no offer button", () => {
    const asked: number[] = [];
    const served = card(CR(), 12, { onOffer: () => asked.push(1) });
    expect(served).toContain(">קופון וסוף מבצע</button>");
    expect(served).toContain("הקוד וסוף המבצע — עדיין משתנים");
    expect(served).not.toContain("data-creative-edit");
    expect(card(CR({ offer_ends_on: "2026-11-01" }), 12, { onOffer: noop })).toContain(">הארכת המבצע</button>");
    const fresh = card(CR(), 0, { onOffer: noop });
    expect(fresh).toContain("data-creative-edit");
    expect(fresh).not.toContain("data-creative-offer-edit");
    const tree = CreativeCard({ c: CR(), served: 12, imageBase: BASE, canManage: true, busy: false, onToggle: noop, onEdit: noop, onDuplicate: noop, onDelete: noop, today: TODAY, onOffer: () => asked.push(1) });
    byData(tree, "data-creative-offer-edit")[0].props.onClick();
    expect(asked).toEqual([1]);
    expect(card(CR(), 12, { onOffer: noop, canManage: false })).not.toContain("data-creative-offer-edit");
  });
  it("no code, no offer — no offer row at all", () => {
    expect(card(CR({ coupon_code: null, offer_ends_on: null }))).not.toContain("data-creative-offer=");
  });
});

describe("the small sheet for a served ad: only the code and the offer end", () => {
  const sheet = (o: Record<string, unknown> = {}) => ({ creative: CR(), coupon: "SAVE20", offerEndsOn: "2026-11-30", onChange: noop, today: TODAY, campaignEndsOn: "2026-12-31", busy: false, err: null, onSave: noop, onCancel: noop, ...o });
  it("says what changes; save only when something changed and both are valid", () => {
    const same = html(createElement(OfferSheetView, sheet()));
    expect(same).toContain("המודעה כבר הוצגה, ולכן רק הקוד וסוף המבצע משתנים");
    expect(same).toMatch(/data-offer-save=""[^>]*disabled=""|disabled=""[^>]*data-offer-save=""/);
    const longer = html(createElement(OfferSheetView, sheet({ offerEndsOn: "2026-12-15" })));
    expect(longer).not.toMatch(/data-offer-save=""[^>]*disabled=""|disabled=""[^>]*data-offer-save=""/);
    const bad = html(createElement(OfferSheetView, sheet({ coupon: "-X" })));
    expect(bad).toMatch(/data-offer-save=""[^>]*disabled=""|disabled=""[^>]*data-offer-save=""/);
    expect(bad).toContain(COUPON_INVALID_TEXT);
    const saved: number[] = [];
    byData(OfferSheetView(sheet({ offerEndsOn: "2026-12-15", onSave: () => saved.push(1) })), "data-offer-save")[0].props.onClick();
    expect(saved).toEqual([1]);
    expect(html(createElement(OfferSheetView, sheet({ err: OFFER_LOCKED_TEXT })))).toContain(OFFER_LOCKED_TEXT);
    expect(OFFER_SAVED_TEXT).toBe("הקוד וסוף המבצע נשמרו.");
  });
  it("the payload: the stored values exactly (from the row, not a form) + the new code and date — frames as stored (focal when set)", () => {
    expect(offerPayloadFor(CR(), { coupon_code: " winter-26 ", offer_ends_on: "2026-12-15" })).toEqual({
      action: "creative.save", id: "cr1", campaign_id: "00000000-0000-4000-e000-000000000001", format: "card", banner_position: null,
      image_url: OURS(1), image_alt: "קפה", focal_x: 0.5, focal_y: 0.4, headline: "קפה ב-20%", body: "", cta_label: "לפרטים", cta_url: "https://cafe.example",
      theme: "light", accent: "#0E7C66", frames: null, coupon_code: "WINTER-26", offer_ends_on: "2026-12-15",
    });
    const carousel = CR({ format: "carousel", frames: [
      { image_url: OURS(1), image_alt: "א", caption: "ראשון", cta_url: "https://a.example", focal: [0.5, 0.5] },
      { image_url: OURS(2), image_alt: "ב", caption: null, cta_url: null, focal: null },
    ] });
    expect(offerPayloadFor(carousel, { coupon_code: "", offer_ends_on: "" }).frames).toEqual([
      { image_url: OURS(1), image_alt: "א", caption: "ראשון", cta_url: "https://a.example", focal: [0.5, 0.5] },
      { image_url: OURS(2), image_alt: "ב" },
    ]);
    expect(offerPayloadFor(carousel, { coupon_code: "", offer_ends_on: "" })).toMatchObject({ coupon_code: null, offer_ends_on: null });
    expect(offerPayloadFor(CR({ format: "banner", banner_position: "top" }), { coupon_code: "A1", offer_ends_on: "" })).toMatchObject({ banner_position: "top" });
  });
});

// ── תור הדיווחים ──
const queue = fixture("queue_rows.json");
const QCAMP = (o: Partial<ReportCampaign> = {}): ReportCampaign => ({
  id: queue.campaign.id, name: "מבצע חורף — כרטיס", status: "paused", advertiser: "קפה השכונה", advertiser_logo: null, advertiser_color: "#0E7C66",
  paused_by_reports_at: queue.campaign.paused_by_reports_at, ...o,
});
const groups = (o: Partial<ReportCampaign> = {}, rows = parseReportRows(queue.rows)): ReportGroup[] => groupReports(rows, [QCAMP(o)], [
  { id: "00000000-0000-4000-f000-000000000012", campaign_id: queue.campaign.id, image_url: OURS(3), image_alt: "פס", focal_x: 0.5, focal_y: 0.5, format: "banner", active: true, headline: "פס" },
]);
const NOW = new Date("2026-11-16T10:30:00Z");
const QV = (o: Partial<ReportsQueueViewProps> = {}): ReportsQueueViewProps => ({
  state: "ok", groups: groups(), filter: "new", onFilter: noop, canManage: true, imageBase: BASE, busy: null, confirming: null,
  onAsk: noop, onConfirm: noop, onCancel: noop, notice: null, err: null, unclear: false, onRetry: noop, now: NOW, ...o,
});

describe("the reports queue — loading, failed, missing SQL, empty, the list", () => {
  it("loading: skeletons (aria-busy)", () => {
    expect(html(createElement(ReportsQueueSkeleton))).toContain('data-reports-queue="loading" aria-busy="true"');
  });
  it("failed: a read failure with \"נסו שוב\" (never an empty queue); missing SQL 231: said — three different states", () => {
    const retried: number[] = [];
    const failed = html(createElement(ReportsQueueView, QV({ state: "error", groups: [] })));
    expect(failed).toContain('data-reports-queue="error"');
    expect(failed).toContain("לא הצלחנו לטעון את הדיווחים");
    expect(failed).not.toContain("data-reports-empty");
    byData(ReportsQueueView(QV({ state: "error", groups: [], onRetry: () => retried.push(1) })), "data-reports-retry")[0].props.onClick();
    expect(retried).toEqual([1]);
    const missing = html(createElement(ReportsQueueView, QV({ state: "missing", groups: [] })));
    expect(missing).toContain("תור הדיווחים יופיע אחרי SQL 231 של bloc.");
    expect(missing).not.toContain("data-reports-empty");
  });
  it("empty: \"חדשים\" — nothing waiting (and a way to all); \"הכל\" — nothing ever reported", () => {
    const allClosed = groups({ status: "active", paused_by_reports_at: null }, parseReportRows(queue.rows).map((r) => ({ ...r, status: "dismissed" as const })));
    const h = html(createElement(ReportsQueueView, QV({ groups: allClosed })));
    expect(h).toContain('data-reports-empty="new"');
    expect(h).toContain("אין דיווחים שמחכים לבדיקה.");
    expect(h).toContain("קמפיין שמגיע למספר הדיווחים החמורים שבהגדרות (מדיווחים שעוד לא נבדקו) מושהה מעצמו");   // review #6
    expect(h).toContain("לכל הדיווחים (קמפיין אחד)");
    const none = html(createElement(ReportsQueueView, QV({ groups: [], filter: "all" })));
    expect(none).toContain("עוד לא דווח על אף פרסומת.");
    expect(none).not.toContain("data-reports-show-all");
  });
  it("the list: the header + nav (\"דיווחים\" with the open count), the filter with the pending count, the privacy line", () => {
    const h = html(createElement(ReportsQueueView, QV()));
    expect(h).toContain(">דיווחים</h1>");
    expect(h).toContain('data-studio-nav="reports"');
    expect(h).toContain('data-studio-nav-count="3"');
    expect(h).toMatch(/data-segment="new"[^>]*>חדשים · 1</);
    expect(h).toContain("בלי פרטים על מי דיווח: לא שם, לא בניין ולא עיר.");
  });
  it("a group paused by reports: red, the state, counts per reason (the open ones), the notes with reason + date — never who", () => {
    const h = html(createElement(ReportsQueueView, QV()));
    expect(h).toContain('data-report-state="paused_reports"');
    expect(h).toMatch(/data-report-state="paused_reports"[^>]*style="[^"]*border-color:rgba\(239,68,68,.6\)/);
    expect(h).toContain("הושהה אוטומטית בגלל דיווחים");
    expect(h).toContain('data-report-reasons="misleading,offensive,scam"');
    expect(h).toMatch(/data-report-reason="misleading" data-report-reason-count="1"/);
    expect(h).toContain("3 דיווחים פתוחים · 3 חמורים");
    expect(h).toContain("ההנחה לא כובדה בקופה");
    expect(h).not.toContain("כל יום אותה פרסומת");   // a closed note — only under "הכל"
    expect(h).toContain(`src="${OURS(3)}"`);         // the creative of the newest report
    expect(h).not.toMatch(/user_id|building_id|serve_id|נועה|הרצל/);
  });
  it("the counts follow the filter: \"חדשים\" counts the open ones of a reason, \"הכל\" all of them", () => {
    const rows = [...parseReportRows(queue.rows), { ...parseReportRows(queue.rows)[0], id: "old", status: "dismissed" as const, created_at: "2026-11-10T08:00:00Z" }];
    const gs = groups({}, rows);
    expect(html(createElement(ReportsQueueView, QV({ groups: gs })))).toMatch(/data-report-reason="misleading" data-report-reason-count="1"/);
    expect(html(createElement(ReportsQueueView, QV({ groups: gs, filter: "all" })))).toMatch(/data-report-reason="misleading" data-report-reason-count="2"/);
  });
  it("\"הכל\": every reason with totals, the closed note with its status", () => {
    const h = html(createElement(ReportsQueueView, QV({ filter: "all" })));
    expect(h).toMatch(/data-report-reason="too_often" data-report-reason-count="1"/);
    expect(h).toContain("כל יום אותה פרסומת");
    expect(h).toContain('data-report-note-status="dismissed"');
    expect(h).toContain("4 דיווחים · 3 פתוחים");
  });
  it("decisions: paused by reports — \"בדקנו — תקין\" / \"להשאיר מושהה\"; asking shows the sentence; yes / no call back", () => {
    const asked: string[] = [];
    const tree = ReportsQueueView(QV({ onAsk: (_g, d) => asked.push(d) }));
    expect(byData(tree, "data-report-decision").map((e) => e.props["data-report-decision"])).toEqual(["dismiss", "keep_paused"]);
    byData(tree, "data-report-decision", "keep_paused")[0].props.onClick();
    expect(asked).toEqual(["keep_paused"]);
    const done: string[] = [];
    const confirm = ReportsQueueView(QV({ confirming: { campaignId: queue.campaign.id, decision: "dismiss" }, onConfirm: () => done.push("yes"), onCancel: () => done.push("no") }));
    const h = html(createElement(ReportsQueueView, QV({ confirming: { campaignId: queue.campaign.id, decision: "dismiss" } })));
    expect(h).toContain('role="alertdialog"');
    expect(h).toContain("לסגור את 3 הדיווחים הפתוחים כתקינים ולהחזיר את הקמפיין לפעול? הוא יחזור להיות מוצג לדיירים מיד.");
    expect(h).toContain(">כן, בדקנו — תקין</button>");
    expect(h).not.toContain("data-report-decisions");
    byData(confirm, "data-report-yes")[0].props.onClick();
    byData(confirm, "data-report-no")[0].props.onClick();
    expect(done).toEqual(["yes", "no"]);
  });
  it("an active campaign: \"להשהות\" in red; one decision at a time (others disabled while busy)", () => {
    const g = groups({ status: "active", paused_by_reports_at: null })[0];
    const h = html(createElement(ReportGroupCard, { g, filter: "new", canManage: true, imageBase: BASE, busy: false, anyBusy: false, confirming: null, onAsk: noop, onConfirm: noop, onCancel: noop, now: NOW }));
    expect(h).toContain('data-report-decisions="dismiss,pause"');
    expect(h).toMatch(/data-report-decision="pause"[^>]*color:var\(--red\)/);
    const busy = html(createElement(ReportGroupCard, { g, filter: "new", canManage: true, imageBase: BASE, busy: false, anyBusy: true, confirming: null, onAsk: noop, onConfirm: noop, onCancel: noop, now: NOW }));
    expect((busy.match(/disabled=""/g) ?? []).length).toBe(2);
  });
  it("read-only: no decisions — said once; the notice / error banners; an unclear answer offers a refresh", () => {
    const ro = html(createElement(ReportsQueueView, QV({ canManage: false })));
    expect(ro).toContain("רק מנהלים יכולים להחליט על דיווחים.");
    expect(ro).not.toContain("data-report-decision");
    expect(html(createElement(ReportsQueueView, QV({ notice: "3 דיווחים נסגרו. הקמפיין חזר לפעול." })))).toContain("data-reports-notice");
    const unclear = html(createElement(ReportsQueueView, QV({ err: "התשובה מהשרת לא ברורה", unclear: true })));
    expect(unclear).toContain("data-reports-recheck");
    expect(html(createElement(ReportsQueueView, QV({ err: "הקמפיין לא נמצא", unclear: false })))).not.toContain("data-reports-recheck");
  });
  it("320px: the groups grid never asks for more than the screen (min(320px,100%)); the card wraps long names", () => {
    const h = html(createElement(ReportsQueueView, QV()));
    expect(h).toContain("grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))");
    expect(h).toContain("overflow-wrap:anywhere");
  });
});

// ── ההגדרות ──
describe("settings: the auto-pause (report_pause_at)", () => {
  it("the field as the plan words it, the steps (44px), what it means; save only when changed", () => {
    const h = html(createElement(ReportPauseView, { value: "3", saved: 3, canManage: true, busy: false, onChange: noop, onSave: noop }));
    expect(h).toContain("השהיה אוטומטית אחרי");
    expect(h).toContain("דיווחים חמורים בשבוע (0 — כבוי)");
    expect(h).toMatch(/data-report-pause-step="-1"/);
    expect(h).toMatch(/width:44px;height:44px/);
    expect(h).toContain(pauseText(3));
    expect(h).toMatch(/data-report-pause-save=""[^>]*disabled=""|disabled=""[^>]*data-report-pause-save=""/);
    const changed = html(createElement(ReportPauseView, { value: "5", saved: 3, canManage: true, busy: false, onChange: noop, onSave: noop }));
    expect(changed).not.toMatch(/data-report-pause-save=""[^>]*disabled=""|disabled=""[^>]*data-report-pause-save=""/);
  });
  it("the steps: −1 / +1 within 0..20", () => {
    const got: string[] = [];
    const tree = ReportPauseView({ value: "3", saved: 3, canManage: true, busy: false, onChange: (v) => got.push(v), onSave: noop });
    byData(tree, "data-report-pause-step", "-1")[0].props.onClick();
    byData(tree, "data-report-pause-step", "1")[0].props.onClick();
    expect(got).toEqual(["2", "4"]);
    const top = html(createElement(ReportPauseView, { value: "20", saved: 20, canManage: true, busy: false, onChange: noop, onSave: noop }));
    expect(top).toMatch(/disabled=""[^>]*data-report-pause-step="1"/);
    // the steps stay inside 0..20 even if called at the edge (the buttons are disabled there too)
    const edge: string[] = [];
    byData(ReportPauseView({ value: "20", saved: 20, canManage: true, busy: false, onChange: (v) => edge.push(v), onSave: noop }), "data-report-pause-step", "1")[0].props.onClick();
    byData(ReportPauseView({ value: "0", saved: 0, canManage: true, busy: false, onChange: (v) => edge.push(v), onSave: noop }), "data-report-pause-step", "-1")[0].props.onClick();
    expect(edge).toEqual(["20", "0"]);
  });
  it("a wrong value — the sentence, no save; 0 — off; before SQL 231 — said; read-only — the sentence only", () => {
    const bad = html(createElement(ReportPauseView, { value: "25", saved: 3, canManage: true, busy: false, onChange: noop, onSave: noop }));
    expect(bad).toContain("מספר שלם בין 0 ל-20 (0 — כבוי).");
    expect(html(createElement(ReportPauseView, { value: "0", saved: 3, canManage: true, busy: false, onChange: noop, onSave: noop }))).toContain(pauseText(0));
    expect(html(createElement(ReportPauseView, { value: "3", saved: null, canManage: true, busy: false, onChange: noop, onSave: noop }))).toContain(REPORT_PAUSE_SQL_TEXT);
    const ro = html(createElement(ReportPauseView, { value: "3", saved: 3, canManage: false, busy: false, onChange: noop, onSave: noop }));
    expect(ro).toContain("השהיה אוטומטית אחרי 3 דיווחים חמורים בשבוע.");
    expect(ro).not.toContain("<input");
    expect([parsePause("0"), parsePause("20"), parsePause("21"), parsePause("2.5"), parsePause(" 7 "), parsePause("")]).toEqual([0, 20, null, null, 7, null]);
    // review #6: only reviews not yet checked count
    expect(pauseText(1)).toBe("קמפיין פעיל מושהה מעצמו כשמשתמש אחד דיווח על הפרסומת כחמורה (מטעה, פוגעני או הונאה), בדיווח שעוד לא נבדק, בשבוע האחרון. ההחלטה — בתור הדיווחים.");
    expect(pauseText(3)).toBe("קמפיין פעיל מושהה מעצמו כש-3 משתמשים שונים דיווחו על הפרסומת כחמורה (מטעה, פוגעני או הונאה), בדיווחים שעוד לא נבדקו, בשבוע האחרון. ההחלטה — בתור הדיווחים.");
  });
  it("the fixed rules now say hide / report and the ended offer", () => {
    expect(FIXED_RULES.map((r) => r.key)).toEqual(expect.arrayContaining(["hide", "offer"]));
    expect(FIXED_RULES.find((r) => r.key === "offer")!.text).toContain("קוד קופון לא מוצג בפס");
  });
});

// ── מסך הבית והניווט ──
const CAMP = (o: Partial<AdCampaignRow> = {}): AdCampaignRow => ({
  id: "c1", name: "מבצע חורף", status: "paused", starts_on: "2026-11-01", ends_on: "2026-11-30", days: [0, 1, 2, 3, 4, 5, 6], hour_from: 0, hour_to: 24,
  screens: ["home"], plans: ["free"], roles: ["tenant"], cities: [], building_ids: [], goal_views: null, daily_cap: null, per_user_cap: 3, weight: 1,
  contract_id: "k1", advertiser: "קפה השכונה", advertiser_id: "a1", contract_ref: null, serves: 40, views: 31, clicks: 4, closes: 9, today_views: 0, today_clicks: 0,
  creatives_active: 2, creatives_total: 2, creatives_ready: 2, creatives_ended: 0, paused_by_reports_at: "2026-11-16T09:12:40Z", placements: ["card", "banner"], slots: ["full", "banner"],
  advertiser_logo: null, advertiser_color: "#0E7C66", phase: "paused", phase_label: "מושהה", tone: "wait", pace_state: "none", pace_label: "", pace_expected: 0, ...o,
});
const ADV: AdAdvertiserRow = { id: "a1", name: "קפה השכונה", legal_name: null, business_id: null, contact_name: null, contact_phone: null, contact_email: null, website: null, notes: null, archived_at: null, contracts: [], logo_url: null, brand_color: null };
const home = (o: Partial<StudioHomeViewProps> = {}): StudioHomeViewProps => ({
  state: "ok", today: TODAY, campaigns: [CAMP()], advertisers: [ADV], daily: {}, enabled: true, canManage: true, imageBase: BASE, range: "7d", onRange: noop,
  tab: "all", onTab: noop, q: "", onQ: noop, adv: "", onAdv: noop, busy: null, staleDup: false, notice: null, err: null, onRetry: noop,
  onPause: noop, onResume: noop, onDuplicate: noop, now: NOW, reportsCount: 3, ...o,
});

describe("the studio home: \"3 דיווחים חדשים\" and \"הושהה בגלל דיווחים\"", () => {
  it("the badge links to the queue; singular; none when 0 / unknown (before SQL 231)", () => {
    const h = html(createElement(StudioHomeView, home()));
    // the real next/link puts href after the other props (<a {...restProps} {...childProps}>) — the whole tag, any order
    expect(tag(h, 'data-studio-reports-badge="3"')).toContain('href="/ads/reports"');
    expect(h).toContain("3 דיווחים חדשים");
    expect(html(createElement(ReportsBadge, { count: 1 }))).toContain("דיווח חדש אחד");
    expect(html(createElement(StudioHomeView, home({ reportsCount: 0 })))).not.toContain("data-studio-reports-badge");
    expect(html(createElement(StudioHomeView, home({ reportsCount: null })))).not.toContain("data-studio-reports-badge");
  });
  it("a card paused by reports: the red tag instead of \"מושהה\"; paused by hand — \"מושהה\"; resumed (active) — never the tag", () => {
    const props = (c: AdCampaignRow) => ({ c, daily: null, today: TODAY, canManage: true, busy: false, anyBusy: false, staleDup: false, imageBase: BASE, onPause: noop, onResume: noop, onDuplicate: noop, now: NOW });
    const by = html(createElement(CampaignCard, props(CAMP())));
    expect(by).toContain('data-campaign-card-tag="reports"');
    expect(by).toContain("הושהה בגלל דיווחים");
    expect(html(createElement(CampaignCard, props(CAMP({ paused_by_reports_at: null }))))).not.toContain("data-campaign-card-tag");
    // its dates passed while paused by reports — "הסתיים", as always (not the reports tag)
    expect(html(createElement(CampaignCard, props(CAMP({ phase: "ended", phase_label: "הסתיים", tone: "muted" }))))).not.toContain("data-campaign-card-tag");
    expect(html(createElement(CampaignCard, props(CAMP({ status: "active", phase: "running", phase_label: "פעיל", tone: "ok" }))))).not.toContain("הושהה בגלל דיווחים");
  });
  it("paused by reports: the quick action is 'לתור הדיווחים' (the decision there resumes it), not a bare 'המשך'; paused by hand keeps 'המשך'", () => {
    const props = (c: AdCampaignRow) => ({ c, daily: null, today: TODAY, canManage: true, busy: false, anyBusy: false, staleDup: false, imageBase: BASE, onPause: noop, onResume: noop, onDuplicate: noop, now: NOW });
    const by = html(createElement(CampaignCard, props(CAMP())));
    expect(tag(by, 'data-quick="reports"')).toContain('href="/ads/reports"');
    expect(by).not.toContain('data-quick="resume"');
    const hand = html(createElement(CampaignCard, props(CAMP({ paused_by_reports_at: null }))));
    expect(hand).toContain('data-quick="resume"');
    expect(hand).not.toContain('data-quick="reports"');
    expect(RESUME_REPORTED_CONFIRM).toContain("בלי להחליט על הדיווחים");
  });
  it("the nav has \"דיווחים\" (with the count when known, 99+ above)", () => {
    const h = html(createElement(StudioNav, { active: "campaigns", reports: 3 }));
    expect(h).toContain('href="/ads/reports"');
    expect(h).toContain('data-studio-nav-count="3"');
    expect(html(createElement(StudioNav, { active: "settings" }))).not.toContain("data-studio-nav-count");
    expect(html(createElement(StudioNav, { active: "reports", reports: 120 }))).toContain(">99+<");
  });
});

// ── הביצועים, ההדפסה ו"למה לא מוצג?" ──
describe("performance: copies of the code and the reports counts", () => {
  const rep = parseReport(fixture("ad_report.raw.json"));
  const creatives = [CR({ id: "00000000-0000-4000-f000-000000000001" }), CR({ id: "00000000-0000-4000-f000-000000000012", format: "banner", banner_position: "bottom", coupon_code: null, offer_ends_on: null })];
  it("with a code: \"העתקות קוד\" in the totals, per creative and per format", () => {
    const h = html(createElement(PerformanceTabView, { campaign: CAMP(), report: rep, creatives, imageBase: BASE }));
    expect(h).toMatch(/data-kpi="copies"[\s\S]*?העתקות קוד[\s\S]*?>6</);
    expect(h).toContain('data-report-creative-copies="6"');
    expect(h).toContain('data-report-creative-copies="0"');
    expect(h).toContain('data-report-format-copies="6"');
  });
  it("the reports: \"דיווחים: 3 פתוחים · 4 בסך הכל\" with a link to the queue — numbers only", () => {
    const h = html(createElement(PerformanceTabView, { campaign: CAMP(), report: rep, creatives, imageBase: BASE }));
    expect(h).toContain('data-report-reports="3/4"');
    expect(h).toContain("דיווחים: 3 פתוחים · 4 בסך הכל");
    expect(tag(h, "data-report-reports-link")).toContain('href="/ads/reports"');
  });
  it("no code and nothing copied — no copies anywhere; no reports — no row", () => {
    const plain = parseReport({ totals: { views: 5 }, creatives: [{ creative_id: "x", views: 5 }] });
    const h = html(createElement(PerformanceTabView, { campaign: CAMP(), report: plain, creatives: [CR({ id: "x", coupon_code: null })], imageBase: BASE }));
    expect(h).not.toContain('data-kpi="copies"');
    expect(h).not.toContain("העתקות");
    expect(h).not.toContain("data-report-reports");
    const zero = parseReport({ totals: {}, reports: { open: 0, total: 0, paused_by_reports_at: null } });
    expect(html(createElement(PerformanceTabView, { campaign: CAMP(), report: zero, creatives: [], imageBase: BASE }))).not.toContain("data-report-reports");
  });
  it("the paused banner: when, and the way out (the queue)", () => {
    const h = html(createElement(ReportsPausedBanner, { at: "2026-11-16T09:12:40Z", now: NOW }));
    expect(h).toContain("הושהה אוטומטית בגלל דיווחים (היום ב-11:12)");
    expect(h).toContain('href="/ads/reports"');
  });
});

describe("\"למה לא מוצג?\": the hidden check and the ended creatives", () => {
  it("bloc's answer (explain_answer_hidden.json): the hidden campaign says so; the one with only ended creatives says the offer may have ended", () => {
    const v = explainView(parseExplain(fixture("explain_answer_hidden.json")), new Date("2026-11-16T10:20:31Z"), "full");
    const h = html(createElement(ExplainResultView, { view: v }));
    expect(h).toContain(CHECK_FAIL.hidden);
    expect(h).toContain("או שהמבצע בכל המודעות הפעילות הסתיים");
  });
});

// ── עוד: כל פורמט — הסטודיו מעביר את הקוד לתצוגה ──
describe("every format gets the coupon from the form (the studio's preview mapping)", () => {
  it("previewFromForm / previewFromCreative carry the code and the date", () => {
    const f = form({ coupon_code: "save20", offer_ends_on: "2026-11-30" });
    for (const fmt of AD_FORMATS) expect(previewFromForm(fmt, f, { advertiser: "א", advertiserLogo: null, imageBase: BASE, today: TODAY }), fmt).toMatchObject({ coupon: "save20", offerEndsOn: "2026-11-30", today: TODAY });
    expect(previewFromCreative(CR(), { advertiser: "א", advertiserLogo: null, imageBase: BASE })).toMatchObject({ coupon: "SAVE20", offerEndsOn: "2026-11-30" });
  });
});

// ── מול הקובץ של bloc עצמו (סקירה #3) — מקומי בלבד: בלי העץ של bloc (BLOC_ROOT, ברירת מחדל /home/claude/hood-ads2) אין מה לבדוק, כמו
// ב-adsOffer.test.ts. אותן מחלקות לכל חלק, אותם צבעים לכל גוון, אותם גדלים (כמו שה-globals.css של bloc מצייר) ואותו מיקום אצל המארחים. ──
const BLOC = process.env.BLOC_ROOT ?? "/home/claude/hood-ads2";
const BLOC_COUPON = join(BLOC, "src", "components", "ads", "AdCoupon.tsx");
const blocFile = (...p: string[]) => readFileSync(join(BLOC, ...p), "utf8");
/** The JSX tag that holds `anchor` (or starts with it) — from its "<" to its ">", braces and quotes respected. */
function tagOf(src: string, anchor: string, from = 0): string {
  const i = src.indexOf(anchor, from);
  if (i < 0) throw new Error(`not in bloc's file: ${anchor}`);
  const start = anchor.startsWith("<") ? i : src.lastIndexOf("<", i);
  let depth = 0;
  let quote: string | null = null;
  for (let j = start + 1; j < src.length; j++) {
    const ch = src[j];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`an unclosed tag at ${anchor}`);
}
function classOf(t: string): string {
  const m = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(t);
  if (!m) throw new Error(`no className: ${t.slice(0, 60)}`);
  return (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, " ").replace(/\s+/g, " ").trim();
}
const classSet = (s: string) => s.split(/\s+/).filter(Boolean).sort();
const quoted = (s: string) => (s.match(/'[^']*'/g) ?? []).map((x) => x.slice(1, -1));

describe("parity with bloc's own AdCoupon (when bloc's tree is here) — review #3", () => {
  const here = existsSync(BLOC_COUPON);
  it("the same classes, part by part; the code wraps and is never cut; the same copy icon; the same words", () => {
    if (!here) return;
    const src = readFileSync(BLOC_COUPON, "utf8");
    const theirs: Record<keyof typeof AD_COUPON_CLASSES, string> = {
      root: classOf(tagOf(src, 'data-sponsored-coupon=""')),
      chip: classOf(tagOf(src, 'data-sponsored-coupon-chip=""')),
      label: classOf(tagOf(src, ">קוד:</span>")),
      code: classOf(tagOf(src, 'data-sponsored-coupon-code=""')),
      button: classOf(tagOf(src, "<button")),
      line: classOf(tagOf(src, 'data-sponsored-offer=""')),
    };
    for (const k of Object.keys(theirs) as Array<keyof typeof AD_COUPON_CLASSES>) {
      expect(classSet(AD_COUPON_CLASSES[k]), k).toEqual(classSet(theirs[k]));
      expect(() => twStyle(theirs[k]), k).not.toThrow();
    }
    // B1 of bloc: a long code wraps (break-all), never cut (truncate) — strict now that bloc's file has it
    expect(AD_COUPON_CLASSES.code).toMatch(/\bbreak-all\b/);
    expect(AD_COUPON_CLASSES.code).not.toMatch(/\btruncate\b/);
    const icon = tagOf(src, "<IconCopy");
    expect([classOf(icon), /strokeWidth=\{([\d.]+)\}/.exec(icon)?.[1]]).toEqual(["h-4 w-4", "2.2"]);
    const h = html(createElement(CouponBlock, { code: "A1", offerEndsOn: null, today: TODAY, tone: "light" }));
    expect(h).toMatch(/<svg width="16" height="16"[^>]*stroke-width="2.2"/);
    const icons = blocFile("src", "components", "ui", "Icons.tsx");
    const at = icons.indexOf("export const IconCopy =");
    const shapes = icons.slice(at, icons.indexOf(");", at)).match(/<(?:rect|path) [^>]*?\/>/g) ?? [];
    expect(shapes.length).toBe(2);
    for (const sh of shapes) expect(h, sh).toContain(sh.replace(/\s*\/>$/, ""));
    expect(src).toContain("'העתקה'");
    expect(h).toContain(">העתקה</span>");
    // an ended offer — nothing at all; no code and no line — nothing (the same two lines as bloc)
    expect(src).toContain("if (offerEnded(offerEndsOn, today)) return null");
    expect(src).toContain("if (!code && !line) return null");
  });
  it("the same colours for each tone (every `dark ? … : …` of bloc's file); var(--ink-soft) on light — as bloc's globals.css draws it", () => {
    if (!here) return;
    const src = readFileSync(BLOC_COUPON, "utf8");
    const css = blocFile("src", "app", "globals.css");
    const props = { code: "A1", offerEndsOn: "2026-11-30", today: TODAY };
    const dark = html(createElement(CouponBlock, { ...props, tone: "dark" }));
    const light = html(createElement(CouponBlock, { ...props, tone: "light" }));
    const pairs = src.match(/dark \? (?:'[^']*'|\{[^{}]*\}) : (?:'[^']*'|\{[^{}]*\})/g) ?? [];
    expect(pairs.length).toBe(4);   // the soft text, the dashes, the chip's text, the button
    for (const pr of pairs) {
      const [d, l] = pr.slice("dark ? ".length).split(/ : (?='|\{)/);
      for (const t of quoted(d)) expect(dark, `dark: ${t}`).toContain(t);
      for (const t of quoted(l)) {
        if (t === "var(--ink-soft)") continue;   // just below
        expect(light, `light: ${t}`).toContain(t);
      }
    }
    // bloc's globals.css: an inline color: var(--ink-soft) is drawn as --ink-desc (!important), in --type-desc at --desc-weight
    expect(css).toMatch(/\[style\*="color: var\(--ink-soft\)"\][^{]*\{\s*color: var\(--ink-desc\) !important;/);
    expect(css).toMatch(/\[style\*="color: var\(--ink-soft\)"\][^{]*:not\(\.font-black\)[^{]*\{\s*font-family: var\(--type-desc\);\s*font-weight: var\(--desc-weight\);/);
    const weight = /--desc-weight:\s*(\d+);/.exec(css)?.[1];
    expect(weight).toBe("400");
    const desc = (/--type-desc:\s*([^;]+);/.exec(css)?.[1] ?? "").toLowerCase();
    expect(desc.indexOf("assistant")).toBeGreaterThan(-1);
    expect(desc.indexOf("assistant")).toBeLessThan(desc.indexOf("heebo"));
    expect(light).toMatch(new RegExp(`font-weight:${weight};color:var\\(--ink-desc\\);font-family:Assistant, Heebo[^"]*">קוד:<`));
    expect(light).not.toContain("var(--ink-soft);");   // never written as is: the app would not show it so
    // the :root values the var()s resolve to
    for (const [k, v] of Object.entries(BLOC_TOKENS)) expect(css, k).toMatch(new RegExp(`${k}:\\s*${v};`, "i"));
  });
  it("the same sizes: every text-[Npx] of AdCoupon as bloc's globals.css draws it (14 → 15, 13.5 → 13, 16 stays)", () => {
    if (!here) return;
    const css = blocFile("src", "app", "globals.css");
    const rules = css.match(/[^{}]+\{\s*font-size:\s*\d+(?:\.\d+)?px;\s*\}/g) ?? [];
    const drawn = (cls: string): string => {
      const name = "." + cls.replace(/([[\].])/g, "\\$1");
      for (const r of rules) {
        const [sel, body] = r.split("{");
        if (sel.split(",").map((x) => x.trim()).indexOf(name) >= 0) return /font-size:\s*(\d+(?:\.\d+)?px)/.exec(body)![1];
      }
      return cls.slice("text-[".length, -1);
    };
    const seen: string[] = [];
    for (const cls of Object.values(AD_COUPON_CLASSES)) {
      for (const t of cls.match(/text-\[\d+(?:\.\d+)?px\]/g) ?? []) {
        expect(twStyle(t).fontSize, t).toBe(drawn(t));
        seen.push(`${t}→${drawn(t)}`);
      }
    }
    expect(Array.from(new Set(seen)).sort()).toEqual(["text-[13.5px]→13px", "text-[14px]→15px", "text-[16px]→16px"]);
  });
  it("the same placement: bloc's hosts give mt-3 (above the button) and mx-3.5 mt-2.5 (under the carousel frames); dark on the image formats, the ad's theme elsewhere", () => {
    if (!here) return;
    const uses = (file: string) => {
      const src = blocFile("src", "components", "ads", file);
      const out: Array<{ cls: string; tone: string }> = [];
      for (let i = src.indexOf("<AdCoupon "); i >= 0; i = src.indexOf("<AdCoupon ", i + 1)) {
        const t = tagOf(src, "<AdCoupon ", i);
        out.push({ cls: classOf(t), tone: /tone=(\{[^}]*\}|"[^"]*")/.exec(t)?.[1] ?? "" });
      }
      return out;
    };
    const overlay = uses("SponsoredOverlay.tsx");
    const inline = uses("SponsoredInline.tsx");
    const all = overlay.concat(inline);
    expect(Array.from(new Set(all.map((u) => u.cls))).sort()).toEqual(Object.values(AD_COUPON_PLACE).slice().sort());
    expect(all.filter((u) => u.cls === AD_COUPON_PLACE.carousel)).toHaveLength(1);
    // tone: bloc's "dark" hosts (card, fullscreen, story) vs the ad's theme (dialog, native, carousel) — the same split in ours
    const darkHosts = all.filter((u) => u.tone === '"dark"').length;
    const themeHosts = all.filter((u) => /theme\}$/.test(u.tone)).length;
    expect([darkHosts, themeHosts, all.length]).toEqual([3, 3, 6]);
    const fr = (f: AdFormat) => (FORMAT_INFO[f].frames ? twoFrames : null);
    const lastFrame = (f: AdFormat) => (f === "story" ? { frame: 1, onFrame: noop } : {});
    const onLight = (["card", "dialog", "fullscreen", "story", "native", "carousel"] as AdFormat[])
      .filter((f) => html(createElement(AdPreview, P({ format: f, theme: "light", frames: fr(f), ...lastFrame(f) }))).includes("border:1.5px dashed rgba(255,255,255,0.6)"));
    expect(onLight).toEqual(["card", "fullscreen", "story"]);
    expect(onLight.length).toBe(darkHosts);
  });
});
