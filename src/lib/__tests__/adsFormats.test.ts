// ADS-2א v2 (החלטות 376–380, 383): הפורמטים בפאנל — שבעה (עם החלון הקופץ), איפה כל אחד יושב (slot), מידות התמונה, ההתאמה
// הפנימית של מודעה (אותו כלל כמו ה-CHECK של SQL 228), נקודת המיקוד וחשבון החיתוך (כמו object-fit: cover), צבע הכפתור והטקסט
// עליו לפי ניגודיות (אותה פונקציה כמו ב-bloc), והעריכה של התמונות בסטורי / קרוסלה בגבולות של bloc.
import { describe, it, expect } from "vitest";
import {
  AD_FORMATS, AD_SLOTS, FORMAT_INFO, FORMAT_SLOT, formatSlot, slotsOf, SLOT_LABEL, SLOT_FORMATS_TEXT, parseFormat, parseBannerPosition, parseTheme,
  parseFrames, creativeFits, allImagesOurs, addFrame, removeFrame, moveFrame, dropFrame, updateFrame, framesToDrafts, frameReady, framesReady,
  framesPayload, emptyFrame, canAddFrame, canRemoveFrame, imageSpecText, imageHint, sizeText, formatText, formatRatio, framesCountText,
  creativeMetaText, isSlot, isFormat, VIEW_DEFINITION, CREATIVE_LOCKED_TEXT, FRAMES_MIN, FRAMES_MAX, CAPTION_MAX,
  clampFocal, parseFocal, roundFocal, objectPosition, cropRect, focalFromPoint, isHexColor, parseHex, luminance, contrastRatio,
  ctaTextColor, contrastInfo, accessibleAccent, BLOC_ACCENT, CTA_DARK_TEXT, CTA_LIGHT_TEXT,
  type FrameDraft,
} from "../adsFormats";

const BASE = "https://abc.supabase.co/storage/v1/object/public/ads/";
const OURS = (n: number) => `${BASE}creatives/2026-11/${n}.webp`;
const FOREIGN = "https://cdn.example.com/x.jpg";
const F = (i: number, o: Partial<FrameDraft> = {}): FrameDraft => ({ key: `f${i}`, image_url: OURS(i), image_alt: `תמונה ${i}`, caption: "", cta_url: "", focal: [0.5, 0.5], ...o });

describe("the seven formats (decision 376 + v2's dialog)", () => {
  it("one list, in the order of the gallery; card first (the default and today's format), dialog second", () => {
    expect([...AD_FORMATS]).toEqual(["card", "dialog", "fullscreen", "story", "banner", "native", "carousel"]);
    expect([...AD_SLOTS]).toEqual(["full", "banner", "inline"]);
  });
  it("the slot mapping: card / dialog / fullscreen / story → full, banner → banner, native / carousel → inline", () => {
    expect(FORMAT_SLOT).toEqual({ card: "full", dialog: "full", fullscreen: "full", story: "full", banner: "banner", native: "inline", carousel: "inline" });
    for (const f of AD_FORMATS) expect(formatSlot(f)).toBe(FORMAT_SLOT[f]);
    expect([isSlot("inline"), isSlot("popup"), isSlot(null), isFormat("dialog"), isFormat("popup")]).toEqual([true, false, false, true, false]);
  });
  it("the slots of a campaign's active formats: each once, in the fixed order", () => {
    expect(slotsOf(["carousel", "card", "native", "dialog"])).toEqual(["full", "inline"]);
    expect(slotsOf(["banner"])).toEqual(["banner"]);
    expect(slotsOf([])).toEqual([]);
    expect(SLOT_LABEL).toEqual({ full: "מעל המסך", banner: "פס", inline: "ברשימה" });
    expect(SLOT_FORMATS_TEXT.full).toBe("כרטיס, חלון קופץ, מסך מלא וסטורי");
  });
  it("Hebrew names and the image of each format, as the plan's table (dialog: 16:9, 1200×675)", () => {
    const t = Object.fromEntries(AD_FORMATS.map((f) => [f, [FORMAT_INFO[f].label, FORMAT_INFO[f].image.w, FORMAT_INFO[f].image.h, FORMAT_INFO[f].image.ratio]]));
    expect(t).toEqual({
      card: ["כרטיס במרכז", 1080, 1350, "4:5"], dialog: ["חלון קופץ", 1200, 675, "16:9"], fullscreen: ["מסך מלא", 1080, 1920, "9:16"],
      story: ["סטורי ממומן", 1080, 1920, "9:16"], banner: ["פס", 1080, 1080, "1:1"], native: ["כרטיס ברשימה", 1200, 628, "1.91:1"], carousel: ["קרוסלה", 1080, 1080, "1:1"],
    });
    expect(formatRatio("dialog")).toBeCloseTo(1200 / 675, 10);
  });
  it("frames only for story / carousel; light / dark for dialog / banner / native / carousel (the overlays are dark over the image)", () => {
    expect(AD_FORMATS.filter((f) => FORMAT_INFO[f].frames)).toEqual(["story", "carousel"]);
    expect(AD_FORMATS.filter((f) => FORMAT_INFO[f].theme)).toEqual(["dialog", "banner", "native", "carousel"]);
    expect([FRAMES_MIN, FRAMES_MAX, CAPTION_MAX]).toEqual([2, 5, 60]);
  });
  it("sizes in an LTR isolate (else 1080×1350 reads 1350×1080 in RTL); \"each image\" for frames", () => {
    expect(sizeText(FORMAT_INFO.card.image)).toBe("⁦1080×1350⁩");
    expect(imageSpecText("story")).toBe("כל תמונה ⁦1080×1920⁩ (9:16)");
    expect(imageSpecText("dialog")).toBe("תמונה ⁦1200×675⁩ (16:9)");
    expect(imageHint("native")).toBe("JPEG, PNG או WebP, עד 2MB. הכי טוב ⁦1200×628⁩ (1.91:1).");
  });
  it("the format in words; the banner with its position", () => {
    expect(formatText("banner", "top")).toBe("פס · למעלה");
    expect(formatText("banner", "bottom")).toBe("פס · למטה");
    expect(formatText("banner")).toBe("פס");
    expect(formatText("dialog", "top")).toBe("חלון קופץ");
  });
  it("frame counts and the creative's line (theme only where the format has one)", () => {
    expect([framesCountText("carousel", 1), framesCountText("carousel", 3), framesCountText("story", 1), framesCountText("story", 4)])
      .toEqual(["כרטיס אחד", "3 כרטיסים", "תמונה אחת", "4 תמונות"]);
    expect(creativeMetaText("story", [1, 2, 3, 4], "dark")).toBe("4 תמונות");
    expect(creativeMetaText("carousel", [1, 2], "dark")).toBe("2 כרטיסים · כהה");
    expect(creativeMetaText("dialog", null, "dark")).toBe("כהה");
    expect(creativeMetaText("native", null, null)).toBe("בהיר");
    expect(creativeMetaText("card", null, "dark")).toBe("");
  });
  it("what counts as a view, per slot (decision 379); a shown creative is locked", () => {
    expect(VIEW_DEFINITION.full).toBe("חשיפה — המודעה הוצגה על המסך, עם התמונה.");
    expect(VIEW_DEFINITION.banner).toContain("חצי מהפס");
    expect(VIEW_DEFINITION.inline).toContain("שנייה רצופה");
    expect(CREATIVE_LOCKED_TEXT).toBe("נעולה — שכפלו כדי לשנות");
  });
});

describe("what the database returned (before SQL 228 the columns are missing)", () => {
  it("format / position / theme: unknown → bloc's defaults", () => {
    expect([parseFormat("dialog"), parseFormat("popup"), parseFormat(undefined)]).toEqual(["dialog", "card", "card"]);
    expect([parseBannerPosition("top"), parseBannerPosition("left"), parseBannerPosition(null)]).toEqual(["top", null, null]);
    expect([parseTheme("dark"), parseTheme("x"), parseTheme(undefined)]).toEqual(["dark", "light", "light"]);
  });
  it("frames: an array of objects (junk dropped, at most 5, empty caption / link → null, focal only a valid [x, y]); else null", () => {
    const f = parseFrames([
      { image_url: OURS(1), image_alt: "א", caption: "", cta_url: " ", focal: [0.2, 0.8] }, 7, null, ["x"],
      { image_url: OURS(2), image_alt: "ב", caption: "כיתוב", cta_url: "https://a.example", focal: [2, 0] },
      { image_url: OURS(3), image_alt: "ג", focal: [0.1] }, { image_url: OURS(4), image_alt: "ד", focal: "0.5,0.5" }, { image_url: OURS(5), image_alt: "ה" },
      { image_url: OURS(6), image_alt: "ו" },
    ]);
    expect(f).toHaveLength(5);
    expect(f![0]).toEqual({ image_url: OURS(1), image_alt: "א", caption: null, cta_url: null, focal: [0.2, 0.8] });
    expect(f![1]).toEqual({ image_url: OURS(2), image_alt: "ב", caption: "כיתוב", cta_url: "https://a.example", focal: null });
    expect([f![2].focal, f![3].focal]).toEqual([null, null]);
    for (const v of [null, undefined, "[]", {}, 3, []]) expect(parseFrames(v), JSON.stringify(v)).toBeNull();
  });
});

describe("the focal point — object-position with object-fit: cover, as in the app", () => {
  it("clamp / parse / round: 0..1, the middle when unknown, 3 decimals when sent", () => {
    expect([clampFocal(2), clampFocal(-1), clampFocal(NaN), clampFocal(0.3)]).toEqual([1, 0, 0.5, 0.3]);
    expect([parseFocal(0.3), parseFocal("0.7"), parseFocal(1.2), parseFocal(-0.1), parseFocal(null), parseFocal(""), parseFocal("x"), parseFocal(0), parseFocal(1)])
      .toEqual([0.3, 0.7, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 1]);
    expect([roundFocal(0.12345), roundFocal(0.9996), roundFocal(1.7), roundFocal(-3)]).toEqual([0.123, 1, 1, 0]);
  });
  it("object-position: percents to 0.1% (as bloc) from the left and the top (also in RTL)", () => {
    expect(objectPosition(0.3, 0.75)).toBe("30% 75%");
    expect(objectPosition(2, -1)).toBe("100% 0%");
    expect(objectPosition(0.5, 0.5)).toBe("50% 50%");
    expect(objectPosition(0.333, 0.6666)).toBe("33.3% 66.7%");
    expect(objectPosition(0.1234, 0.05)).toBe("12.3% 5%");
  });
  it("cropRect: a wide image in a tall frame keeps the full height and slides by the focal x (the excess × the percent)", () => {
    const c = cropRect(16 / 9, 4 / 5, 0.5, 0.9);
    expect(c.w).toBeCloseTo((4 / 5) / (16 / 9), 10);
    expect([c.y, c.h]).toEqual([0, 1]);
    expect(c.x).toBeCloseTo((1 - c.w) * 0.5, 10);
    expect(cropRect(16 / 9, 4 / 5, 0, 0.5).x).toBe(0);
    expect(cropRect(16 / 9, 4 / 5, 1, 0.5).x).toBeCloseTo(1 - c.w, 10);
  });
  it("cropRect: a tall image in a wide frame keeps the full width and slides by the focal y; same ratio — all of it; bad input — all of it", () => {
    const c = cropRect(4 / 5, 1200 / 628, 0.2, 0.25);
    expect([c.x, c.w]).toEqual([0, 1]);
    expect(c.h).toBeCloseTo((4 / 5) / (1200 / 628), 10);
    expect(c.y).toBeCloseTo((1 - c.h) * 0.25, 10);
    expect(cropRect(1, 1, 0.9, 0.1)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(cropRect(0, 1, 0.5, 0.5)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(cropRect(1, NaN, 0.5, 0.5)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(cropRect(2, 1, 5, 0.5).x).toBeCloseTo(0.5, 10);   // the focal is clamped
  });
  it("a tap / drag → the focal point (from the left and the top), clamped; a box without size — the middle", () => {
    const r = { left: 100, top: 50, width: 200, height: 100 };
    expect(focalFromPoint(r, 150, 75)).toEqual([0.25, 0.25]);
    expect(focalFromPoint(r, 400, 0)).toEqual([1, 0]);
    expect(focalFromPoint(r, 100 + 200 / 3, 50)).toEqual([0.333, 0]);
    expect(focalFromPoint({ ...r, width: 0 }, 150, 75)).toEqual([0.5, 0.5]);
    expect(focalFromPoint({ ...r, height: -1 }, 150, 75)).toEqual([0.5, 0.5]);
  });
});

describe("the CTA color and its text — white or #0F172A, whichever contrasts more (the same rule as bloc)", () => {
  it("hex colors only (#RRGGBB); stored upper-case", () => {
    expect([isHexColor("#2563EB"), isHexColor("#2563eb"), isHexColor("2563EB"), isHexColor("#2563E"), isHexColor("#2563EBA"), isHexColor(null), isHexColor("red")])
      .toEqual([true, true, false, false, false, false, false]);
    expect([parseHex("#2563eb"), parseHex("red"), parseHex(undefined)]).toEqual(["#2563EB", null, null]);
  });
  it("WCAG luminance and contrast", () => {
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 10);
    expect(luminance("#000000")).toBe(0);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 10);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 10);
    expect(luminance("#2563EB")).toBeCloseTo(0.1531, 3);
  });
  it("bloc's blue (and no accent, and junk) → white text, 6.7:1; yellow / white → the dark text; black → white", () => {
    expect([CTA_LIGHT_TEXT, CTA_DARK_TEXT, BLOC_ACCENT]).toEqual(["#FFFFFF", "#0F172A", "#1D4ED8"]);
    for (const a of [null, undefined, "#2563EB", "red", "#12"]) expect(ctaTextColor(a), String(a)).toBe("#FFFFFF");
    expect(contrastInfo(null)).toEqual({ text: "#FFFFFF", ratio: 6.7, ok: true });   // bloc's AD_DEFAULT_ACCENT #1D4ED8
    expect(ctaTextColor("#FACC15")).toBe("#0F172A");
    expect(ctaTextColor("#FFFFFF")).toBe("#0F172A");
    expect(ctaTextColor("#000000")).toBe("#FFFFFF");
    expect(ctaTextColor("#16A34A")).toBe("#0F172A");   // green-600: the dark text contrasts more (5.4 vs 3.3)
    expect(contrastInfo("#FACC15").ok).toBe(true);
  });
  it("\"ok\" is the exact ratio, not the rounded one: #777777 shows 4.5:1 with white and still fails 4.5", () => {
    const c = contrastInfo("#777777");
    expect(c.text).toBe("#FFFFFF");
    expect(c.ratio).toBe(4.5);
    expect(c.ok).toBe(false);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeLessThan(4.5);
    expect(contrastInfo("#767676").ok).toBe(true);   // the classic AA gray: 4.54
  });
  it("review #9 — the nearest shade that passes: darker or lighter by 2% steps, the closer one (a tie — darker); a passing one is itself", () => {
    expect(accessibleAccent("#DC2626")).toBe("#DC2626");
    expect(accessibleAccent("#dc2626")).toBe("#DC2626");
    expect(accessibleAccent("#777777")).toBe("#757575");            // 4.48 → one 2% step darker: 4.6 with white
    expect(accessibleAccent("#2E8B57")).toBe("#2C8554");            // sea green 4.25 → two steps darker
    for (const a of ["#777777", "#2E8B57", "#7A7A7A", "#D1477A", "#0077FF", "#008899"]) {
      const fix = accessibleAccent(a)!;
      expect(contrastInfo(a).ok, a).toBe(false);
      expect(contrastInfo(fix).ok, `${a} → ${fix}`).toBe(true);
      expect(isHexColor(fix)).toBe(true);
    }
    // lighter when that is the closer way: #0077FF reaches only 4.32 (with the dark text) — two steps lighter passes first
    expect(accessibleAccent("#0077FF")).toBe("#0A7CFF");
    // a tie (both ways pass at the same step): the darker one, with white text
    expect(accessibleAccent("#0087A0")).toBe("#00829A");
    expect(contrastInfo("#0A8CA4").ok).toBe(true);   // the lighter one would pass too — darker is the rule
    expect(contrastInfo("#0A7CFF").text).toBe("#0F172A");
    expect([null, undefined, "red", "#12"].map((x) => accessibleAccent(x))).toEqual([null, null, null, null]);
  });
});

describe("a creative fits itself — the same rule as SQL 228's row CHECKs (C5 v2)", () => {
  it("story / carousel need 2..5 frames; every other format needs none", () => {
    expect(creativeFits("story", [1, 2])).toBe(true);
    expect(creativeFits("carousel", [1, 2, 3, 4, 5])).toBe(true);
    expect(creativeFits("story", [1])).toBe(false);
    expect(creativeFits("carousel", [1, 2, 3, 4, 5, 6])).toBe(false);
    expect(creativeFits("story", null)).toBe(false);
    for (const f of ["card", "dialog", "fullscreen", "banner", "native"] as const) {
      expect(creativeFits(f, null), f).toBe(true);
      expect(creativeFits(f, [1, 2]), f).toBe(false);
    }
  });
  it("a banner needs a position; nothing else has one (undefined — not judged)", () => {
    expect(creativeFits("banner", null, "top")).toBe(true);
    expect(creativeFits("banner", null, null)).toBe(false);
    expect(creativeFits("card", null, "top")).toBe(false);
    expect(creativeFits("card", null, null)).toBe(true);
    expect(creativeFits("banner", null)).toBe(true);
  });
  it("all images ours: the cover and every frame (an unknown base — not judged)", () => {
    const frames = [{ image_url: OURS(1), image_alt: "א", caption: null, cta_url: null, focal: null }, { image_url: OURS(2), image_alt: "ב", caption: null, cta_url: null, focal: null }];
    expect(allImagesOurs(OURS(1), frames, BASE)).toBe(true);
    expect(allImagesOurs(FOREIGN, null, BASE)).toBe(false);
    expect(allImagesOurs(OURS(1), [frames[0], { ...frames[1], image_url: FOREIGN }], BASE)).toBe(false);
    expect(allImagesOurs(FOREIGN, [{ ...frames[1], image_url: FOREIGN }], null)).toBe(true);
  });
});

describe("editing the frames — 2 to 5, like bloc; each with its own focal point", () => {
  const two = [F(1), F(2)];
  it("a new frame is empty, focal in the middle; add up to 5 (the sixth is refused, the list unchanged)", () => {
    expect(emptyFrame("k")).toEqual({ key: "k", image_url: "", image_alt: "", caption: "", cta_url: "", focal: [0.5, 0.5] });
    const five = [F(1), F(2), F(3), F(4), F(5)];
    expect(addFrame(two, "n")).toEqual([...two, emptyFrame("n")]);
    expect(addFrame(five, "n")).toEqual(five);
    expect(addFrame(five, "n")).not.toBe(five);
    expect([canAddFrame(4), canAddFrame(5), canRemoveFrame(2), canRemoveFrame(3)]).toEqual([true, false, false, true]);
  });
  it("remove: never below 2; out of range — unchanged", () => {
    expect(removeFrame(two, 0)).toEqual(two);
    expect(removeFrame([F(1), F(2), F(3)], 1)).toEqual([F(1), F(3)]);
    expect(removeFrame([F(1), F(2), F(3)], 3)).toEqual([F(1), F(2), F(3)]);
    expect(removeFrame([F(1), F(2), F(3)], -1)).toEqual([F(1), F(2), F(3)]);
  });
  it("move (arrows) swaps with the neighbour; the edges do nothing; the input is not mutated", () => {
    const three = [F(1), F(2), F(3)];
    expect(moveFrame(three, 0, 1).map((f) => f.key)).toEqual(["f2", "f1", "f3"]);
    expect(moveFrame(three, 2, -1).map((f) => f.key)).toEqual(["f1", "f3", "f2"]);
    expect(moveFrame(three, 0, -1).map((f) => f.key)).toEqual(["f1", "f2", "f3"]);
    expect(moveFrame(three, 2, 1).map((f) => f.key)).toEqual(["f1", "f2", "f3"]);
    expect(three.map((f) => f.key)).toEqual(["f1", "f2", "f3"]);
  });
  it("drop (drag) moves one frame to a place, the others shift; same place / out of range — unchanged", () => {
    const four = [F(1), F(2), F(3), F(4)];
    expect(dropFrame(four, 0, 2).map((f) => f.key)).toEqual(["f2", "f3", "f1", "f4"]);
    expect(dropFrame(four, 3, 0).map((f) => f.key)).toEqual(["f4", "f1", "f2", "f3"]);
    expect(dropFrame(four, 1, 1).map((f) => f.key)).toEqual(["f1", "f2", "f3", "f4"]);
    expect(dropFrame(four, 4, 0).map((f) => f.key)).toEqual(["f1", "f2", "f3", "f4"]);
    expect(dropFrame(four, 0, -1).map((f) => f.key)).toEqual(["f1", "f2", "f3", "f4"]);
    expect(four.map((f) => f.key)).toEqual(["f1", "f2", "f3", "f4"]);
  });
  it("update one frame only", () => {
    const out = updateFrame(two, 1, { caption: "חדש", focal: [0.1, 0.9] });
    expect(out[1]).toEqual({ ...F(2), caption: "חדש", focal: [0.1, 0.9] });
    expect(out[0]).toBe(two[0]);
  });
  it("a creative's frames → drafts with fresh keys (no focal → the middle); none → two empty frames (the minimum)", () => {
    const k = (i: number) => `k${i}`;
    expect(framesToDrafts(null, k)).toEqual([emptyFrame("k0"), emptyFrame("k1")]);
    const d = framesToDrafts([{ image_url: OURS(1), image_alt: "א", caption: "כ", cta_url: null, focal: [0.2, 0.3] }, { image_url: OURS(2), image_alt: "ב", caption: null, cta_url: "https://x.example", focal: null }], k);
    expect(d).toEqual([
      { key: "k0", image_url: OURS(1), image_alt: "א", caption: "כ", cta_url: "", focal: [0.2, 0.3] },
      { key: "k1", image_url: OURS(2), image_alt: "ב", caption: "", cta_url: "https://x.example", focal: [0.5, 0.5] },
    ]);
    expect(framesToDrafts([{ image_url: OURS(1), image_alt: "א", caption: null, cta_url: null, focal: null }], k)).toHaveLength(2);
  });
  it("a frame is ready with our image, alt 2..200, caption ≤60, and a https link only in a carousel", () => {
    expect(frameReady(F(1), "story", BASE)).toBe(true);
    expect(frameReady(F(1, { image_url: "" }), "story", BASE)).toBe(false);
    expect(frameReady(F(1, { image_url: FOREIGN }), "story", BASE)).toBe(false);
    expect(frameReady(F(1, { image_url: FOREIGN }), "story", null)).toBe(true);
    expect(frameReady(F(1, { image_alt: " א " }), "story", BASE)).toBe(false);
    expect(frameReady(F(1, { image_alt: "א".repeat(201) }), "story", BASE)).toBe(false);
    expect(frameReady(F(1, { caption: "כ".repeat(60) }), "story", BASE)).toBe(true);
    expect(frameReady(F(1, { caption: "כ".repeat(61) }), "story", BASE)).toBe(false);
    expect(frameReady(F(1, { cta_url: "https://x.example" }), "carousel", BASE)).toBe(true);
    expect(frameReady(F(1, { cta_url: "https://x.example" }), "story", BASE)).toBe(false);
    expect(frameReady(F(1, { cta_url: "http://x.example" }), "carousel", BASE)).toBe(false);
  });
  it("the list is ready with 2..5 ready frames", () => {
    expect(framesReady([F(1), F(2)], "story", BASE)).toBe(true);
    expect(framesReady([F(1)], "story", BASE)).toBe(false);
    expect(framesReady([F(1), F(2), F(3), F(4), F(5), F(6)], "story", BASE)).toBe(false);
    expect(framesReady([F(1), F(2, { image_alt: "" })], "story", BASE)).toBe(false);
    expect(framesReady(null, "story", BASE)).toBe(false);
  });
  it("the payload (C5 v2): trimmed; empty caption / link not sent (not null); a link only in a carousel; focal only off the middle, 3 decimals; no key", () => {
    const list = [
      F(1, { image_alt: " א ב ", caption: " כיתוב ", cta_url: " https://x.example ", focal: [0.12345, 0.5] }),
      F(2, { caption: "  ", cta_url: "" }),
    ];
    expect(framesPayload(list, "carousel")).toEqual([
      { image_url: OURS(1), image_alt: "א ב", caption: "כיתוב", cta_url: "https://x.example", focal: [0.123, 0.5] },
      { image_url: OURS(2), image_alt: "תמונה 2" },
    ]);
    expect(framesPayload(list, "story")).toEqual([
      { image_url: OURS(1), image_alt: "א ב", caption: "כיתוב", focal: [0.123, 0.5] },
      { image_url: OURS(2), image_alt: "תמונה 2" },
    ]);
    expect(JSON.stringify(framesPayload(list, "carousel"))).not.toContain("key");
  });
});
