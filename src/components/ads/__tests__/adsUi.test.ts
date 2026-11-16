// bloc ADS-1b — מה המנהל רואה בפאנל (מרונדר לשרת, בלי דפדפן):
//   • REGRESSION (13.10): ימים ומסכים "נבחרו" בלחיצה ובעצם בוטלו (הכל מסומן מראש). עכשיו: וי בתוך כל אפשרות
//     מסומנת, "הכל" כשלא הכל מסומן, ושורה "לא נבחרו: …".
//   • התצוגה המקדימה כמו באפליקציה: מסגרת 4:5, ו"ממומן · המפרסם" בתחתית, אחרי הכפתור. ADS-2א (החלטה 377): ה-X כבר לא על
//     התמונה עם ספירה — עיגול אטום בפינה השמאלית העליונה של המסך (ADS-2א v2: studio/AdPreview מחליף את AdPhonePreview).
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChipSet } from "../adsKit";
import AdPreview from "../studio/AdPreview";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"].map((d, i) => ({ key: i, label: d }));
const chips = (value: number[], allLabel?: string) =>
  renderToStaticMarkup(createElement(ChipSet<number>, { name: "days", label: "ימים", options: DAYS, value, onChange: () => {}, ...(allLabel ? { allLabel } : {}) }));

describe("ChipSet — what is chosen is unmistakable", () => {
  it("every chosen chip carries a check (an svg) and aria-pressed; the others none", () => {
    const html = chips([0, 1, 4, 5, 6]);
    const buttons = html.split("<button").slice(1);
    const day = (k: number) => buttons.find((b) => b.includes(`data-chip="${k}"`))!;
    for (const k of [0, 1, 4, 5, 6]) {
      expect(day(k)).toContain('aria-pressed="true"');
      expect(day(k)).toContain("<svg");
    }
    for (const k of [2, 3]) {
      expect(day(k)).toContain('aria-pressed="false"');
      expect(day(k)).not.toContain("<svg");
    }
  });
  it("REGRESSION (13.10): not all chosen — \"all\" and the line that names what is left out", () => {
    const html = chips([0, 1, 4, 5, 6], "כל הימים");
    expect(html).toContain("data-chip-all");
    expect(html).toContain(">כל הימים<");
    expect(html).toContain("לא נבחרו: שלישי, רביעי");
  });
  it("all chosen — no \"all\" and no line", () => {
    const html = chips([0, 1, 2, 3, 4, 5, 6]);
    expect(html).not.toContain("data-chip-all");
    expect(html).not.toContain("לא נבחרו");
  });
});

describe("the phone preview is the app's screen (the card)", () => {
  const html = renderToStaticMarkup(createElement(AdPreview, {
    format: "card", advertiser: "bloc", imageUrl: "https://x.supabase.co/storage/v1/object/public/ads/a.png", imageAlt: "bloc", headline: "כותרת", body: "משפט", ctaLabel: "לפרטים",
  }));
  it("a 4:5 frame the image fills; the X is NOT inside it any more — it is at the screen's corner", () => {
    const frame = html.slice(html.indexOf("data-ad-preview-frame"), html.indexOf("כותרת"));
    expect(html).toMatch(/aspect-ratio:4 \/ 5/);
    expect(frame.indexOf("object-fit:cover")).toBeGreaterThan(-1);
    expect(frame).not.toContain("data-ad-preview-close");
    expect(html).toContain('data-ad-preview-close="solid"');
  });
  it("the button, then \"ממומן · \" the advertiser — at the bottom", () => {
    expect(html.indexOf("לפרטים")).toBeLessThan(html.indexOf("data-ad-preview-sponsored"));
    expect(html).toContain("ממומן · <b");
    expect(html.indexOf("data-ad-preview-sponsored")).toBeGreaterThan(html.indexOf("data-ad-preview-frame"));
  });
  it("without an image — the place for it, with the recommended size isolated left-to-right (no more 1350×1080)", () => {
    const empty = renderToStaticMarkup(createElement(AdPreview, { format: "card", advertiser: "", imageUrl: null, imageAlt: "", headline: "", body: null, ctaLabel: "" }));
    expect(empty).toContain("התמונה תופיע כאן (⁦1080×1350⁩)");
    expect(empty).toContain("שם המפרסם");
  });
});
