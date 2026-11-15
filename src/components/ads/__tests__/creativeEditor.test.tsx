// PANEL-PAY א2ב (החלטות 372–373) — עורך הפרסומת (מרונדר לשרת, בלי דפדפן):
//   • התמונה רק דרך כפתור ההעלאה: אין יותר שדה "כתובת של תמונה"; תיבת התמונה אומרת מה קורה (אין / מעלים / הועלתה /
//     שמורה ב-bloc / מאתר אחר / ההעלאה נכשלה / bloc סירב — image_not_ours).
//   • פרסומת ישנה עם תמונה מאתר אחר מסומנת ברשימה, ואי אפשר לשמור אותה בלי להעלות.
//   • תשובה לא ברורה לפרסומת חדשה — "שמירה" נעולה, ובהודעה "רענון" (בלי כפילות).
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CreativeImageField from "../CreativeImageField";
import CreativeManager, { CreativeManagerView, creativeReady, type CreativeDraft } from "../CreativeManager";
import { imageBoxState, IMAGE_NOT_OURS_TEXT, UPLOAD_FAILED_TEXT, IMAGE_FOREIGN_TEXT, type UploadState } from "@/lib/adsUi";
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

const CR = (o: Partial<AdCreativeRow> = {}): AdCreativeRow => ({
  id: "c1", campaign_id: "k1", image_url: OURS, image_alt: "פיצה", headline: "פיצה ב-49", body: null,
  cta_label: "להזמנה", cta_url: "https://pizza.example", active: true, created_at: "2026-11-01T10:00:00Z", ...o,
});
const DRAFT: CreativeDraft = { image_url: OURS, image_alt: "פיצה משפחתית", headline: "פיצה ב-49", body: "", cta_label: "להזמנה", cta_url: "https://pizza.example" };
const noop = () => {};
const view = (o: Partial<Parameters<typeof CreativeManagerView>[0]> = {}) => renderToStaticMarkup(createElement(CreativeManagerView, {
  advertiser: "פיצה השכונה", creatives: [CR()], creativeServes: {}, canManage: true, imageBase: BASE,
  draft: null, box: null, busy: null, err: null, notice: null, stale: false,
  onNew: noop, onEdit: noop, onToggle: noop, onDelete: noop, onChange: noop, onPick: noop, onSave: noop, onCancel: noop, onRecheck: noop,
  ...o,
}));
const saveBtn = (html: string) => html.slice(html.lastIndexOf("<button", html.indexOf("data-creative-save")), html.indexOf("</button>", html.indexOf("data-creative-save")));

describe("the editor — the image only through the upload button", () => {
  it("the section hint: the size isolated left-to-right — the real marks, not a literal \\u2066 (a JSX attribute string keeps backslashes)", () => {
    const html = view({});
    expect(html).toContain("\u20661080×1350\u2069 (4:5)");
    expect(html).not.toContain("\\u2066");
  });
  it("no free \"image address\" field any more; the image box instead", () => {
    const html = view({ draft: DRAFT, box: box(OURS) });
    expect(html).not.toContain('data-creative-field="image_url"');
    expect(html).not.toContain("או כתובת של תמונה");
    expect(html).toContain("data-creative-image=");
    expect(html).toContain('data-creative-field="image_alt"');
    expect(saveBtn(html)).not.toContain("disabled");
  });
  it("an outside image (old creative): marked in the list, warned in the box, the preview empty, saving disabled", () => {
    const list = view({ creatives: [CR({ id: "c2", image_url: FOREIGN })] });
    expect(list).toContain('data-creative-foreign="c2"');
    expect(list).toContain("תמונה מאתר אחר — לא מוצגת");
    const html = view({ creatives: [CR({ id: "c2", image_url: FOREIGN })], draft: { ...DRAFT, id: "c2", image_url: FOREIGN }, box: box(FOREIGN) });
    expect(html).toContain(IMAGE_FOREIGN_TEXT);
    expect(html).toContain("התמונה תופיע כאן");
    expect(saveBtn(html)).toContain('disabled=""');
  });
  it("review #11: an outside image is never loaded in the panel either — no <img> with its address, in the list or in the box", () => {
    const html = view({ creatives: [CR({ id: "c2", image_url: FOREIGN })], draft: { ...DRAFT, id: "c2", image_url: FOREIGN }, box: box(FOREIGN) });
    expect(html).not.toContain(`src="${FOREIGN}"`);
    expect(html).toContain('data-creative-thumb="foreign"');
    // our own image still shows
    expect(view({ creatives: [CR()] })).toMatch(/<img [^>]*src="https:\/\/abc\.supabase\.co\/storage\/v1\/object\/public\/ads\//);
  });
  it("our images are not marked; an unknown base marks nothing", () => {
    expect(view({ creatives: [CR()] })).not.toContain("data-creative-foreign");
    expect(view({ creatives: [CR({ image_url: FOREIGN })], imageBase: null })).not.toContain("data-creative-foreign");
  });
  it("bloc refused the image: the sentence at the image box (not only at the top)", () => {
    const html = view({ draft: { ...DRAFT, image_url: FOREIGN }, box: box(FOREIGN, { phase: "idle" }, IMAGE_NOT_OURS_TEXT) });
    const at = html.indexOf("data-creative-image=");
    expect(html.indexOf(IMAGE_NOT_OURS_TEXT)).toBeGreaterThan(at);
    expect(html).not.toContain("data-creative-error");
  });
  it("while uploading: save, cancel and the other creatives' edit are disabled", () => {
    const html = view({ draft: DRAFT, box: box(OURS, { phase: "uploading", name: "b.png" }) });
    expect(saveBtn(html)).toContain('disabled=""');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>ביטול<\/button>/);
    expect(html).toMatch(/aria-label="עריכה" disabled=""/);
  });
});

describe("an unclear answer for a new creative — no second save, a refresh", () => {
  it("stale: the error with \"רענון\", saving disabled", () => {
    const html = view({ draft: DRAFT, box: box(OURS), err: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב.", stale: true });
    expect(html).toContain("ייתכן שהפעולה בוצעה");
    expect(html).toContain("data-creative-recheck");
    expect(html).toContain(">רענון<");
    expect(saveBtn(html)).toContain('disabled=""');
  });
  it("a definite error: no refresh button, saving stays possible", () => {
    const html = view({ draft: DRAFT, box: box(OURS), err: "הקמפיין של הפרסומת לא נמצא", stale: false });
    expect(html).not.toContain("data-creative-recheck");
    expect(saveBtn(html)).not.toContain("disabled");
  });
});

describe("creativeReady and the stateful wrapper", () => {
  it("ready needs our image (or an unknown base), alt, headline, button and an https link", () => {
    expect(creativeReady(DRAFT, BASE)).toBe(true);
    expect(creativeReady({ ...DRAFT, image_url: FOREIGN }, BASE)).toBe(false);
    expect(creativeReady({ ...DRAFT, image_url: FOREIGN }, null)).toBe(true);
    expect(creativeReady({ ...DRAFT, image_url: "" }, BASE)).toBe(false);
    expect(creativeReady({ ...DRAFT, image_alt: " א " }, BASE)).toBe(false);
    expect(creativeReady({ ...DRAFT, headline: "א" }, BASE)).toBe(false);
    expect(creativeReady({ ...DRAFT, cta_label: " " }, BASE)).toBe(false);
    expect(creativeReady({ ...DRAFT, cta_url: "http://pizza.example" }, BASE)).toBe(false);
    expect(creativeReady({ ...DRAFT, cta_url: "https://pizza example" }, BASE)).toBe(false);
  });
  it("CreativeManager renders the list (form closed) with the hidden file input; JPEG / PNG / WebP only", () => {
    const html = renderToStaticMarkup(createElement(CreativeManager, {
      campaignId: "k1", advertiser: "פיצה", creatives: [CR({ id: "c3", image_url: FOREIGN })], creativeServes: {}, canManage: true, imageBase: BASE,
    }));
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).toContain('data-creative-foreign="c3"');
    expect(html).toContain("data-creative-new");
    expect(html).not.toContain("data-creative-form");
  });
});
