// bloc ADS-2ג1 בפאנל — המסכים של הסטודיו: "הכפתור" (סוג, יעד, שם, מה הדייר יקבל), התצוגה המקדימה (אייקון, שם שלא נחתך),
// הכרטיס של המודעה, "הקלקות" לפי הסוג בדוח, בורר המסכים (חמישה, עם מה מופיע איפה) ובדיקת משתמש (רק המקומות שיש במסך).
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CtaEditor, { type CtaEditorProps } from "../studio/CtaEditor";
import AdPreview, { type AdPreviewProps } from "../studio/AdPreview";
import { previewFromForm, previewFromCreative } from "../studio/StudioPreview";
import CreativeCard from "../studio/CreativeCard";
import { PerformanceTabView } from "../studio/CampaignStudio";
import { AudienceEditorView } from "../studio/AudienceEditor";
import { explainSlots } from "../studio/ExplainBox";
import { emptyCreativeForm, type CreativeForm } from "@/lib/adsStudio";
import { emptyCtaDraft, type CtaDraft } from "@/lib/adsCta";
import { parseReport, SCREENS_HINT } from "@/lib/ads";
import type { AdCampaignRow, AdCreativeRow } from "@/lib/adsServer";

const html = (el: any) => renderToStaticMarkup(el);
const BASE = "https://abc.supabase.co/storage/v1/object/public/ads/";
const OURS = `${BASE}creatives/2026-11/a.webp`;
const noop = () => {};
const kids = (n: any): any[] => (n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(kids) : [n]);
/** every element in a pure tree (through children and element-valued props). */
function find(n: any, pred: (e: any) => boolean, out: any[] = []): any[] {
  for (const k of kids(n)) if (typeof k === "object" && k.props) {
    if (pred(k)) out.push(k);
    for (const [name, v] of Object.entries(k.props)) if (name === "children" || (v && typeof v === "object" && ((v as any).props || Array.isArray(v)))) find(v, pred, out);
  }
  return out;
}
const byData = (t: any, attr: string, value?: string) => find(t, (e) => e.props?.[attr] !== undefined && (value === undefined || String(e.props[attr]) === value));
const FORM = (o: Partial<CreativeForm> = {}): CreativeForm => ({
  ...emptyCreativeForm((i) => `k${i}`), image: { image_url: OURS, image_alt: "פיצה", focal: [0.5, 0.5] }, headline: "פיצה ב-49", cta_label: "לפרטים", cta_url: "https://pizza.example", ...o,
});
const withDraft = (d: Partial<CtaDraft>, o: Partial<CreativeForm> = {}) => FORM({ cta: { ...emptyCtaDraft(), ...d }, ...o });
const props = (o: Partial<CtaEditorProps> = {}): CtaEditorProps => ({ form: FORM(), onForm: noop, campaignId: "c1", labelIssue: null, urlIssue: null, ...o });

describe("the button editor (decision 404)", () => {
  it("four kinds as tiles — the current one checked; a website by default (a form without a draft — from its address)", () => {
    const h = html(createElement(CtaEditor, props()));
    expect(h).toContain('role="radiogroup" aria-label="מה הכפתור עושה"');
    for (const k of ["link", "call", "whatsapp", "navigate"]) expect(h).toContain(`data-cta-kind="${k}"`);
    expect(h).toMatch(/aria-checked="true" data-cta-kind="link"/);
    expect(h).toContain('data-creative-cta="link"');
    expect(h).toContain('data-creative-final-link="utm"');
    const tel = html(createElement(CtaEditor, props({ form: FORM({ cta_url: "tel:*2700" }) })));
    expect(tel).toMatch(/aria-checked="true" data-cta-kind="call"/);
    expect(tel).toContain('value="*2700"');
  });
  it("each kind its own destination field (the one \"מה חסר\" jumps to); WhatsApp — the number and a ready message", () => {
    const call = html(createElement(CtaEditor, props({ form: withDraft({ kind: "call", phone: "050-1234567" }) })));
    expect(call).toMatch(/inputMode="tel"[^>]*data-creative-field="cta_url"|data-creative-field="cta_url"[^>]*inputMode="tel"/);
    expect(call).toContain("מספר הטלפון");
    const wa = html(createElement(CtaEditor, props({ form: withDraft({ kind: "whatsapp", waPhone: "050-1234567", waText: "היי" }) })));
    expect(wa).toContain("מספר הוואטסאפ");
    expect(wa).toContain('data-creative-field="cta_wa_text"');
    expect(wa).toContain("הודעה מוכנה (לא חובה, 3/120)");
    const nav = html(createElement(CtaEditor, props({ form: withDraft({ kind: "navigate", place: "הרצל 1, חיפה" }) })));
    expect(nav).toContain("לאן מנווטים");
    expect(nav.match(/data-creative-field="cta_url"/g)).toHaveLength(1);
  });
  it("the names ready for each kind (any name may be written); the chosen one pressed", () => {
    const h = html(createElement(CtaEditor, props({ form: withDraft({ kind: "call", phone: "*2700" }, { cta_label: "דברו איתנו" }) })));
    expect(h).toContain('data-cta-suggestions="call"');
    for (const t of ["התקשרו עכשיו", "להזמנה בטלפון", "לתיאום ביקור", "דברו איתנו"]) expect(h).toContain(`data-cta-suggestion="${t}"`);
    expect(h).toMatch(/aria-pressed="true" data-cta-suggestion="דברו איתנו"/);
    expect(h).toContain("השם של הכפתור (10/24)");
  });
  it("what the tenant gets, in words — and that a call / a message shows their number; a website — the link with utm", () => {
    const call = html(createElement(CtaEditor, props({ form: withDraft({ kind: "call", phone: "050-1234567" }, { cta_url: "tel:+972501234567" }) })));
    expect(call).toContain('data-creative-final-link="action"');
    // the number in an LTR isolate (review row 6)
    expect(call).toContain("הדייר יחייג אליכם: \u2066050-123-4567\u2069. המפרסם יראה את המספר של הדייר שפונה אליו");
    const star = html(createElement(CtaEditor, props({ form: withDraft({ kind: "call", phone: "*2700" }, { cta_url: "tel:*2700" }) })));
    expect(star).toContain("הדייר יחייג אליכם: \u2066*2700\u2069.");
    const nav = html(createElement(CtaEditor, props({ form: withDraft({ kind: "navigate", place: "הרצל 1" }, { cta_url: "https://waze.com/ul?q=%D7%94%D7%A8%D7%A6%D7%9C%201&navigate=yes" }) })));
    expect(nav).toContain("ייפתח ניווט ב-Waze אל: הרצל 1.");
    expect(nav).not.toContain("המפרסם יראה את המספר");
    const link = html(createElement(CtaEditor, props()));
    expect(link).toContain("utm_source=bloc");
  });
  it("picking a kind: the draft and the address together, a ready name switched; typing a number makes the address", () => {
    const got: CreativeForm[] = [];
    const t = CtaEditor(props({ onForm: (f) => got.push(f) }));
    byData(t, "data-cta-kind", "call")[0].props.onClick();
    expect(got[0].cta).toMatchObject({ kind: "call" });
    expect(got[0].cta_url).toBe("");
    expect(got[0].cta_label).toBe("התקשרו עכשיו");
    const t2 = CtaEditor(props({ form: withDraft({ kind: "call" }), onForm: (f) => got.push(f) }));
    byData(t2, "data-creative-field", "cta_url")[0].props.onChange({ target: { value: "050-123-4567" } });
    expect(got[1].cta_url).toBe("tel:+972501234567");
    expect(got[1].cta).toMatchObject({ kind: "call", phone: "050-123-4567" });
    byData(t2, "data-cta-suggestion", "לתיאום ביקור")[0].props.onClick();
    expect(got[2].cta_label).toBe("לתיאום ביקור");
    // a name you wrote stays when the kind changes
    const t3 = CtaEditor(props({ form: FORM({ cta_label: "פיצה עד הבית" }), onForm: (f) => got.push(f) }));
    byData(t3, "data-cta-kind", "whatsapp")[0].props.onClick();
    expect(got[3].cta_label).toBe("פיצה עד הבית");
  });
  it("the reason under the field — only when flagged (the issue passed in), with aria-invalid", () => {
    const issue = { id: "cta_url", text: "חסר מספר הטלפון", step: "content" as const, field: "cta_url" as const };
    const h = html(createElement(CtaEditor, props({ form: withDraft({ kind: "call" }), urlIssue: issue })));
    expect(h).toContain('data-content-issue="cta_url">חסר מספר הטלפון</span>');
    expect(h).toMatch(/aria-invalid="true" aria-describedby="content-issue-cta_url"/);
    expect(html(createElement(CtaEditor, props({ form: withDraft({ kind: "call" }) })))).not.toContain("data-content-issue");
  });
});

describe("the preview (decisions 402–403)", () => {
  const P = (o: Partial<AdPreviewProps> = {}): AdPreviewProps => ({ format: "card", advertiser: "פיצה השכונה", headline: "פיצה ב-49", body: null, ctaLabel: "התקשרו עכשיו", imageUrl: null, imageAlt: "", imageBase: BASE, ...o });
  it("the action's icon before the name on every format's button; a website — none", () => {
    for (const format of ["card", "dialog", "fullscreen", "banner", "native"] as const) {
      expect([format, html(createElement(AdPreview, P({ format, ctaKind: "call" }))).includes('data-ad-preview-cta-icon="call"')]).toEqual([format, true]);
      expect([format, html(createElement(AdPreview, P({ format, ctaKind: "link" }))).includes("data-ad-preview-cta-icon")]).toEqual([format, false]);
    }
  });
  it("the banner's button: never cut — up to 132px and no line limit, like bloc (was 96px, one line; review row 1)", () => {
    const h = html(createElement(AdPreview, P({ format: "banner", ctaLabel: "לקבלת ההטבה הבלעדית", ctaKind: "whatsapp" })));
    const btn = h.slice(h.indexOf("data-ad-preview-cta"), h.indexOf("data-ad-preview-close"));
    expect(btn).toContain("max-width:132px");
    expect(btn).not.toContain("max-width:96px");
    expect(btn).not.toContain("line-clamp");
    expect(btn).toContain('data-ad-preview-cta-icon="whatsapp"');
    for (const format of ["card", "dialog", "fullscreen", "banner", "native", "carousel"] as const) {
      const f = html(createElement(AdPreview, P({ format, ctaLabel: "להזמנת שולחן לשישה אנשים", ctaKind: "call" })));
      const label = f.slice(f.indexOf("data-ad-preview-cta-label"));
      expect([format, f.includes("data-ad-preview-cta-label"), label.slice(0, label.indexOf(">")).includes("line-clamp")]).toEqual([format, true, false]);
    }
  });
  it("from the form — the kind chosen in the editor (the icon before the number is complete); from a saved ad — from its address", () => {
    expect(previewFromForm("card", withDraft({ kind: "navigate" }, { cta_url: "" }), { advertiser: "x" }).ctaKind).toBe("navigate");
    expect(previewFromForm("card", FORM({ cta_url: "tel:*2700" }), { advertiser: "x" }).ctaKind).toBe("call");
    const row = { id: "x1", campaign_id: "c1", image_url: OURS, image_alt: "א", headline: "h", body: null, cta_label: "שלחו הודעה", cta_url: "https://wa.me/972501234567", active: true,
      created_at: "", format: "native", banner_position: null, theme: "light", accent: null, focal_x: 0.5, focal_y: 0.5, frames: null, coupon_code: null, offer_ends_on: null } as unknown as AdCreativeRow;
    expect(previewFromCreative(row, { advertiser: "x" }).ctaKind).toBe("whatsapp");
  });
});

describe("the ad's card, the report and the places", () => {
  const CR = (o: Partial<AdCreativeRow> = {}): AdCreativeRow => ({
    id: "x1", campaign_id: "c1", image_url: OURS, image_alt: "א", headline: "מבצע", body: null, cta_label: "התקשרו עכשיו", cta_url: "tel:+972501234567", active: true, created_at: "",
    format: "card", banner_position: null, theme: "light", accent: null, focal_x: 0.5, focal_y: 0.5, frames: null, coupon_code: null, offer_ends_on: null, ...o,
  } as AdCreativeRow);
  it("the card says the action and the number — not a host", () => {
    const h = html(createElement(CreativeCard, { c: CR(), served: 0, imageBase: BASE, canManage: true, busy: false, onToggle: noop, onEdit: noop, onDuplicate: noop, onDelete: noop }));
    expect(h).toContain('data-creative-cta-kind="call"');
    expect(h).toContain("שיחה · \u2066050-123-4567\u2069");
    const star = html(createElement(CreativeCard, { c: CR({ cta_url: "tel:*2700" }), served: 0, imageBase: BASE, canManage: true, busy: false, onToggle: noop, onEdit: noop, onDuplicate: noop, onDelete: noop }));
    expect(star).toContain("שיחה · \u2066*2700\u2069");
    const site = html(createElement(CreativeCard, { c: CR({ cta_url: "https://www.pizza.example/menu" }), served: 0, imageBase: BASE, canManage: true, busy: false, onToggle: noop, onEdit: noop, onDuplicate: noop, onDelete: noop }));
    expect(site).toContain(">pizza.example</bdi>");
  });
  it("the report: taps named by the action — per ad, and the campaign's title when all ads share it (review row 10: taps, not calls)", () => {
    const report = parseReport({
      totals: { serves: 100, views: 90, clicks: 12, closes: 0, reach: 50 }, days: [],
      creatives: [{ creative_id: "x1", serves: 100, views: 90, clicks: 12, closes: 0 }], screens: [], cities: [],
    });
    const CAMP = { id: "c1", slots: ["full"], placements: ["card"], screens: ["home"] } as unknown as AdCampaignRow;
    const h = html(createElement(PerformanceTabView, { campaign: CAMP, report, creatives: [CR()], imageBase: BASE }));
    expect(h).toContain('data-report-creative-clicks="call"');
    expect(h).toContain("12 לחיצות לשיחה");
    expect(h).not.toContain("12 שיחות");
    expect(h).toMatch(/data-kpi="clicks"[\s\S]*?לחיצות לשיחה/);
    const mixed = html(createElement(PerformanceTabView, { campaign: CAMP, report, creatives: [CR(), CR({ id: "x2", cta_url: "https://x.example" })], imageBase: BASE }));
    expect(mixed).toMatch(/data-kpi="clicks"[\s\S]*?הקלקות/);
    // a carousel that calls, with a card that has its own website link: its taps are "הקלקות"
    const frames = [{ image_url: OURS, image_alt: "א", caption: null, cta_url: "https://x.example/a", focal: null }, { image_url: OURS, image_alt: "ב", caption: null, cta_url: null, focal: null }];
    const car = html(createElement(PerformanceTabView, { campaign: CAMP, report, creatives: [CR({ format: "carousel", frames })], imageBase: BASE }));
    expect(car).toContain('data-report-creative-clicks="link"');
    expect(car).toContain("12 הקלקות");
  });
  it("the screens picker: five, with where each format shows; the user check offers only the places a screen has", () => {
    const h = html(createElement(AudienceEditorView, {
      value: { screens: ["home"], plans: ["free"], roles: ["tenant"], cities: [], building_ids: [] }, onChange: noop, cities: [], buildings: [],
      cityQ: "", onCityQ: noop, bq: "", onBq: noop, reach: null,
    }));
    for (const s of ["מסך הבית", "הלוח הקהילתי", "לוח האירועים", "דואר נכנס", "הודעות הוועד"]) expect(h).toContain(s);
    expect(h).toContain(SCREENS_HINT);
    expect(explainSlots(["full", "banner", "inline"], "inbox")).toEqual(["banner", "inline"]);
    expect(explainSlots(["full", "banner", "inline"], "announcements")).toEqual(["inline"]);
    expect(explainSlots(["full"], "announcements")).toEqual([]);
    expect(explainSlots(["full", "banner"], "home")).toEqual(["full", "banner"]);
  });
});
