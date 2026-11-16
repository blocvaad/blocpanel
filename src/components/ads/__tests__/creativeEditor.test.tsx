// PANEL-PAY א2ב (החלטות 372–373) — עורך המודעה (מרונדר לשרת, בלי דפדפן); ADS-2א v2: סטודיו המודעה (studio/CreativeStudio):
//   • התמונה רק דרך כפתור ההעלאה: אין שדה "כתובת של תמונה"; תיבת התמונה אומרת מה קורה (אין / מעלים / הועלתה /
//     שמורה ב-bloc / מאתר אחר / ההעלאה נכשלה / bloc סירב — image_not_ours).
//   • מודעה ישנה עם תמונה מאתר אחר מסומנת ברשימה, ואי אפשר ליצור / לשמור בלי להעלות; היא לא נטענת גם בפאנל.
//   • "צור מודעה בכל פורמט שבחרתי": תוצאה לכל פורמט; נכשל — המשפט ו"נסו שוב"; לא ברור — עוצרים, ובמקום יצירה — "סגירה ורענון".
//   • מודעה שהוצגה — נעולה ("נעולה — שכפלו כדי לשנות"), שכפול כמודעה חדשה.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CreativeImageField from "../CreativeImageField";
import CreativeStudio, { CreativeStudioView, sharedHint, batchResume, overrideKey, BATCH_TEXT, type CreativeStudioViewProps } from "../studio/CreativeStudio";
import CreativeCard from "../studio/CreativeCard";
import CreativeList from "../studio/CreativeList";
import { imageBoxState, IMAGE_NOT_OURS_TEXT, UPLOAD_FAILED_TEXT, IMAGE_FOREIGN_TEXT, RECHECK_TEXT, type UploadState } from "@/lib/adsUi";
import { emptyCreativeForm, type CreativeForm } from "@/lib/adsStudio";
import { CREATIVE_LOCKED_TEXT } from "@/lib/adsFormats";
import type { AdCreativeRow } from "@/lib/adsServer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));

const BASE = "https://abc.supabase.co/storage/v1/object/public/ads/";
const OURS = `${BASE}creatives/2026-11/a.webp`;
const FOREIGN = "https://cdn.example.com/pizza.jpg";
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
/** every element in the tree — through children and through element-valued props (a Banner's action, …). */
function find(n: any, pred: (e: El) => boolean, out: El[] = []): El[] {
  for (const k of kids(n)) if (typeof k === "object" && k.props) {
    if (pred(k)) out.push(k);
    for (const [name, v] of Object.entries(k.props)) if (name === "children" || (v && typeof v === "object" && ((v as any).props || Array.isArray(v)))) find(v, pred, out);
  }
  return out;
}
const byData = (tree: any, attr: string, value?: string | number) =>
  find(tree, (e) => e.props?.[attr] !== undefined && (value === undefined || String(e.props[attr]) === String(value)));

const CR = (o: Partial<AdCreativeRow> = {}): AdCreativeRow => ({
  id: "c1", campaign_id: "k1", image_url: OURS, image_alt: "פיצה", headline: "פיצה ב-49", body: null,
  cta_label: "להזמנה", cta_url: "https://pizza.example", active: true, created_at: "2026-11-01T10:00:00Z",
  format: "card", banner_position: null, theme: "light", accent: null, focal_x: 0.5, focal_y: 0.5, frames: null, ...o,
});
const FORM = (o: Partial<CreativeForm> = {}): CreativeForm => ({
  ...emptyCreativeForm((i) => `k${i}`), image: { image_url: OURS, image_alt: "פיצה משפחתית", focal: [0.5, 0.5] },
  headline: "פיצה ב-49", body: "", cta_label: "להזמנה", cta_url: "https://pizza.example", ...o,
});
const noop = () => {};
const props = (o: Partial<CreativeStudioViewProps> = {}): CreativeStudioViewProps => {
  const form = o.form ?? FORM();
  const boxes = o.boxes ?? Object.fromEntries([["image", box(form.image.image_url)], ...form.frames.map((f) => [f.key, box(f.image_url)])]);
  return {
    mode: "new", served: false, form, onForm: noop, advertiser: "פיצה השכונה", advertiserLogo: null, brandColor: null, imageBase: BASE,
    separate: false, onSeparate: noop, editFormat: "card", onEditFormat: noop, boxes, onPick: noop, frameSel: 0, onFrameSel: noop, refusedFrame: null,
    onAddFrame: noop, batch: null, busy: false, err: null, stale: false, onCreate: noop, onRetry: noop, onSave: noop, onDuplicate: noop, onRecheck: noop,
    onCancel: noop, animate: false, ...o,
  };
};
const view = (o: Partial<CreativeStudioViewProps> = {}) => renderToStaticMarkup(createElement(CreativeStudioView, props(o)));
const btn = (html: string, attr: string) => { const at = html.indexOf(attr); return at < 0 ? "" : html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at)); };

describe("the creative studio — the image only through the upload button", () => {
  it("no free \"image address\" field; the image box, the alt, the focal picker; ready → create enabled", () => {
    const html = view();
    expect(html).not.toContain('data-creative-field="image_url"');
    expect(html).not.toContain("או כתובת של תמונה");
    expect(html).toContain("data-creative-image=");
    expect(html).toContain('data-creative-field="image_alt"');
    expect(html).toContain('data-focal-picker="image"');
    expect(btn(html, "data-creative-create")).not.toContain("disabled");
    expect(html).toContain(">יצירת המודעה<");
  });
  it("an outside image (an old creative): warned in the box, never loaded (no <img> with its address), the preview empty, create disabled", () => {
    const form = FORM({ image: { image_url: FOREIGN, image_alt: "פיצה", focal: [0.5, 0.5] } });
    const html = view({ form, boxes: { image: box(FOREIGN) } });
    expect(html).toContain(IMAGE_FOREIGN_TEXT);
    expect(html).not.toContain(`src="${FOREIGN}"`);
    expect(html).toContain("התמונה תופיע כאן");
    expect(html).toContain("התמונה מאתר אחר — מעלים אותה בכפתור ההעלאה.");
    expect(btn(html, "data-creative-create")).toContain('disabled=""');
  });
  it("bloc refused the image: the sentence at the image box (not only at the top)", () => {
    const html = view({ boxes: { image: box(FOREIGN, { phase: "idle" }, IMAGE_NOT_OURS_TEXT) } });
    expect(html.indexOf(IMAGE_NOT_OURS_TEXT)).toBeGreaterThan(html.indexOf("data-creative-image="));
    expect(html).not.toContain("data-creative-error");
  });
  it("review #9 — an accent bloc refuses blocks create: said once (not per format), next to the issues; the nearest shade offered", () => {
    const html = view({ form: FORM({ formats: ["card", "dialog"], accent: "#777777" }) });
    expect(btn(html, "data-creative-create")).toContain('disabled=""');
    expect(html.match(/data-creative-accent-issue=""/g)).toHaveLength(1);
    expect(html).toContain("bloc לא שומר צבע כזה");
    expect(html).toContain('data-accent-suggest="#757575"');
    expect(btn(view({ form: FORM({ formats: ["card", "dialog"], accent: "#757575" }) }), "data-creative-create")).not.toContain("disabled");
  });
  it("review #12 — an advertiser name over 30 characters: a gentle note under the preview (the count, where to shorten it)", () => {
    const long = view({ advertiser: "סטודיו היוגה והפילאטיס של השכונה הירוקה" });
    expect(long).toContain('data-creative-long-name="39"');
    expect(long).toContain("שם ארוך ייחתך בפס");
    expect(long).toContain("אפשר לקצר את השם בדף המפרסם");
    expect(view()).not.toContain("data-creative-long-name");
  });
  it("while uploading: create disabled", () => {
    expect(btn(view({ boxes: { image: box(OURS, { phase: "uploading", name: "b.png" }) } }), "data-creative-create")).toContain('disabled=""');
  });
  it("several one-image formats: one image for all (crops per format) or a separate image per format — tabs, \"back to the shared image\"", () => {
    const shared = view({ form: FORM({ formats: ["card", "dialog", "native"] }) });
    expect(shared).toContain('data-creative-image-section="shared"');
    expect(shared).toContain('data-segmented="image-mode"');
    for (const f of ["card", "dialog", "native"]) expect(shared).toContain(`data-focal-crop="${f}"`);   // each format's live crop
    const o = { dialog: { image_url: OURS2, image_alt: "רחבה", focal: [0.5, 0.2] as [number, number] } };
    const changed: CreativeForm[] = [];
    const p = props({ form: FORM({ formats: ["card", "dialog"], overrides: o }), separate: true, editFormat: "dialog", onForm: (f) => changed.push(f),
      boxes: { image: box(OURS), [overrideKey("dialog")]: box(OURS2) } });
    const html = renderToStaticMarkup(createElement(CreativeStudioView, p));
    expect(html).toContain('data-creative-image-section="separate"');
    expect(html).toContain('data-image-tab="dialog"');
    expect(html).toContain(`src="${OURS2}"`);
    byData(CreativeStudioView(p), "data-image-back", "dialog")[0].props.onClick();
    expect(changed[0].overrides).toEqual({});
  });
  it("the shared image's hint: one format — its size; several — a big image, the focal point crops it for each", () => {
    expect(sharedHint(["dialog"])).toBe("JPEG, PNG או WebP, עד 2MB. הכי טוב \u20661200×675\u2069 (16:9).");
    expect(sharedHint(["card", "native"])).toContain("תמונה אחת לכל 2 הפורמטים");
  });
});

describe("the creative studio — texts, style, the final link", () => {
  it("templates prefill the headline, the sentence and the button (the link stays)", () => {
    const changed: CreativeForm[] = [];
    byData(CreativeStudioView(props({ onForm: (f) => changed.push(f) })), "data-template", "event")[0].props.onClick();
    expect(changed[0]).toMatchObject({ headline: "מוזמנים לאירוע בשכונה", cta_label: "להרשמה", cta_url: "https://pizza.example" });
  });
  it("the final link with bloc's utm tags (or \"yours\" when the link has its own)", () => {
    expect(view()).toContain("https://pizza.example/?utm_source=bloc&amp;utm_medium=sponsored");
    expect(view({ form: FORM({ cta_url: "https://pizza.example/?utm_source=fb" }) })).toContain('data-creative-final-link="own"');
  });
  it("the theme only when a themed format is chosen; the banner's position only with a banner; the accent picker always (brand first)", () => {
    expect(view()).not.toContain("data-creative-theme=");
    expect(view()).not.toContain("data-creative-banner-position");
    const html = view({ form: FORM({ formats: ["dialog", "banner"], theme: "dark", banner_position: "top" }), brandColor: "#DC2626" });
    expect(html).toContain('data-creative-theme="dark"');
    expect(html).toContain('data-creative-banner-position="top"');
    expect(html).toContain('data-accent="brand"');
  });
  it("what each format still needs is said, per format", () => {
    const html = view({ form: FORM({ formats: ["card", "story"], headline: "" }) });
    expect(html).toContain('data-creative-issues="card,story"');
    expect(html).toContain("חסרה כותרת.");
    expect(btn(html, "data-creative-create")).toContain('disabled=""');
  });
});

describe("\"צור מודעה בכל פורמט שבחרתי\" — a result per format, retry, an unclear answer stops it", () => {
  const three: CreativeForm = FORM({ formats: ["card", "dialog", "native"] });
  it("the button names the run; after a partial success — \"continue: what is left\"", () => {
    expect(view({ form: three })).toContain("צור מודעה בכל פורמט שבחרתי (3)");
    const html = view({ form: three, batch: [{ format: "card", state: "ok", id: "x" }, { format: "dialog", state: "failed", error: "bloc דחה" }, { format: "native", state: "ok", id: "y" }] });
    expect(html).toContain("המשך — יצירת מה שנשאר (1)");
  });
  it("each format's state in words; a failure shows bloc's sentence and \"נסו שוב\" (which retries that format)", () => {
    const retried: number[] = [];
    const batch = [{ format: "card" as const, state: "ok" as const, id: "x" }, { format: "dialog" as const, state: "failed" as const, error: "תמונה 2 לא הועלתה ל-bloc" }, { format: "native" as const, state: "waiting" as const }];
    const html = view({ form: three, batch });
    expect(html).toContain('data-creative-batch="card:ok,dialog:failed,native:waiting"');
    expect(html).toContain(`כרטיס במרכז — ${BATCH_TEXT.ok}`);
    expect(html).toContain("חלון קופץ — לא נוצרה");
    expect(html).toContain('data-batch-error="dialog"');
    expect(html).toContain("כרטיס ברשימה — בתור");
    byData(CreativeStudioView(props({ form: three, batch, onRetry: (i) => retried.push(i) })), "data-batch-retry", "dialog")[0].props.onClick();
    expect(retried).toEqual([1]);
  });
  it("unclear: \"maybe created — refresh\", no retry, no create; \"close and refresh\" instead", () => {
    const batch = [{ format: "card" as const, state: "ok" as const, id: "x" }, { format: "dialog" as const, state: "unclear" as const, error: "התשובה מהשרת לא ברורה" }, { format: "native" as const, state: "waiting" as const }];
    const html = view({ form: three, batch, stale: true });
    expect(html).toContain("ייתכן שנוצרה — רעננו לפני שממשיכים");
    expect(html).not.toContain("data-batch-retry");
    expect(html).toContain("data-creative-recheck");
    expect(html).toContain("ייתכן שבוצע — רעננו");
    expect(btn(html, "data-creative-create")).toContain('disabled=""');
  });
  it("a definite error: no refresh button, create stays possible", () => {
    const html = view({ err: "הקמפיין של הפרסומת לא נמצא" });
    expect(html).not.toContain("data-creative-recheck");
    expect(btn(html, "data-creative-create")).not.toContain("disabled");
  });
  it("resume: the successes stay, failures go back to the queue, a format added meanwhile joins", () => {
    const prev = [{ format: "card" as const, state: "ok" as const, id: "x" }, { format: "dialog" as const, state: "failed" as const, error: "e" }];
    expect(batchResume(prev, ["card", "dialog", "story"])).toEqual([{ format: "card", state: "ok", id: "x" }, { format: "dialog", state: "waiting" }, { format: "story", state: "waiting" }]);
    expect(batchResume(null, ["native", "card"])).toEqual([{ format: "card", state: "waiting" }, { format: "native", state: "waiting" }]);
  });
});

describe("editing — only while never shown; a shown ad is locked: duplicate it", () => {
  it("never shown: \"שמירת המודעה\" (the format fixed), no gallery", () => {
    const saved: number[] = [];
    const p = props({ mode: "edit", onSave: () => saved.push(1) });
    const html = renderToStaticMarkup(createElement(CreativeStudioView, p));
    expect(html).toContain('data-creative-format="card"');
    expect(html).not.toContain("data-format-gallery");
    byData(CreativeStudioView(p), "data-creative-save")[0].props.onClick();
    expect(saved).toEqual([1]);
  });
  it("shown: \"נעולה — שכפלו כדי לשנות\", everything disabled, no save — \"duplicate as a new ad\"", () => {
    const dups: number[] = [];
    const p = props({ mode: "edit", served: true, onDuplicate: () => dups.push(1) });
    const html = renderToStaticMarkup(createElement(CreativeStudioView, p));
    expect(html).toContain(CREATIVE_LOCKED_TEXT);
    expect(html).toMatch(/<fieldset disabled=""/);
    expect(html).not.toContain("data-creative-save");
    byData(CreativeStudioView(p), "data-creative-duplicate")[0].props.onClick();
    expect(dups).toEqual([1]);
  });
  it("duplicate mode: said, and it creates a new ad", () => {
    const html = view({ mode: "duplicate" });
    expect(html).toContain("data-creative-copy");
    expect(html).toContain("data-creative-create");
  });
});

describe("the stateful studio and the list", () => {
  it("CreativeStudio renders the hidden file input (JPEG / PNG / WebP only) and starts from a template", () => {
    const html = renderToStaticMarkup(createElement(CreativeStudio, { campaignId: "k1", advertiser: "פיצה", mode: { kind: "new" }, imageBase: BASE, template: "perk", onDone: noop, animate: false }));
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).toContain('data-creative-studio="new"');
    expect(html).toContain("הטבה בלעדית לדיירים");
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

const OURS2 = `${BASE}creatives/2026-11/b.webp`;
