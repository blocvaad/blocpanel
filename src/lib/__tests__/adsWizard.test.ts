// ADS-2ב2 (החלטות 393–398) — הלוגיקה של סטודיו המודעה שלב אחר שלב: השלבים, מה חסר לכל פורמט (ואותה מוכנות בדיוק כמו קודם),
// לאן קופצים, כיוון ההחלקה (RTL), תוכנית ההעלאה לפורמט אחד או לכמה, מילוי תיאור חסר, וכמה תמונות בבת אחת. אחרי הסקירה העצמאית:
// ההחלטות של המסך כפונקציות (הסימן בפס, הכפתור בעמוד, מה מוכן בסיכום, שורה בסיכום, היציאה, הסגירה, המשפטים).
import { describe, it, expect } from "vitest";
import {
  NO_SWIPE, STUDIO_IDLE, SWIPE_MAX_MS, SWIPE_MIN_PX, allUploaded, batchOf, canUpload, checkSelector, closeOutcome, contentChecks, doneText, exitPlan, fillMissingAlts, leaveAskStays,
  fillSource, finishText, formatChecks, formatMain, formatPill, frameIssues, frameUnit, hasMissingAlt, imageChecks, inFormats, isFormatStep, leaveText, leaveYes,
  okFormats, publishStart, readyToUpload, shownStep, slotsForMany, stepBeside, stepLabel, summaryRow, swipeIntent, uploadedLine, wizardSteps, type Check,
} from "../adsWizard";
import { RECHECK_TEXT } from "../adsUi";
import { emptyCreativeForm, formIssues, accentIssue, offerIssues, type BatchItem, type CreativeForm } from "../adsStudio";
import { AD_FORMATS, FRAMES_MAX, emptyFrame, type AdFormat, type FrameDraft } from "../adsFormats";

const BASE = "https://abc.supabase.co/storage/v1/object/public/ads/";
const OURS = (n: number) => `${BASE}creatives/2026-11/${n}.webp`;
const FOREIGN = "https://cdn.example.com/x.jpg";
const TODAY = "2026-11-17";
const fr = (i: number, o: Partial<FrameDraft> = {}): FrameDraft => ({ ...emptyFrame(`k${i}`), image_url: OURS(i), image_alt: `תמונה ${i}`, ...o });
const FORM = (o: Partial<CreativeForm> = {}): CreativeForm => ({
  ...emptyCreativeForm((i) => `k${i}`), image: { image_url: OURS(0), image_alt: "פיצה משפחתית", focal: [0.5, 0.5] },
  frames: [fr(1), fr(2)], headline: "פיצה ב-49", body: "", cta_label: "להזמנה", cta_url: "https://pizza.example", ...o,
});
const ids = (cs: Check[]) => cs.map((c) => c.id);

describe("the steps (393)", () => {
  it("new / copy: formats, content, a page per chosen format in the fixed order, summary; edit: content and its format", () => {
    expect(wizardSteps(["story", "card", "fullscreen"], "new")).toEqual(["formats", "content", "card", "fullscreen", "story", "summary"]);
    expect(wizardSteps(["banner"], "duplicate")).toEqual(["formats", "content", "banner", "summary"]);
    expect(wizardSteps(["native"], "edit")).toEqual(["content", "native"]);
    expect(wizardSteps(["card", "story"], "edit")).toEqual(["content", "card"]);   // an edit is one ad — never more than its format
  });
  it("a removed format's page falls back to the formats step; a step this mode has not — the first", () => {
    const s = wizardSteps(["card"], "new");
    expect(shownStep("story", s)).toBe("formats");
    expect(shownStep("card", s)).toBe("card");
    expect(shownStep("formats", wizardSteps(["card"], "edit"))).toBe("content");
    expect(shownStep("summary", wizardSteps(["card"], "edit"))).toBe("content");
  });
  it("next / previous, null at the ends", () => {
    const s = wizardSteps(["card", "story"], "new");
    expect(stepBeside("content", s, 1)).toBe("card");
    expect(stepBeside("story", s, 1)).toBe("summary");
    expect(stepBeside("summary", s, 1)).toBeNull();
    expect(stepBeside("formats", s, -1)).toBeNull();
    expect(stepBeside("card", s, -1)).toBe("content");
  });
  it("labels: the fixed steps in Hebrew, a format by its own name", () => {
    expect([stepLabel("formats"), stepLabel("content"), stepLabel("summary"), stepLabel("fullscreen")]).toEqual(["פורמטים", "תוכן", "סיכום", "מסך מלא"]);
    expect(isFormatStep("story")).toBe(true);
    expect(isFormatStep("content")).toBe(false);
  });
});

describe("what is missing (395)", () => {
  it("a ready form: nothing, in every format", () => {
    for (const f of AD_FORMATS) expect(formatChecks(f, FORM({ formats: [f] }), BASE, TODAY), f).toEqual([]);
  });
  it("the shared content: headline, button text, link (empty vs not https), accent, coupon, offer — each with its field, step = content", () => {
    const cs = contentChecks(FORM({ headline: " ", cta_label: "", cta_url: "http://x.example", accent: "#777777", coupon_code: "SAVE 20", offer_ends_on: "2026-11-01" }), TODAY);
    expect(ids(cs)).toEqual(["headline", "cta_label", "cta_url", "accent", "coupon_code", "offer_ends_on"]);
    expect(cs.every((c) => c.step === "content")).toBe(true);
    expect(cs[2].text).toBe("הקישור של הכפתור צריך להתחיל ב-https://");
    expect(contentChecks(FORM({ cta_url: "" }), TODAY)[0].text).toBe("חסר הקישור של הכפתור");
    expect(cs.every((c) => !c.text.endsWith("."))).toBe(true);
  });
  it("a one-image format: no image / an outside image / no description — and \"for this format\" when it has its own", () => {
    expect(imageChecks("card", FORM({ image: { image_url: "", image_alt: "", focal: [0.5, 0.5] } }), BASE).map((c) => c.text))
      .toEqual(["חסרה תמונה", "חסר תיאור לתמונה (\"מה רואים בתמונה\")"]);
    expect(imageChecks("card", FORM({ image: { image_url: FOREIGN, image_alt: "פיצה", focal: [0.5, 0.5] } }), BASE).map((c) => c.text))
      .toEqual(["התמונה מאתר אחר — מעלים אותה מחדש"]);
    const own = FORM({ formats: ["card", "fullscreen"], overrides: { fullscreen: { image_url: "", image_alt: "פיצה", focal: [0.5, 0.5] } } });
    expect(imageChecks("fullscreen", own, BASE).map((c) => [c.id, c.text, c.field])).toEqual([["fullscreen:image", "חסרה תמונה לפורמט הזה", "image"]]);
    expect(imageChecks("card", own, BASE)).toEqual([]);
  });
  it("the owner's case (17/11): a story whose frames 1 and 2 have no description — two items, each naming its frame", () => {
    const f = FORM({ formats: ["card", "fullscreen", "story"], frames: [fr(1, { image_alt: "" }), fr(2, { image_alt: " " }), fr(3, { image_alt: "בושם לגבר" })] });
    const cs = imageChecks("story", f, BASE);
    expect(cs.map((c) => [c.text, c.field, c.frame])).toEqual([
      ["תמונה 1: חסר תיאור (\"מה רואים בתמונה\")", "frame_alt", 0],
      ["תמונה 2: חסר תיאור (\"מה רואים בתמונה\")", "frame_alt", 1],
    ]);
    expect(formatChecks("card", f, BASE, TODAY)).toEqual([]);          // the card is ready on its own — it can go up alone
    expect(formatChecks("fullscreen", f, BASE, TODAY)).toEqual([]);
    expect(checkSelector(cs[1])).toBe('[data-frame-field="1.image_alt"]');
  });
  it("frames: too few, no image, outside image, a too long caption, a carousel card's bad link (a story's link is not checked)", () => {
    const f = FORM({ formats: ["story", "carousel"], frames: [fr(1, { image_url: "", cta_url: "ftp://x" }), fr(2, { image_url: FOREIGN, caption: "א".repeat(61) })] });
    expect(imageChecks("story", f, BASE).map((c) => c.id)).toEqual(["story:0:frame_image", "story:1:frame_image", "story:1:frame_caption"]);
    expect(imageChecks("carousel", f, BASE).map((c) => c.text)).toEqual([
      "כרטיס 1: חסרה תמונה", "כרטיס 1: הקישור צריך להתחיל ב-https://", "כרטיס 2: התמונה מאתר אחר — מעלים אותה מחדש", "כרטיס 2: הכיתוב ארוך מ-60 תווים",
    ]);
    expect(imageChecks("story", FORM({ formats: ["story"], frames: [fr(1)] }), BASE).map((c) => c.text)).toEqual(["צריך לפחות 2 תמונות (יש 1)"]);
    expect(imageChecks("carousel", FORM({ formats: ["carousel"], frames: [fr(1)] }), BASE)[0].text).toBe("צריך לפחות 2 כרטיסים (יש 1)");
    expect(frameUnit("carousel")).toBe("כרטיס");
  });
  it("a format's list: its own page first, then the shared content", () => {
    const cs = formatChecks("card", FORM({ headline: "", image: { image_url: "", image_alt: "פיצה", focal: [0.5, 0.5] } }), BASE, TODAY);
    expect(cs.map((c) => c.step)).toEqual(["card", "content"]);
  });
  it("the same readiness as before: no items ⇔ formIssues empty, the accent fine and the offer fine (random forms, every format)", () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    for (let n = 0; n < 1500; n++) {
      const frames = Array.from({ length: pick([1, 2, 3, 5, 6]) }, (_, i) => fr(i, {
        image_url: pick([OURS(i), OURS(i), "", FOREIGN]), image_alt: pick(["תיאור טוב", "", "א", "א".repeat(201)]),
        caption: pick(["", "כיתוב", "א".repeat(61)]), cta_url: pick(["", "https://ok.example", "http://bad"]),
      }));
      const f = FORM({
        frames, headline: pick(["פיצה", "", "א"]), cta_label: pick(["להזמנה", ""]), cta_url: pick(["https://p.example", "", "http://p.example"]),
        accent: pick([null, "#DC2626", "#777777"]), coupon_code: pick(["", "SAVE20", "bad code"]), offer_ends_on: pick(["", "2026-12-01", "2026-11-01"]),
        image: { image_url: pick([OURS(0), "", FOREIGN]), image_alt: pick(["פיצה", ""]), focal: [0.5, 0.5] },
        overrides: pick([{}, { card: { image_url: pick(["", OURS(9)]), image_alt: pick(["", "קרוב"]), focal: [0.5, 0.5] as [number, number] } }]),
      });
      for (const format of AD_FORMATS) {
        const old = formIssues(format, f, BASE).length === 0 && !accentIssue(f.accent) && offerIssues(f, TODAY).length === 0;
        expect(formatChecks(format, f, BASE, TODAY).length === 0, `${n} ${format}`).toBe(old);
      }
    }
  });
  it("one flaw at a time, from a ready form: the new list and the old rule both say \"not ready\" — each condition on its own", () => {
    const ok = FORM({ formats: ["card", "story", "carousel"], frames: [fr(1), fr(2), fr(3)] });
    const ready = (format: AdFormat, f: CreativeForm) => formatChecks(format, f, BASE, TODAY).length === 0;
    const old = (format: AdFormat, f: CreativeForm) => formIssues(format, f, BASE).length === 0 && !accentIssue(f.accent) && offerIssues(f, TODAY).length === 0;
    for (const format of ["card", "story", "carousel"] as AdFormat[]) { expect(ready(format, ok), format).toBe(true); expect(old(format, ok), format).toBe(true); }
    const frameFlaw = (o: Partial<FrameDraft>) => FORM({ formats: ["story", "carousel"], frames: [fr(1), fr(2, o), fr(3)] });
    const flaws: Array<[string, AdFormat, CreativeForm]> = [
      ["frame alt empty", "story", frameFlaw({ image_alt: "" })],
      ["frame alt one letter", "story", frameFlaw({ image_alt: "א" })],
      ["frame alt 201", "story", frameFlaw({ image_alt: "א".repeat(201) })],
      ["frame caption 61", "story", frameFlaw({ caption: "א".repeat(61) })],
      ["frame no image", "story", frameFlaw({ image_url: "" })],
      ["frame outside image", "story", frameFlaw({ image_url: FOREIGN })],
      ["carousel card bad link", "carousel", frameFlaw({ cta_url: "http://x.example" })],
      ["one frame", "story", FORM({ formats: ["story"], frames: [fr(1)] })],
      ["six frames", "story", FORM({ formats: ["story"], frames: [fr(1), fr(2), fr(3), fr(4), fr(5), fr(6)] })],
      ["six cards", "carousel", FORM({ formats: ["carousel"], frames: [fr(1), fr(2), fr(3), fr(4), fr(5), fr(6)] })],
      ["image empty", "card", FORM({ image: { image_url: "", image_alt: "פיצה", focal: [0.5, 0.5] } })],
      ["image outside", "card", FORM({ image: { image_url: FOREIGN, image_alt: "פיצה", focal: [0.5, 0.5] } })],
      ["image alt one letter", "card", FORM({ image: { image_url: OURS(0), image_alt: "א", focal: [0.5, 0.5] } })],
      ["image alt empty", "card", FORM({ image: { image_url: OURS(0), image_alt: " ", focal: [0.5, 0.5] } })],
      ["headline one letter", "card", FORM({ headline: "א" })],
      ["button text empty", "card", FORM({ cta_label: "" })],
      ["link not https", "card", FORM({ cta_url: "http://pizza.example" })],
      ["accent unreadable", "card", FORM({ accent: "#777777" })],
      ["coupon bad", "card", FORM({ coupon_code: "bad code" })],
      ["offer past", "card", FORM({ offer_ends_on: "2026-11-01" })],
    ];
    for (const [name, format, f] of flaws) {
      expect(ready(format, f), name).toBe(false);
      expect(old(format, f), name).toBe(false);
    }
    expect(imageChecks("story", FORM({ formats: ["story"], frames: [fr(1), fr(2), fr(3), fr(4), fr(5), fr(6)] }), BASE).map((c) => c.text)).toEqual(["יותר מ-5 תמונות — מסירים 1"]);
    expect(imageChecks("story", frameFlaw({ image_alt: "א".repeat(201) }), BASE).map((c) => c.text)).toEqual(["תמונה 2: התיאור ארוך מ-200 תווים"]);
  });
  it("per frame (for the thumbnails' marks): the texts and the fields", () => {
    const f = FORM({ formats: ["story"], frames: [fr(1), fr(2, { image_alt: "" })] });
    expect(frameIssues("story", f, BASE)).toEqual({ 1: [{ text: "תמונה 2: חסר תיאור (\"מה רואים בתמונה\")", field: "frame_alt" }] });
  });
  it("where each item jumps to", () => {
    const s = (field: Check["field"], frame?: number) => checkSelector({ id: "x", text: "x", step: "content", field, ...(frame === undefined ? {} : { frame }) });
    expect(s("headline")).toBe('[data-creative-field="headline"]');
    expect(s("image_alt")).toBe('[data-creative-field="image_alt"]');
    expect(s("image")).toBe("[data-creative-image-section] [data-creative-upload]");
    expect(s("accent")).toContain("[data-accent-picker]");
    expect(s("frame_image", 2)).toBe('[data-frame="2"] [data-creative-upload]');
    expect(s("frame_caption", 0)).toBe('[data-frame-field="0.caption"]');
    expect(s("frame_link", 3)).toBe('[data-frame-field="3.cta_url"]');
    expect(s("frame_add")).toBe("[data-frame-add]");
  });
});

describe("the swipe between steps (396) — RTL", () => {
  it("finger to the right → next, to the left → previous", () => {
    expect(swipeIntent(80, 5, 200)).toBe("next");
    expect(swipeIntent(-80, 5, 200)).toBe("prev");
  });
  it("too short, too vertical (a scroll), too slow, or a nonsense time → nothing", () => {
    expect(swipeIntent(SWIPE_MIN_PX - 1, 0, 100)).toBeNull();
    expect(swipeIntent(SWIPE_MIN_PX, 0, 100)).toBe("next");
    expect(swipeIntent(90, 60, 100)).toBeNull();      // 90 ≤ 1.6 × 60
    expect(swipeIntent(100, 60, 100)).toBe("next");   // 100 > 96
    expect(swipeIntent(120, 0, SWIPE_MAX_MS + 1)).toBeNull();
    expect(swipeIntent(120, 0, -1)).toBeNull();
    expect(swipeIntent(120, 0, Number.NaN)).toBeNull();
  });
  it("a touch that starts on a field, a slider (the focal point), a sideways row or [data-no-swipe] never changes the step", () => {
    for (const s of ["input", "textarea", "select", '[role="slider"]', "[data-no-swipe]", ".studio-scroll"]) expect(NO_SWIPE).toContain(s);
  });
});

describe("uploading a format alone (394)", () => {
  const B = (format: AdFormat, state: BatchItem["state"], error?: string): BatchItem => ({ format, state, ...(error ? { error } : {}) });
  it("one format: only it runs; the others keep what they had", () => {
    expect(publishStart(null, ["fullscreen"])).toEqual([B("fullscreen", "waiting")]);
    expect(publishStart([B("card", "ok"), B("dialog", "failed", "e")], ["fullscreen"])).toEqual([B("card", "ok"), B("dialog", "failed", "e"), B("fullscreen", "waiting")]);
  });
  it("an uploaded format never goes up again; a failed one goes back to the queue; an old queue not chosen now leaves", () => {
    expect(publishStart([B("card", "ok"), B("dialog", "failed", "e")], ["card", "dialog"])).toEqual([B("card", "ok"), B("dialog", "waiting")]);
    expect(publishStart([B("card", "waiting"), B("story", "waiting")], ["story"])).toEqual([B("story", "waiting")]);
    expect(publishStart([B("native", "failed", "x")], ["card", "native"]).map((x) => x.format)).toEqual(["card", "native"]);   // the fixed order
  });
  it("what went up, all up, the batch of a format", () => {
    const b = [B("card", "ok"), B("story", "failed", "e")];
    expect(okFormats(b)).toEqual(["card"]);
    expect(allUploaded(["card"], b)).toBe(true);
    expect(allUploaded(["card", "story"], b)).toBe(false);
    expect(allUploaded([], b)).toBe(false);
    expect(batchOf(b, "story")?.error).toBe("e");
    expect(batchOf(null, "card")).toBeNull();
  });
  it("can upload: nothing missing and not up / not running / not maybe-created", () => {
    expect(canUpload("card", [], null)).toBe(true);
    expect(canUpload("card", [{ id: "h", text: "x", step: "content", field: "headline" }], null)).toBe(false);
    for (const s of ["ok", "saving", "unclear"] as const) expect(canUpload("card", [], [B("card", s)])).toBe(false);
    expect(canUpload("card", [], [B("card", "failed", "e")])).toBe(true);
  });
  it("the texts: all up (as before), and \"finish\" with part of them", () => {
    expect(doneText(1)).toBe("המודעה נוצרה.");
    expect(doneText(3)).toBe("נוצרו 3 מודעות — אחת לכל פורמט.");
    expect(finishText(["fullscreen"], ["card", "story"])).toBe("נוצרה מודעה אחת (מסך מלא). לא הועלו: כרטיס במרכז, סטורי ממומן.");
    expect(finishText(["card", "fullscreen"], [])).toBe("נוצרו 2 מודעות (כרטיס במרכז, מסך מלא).");
  });
});

describe("frames helpers (397)", () => {
  it("filling a missing description: only frames with an image and no description; editable text with the frame's number", () => {
    const list = [fr(1, { image_alt: "" }), fr(2), fr(3, { image_url: "", image_alt: "" }), fr(4, { image_alt: "א" })];
    const r = fillMissingAlts(list, "הטבה בלעדית לדיירים", "תמונה");
    expect(r.filled).toBe(2);
    expect(r.frames.map((x) => x.image_alt)).toEqual(["הטבה בלעדית לדיירים — תמונה 1", "תמונה 2", "", "הטבה בלעדית לדיירים — תמונה 4"]);
    expect(r.auto).toEqual({ k1: "הטבה בלעדית לדיירים — תמונה 1", k4: "הטבה בלעדית לדיירים — תמונה 4" });
    // review #13: without a source (under 2 characters) nothing is filled — never "תמונה — תמונה 1"
    for (const empty of ["  ", "", "א"]) expect(fillMissingAlts(list, empty, "תמונה")).toEqual({ frames: list, filled: 0, auto: {} });
    expect(fillMissingAlts([fr(1, { image_alt: "" })], "א".repeat(250), "תמונה").frames[0].image_alt.length).toBe(200);
    expect(hasMissingAlt(list)).toBe(true);
    expect(hasMissingAlt(r.frames)).toBe(false);
    expect(hasMissingAlt([fr(1, { image_url: "", image_alt: "" })])).toBe(false);   // no image yet — nothing to describe
  });
  it("review #13 — where the fill comes from: the headline, else the advertiser's name (and the button says which); neither — no button", () => {
    expect(fillSource("הטבה בלעדית", "פיצה")).toEqual({ base: "הטבה בלעדית", label: "מילוי תיאור חסר מהכותרת" });
    expect(fillSource(" א ", "פיצה השכונה")).toEqual({ base: "פיצה השכונה", label: "מילוי תיאור חסר משם המפרסם" });
    expect(fillSource("", " ")).toBeNull();
    expect(fillSource("אב", "")?.base).toBe("אב");
  });
  it("several images at once: the empty frames first, then new ones up to 5; the rest have no room", () => {
    const two = [fr(1, { image_url: "" }), fr(2)];
    expect(slotsForMany(two, 3)).toEqual({ fill: ["k1"], add: 2, taken: 3 });
    expect(slotsForMany(two, 9)).toEqual({ fill: ["k1"], add: FRAMES_MAX - 2, taken: 1 + FRAMES_MAX - 2 });
    const full = Array.from({ length: FRAMES_MAX }, (_, i) => fr(i));
    expect(slotsForMany(full, 2)).toEqual({ fill: [], add: 0, taken: 0 });
    expect(slotsForMany([fr(1, { image_url: "" }), fr(2, { image_url: "" })], 1)).toEqual({ fill: ["k1"], add: 0, taken: 1 });
  });
});

describe("the screen's decisions as functions (independent review #5, #6, #11, #12, #14)", () => {
  const B = (format: AdFormat, state: BatchItem["state"], error?: string): BatchItem => ({ format, state, ...(error ? { error } : {}) });
  const miss = (n: number): Check[] => Array.from({ length: n }, (_, i) => ({ id: `x${i}`, text: "x", step: "content" as const, field: "headline" as const }));
  it("the pill of a format counts everything that keeps it from going up (the shared content too); the batch state wins", () => {
    expect(formatPill("card", [], null)).toEqual({ kind: "ready" });
    expect(formatPill("card", miss(2), null)).toEqual({ kind: "missing", count: 2 });
    expect(formatPill("card", miss(1), [B("card", "ok")])).toEqual({ kind: "uploaded" });
    for (const s of ["saving", "waiting"] as const) expect(formatPill("card", [], [B("card", s)])).toEqual({ kind: "saving" });
    expect(formatPill("card", [], [B("card", "failed", "e")])).toEqual({ kind: "failed" });
    // second review #11: an unclear answer is "maybe up" in the strip, as on the page — never "not up"
    expect(formatPill("card", [], [B("card", "unclear")])).toEqual({ kind: "unclear" });
    // the pill and the page agree: a format whose content misses something is never "ready"
    const f = FORM({ formats: ["card"], headline: "" });
    expect(formatPill("card", formatChecks("card", f, BASE, TODAY), null)).toEqual({ kind: "missing", count: 1 });
  });
  it("a format's main button: up → next; missing → complete (with the count); otherwise upload, enabled only when free and allowed", () => {
    expect(formatMain("card", [], [B("card", "ok")], true)).toEqual({ kind: "next" });
    expect(formatMain("card", miss(3), null, true)).toEqual({ kind: "complete", count: 3 });
    expect(formatMain("card", [], null, true)).toEqual({ kind: "publish", enabled: true, label: "upload" });
    expect(formatMain("card", [], null, false)).toEqual({ kind: "publish", enabled: false, label: "upload" });
    expect(formatMain("card", [], [B("card", "failed", "e")], true)).toEqual({ kind: "publish", enabled: true, label: "retry" });
    expect(formatMain("card", [], [B("card", "saving")], true)).toEqual({ kind: "publish", enabled: false, label: "saving" });
    expect(formatMain("card", [], [B("card", "waiting")], false)).toEqual({ kind: "publish", enabled: false, label: "waiting" });
    expect(formatMain("card", [], [B("card", "unclear")], true)).toEqual({ kind: "publish", enabled: false, label: "upload" });
  });
  it("what the summary can upload now: canUpload for each chosen format, in the fixed order", () => {
    const checks = (f: AdFormat) => (f === "story" ? miss(2) : []);
    expect(readyToUpload(["story", "fullscreen", "card"], checks, null)).toEqual(["card", "fullscreen"]);
    expect(readyToUpload(["card", "fullscreen"], checks, [B("card", "ok"), B("fullscreen", "unclear")])).toEqual([]);
    expect(readyToUpload(["card", "dialog"], checks, [B("dialog", "failed", "e")])).toEqual(["card", "dialog"]);
    expect(readyToUpload([], checks, null)).toEqual([]);
  });
  it("a summary row: ready → upload; missing → complete; failed → retry, or complete when something is missing now; unclear (stale) → nothing", () => {
    expect(summaryRow("card", [], null, false)).toEqual({ state: "ready", action: "publish" });
    expect(summaryRow("card", miss(1), null, false)).toEqual({ state: "missing", action: "complete" });
    expect(summaryRow("card", [], [B("card", "failed", "e")], false)).toEqual({ state: "failed", action: "retry" });
    expect(summaryRow("card", miss(1), [B("card", "failed", "e")], false)).toEqual({ state: "failed", action: "complete" });
    expect(summaryRow("card", [], [B("card", "failed", "e")], true)).toEqual({ state: "failed", action: null });
    expect(summaryRow("card", [], [B("card", "ok")], false)).toEqual({ state: "ok", action: null });
    expect(summaryRow("card", [], [B("card", "unclear")], true)).toEqual({ state: "unclear", action: null });
    expect(summaryRow("card", [], [B("card", "waiting")], false)).toEqual({ state: "waiting", action: null });
  });
  it("leaving: busy → nothing; work that would be lost and not asked yet → ask; then up → finish; unclear → recheck; else close", () => {
    const s = { busy: false, dirty: false, asked: false, up: 0, maybe: false };
    expect(exitPlan({ ...s, busy: true, dirty: true })).toBe("none");
    expect(exitPlan({ ...s, dirty: true })).toBe("ask");
    expect(exitPlan({ ...s, dirty: true, up: 1 })).toBe("ask");           // review #6: part up, the rest holds work — ask too
    expect(exitPlan({ ...s, dirty: true, asked: true, up: 1 })).toBe("finish");
    expect(exitPlan({ ...s, up: 2, maybe: true })).toBe("finish");
    expect(exitPlan({ ...s, maybe: true })).toBe("recheck");
    expect(exitPlan({ ...s, dirty: true, asked: true })).toBe("close");
    expect(exitPlan(s)).toBe("close");
  });
  it("the wizard's leave question stays only while true: the studio shown, idle, with unsaved work", () => {
    expect(leaveAskStays({ ...STUDIO_IDLE, dirty: true })).toBe(true);
    expect(leaveAskStays({ ...STUDIO_IDLE, dirty: true, busy: true })).toBe(false);   // an upload started under it
    expect(leaveAskStays({ ...STUDIO_IDLE, dirty: false })).toBe(false);              // nothing left to lose
    expect(leaveAskStays(null)).toBe(false);                                          // the studio is gone (done)
  });
  it("closing the sheet from outside: nothing changed → just close; an upload → refresh and say it; an unclear answer → refresh and check", () => {
    expect(closeOutcome([], [], false)).toBeNull();
    expect(closeOutcome([], ["card"], false)).toBeNull();
    expect(closeOutcome([], ["card"], true)).toBe(RECHECK_TEXT.creative);
    // second review #8: the same sentence as the studio's own finish — what went up and what did not
    expect(closeOutcome(["card"], [], false)).toBe("נוצרה מודעה אחת (כרטיס במרכז).");
    expect(closeOutcome(["card"], ["story"], false)).toBe(finishText(["card"], ["story"]));
    expect(closeOutcome(["card", "fullscreen", "story"], [], false)).toBe("נוצרו 3 מודעות (כרטיס במרכז, מסך מלא, סטורי ממומן).");
    expect(closeOutcome(["card"], ["story"], true)).toBe("נוצרה מודעה אחת (כרטיס במרכז). לא הועלו: סטורי ממומן. ייתכן שנוצרה עוד אחת — בדקו ברשימה לפני שמעלים שוב.");
    expect(STUDIO_IDLE).toEqual({ busy: false, dirty: false, up: [], rest: [], maybe: false });
  });
  it("review #12 — the ad is the subject (the format names are masculine), one and many said right", () => {
    expect(inFormats([])).toBe("");
    expect(inFormats(["fullscreen"])).toBe("במסך מלא");
    expect(inFormats(["fullscreen", "story"])).toBe("במסך מלא ובסטורי ממומן");
    expect(inFormats(["card", "fullscreen", "story"])).toBe("בכרטיס במרכז, במסך מלא ובסטורי ממומן");
    expect(uploadedLine(["fullscreen"])).toBe("המודעה במסך מלא כבר עלתה.");
    expect(uploadedLine(["card", "banner"])).toBe("המודעות בכרטיס במרכז ובפס כבר עלו.");
  });
  it("the exit question: the same sentence in the sheet and the studio — per mode, and what is up / not yet", () => {
    expect(leaveText("new", [], [])).toBe("יש כאן מודעה שעוד לא הועלתה. לצאת בלי להעלות? מה שמילאתם לא יישמר.");
    expect(leaveText("duplicate", [], ["card"])).toBe(leaveText("new", [], []));
    expect(leaveText("new", ["fullscreen"], ["story"])).toBe("המודעה במסך מלא כבר עלתה. המודעה בסטורי ממומן עוד לא הועלתה. לצאת בלי להעלות אותה?");
    expect(leaveText("new", ["card"], ["fullscreen", "story"])).toBe("המודעה בכרטיס במרכז כבר עלתה. המודעות במסך מלא ובסטורי ממומן עוד לא הועלו. לצאת בלי להעלות אותן?");
    expect(leaveText("new", ["card"], [])).toBe(leaveText("new", [], []));
    expect(leaveText("edit", ["card"], ["story"])).toBe("יש שינויים שעוד לא נשמרו. לצאת בלי לשמור? השינויים לא יישמרו.");
    expect([leaveYes("new"), leaveYes("duplicate"), leaveYes("edit")]).toEqual(["יציאה בלי להעלות", "יציאה בלי להעלות", "יציאה בלי לשמור"]);
    for (const t of [leaveText("new", [], []), leaveText("edit", [], []), leaveText("new", ["card"], ["story"])]) expect(t).toMatch(/^[א-ת]/);
    // second review #8: in the campaign wizard the question has the button's verb — "לעבור ל<step>"
    expect(leaveText("new", [], [], "קהל")).toBe("יש כאן מודעה שעוד לא הועלתה. לעבור לקהל בלי להעלות? מה שמילאתם לא יישמר.");
    expect(leaveText("new", ["card"], ["story"], "סטודיו הפרסום")).toBe("המודעה בכרטיס במרכז כבר עלתה. המודעה בסטורי ממומן עוד לא הועלתה. לעבור לסטודיו הפרסום בלי להעלות אותה?");
    expect(leaveText("edit", [], [], "קהל")).toBe(leaveText("edit", [], []));
  });
  it("second review #6 — a one-letter headline or button text is \"too short\", not \"missing\"", () => {
    expect(contentChecks(FORM({ headline: "א" }), TODAY).map((c) => c.text)).toEqual(["הכותרת קצרה מדי — לפחות 2 תווים"]);
    expect(contentChecks(FORM({ headline: " " }), TODAY).map((c) => c.text)).toEqual(["חסרה כותרת"]);
    expect(contentChecks(FORM({ cta_label: "א" }), TODAY).map((c) => c.text)).toEqual(["הטקסט לכפתור קצר מדי — לפחות 2 תווים"]);
    expect(contentChecks(FORM({ cta_label: "" }), TODAY).map((c) => c.text)).toEqual(["חסר טקסט לכפתור"]);
  });
});
