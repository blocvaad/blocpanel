// PANEL-PAY א2ב (החלטות 372–373) — עורך המודעה (מרונדר לשרת, בלי דפדפן); ADS-2א v2: סטודיו המודעה (studio/CreativeStudio);
// ADS-2ב2 (החלטות 393–399): שלב אחר שלב —
//   • השלבים: פורמטים → תוכן → עמוד לכל פורמט → סיכום; הפס למעלה עם מצב לכל שלב; "הבא" לעולם לא נעול; החלקה בין שלבים.
//   • התמונה רק דרך כפתור ההעלאה: אין שדה "כתובת של תמונה"; תיבת התמונה אומרת מה קורה (אין / מעלים / הועלתה /
//     שמורה ב-bloc / מאתר אחר / ההעלאה נכשלה / bloc סירב — image_not_ours).
//   • מודעה ישנה עם תמונה מאתר אחר מסומנת ברשימה, ואי אפשר להעלות / לשמור בלי להעלות תמונה; היא לא נטענת גם בפאנל.
//   • לכל פורמט העלאה משלו; "העלאת כל המוכנות"; מה חסר — רשימה שכל פריט בה קופץ לשדה (המקרה של 17/11: סטורי בלי תיאור לתמונות
//     1 ו-2 — הכרטיס ומסך מלא עולים לבד); נכשל — המשפט ו"נסו שוב"; לא ברור — עוצרים, ובמקום העלאה — "סגירה ורענון".
//   • מודעה שהוצגה — נעולה ("נעולה — שכפלו כדי לשנות"), שכפול כמודעה חדשה.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CreativeImageField from "../CreativeImageField";
import CreativeStudio, {
  CreativeStudioView, Checklist, sharedHint, overrideKey, initialCreativeForm, afterUploadText, BATCH_TEXT, type CreativeStudioViewProps,
} from "../studio/CreativeStudio";
import { CampaignBarView } from "../studio/CampaignWizard";
import { SheetGuard, StepBar } from "../studio/kit";
import WizardSteps, { WizardStepsView, stepStateText } from "../studio/WizardSteps";
import CreativeCard from "../studio/CreativeCard";
import CreativeList from "../studio/CreativeList";
import { imageBoxState, IMAGE_NOT_OURS_TEXT, UPLOAD_FAILED_TEXT, IMAGE_FOREIGN_TEXT, RECHECK_TEXT, type UploadState } from "@/lib/adsUi";
import { emptyCreativeForm, type BatchItem, type CreativeForm } from "@/lib/adsStudio";
import { CREATIVE_LOCKED_TEXT, emptyFrame, type AdFormat, type FrameDraft } from "@/lib/adsFormats";
import { STUDIO_IDLE, leaveText, type Check, type StudioState } from "@/lib/adsWizard";
import type { AdCreativeRow } from "@/lib/adsServer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));

const BASE = "https://abc.supabase.co/storage/v1/object/public/ads/";
const OURS = `${BASE}creatives/2026-11/a.webp`;
const OURS2 = `${BASE}creatives/2026-11/b.webp`;
const FOREIGN = "https://cdn.example.com/pizza.jpg";
const TODAY = "2026-11-17";
const box = (url: string, upload: UploadState = { phase: "idle" }, refusal: string | null = null) => imageBoxState({ url, upload, refusal, base: BASE });
const field = (url: string, upload?: UploadState, refusal?: string | null, locked = false) =>
  renderToStaticMarkup(createElement(CreativeImageField, { url, box: box(url, upload, refusal), locked, onPick: () => {} }));

describe("CreativeImageField — every upload state, said in words", () => {
  it("empty: a dashed box, the format hint, \"העלאת תמונה\"", () => {
    const html = field("");
    expect(html).toContain('data-creative-image="empty"');
    expect(html).toContain("עוד לא הועלתה תמונה");
    expect(html).toContain("JPEG, PNG או WebP, עד 2MB");
    expect(html).not.toMatch(/<bdi>[^<]*עד 2MB/);   // a Hebrew line is never isolated (an English first word would flip it)
    expect(html).toContain("העלאת תמונה");
    expect(html).not.toContain("<img");
  });
  it("uploading: busy, the file name, the button disabled", () => {
    const html = field("", { phase: "uploading", name: "pizza.jpg" });
    expect(html).toContain('data-creative-image="busy"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("מעלים את התמונה…");
    expect(html).toContain("<bdi>pizza.jpg</bdi>");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-creative-upload/);
  });
  it("uploaded: ✓, the thumbnail, \"החלפת התמונה\"", () => {
    const html = field(OURS, { phase: "done", name: "pizza.jpg" });
    expect(html).toContain('data-creative-image="ok"');
    expect(html).toContain("התמונה הועלתה");
    expect(html).toContain(`src="${OURS}"`);
    expect(html).toContain("החלפת התמונה");
    expect(html).not.toMatch(/<button[^>]*disabled=""/);
  });
  it("failed: the reason as an alert; the earlier image kept", () => {
    const html = field(OURS, { phase: "failed", error: UPLOAD_FAILED_TEXT });
    expect(html).toContain('data-creative-image="error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("ההעלאה נכשלה. נסו שוב.");
    expect(html).toContain("התמונה הקודמת לא השתנתה.");
  });
  it("bloc refused the image: image_not_ours, in the box, as an alert", () => {
    const html = field(FOREIGN, { phase: "idle" }, IMAGE_NOT_OURS_TEXT);
    expect(html).toContain("העלו את התמונה בכפתור ההעלאה — תמונה מאתר אחר לא מוצגת לדיירים.");
    expect(html).toContain('role="alert"');
  });
  it("an old creative's outside image: warn, upload it", () => {
    const html = field(FOREIGN);
    expect(html).toContain('data-creative-image="warn"');
    expect(html).toContain(IMAGE_FOREIGN_TEXT);
  });
  it("a creative that was shown: the upload button disabled", () => {
    expect(field(OURS, undefined, null, true)).toMatch(/<button[^>]*disabled=""[^>]*data-creative-upload/);
  });
});

type El = { type: any; props: any };
const kids = (n: any): any[] => (n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(kids) : [n]);
/** every element in the tree — through children, element-valued props (a Banner's action, …) and function components (rendered with their props). */
function find(n: any, pred: (e: El) => boolean, out: El[] = []): El[] {
  for (const k of kids(n)) if (typeof k === "object" && k.props) {
    if (pred(k)) out.push(k);
    if (typeof k.type === "function" && STEP_COMPONENTS.has(k.type.name)) find(k.type(k.props), pred, out);
    if (k.type === WizardSteps) find(WizardStepsView(k.props), pred, out);   // the strip's wrapper only scrolls; its view is pure
    for (const [name, v] of Object.entries(k.props)) if (name === "children" || (v && typeof v === "object" && ((v as any).props || Array.isArray(v)))) find(v, pred, out);
  }
  return out;
}
// the wizard's own sub-views are plain functions of their props — walk into them (the shared kit components stay opaque)
const STEP_COMPONENTS = new Set(["FormatsStep", "ContentStep", "FormatStep", "SummaryStep", "LockedView", "Checklist", "OfferFields", "FramesStrip", "Segmented"]);
const byData = (tree: any, attr: string, value?: string | number) =>
  find(tree, (e) => e.props?.[attr] !== undefined && (value === undefined || String(e.props[attr]) === String(value)));

const CR = (o: Partial<AdCreativeRow> = {}): AdCreativeRow => ({
  id: "c1", campaign_id: "k1", image_url: OURS, image_alt: "פיצה", headline: "פיצה ב-49", body: null,
  cta_label: "להזמנה", cta_url: "https://pizza.example", active: true, created_at: "2026-11-01T10:00:00Z",
  format: "card", banner_position: null, theme: "light", accent: null, focal_x: 0.5, focal_y: 0.5, frames: null, coupon_code: null, offer_ends_on: null, ...o,
});
const fr = (i: number, o: Partial<FrameDraft> = {}): FrameDraft => ({ ...emptyFrame(`k${i}`), image_url: OURS, image_alt: `תמונה ${i}`, ...o });
const FORM = (o: Partial<CreativeForm> = {}): CreativeForm => ({
  ...emptyCreativeForm((i) => `k${i}`), image: { image_url: OURS, image_alt: "פיצה משפחתית", focal: [0.5, 0.5] },
  frames: [fr(1), fr(2)], headline: "פיצה ב-49", body: "", cta_label: "להזמנה", cta_url: "https://pizza.example", ...o,
});
const noop = () => {};
const props = (o: Partial<CreativeStudioViewProps> = {}): CreativeStudioViewProps => {
  const form = o.form ?? FORM();
  const boxes = o.boxes ?? Object.fromEntries([
    ["image", box(form.image.image_url)],
    ...form.formats.map((f) => [overrideKey(f), box(form.overrides[f]?.image_url ?? "")]),
    ...form.frames.map((f) => [f.key, box(f.image_url)]),
  ]);
  return {
    mode: "new", served: false, form, onForm: noop, advertiser: "פיצה השכונה", advertiserLogo: null, brandColor: null, imageBase: BASE,
    step: form.formats[0], onStep: noop, boxes, onPick: noop, frameSel: 0, onFrameSel: noop, refusedFrame: null,
    onAddFrame: noop, batch: null, busy: false, err: null, stale: false, onPublish: noop, onJump: noop, onFinish: noop, onSave: noop, onDuplicate: noop, onRecheck: noop,
    onCancel: noop, animate: false, today: TODAY, ...o,
  };
};
const view = (o: Partial<CreativeStudioViewProps> = {}) => renderToStaticMarkup(createElement(CreativeStudioView, props(o)));
const tree = (o: Partial<CreativeStudioViewProps> = {}) => CreativeStudioView(props(o));
// the opening tag of the button that carries attr — a missing button fails the test (a negative check must not pass on nothing)
const btn = (html: string, attr: string) => { const at = html.indexOf(attr); if (at < 0) throw new Error(`no button with ${attr}`); return html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at)); };
const B = (format: AdFormat, state: BatchItem["state"], error?: string): BatchItem => ({ format, state, ...(error ? { error } : {}) });
// the owner's case (17/11): card + full screen (its own image) + story, frames 1 and 2 without a description
const OWNER = FORM({
  formats: ["card", "fullscreen", "story"], overrides: { fullscreen: { image_url: OURS2, image_alt: "מגביר חלב איכותי", focal: [0.5, 0.5] } },
  frames: [fr(1, { image_alt: "" }), fr(2, { image_alt: "" }), fr(3, { image_alt: "בושם לגבר", caption: "בושם שאין מילים" })],
  headline: "הטבה בלעדית לדיירים", cta_label: "לקבלת ההטבה", cta_url: "https://blocvaad.co.il",
});

describe("the steps (393): formats → content → a page per format → summary", () => {
  it("the strip: every step numbered with its state; the current one marked; the progress bar", () => {
    const html = view({ form: OWNER, step: "content" });
    expect(html).toContain('data-wizard-steps="formats,content,card,fullscreen,story,summary"');
    expect(html).toContain('data-wizard-current="content"');
    expect(html).toMatch(/aria-current="step"[^>]*data-wizard-pill="content"|data-wizard-pill="content"[^>]*aria-current="step"/);
    expect(btn(html, 'data-wizard-pill="story"')).toContain('data-pill-state="missing"');
    expect(html).toContain('aria-label="שלב 5: סטורי ממומן — חסרים 2"');
    expect(html).toMatch(/data-pill-badge="missing"[^>]*>(<svg[^>]*>.*?<\/svg>)?<span class="studio-num">2<\/span>/);
    expect(btn(html, 'data-wizard-pill="card"')).toContain('data-pill-state="ready"');
    expect(btn(html, 'data-wizard-pill="summary"')).toContain('data-pill-state="info"');
    expect(html).toContain('data-wizard-progress="2/6"');
    expect(html).toContain('data-wizard-where="2/6"');
    expect(view({ form: OWNER, step: "formats" })).toContain('data-wizard-where-state="">נבחרו 3 פורמטים<');
    expect(view({ form: OWNER, step: "summary", batch: [B("card", "ok")] })).toContain('data-wizard-where-state="">עלו 1 מתוך 3<');
  });
  it("every pill moves there (no step is locked); \"next\" is never disabled, even with things missing", () => {
    const went: string[] = [];
    const t = tree({ form: FORM({ headline: "" }), step: "formats", onStep: (s) => went.push(s) });
    byData(t, "data-wizard-pill", "summary")[0].props.onClick();
    byData(t, "data-studio-next")[0].props.onClick();
    expect(went).toEqual(["summary", "content"]);
    expect(btn(view({ form: FORM({ headline: "" }), step: "content" }), "data-studio-next")).not.toContain("disabled");
  });
  it("the bar: back on every step but the first (there — cancel); the next step named", () => {
    const first = view({ step: "formats" });
    expect(first).not.toContain("data-studio-back");
    expect(first).toContain("data-creative-cancel");
    expect(first).toContain("הבא: תוכן");
    expect(view({ step: "content" })).toContain("data-studio-back");
    expect(view({ form: OWNER, step: "content" })).toContain("הבא: כרטיס במרכז");
  });
  it("swipe: the body carries the touch handlers; the slide direction animates; a hint on phones", () => {
    const touch = { onTouchStart: noop, onTouchEnd: noop };
    const body = byData(tree({ step: "content", touch, slide: "next" }), "data-wizard-body", "content")[0];
    expect(body.props.onTouchStart).toBe(touch.onTouchStart);
    expect(body.props.onTouchEnd).toBe(touch.onTouchEnd);
    expect(body.props.className).toContain("wiz-in-next");
    expect(view({ step: "content" })).toContain("החלקה ימינה — לשלב הבא, שמאלה — לקודם.");
  });
  it("the formats step: the gallery, said what happens next; an uploaded format stays ticked", () => {
    const html = view({ form: OWNER, step: "formats", batch: [B("fullscreen", "ok")] });
    expect(html).toContain('data-format-gallery="card,fullscreen,story"');
    expect(html).toContain("לכל פורמט נוצרת מודעה משלו");
    expect(html).toContain('data-format-uploaded=""');
    expect(html).toContain("מסך מלא — כבר עלתה");
  });
  it("the WizardSteps pill states in words", () => {
    expect([stepStateText({ kind: "ready" }), stepStateText({ kind: "missing", count: 1 }), stepStateText({ kind: "missing", count: 3 }), stepStateText({ kind: "uploaded" })])
      .toEqual(["מוכן", "חסר פרט אחד", "חסרים 3", "עלתה"]);
    const html = renderToStaticMarkup(createElement(WizardSteps, { steps: ["content", "card"], current: "card", state: () => ({ kind: "failed" as const }), onStep: noop }));
    expect(html).toContain("לא עלתה");
    // second review #11: an unclear answer is "maybe up" in the strip, as on the page
    expect(stepStateText({ kind: "unclear" })).toBe("ייתכן שעלתה");
    const strip = view({ form: FORM({ formats: ["card", "dialog"] }), step: "summary", batch: [B("dialog", "unclear", "x")], stale: true });
    expect(btn(strip, 'data-wizard-pill="dialog"')).toContain('data-pill-state="unclear"');
    expect(strip).toContain('aria-label="שלב 4: חלון קופץ — ייתכן שעלתה"');
    expect(strip).toMatch(/data-pill-badge="unclear" style="[^"]*color:var\(--yellow\)/);   // yellow, like the page's warning
  });
});

describe("the owner's case (17/11): the story is missing descriptions — the card and the full screen go up alone", () => {
  it("the card's page: ready, its own upload button, enabled; it uploads only the card", () => {
    const up: AdFormat[][] = [];
    const html = view({ form: OWNER, step: "card" });
    expect(html).toContain('data-checklist="card" data-checklist-ready=""');
    expect(btn(html, 'data-creative-publish="card"')).not.toContain("disabled");
    expect(html).toContain("העלאת כרטיס במרכז");
    byData(tree({ form: OWNER, step: "card", onPublish: (f) => up.push(f) }), "data-creative-publish", "card")[0].props.onClick();
    expect(up).toEqual([["card"]]);
  });
  it("the story's page: \"להשלמה · חסרים 2\" instead of a dead button; each missing frame named and a jump to its description", () => {
    const jumps: Check[] = [];
    const html = view({ form: OWNER, step: "story" });
    expect(html).not.toContain('data-creative-publish="story"');
    expect(btn(html, 'data-creative-complete="story"')).not.toContain("disabled");
    expect(html).toContain("להשלמה · חסרים 2");
    expect(html).toContain("תמונה 1: חסר תיאור (&quot;מה רואים בתמונה&quot;)");
    expect(html).toContain("תמונה 2: חסר תיאור (&quot;מה רואים בתמונה&quot;)");
    const t = tree({ form: OWNER, step: "story", onJump: (c) => jumps.push(c) });
    byData(t, "data-check-jump", "story:1:frame_alt")[0].props.onClick();
    byData(t, "data-creative-complete", "story")[0].props.onClick();
    expect(jumps.map((c) => [c.frame, c.field])).toEqual([[1, "frame_alt"], [0, "frame_alt"]]);
  });
  it("the story's thumbnails: a mark on 1 and 2, a ✓ on 3; \"fill the missing descriptions\" fills only them", () => {
    const changed: CreativeForm[] = [];
    const html = view({ form: OWNER, step: "story" });
    expect(html.match(/data-frame-missing="1"/g)).toHaveLength(2);
    expect(html.match(/data-frame-ready=""/g)).toHaveLength(1);
    expect(html).toContain("מילוי תיאור חסר מהכותרת");
    byData(tree({ form: OWNER, step: "story", onForm: (f) => changed.push(f) }), "data-frame-fill-alts")[0].props.onClick();
    expect(changed[0].frames.map((x) => x.image_alt)).toEqual(["הטבה בלעדית לדיירים — תמונה 1", "הטבה בלעדית לדיירים — תמונה 2", "בושם לגבר"]);
  });
  it("review #13 — the fill: the button says its source (the headline, else the advertiser); no source — no button; what it wrote asks to be checked", () => {
    const bases: string[] = [];
    byData(tree({ form: OWNER, step: "story", onFillAlts: (b) => bases.push(b) }), "data-frame-fill-alts")[0].props.onClick();
    expect(bases).toEqual(["הטבה בלעדית לדיירים"]);
    const noHead = view({ form: { ...OWNER, headline: "" }, step: "story" });
    expect(noHead).toContain("מילוי תיאור חסר משם המפרסם");
    expect(view({ form: { ...OWNER, headline: "" }, step: "story", advertiser: "" })).not.toContain("data-frame-fill-alts");
    // a filled description nobody changed yet: a hint under the field; changed — no hint
    const filled = { ...OWNER, frames: OWNER.frames.map((x, i) => (i === 0 ? { ...x, image_alt: "הטבה בלעדית לדיירים — תמונה 1" } : x)) };
    const auto = { [OWNER.frames[0].key]: "הטבה בלעדית לדיירים — תמונה 1" };
    expect(view({ form: filled, step: "story", frameSel: 0, autoAlts: auto })).toContain("מולא אוטומטית — כדאי לכתוב מה באמת רואים בתמונה");
    expect(view({ form: filled, step: "story", frameSel: 0, autoAlts: auto })).toContain("data-frame-alt-auto");
    const edited = { ...filled, frames: filled.frames.map((x, i) => (i === 0 ? { ...x, image_alt: "בקבוק חלב על שולחן" } : x)) };
    expect(view({ form: edited, step: "story", frameSel: 0, autoAlts: auto })).not.toContain("data-frame-alt-auto");
  });
  it("several images at once: the button calls the multi picker; its note is shown", () => {
    let many = 0;
    byData(tree({ form: OWNER, step: "story", onPickMany: () => many++ }), "data-frame-many")[0].props.onClick();
    expect(many).toBe(1);
    expect(view({ form: OWNER, step: "story", onPickMany: noop, manyNote: "נכנסו 3 מתוך 6 — עד 5 תמונות." })).toContain('data-frame-many-note="">נכנסו 3 מתוך 6');
  });
  it("the selected frame with an image and no description: the field marked red, with an example", () => {
    const html = view({ form: OWNER, step: "story", frameSel: 1 });
    // an unmarked field keeps its border colour (second review #7: removing only the longhand would drop the shorthand's colour)
    expect(html).toMatch(/border-color:var\(--border\)[^>]*data-frame-field="1.caption"/);
    expect(html).toMatch(/border-color:var\(--red\)[^>]*data-frame-field="1.image_alt"/);
    expect(html).toMatch(/aria-invalid="true"[^>]*data-frame-field="1.image_alt"|data-frame-field="1.image_alt"[^>]*aria-invalid="true"/);
    expect(html).toContain("חובה — 2 עד 200 תווים.");
  });
  it("the summary: card and full screen ready, story missing 2 — \"upload all ready (2)\" sends exactly those two", () => {
    const up: AdFormat[][] = [];
    const html = view({ form: OWNER, step: "summary" });
    expect(html).toContain('data-summary-row="card" data-summary-state="ready"');
    expect(html).toContain('data-summary-row="story" data-summary-state="missing"');
    expect(html).toContain("העלאת כל המוכנות (2)");
    byData(tree({ form: OWNER, step: "summary", onPublish: (f) => up.push(f) }), "data-creative-publish-all")[0].props.onClick();
    expect(up).toEqual([["card", "fullscreen"]]);
  });
});

describe("the creative studio — the image only through the upload button (a format's page)", () => {
  it("no free \"image address\" field; the image box, the alt, the focal picker; ready → its upload button enabled", () => {
    const html = view();
    expect(html).not.toContain('data-creative-field="image_url"');
    expect(html).not.toContain("או כתובת של תמונה");
    expect(html).toContain("data-creative-image=");
    expect(html).toContain('data-creative-field="image_alt"');
    expect(html).toContain('data-focal-picker="image"');
    expect(btn(html, 'data-creative-publish="card"')).not.toContain("disabled");
  });
  it("an outside image (an old creative): warned in the box, never loaded, the preview empty, and \"להשלמה\" instead of upload", () => {
    const form = FORM({ image: { image_url: FOREIGN, image_alt: "פיצה", focal: [0.5, 0.5] } });
    const html = view({ form, boxes: { image: box(FOREIGN) } });
    expect(html).toContain(IMAGE_FOREIGN_TEXT);
    expect(html).not.toContain(`src="${FOREIGN}"`);
    expect(html).toContain("התמונה תופיע כאן");
    expect(html).toContain("התמונה מאתר אחר — מעלים אותה מחדש");
    expect(html).not.toContain("data-creative-publish=");
    expect(html).toContain('data-creative-complete="card"');
  });
  it("bloc refused the image: the sentence at the image box (not only at the top)", () => {
    const html = view({ boxes: { image: box(FOREIGN, { phase: "idle" }, IMAGE_NOT_OURS_TEXT) } });
    expect(html.indexOf(IMAGE_NOT_OURS_TEXT)).toBeGreaterThan(html.indexOf("data-creative-image="));
    expect(html).not.toContain("data-creative-error");
  });
  it("review #9 — an accent bloc refuses: the content step lists it once and offers the nearest shade; a format cannot go up", () => {
    const form = FORM({ formats: ["card", "dialog"], accent: "#777777" });
    const content = view({ form, step: "content" });
    expect(content.match(/data-check-jump="accent"/g)).toHaveLength(1);
    expect(content).toContain("bloc לא שומר צבע כזה");
    expect(content).toContain('data-accent-suggest="#757575"');
    const page = view({ form, step: "card" });
    expect(page).toContain("צבע הכפתור לא קריא — צריך צבע כהה או בהיר יותר");
    expect(page).toContain(" · בשלב תוכן");
    expect(page).not.toContain("data-creative-publish=");
    expect(btn(view({ form: FORM({ formats: ["card", "dialog"], accent: "#757575" }), step: "card" }), 'data-creative-publish="card"')).not.toContain("disabled");
  });
  it("review #12 — an advertiser name over 30 characters: a gentle note under the content's preview", () => {
    const long = view({ step: "content", advertiser: "סטודיו היוגה והפילאטיס של השכונה הירוקה" });
    expect(long).toContain('data-creative-long-name="39"');
    expect(long).toContain("שם ארוך ייחתך בפס");
    expect(long).toContain("אפשר לקצר את השם בדף המפרסם");
    expect(view({ step: "content" })).not.toContain("data-creative-long-name");
  });
  it("while uploading an image: the upload button disabled", () => {
    expect(btn(view({ boxes: { image: box(OURS, { phase: "uploading", name: "b.png" }) } }), 'data-creative-publish="card"')).toContain('disabled=""');
  });
  it("several one-image formats: the shared image (crops per format) or one only for this format; \"back to the shared image\"", () => {
    const three = FORM({ formats: ["card", "dialog", "native"] });
    const shared = view({ form: three, step: "dialog" });
    expect(shared).toContain('data-creative-image-section="shared"');
    expect(shared).toContain('data-segmented="image-mode"');
    expect(shared).toContain("אותה תמונה משמשת גם את: כרטיס במרכז, כרטיס ברשימה");
    expect(shared).toContain('data-focal-crop="dialog"');
    const changed: CreativeForm[] = [];
    byData(tree({ form: three, step: "dialog", onForm: (f) => changed.push(f) }), "data-segment", "separate")[0].props.onClick();
    expect(changed[0].overrides.dialog).toEqual({ image_url: "", image_alt: "פיצה משפחתית", focal: [0.5, 0.5] });
    const o = { dialog: { image_url: OURS2, image_alt: "רחבה", focal: [0.5, 0.2] as [number, number] } };
    const p = props({ form: FORM({ formats: ["card", "dialog"], overrides: o }), step: "dialog", onForm: (f) => changed.push(f) });
    const html = renderToStaticMarkup(createElement(CreativeStudioView, p));
    expect(html).toContain('data-creative-image-section="separate"');
    expect(html).toContain(`src="${OURS2}"`);
    expect(html).toContain("תמונה רק לחלון קופץ");
    byData(CreativeStudioView(p), "data-image-back", "dialog")[0].props.onClick();
    expect(changed[1].overrides).toEqual({});
  });
  it("an uploaded image without a description: the field red, with an example (never on an empty new page)", () => {
    const html = view({ form: FORM({ image: { image_url: OURS, image_alt: "", focal: [0.5, 0.5] } }) });
    expect(html).toMatch(/aria-invalid="true"[^>]*data-creative-field="image_alt"|data-creative-field="image_alt"[^>]*aria-invalid="true"/);
    expect(html).toContain("חובה — 2 עד 200 תווים.");
    expect(view({ form: FORM({ image: { image_url: "", image_alt: "", focal: [0.5, 0.5] } }) })).not.toContain('aria-invalid="true"');
  });
  it("a format with its own image that is still empty: \"חסרה תמונה לפורמט הזה\"", () => {
    const html = view({ form: FORM({ formats: ["card", "fullscreen"], overrides: { fullscreen: { image_url: "", image_alt: "x", focal: [0.5, 0.5] } } }), step: "fullscreen" });
    expect(html).toContain("חסרה תמונה לפורמט הזה");
  });
  it("the shared image's hint: one format — its size; several — a big image, the focal point crops it for each", () => {
    expect(sharedHint(["dialog"])).toBe("JPEG, PNG או WebP, עד 2MB. הכי טוב ⁦1200×675⁩ (16:9).");
    expect(sharedHint(["card", "native"])).toContain("תמונה אחת לכל 2 הפורמטים");
  });
});

describe("the content step — texts, the button's colour, the final link", () => {
  it("templates prefill the headline, the sentence and the button (the link stays)", () => {
    const changed: CreativeForm[] = [];
    byData(tree({ step: "content", onForm: (f) => changed.push(f) }), "data-template", "event")[0].props.onClick();
    expect(changed[0]).toMatchObject({ headline: "מוזמנים לאירוע בשכונה", cta_label: "להרשמה", cta_url: "https://pizza.example" });
  });
  it("the final link with bloc's utm tags (or \"yours\" when the link has its own)", () => {
    expect(view({ step: "content" })).toContain("https://pizza.example/?utm_source=bloc&amp;utm_medium=sponsored");
    expect(view({ step: "content", form: FORM({ cta_url: "https://pizza.example/?utm_source=fb" }) })).toContain('data-creative-final-link="own"');
  });
  it("the accent picker on the content step (brand first); the theme only on a themed format's page; the banner's position on the banner's page", () => {
    expect(view({ step: "content", brandColor: "#DC2626" })).toContain('data-accent="brand"');
    expect(view()).not.toContain("data-creative-theme=");
    const form = FORM({ formats: ["card", "banner"], theme: "dark", banner_position: "top" });
    expect(view({ form, step: "card" })).not.toContain("data-creative-theme=");
    const banner = view({ form, step: "banner" });
    expect(banner).toContain('data-creative-theme="dark"');
    expect(banner).toContain('data-creative-banner-position="top"');
  });
  it("what the content still needs: a list with a jump to each field; \"התוכן מוכן\" when nothing", () => {
    const jumps: Check[] = [];
    const html = view({ step: "content", form: FORM({ headline: "", cta_url: "" }) });
    expect(html).toContain('data-checklist="content" data-checklist-count="2"');
    expect(html).toContain("חסרה כותרת");
    byData(tree({ step: "content", form: FORM({ headline: "" }), onJump: (c) => jumps.push(c) }), "data-check-jump", "headline")[0].props.onClick();
    expect(jumps[0]).toMatchObject({ step: "content", field: "headline" });
    expect(view({ step: "content" })).toContain("התוכן מוכן.");
  });
  it("review #4 — the field the user was sent to (or left) is marked: red, aria-invalid, the reason under it; never while typing, never an untouched form", () => {
    const empty = FORM({ headline: "", cta_label: "", cta_url: "" });
    const fresh = view({ step: "content", form: empty });
    expect(fresh).not.toContain('aria-invalid="true"');
    expect(fresh).not.toContain("data-content-issue");
    const sent = view({ step: "content", form: empty, flagged: ["headline", "cta_url"] });
    expect(sent).toMatch(/aria-invalid="true" aria-describedby="content-issue-headline"[^>]*border-color:var\(--red\)[^>]*data-creative-field="headline"/);
    expect(sent).toContain('data-content-issue="headline">חסרה כותרת</span>');
    expect(sent).toContain('id="content-issue-cta_url"');
    expect(sent).not.toContain('data-content-issue="cta_label"');
    const typing = FORM({ cta_url: "www.pizza.example", headline: "פ" });
    expect(view({ step: "content", form: typing })).not.toContain("data-content-issue");   // still typing — no mark
    const left = view({ step: "content", form: typing, flagged: ["cta_url", "headline"] });
    expect(left).toContain('data-content-issue="cta_url">הקישור של הכפתור צריך להתחיל ב-https://</span>');
    expect(left).toContain('data-content-issue="headline">הכותרת קצרה מדי — לפחות 2 תווים</span>');   // second review #6: not "missing"
    expect(view({ step: "content", flagged: ["headline"] })).not.toContain("data-content-issue");   // flagged but fixed — no mark
    // leaving a field flags it; an unmarked field still sets its border colour (second review #7: removing only the longhand would drop it)
    const flagged: string[] = [];
    const t = tree({ step: "content", onFlag: (f) => flagged.push(f) });
    for (const f of ["headline", "cta_label", "cta_url"]) byData(t, "data-creative-field", f)[0].props.onBlur();
    expect(flagged).toEqual(["headline", "cta_label", "cta_url"]);
    expect(view({ step: "content" })).toMatch(/border-color:var\(--border\)[^>]*data-creative-field="headline"/);
  });
  it("review #4 / #10 — the jump's highlight is a box-shadow (an inline outline:none cannot hide it); reduced motion: still, and the progress bar too", () => {
    const html = view({ step: "content" });
    expect(html).toContain("box-shadow: 0 0 0 4px rgba(234,179,8,.85)");
    expect(html).not.toMatch(/\.wiz-flash \{[^}]*outline/);
    expect(html).toContain("box-shadow: 0 0 0 3px rgba(234,179,8,.85) !important");
    expect(html).toContain("[data-wizard-progress] { transition: none !important; }");
  });
  it("review #5 — a format's pill is \"ready\" only when it can go up: missing shared content counts on every format", () => {
    const html = view({ step: "content", form: FORM({ formats: ["card", "fullscreen"], headline: "" }) });
    expect(btn(html, 'data-wizard-pill="card"')).toContain('data-pill-state="missing"');
    expect(btn(html, 'data-wizard-pill="fullscreen"')).toContain('data-pill-state="missing"');
    expect(html).toContain('aria-label="שלב 3: כרטיס במרכז — חסר פרט אחד"');
  });
  it("after part went up: said once on the content step — changes apply only to what is not up yet", () => {
    const html = view({ form: OWNER, step: "content", batch: [B("fullscreen", "ok")] });
    expect(html).toContain(afterUploadText(["fullscreen"]));
    expect(afterUploadText(["fullscreen"])).toBe("המודעה במסך מלא כבר עלתה. שינוי כאן חל רק על מה שעוד לא עלה.");
    expect(afterUploadText(["card", "fullscreen"])).toBe("המודעות בכרטיס במרכז ובמסך מלא כבר עלו. שינוי כאן חל רק על מה שעוד לא עלה.");
    expect(view({ form: OWNER, step: "content" })).not.toContain("data-creative-after-upload");
  });
  it("Checklist alone: the ready line and the items (with \"in step …\" when the field is elsewhere)", () => {
    const c: Check = { id: "headline", text: "חסרה כותרת", step: "content", field: "headline" };
    expect(renderToStaticMarkup(createElement(Checklist, { checks: [c], onJump: noop, here: "card", readyText: "x", testId: "t" }))).toContain("חסרה כותרת<span");
    expect(renderToStaticMarkup(createElement(Checklist, { checks: [c], onJump: noop, here: "card", readyText: "x", testId: "t" }))).toContain(" · בשלב תוכן");
    expect(renderToStaticMarkup(createElement(Checklist, { checks: [], onJump: noop, here: "card", readyText: "מוכן להעלאה.", testId: "t" }))).toContain("מוכן להעלאה.");
  });
});

describe("uploading per format (394) — results, retry, an unclear answer stops everything", () => {
  const three: CreativeForm = FORM({ formats: ["card", "dialog", "native"] });
  it("an uploaded format's page: \"עלתה\", no upload again, next is the main action", () => {
    const html = view({ form: three, step: "card", batch: [B("card", "ok")] });
    expect(html).toContain('data-batch-item="card" data-batch-state="ok"');
    expect(html).toContain("המודעה בכרטיס במרכז עלתה — היא ברשימת המודעות של הקמפיין.");
    expect(html).not.toContain("data-creative-publish=");
    expect(btn(html, "data-studio-next")).toContain("background");
    expect(html).not.toContain("data-creative-image-section");
  });
  it("the summary: each format's state in words; a failure shows bloc's sentence and \"נסו שוב\" (which uploads that format again)", () => {
    const up: AdFormat[][] = [];
    const batch = [B("card", "ok"), B("dialog", "failed", "תמונה 2 לא הועלתה ל-bloc"), B("native", "waiting")];
    const html = view({ form: three, step: "summary", batch });
    expect(html).toContain('data-creative-batch="card:ok,dialog:failed,native:waiting"');
    expect(html).toContain("אפשר להעלות כל אחת לבד, או את כל המוכנות בבת אחת.");
    expect(html).toContain(`data-summary-text="card">${BATCH_TEXT.ok}`);
    expect(html).toContain('data-summary-text="dialog">לא עלתה');
    expect(html).toContain('data-batch-error="dialog"');
    expect(html).toContain('data-summary-text="native">בתור');
    byData(tree({ form: three, step: "summary", batch, onPublish: (f) => up.push(f) }), "data-batch-retry", "dialog")[0].props.onClick();
    expect(up).toEqual([["dialog"]]);
  });
  it("a failed format's own page: bloc's sentence, and its button says \"נסו שוב\"", () => {
    const html = view({ form: three, step: "dialog", batch: [B("dialog", "failed", "bloc דחה")] });
    expect(html).toContain('data-batch-error="dialog">bloc דחה');
    expect(html).toContain("המודעה בחלון קופץ — לא עלתה");
    expect(html).toContain("נסו שוב");
  });
  it("unclear: \"maybe up — refresh\", no retry, no upload anywhere; \"close and refresh\" instead", () => {
    const batch = [B("card", "ok"), B("dialog", "unclear", "התשובה מהשרת לא ברורה"), B("native", "waiting")];
    const html = view({ form: three, step: "summary", batch, stale: true });
    expect(html).toContain("ייתכן שעלתה — רעננו לפני שממשיכים");
    expect(html).not.toContain("data-batch-retry");
    expect(html).toContain("data-creative-recheck");
    expect(html).toContain("ייתכן שבוצע — רעננו");
    expect(btn(view({ form: three, step: "native", batch, stale: true }), 'data-creative-publish="native"')).toContain('disabled=""');
    // after an unclear answer even a definite failure offers no retry until the refresh
    expect(view({ form: three, step: "summary", batch: [B("card", "unclear"), B("dialog", "failed", "e")], stale: true })).not.toContain("data-batch-retry");
  });
  it("a definite error: no refresh button, uploading stays possible", () => {
    const html = view({ err: "הקמפיין של הפרסומת לא נמצא" });
    expect(html).not.toContain("data-creative-recheck");
    expect(btn(html, 'data-creative-publish="card"')).not.toContain("disabled");
  });
  it("finish with part uploaded: \"סיום\" calls the finish (the studio closes and says what went up); with nothing up it says \"ביטול\"", () => {
    let done = 0;
    byData(tree({ form: three, step: "summary", batch: [B("card", "ok")], onFinish: () => done++ }), "data-creative-finish")[0].props.onClick();
    expect(done).toBe(1);
    expect(btn(view({ form: three, step: "summary" }), "data-creative-finish")).toContain("data-creative-finish");
    expect(view({ form: three, step: "summary" })).toContain(">ביטול</button>");
  });
  it("review #11 — a failed format that now misses something: \"להשלמה\" (a jump), not a dead \"נסו שוב\"", () => {
    const jumps: Check[] = [];
    const form = FORM({ formats: ["card", "dialog"], headline: "" });
    const batch = [B("dialog", "failed", "bloc דחה")];
    const html = view({ form, step: "summary", batch });
    expect(html).toContain('data-summary-complete="dialog"');
    expect(html).not.toContain("data-batch-retry");
    expect(html).toContain('data-summary-text="dialog">לא עלתה · חסר פרט אחד');
    byData(tree({ form, step: "summary", batch, onJump: (c) => jumps.push(c) }), "data-summary-complete", "dialog")[0].props.onClick();
    expect(jumps[0]).toMatchObject({ field: "headline" });
  });
  it("review #9 — the summary's row actions are 44px touch targets", () => {
    const batch = [B("dialog", "failed", "e")];
    const html = view({ form: FORM({ formats: ["card", "dialog", "native"], headline: "" }), step: "summary" });
    expect(btn(html, 'data-summary-complete="card"')).toContain("min-height:44px");
    expect(btn(view({ form: three, step: "summary" }), 'data-summary-publish="card"')).toContain("min-height:44px");
    expect(btn(view({ form: three, step: "summary", batch }), 'data-batch-retry="dialog"')).toContain("min-height:44px");
  });
  it("review #2 — while a run goes what is edited is locked; the preview, \"מה חסר\" and the steps stay open (second review #5)", () => {
    const run = [B("card", "saving"), B("dialog", "waiting")];
    const busy = view({ form: { ...three, headline: "" }, step: "content", busy: true, batch: run });
    expect(busy).toMatch(/<fieldset disabled=""[^>]*data-studio-lock="on"/);
    const start = busy.indexOf("<fieldset"), end = busy.indexOf("</fieldset>");
    const inside = busy.slice(start, end);
    for (const x of ["data-template=", 'data-creative-field="headline"', 'data-creative-field="cta_url"', "data-accent-picker", 'data-creative-field="coupon_code"']) expect(inside, x).toContain(x);
    expect(busy.indexOf('data-check-jump="headline"')).toBeGreaterThan(end);   // the jumps: outside
    expect(busy.indexOf("data-preview-tab=")).toBeGreaterThan(end);    // the preview's tabs: outside
    // a format's page: its image and style inside, its checklist and preview outside; an uploaded format's page has no lock at all
    const fp = view({ form: { ...three, image: { ...three.image, image_alt: "" } }, step: "dialog", busy: true, batch: run });
    const fin = fp.slice(fp.indexOf("<fieldset"), fp.indexOf("</fieldset>"));
    expect(fin).toContain("data-creative-image-section=");
    expect(fin).toContain('data-creative-field="image_alt"');
    expect(fp.indexOf('data-checklist="dialog"')).toBeGreaterThan(fp.indexOf("</fieldset>"));
    expect(view({ form: three, step: "card", batch: [B("card", "ok")] })).not.toContain("<fieldset");
    // the focal slider is a div (a fieldset does not reach it) — disabled by its own prop
    const page = view({ form: three, step: "dialog", busy: true, batch: run });
    expect(page).toMatch(/role="slider" tabindex="-1"[^>]*aria-disabled="true"/);
    expect(view({ form: three, step: "dialog" })).toMatch(/role="slider" tabindex="0"/);
    expect(btn(busy, 'data-studio-next="card"')).not.toContain("disabled");
    expect(btn(busy, 'data-wizard-pill="summary"')).not.toContain("disabled");
    expect(view({ form: three, step: "content" })).toMatch(/<fieldset[^>]*data-studio-lock="off"/);
    expect(view({ form: three, step: "content" })).not.toMatch(/<fieldset disabled/);
    // a queued format's own page says it is waiting
    expect(view({ form: three, step: "dialog", busy: true, batch: [B("card", "saving"), B("dialog", "waiting")] })).toContain("בתור…");
  });
});

describe("editing — only while never shown; a shown ad is locked: duplicate it", () => {
  it("never shown: content → its format; no formats step; the format's page saves (\"שמירת המודעה\")", () => {
    const saved: number[] = [];
    const p = props({ mode: "edit", step: "card", onSave: () => saved.push(1) });
    const html = renderToStaticMarkup(createElement(CreativeStudioView, p));
    expect(html).toContain('data-wizard-steps="content,card"');
    expect(html).not.toContain("data-format-gallery");
    expect(html).toContain("מוכן לשמירה.");
    byData(CreativeStudioView(p), "data-creative-save")[0].props.onClick();
    expect(saved).toEqual([1]);
    expect(btn(view({ mode: "edit", step: "card", form: FORM({ headline: "" }) }), "data-creative-save")).toContain('disabled=""');
  });
  it("shown: \"נעולה — שכפלו כדי לשנות\", no fields, no save — \"duplicate as a new ad\"", () => {
    const dups: number[] = [];
    const p = props({ mode: "edit", served: true, onDuplicate: () => dups.push(1) });
    const html = renderToStaticMarkup(createElement(CreativeStudioView, p));
    expect(html).toContain(CREATIVE_LOCKED_TEXT);
    expect(html).not.toContain("data-creative-save");
    expect(html).not.toContain("data-creative-field");
    byData(CreativeStudioView(p), "data-creative-duplicate")[0].props.onClick();
    expect(dups).toEqual([1]);
  });
  it("duplicate mode: said, all the steps (formats can be added), and each format uploads", () => {
    const html = view({ mode: "duplicate", step: "card" });
    expect(html).toContain("data-creative-copy");
    expect(html).toContain('data-wizard-steps="formats,content,card,summary"');
    expect(html).toContain('data-creative-publish="card"');
  });
});

describe("cancel asks first (399)", () => {
  it("the ask in the bar: leave without uploading / keep editing", () => {
    let left = 0, kept = 0;
    const p = props({ step: "formats", confirmCancel: true, onCancel: () => left++, onKeepEditing: () => kept++ });
    const html = renderToStaticMarkup(createElement(CreativeStudioView, p));
    expect(html).toContain(leaveText("new", [], []));
    expect(html).toContain(">יציאה בלי להעלות</button>");
    expect(html).not.toContain("data-studio-next");
    byData(CreativeStudioView(p), "data-creative-cancel-yes")[0].props.onClick();
    byData(CreativeStudioView(p), "data-creative-cancel-no")[0].props.onClick();
    expect([left, kept]).toEqual([1, 1]);
  });
  it("review #6/#7 — after part went up the ask names what is up and what is not; in an edit it speaks of saving", () => {
    const part = view({ form: OWNER, step: "formats", confirmCancel: true, batch: [B("fullscreen", "ok")] });
    expect(part).toContain("המודעה במסך מלא כבר עלתה. המודעות בכרטיס במרכז ובסטורי ממומן עוד לא הועלו. לצאת בלי להעלות אותן?");
    const edit = view({ mode: "edit", step: "content", confirmCancel: true });
    expect(edit).toContain("יש שינויים שעוד לא נשמרו. לצאת בלי לשמור? השינויים לא יישמרו.");
    expect(edit).toContain(">יציאה בלי לשמור</button>");
    expect(edit).not.toContain("להעלות");
  });
  it("third review #3 — mid-upload the studio's question has no live way out (the question itself gives way to the upload)", () => {
    const html = view({ form: OWNER, step: "summary", confirmCancel: true, busy: true, batch: [B("card", "saving")] });
    expect(btn(html, "data-creative-cancel-yes")).toContain('disabled=""');
    expect(btn(view({ form: OWNER, step: "summary", confirmCancel: true }), "data-creative-cancel-yes")).not.toContain("disabled");
  });
});

describe("second review #2 / #8 — the sheet's question: the button has the question's verb, and nothing closes mid-upload", () => {
  it("idle: \"יציאה בלי להעלות\" closes, \"המשך עריכה\" stays; mid-upload the closing button is disabled", () => {
    let left = 0, stayed = 0;
    const p = { text: leaveText("new", [], []), yes: "יציאה בלי להעלות", busy: false, onLeave: () => left++, onStay: () => stayed++ };
    const idle = renderToStaticMarkup(createElement(SheetGuard, p));
    expect(idle).toContain('role="alertdialog" aria-label="יציאה בלי להעלות?"');
    expect(idle).toContain(leaveText("new", [], []));
    expect(btn(idle, "data-sheet-guard-close")).not.toContain("disabled");
    const el = SheetGuard(p);
    byData(el, "data-sheet-guard-close")[0].props.onClick();
    byData(el, "data-sheet-guard-stay")[0].props.onClick();
    expect([left, stayed]).toEqual([1, 1]);
    expect(btn(renderToStaticMarkup(createElement(SheetGuard, { ...p, busy: true })), "data-sheet-guard-close")).toContain('disabled=""');
  });
});

describe("review #1 — the studio inside the campaign wizard: one sticky bar, and leaving step 2 asks", () => {
  const bar = (o: Partial<Parameters<typeof CampaignBarView>[0]> = {}) => {
    const p = { step: 2, id: "k1", canNext: true, busy: null, stale: null, inline: null, leaveTo: null, onBack: noop, onNext: noop, onLeave: noop, onStay: noop, ...o };
    return { html: renderToStaticMarkup(createElement(CampaignBarView, p)), el: CampaignBarView(p) };
  };
  const st = (o: Partial<StudioState> = {}): StudioState => ({ ...STUDIO_IDLE, ...o });
  it("the studio's own bar is the sticky one; the wizard's bar on step 2 becomes a plain row (secondary) — never two sticky bars", () => {
    expect(view({ step: "content" })).toMatch(/data-sticky-bar="studio" data-sticky="1"/);
    const inl = bar({ inline: st() }).html;
    expect(inl).toMatch(/data-sticky-bar="wizard" data-sticky="0"/);
    expect(inl).toContain("position:static");
    expect(inl).toContain("אפשר להוסיף מודעות גם אחר כך");
    expect(inl).toContain("הקודם: מפרסם");   // under the studio's own "הקודם" the wizard's says where it goes
    expect(bar().html).not.toContain("הקודם: מפרסם");
    expect(btn(inl, 'data-wizard-next="2"')).not.toContain("disabled");
    expect(btn(inl, 'data-wizard-next="2"')).not.toContain("background:var(--blue)");   // secondary next to the studio's own actions
    expect(btn(bar().html, 'data-wizard-next="2"')).toContain("background:var(--blue)");
    // without the studio (the list is shown) — the wizard's bar stays sticky, as before
    expect(bar().html).toMatch(/data-sticky-bar="wizard" data-sticky="1"/);
    expect(bar({ step: 3, inline: st() }).html).toMatch(/data-sticky-bar="wizard" data-sticky="1"/);
  });
  it("mid-upload in the studio: no leaving the step (back and next disabled), and it says so", () => {
    const html = bar({ inline: st({ busy: true }) }).html;
    expect(btn(html, 'data-wizard-next="2"')).toContain('disabled=""');
    expect(btn(html, "data-wizard-back")).toContain('disabled=""');
    expect(html).toContain('data-wizard-studio-note="busy"');
  });
  it("asked to leave with work in the studio: the same sentence as the studio, \"מעבר לקהל בלי להעלות\" / \"המשך עריכה\"", () => {
    let left = 0, stayed = 0;
    const o = { inline: st({ dirty: true, up: ["card"] as AdFormat[], rest: ["story"] as AdFormat[] }), leaveTo: 3, onLeave: () => left++, onStay: () => stayed++ };
    const { html, el } = bar(o);
    // second review #3: the question is a plain row at the end — it never covers the studio's sticky bar
    expect(html).toMatch(/data-sticky-bar="wizard-leave" data-sticky="0"/);
    expect(html).toContain(leaveText("new", ["card"], ["story"], "קהל"));
    expect(html).toContain("לעבור לקהל בלי להעלות אותה?");
    expect(html).toContain("מעבר לקהל בלי להעלות");
    byData(el, "data-wizard-leave-yes")[0].props.onClick();
    byData(el, "data-wizard-leave-no")[0].props.onClick();
    expect([left, stayed]).toEqual([1, 1]);
    expect(html).not.toContain("data-wizard-next");
    // "לסטודיו" at the top asks the same, to the studio home
    expect(bar({ ...o, leaveTo: "home" }).html).toContain("מעבר לסטודיו הפרסום בלי להעלות");
  });
  it("third review #2 — the campaign step bar: a step that cannot be reached now looks it (a phone has no cursor)", () => {
    const h = renderToStaticMarkup(createElement(StepBar, { steps: ["א", "ב", "ג"], current: 2, reachable: (n: number) => n !== 3, onStep: noop }));
    expect(h).toMatch(/disabled=""[^>]*opacity:0.5[^>]*>|opacity:0.5[^>]*data-step="3"|data-step="3"[^>]*opacity:0.5/);
    expect(h).toMatch(/data-step="1"[^>]*opacity:1|opacity:1[^>]*data-step="1"/);
    expect(h).toMatch(/data-step="2"[^>]*opacity:1|opacity:1[^>]*data-step="2"/);
  });
  it("second review #1 — an upload started under the question: no question, no way out, just the hold", () => {
    const html = bar({ inline: st({ busy: true, dirty: true }), leaveTo: 3 }).html;
    expect(html).not.toContain("data-wizard-leave-yes");
    expect(html).toContain('data-wizard-studio-note="busy"');
    expect(btn(html, 'data-wizard-next="2"')).toContain('disabled=""');
  });
  it("the last step keeps only \"הקודם\"; step 1 without a draft says \"שמירה והמשך\"", () => {
    expect(bar({ step: 5 }).html).toContain("data-wizard-back");
    expect(bar({ step: 5 }).html).not.toContain("data-wizard-next");
    expect(bar({ step: 1, id: null }).html).toContain("שמירה והמשך");
    expect(btn(bar({ step: 1, id: null, canNext: false }).html, "data-wizard-next")).toContain('disabled=""');
  });
});

describe("the stateful studio and the list", () => {
  it("CreativeStudio renders both hidden file inputs (one image / several — JPEG / PNG / WebP) and starts at the formats", () => {
    const html = renderToStaticMarkup(createElement(CreativeStudio, { campaignId: "k1", advertiser: "פיצה", mode: { kind: "new" }, imageBase: BASE, template: "perk", onDone: noop, animate: false }));
    expect(html.match(/accept="image\/jpeg,image\/png,image\/webp"/g)).toHaveLength(2);
    expect(html).toMatch(/multiple=""[^>]*data-creative-files=""|data-creative-files=""[^>]*multiple=""/);
    expect(html).toContain('data-creative-studio="new"');
    expect(html).toContain('data-wizard-current="formats"');
  });
  it("the opening form: a template prefills the texts; an edit / a copy start from the ad (and the studio at its content)", () => {
    expect(initialCreativeForm({ kind: "new" }, "perk", null, (i) => `k${i}`).headline).toBe("הטבה בלעדית לדיירים");
    expect(initialCreativeForm({ kind: "new" }, null, "#DC2626", (i) => `k${i}`).headline).toBe("");
    expect(initialCreativeForm({ kind: "duplicate", creative: CR() }, null, null, (i) => `k${i}`).headline).toBe("פיצה ב-49");
    const html = renderToStaticMarkup(createElement(CreativeStudio, { campaignId: "k1", advertiser: "פיצה", mode: { kind: "duplicate", creative: CR() }, imageBase: BASE, onDone: noop, animate: false }));
    expect(html).toContain('data-wizard-current="content"');
  });
  it("CreativeCard: format, outside image never loaded (marked), shown → locked chip, no edit / delete, \"duplicate to change\"", () => {
    const card = (c: AdCreativeRow, served = 0) => renderToStaticMarkup(createElement(CreativeCard, { c, served, imageBase: BASE, canManage: true, busy: false, onToggle: noop, onEdit: noop, onDuplicate: noop, onDelete: noop }));
    const out = card(CR({ id: "c2", image_url: FOREIGN }));
    expect(out).toContain('data-creative-foreign="c2"');
    expect(out).toContain("תמונה מאתר אחר — לא מוצגת");
    expect(out).not.toContain(`src="${FOREIGN}"`);
    expect(out).toContain('data-creative-thumb="foreign"');
    const fresh = card(CR());
    expect(fresh).toContain("data-creative-edit");
    expect(fresh).toContain("data-creative-delete");
    expect(fresh).toContain('object-position:50% 50%');
    const shown = card(CR({ format: "story", frames: [{ image_url: OURS, image_alt: "א", caption: null, cta_url: null, focal: null }, { image_url: OURS2, image_alt: "ב", caption: null, cta_url: null, focal: null }] }), 12);
    expect(shown).toContain('data-creative-served="12"');
    expect(shown).toContain(CREATIVE_LOCKED_TEXT);
    expect(shown).not.toContain("data-creative-edit");
    expect(shown).not.toContain("data-creative-delete");
    expect(shown).toContain("שכפול כדי לשנות");
    expect(shown).toContain('data-creative-frames="2"');
    expect(card(CR({ active: false }))).toContain('aria-checked="false"');
  });
  it("CreativeList: the cards and \"+ מודעה\"; in the wizard with no ads yet — the studio itself", () => {
    const list = renderToStaticMarkup(createElement(CreativeList, { campaignId: "k1", creatives: [CR()], serves: {}, advertiser: "פיצה", advertiserLogo: null, brandColor: null, imageBase: BASE, canManage: true }));
    expect(list).toContain('data-creative-card="c1"');
    expect(list).toContain("data-creative-new");
    const inline = renderToStaticMarkup(createElement(CreativeList, { campaignId: "k1", creatives: [], serves: {}, advertiser: "פיצה", advertiserLogo: null, brandColor: null, imageBase: BASE, canManage: true, inlineWhenEmpty: true }));
    expect(inline).toContain('data-creative-list="inline"');
    expect(inline).toContain('data-creative-studio="new"');
    expect(RECHECK_TEXT.creative).toMatch(/[א-ת]/);
  });
});
void UPLOAD_FAILED_TEXT;
