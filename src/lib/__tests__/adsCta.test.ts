// bloc ADS-2ג1 (החלטות 402, 404–405; SQL 233) — הכפתור של כל מודעה, בפאנל (lib/adsCta).
//   • אותם כללים כמו ב-bloc: AD_TEL_RE (= ה-CHECK של 233 ו-AD_TEL_RE של bloc, תו בתו), ctaKindOf (= adCtaKind של bloc) — נבדק מול
//     העץ של bloc כשהוא כאן (BLOC_ROOT).
//   • מספר ישראלי: כל צורה שאנשים מקלידים → tel:+972… — לפי הקידומת (ספרה חסרה / מיותרת — לא נשמר, ו"מה חסר" אומר כמה); 1-700 →
//     tel:1700… (כך מחייגים בארץ); כוכבית → tel:*NNNN; הצגה 050-123-4567, ובתוך משפט — בבידוד משמאל לימין.
//   • הטיוטה ↔ הכתובת: כל סוג חוזר לשדות שלו (עריכה / שכפול), ומה חסר — משפט לכל סוג.
//   • מה הדייר יקבל, הכרטיס של המודעה, "הקלקות" לפי הסוג.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AD_TEL_RE, CTA_KINDS, CTA_LABEL_SUGGESTIONS, WA_TEXT_MAX, clickKindOf, clicksText, clicksTitle, ctaDraftFrom, ctaIssue, ctaKindOf, ctaOutcome, ctaShort,
  ctaUrlFrom, emptyCtaDraft, ilDisplay, ilNational, ilPhoneProblem, ltr, phoneToTel, switchCtaKind, type CtaDraft,
} from "../adsCta";

const BLOC = process.env.BLOC_ROOT ?? "/home/claude/hood-ads2";
const blocFile = (p: string) => (existsSync(join(BLOC, p)) ? readFileSync(join(BLOC, p), "utf8") : null);
const D = (o: Partial<CtaDraft>): CtaDraft => ({ ...emptyCtaDraft(), ...o });

describe("the same rules as bloc", () => {
  it("AD_TEL_RE — the CHECK of SQL 233 and bloc's AD_TEL_RE, character for character (when bloc's tree is here)", () => {
    expect(AD_TEL_RE.source).toBe("^tel:(\\+972([23489][0-9]{7}|[57][0-9]{8})|1(599|700|80[01])[0-9]{6}|\\*[0-9]{3,5})$");
    const sql = blocFile("supabase/migrations/233_ads_places_buttons_before_push.sql");
    if (sql) expect(sql).toContain(`cta_url ~ '${AD_TEL_RE.source}'`);
    const lib = blocFile("src/lib/ads.ts");
    if (lib) expect(lib).toContain(`export const AD_TEL_RE = /${AD_TEL_RE.source}/`);
  });
  it("ctaKindOf — the kind from the address, as bloc's adCtaKind (the same host rules)", () => {
    const table: Array<[string, string]> = [
      ["tel:+972501234567", "call"], ["tel:*2700", "call"], ["tel:0501234567", "link"],
      ["https://wa.me/972501234567?text=%D7%A9", "whatsapp"], ["https://api.whatsapp.com/send?phone=972501234567", "whatsapp"],
      ["https://wa.me.example.com/x", "link"], ["https://evilwa.me/x", "link"], ["http://wa.me/972501234567", "link"],
      ["https://waze.com/ul?q=Herzl&navigate=yes", "navigate"], ["https://ul.waze.com/x", "navigate"], ["https://maps.apple.com/?q=x", "navigate"],
      ["https://maps.google.com/?q=x", "navigate"], ["https://maps.app.goo.gl/AbC", "navigate"], ["https://www.google.com/maps/place/x", "navigate"],
      ["https://www.google.com/search?q=maps", "link"], ["https://waze.com.example.io/ul", "link"], ["https://cafe.example/menu", "link"], ["", "link"],
    ];
    for (const [url, kind] of table) expect([url, ctaKindOf(url)]).toEqual([url, kind]);
    const lib = blocFile("src/lib/ads.ts");
    if (lib) {
      // the host rules are the same text on both sides
      expect(lib).toContain("if (h === 'wa.me' || h === 'api.whatsapp.com') return 'whatsapp'");
      expect(lib).toContain("if (h === 'waze.com' || h.endsWith('.waze.com') || h === 'maps.apple.com' || h === 'maps.google.com' || h === 'maps.app.goo.gl'");
    }
  });
});

describe("an Israeli phone, as people type it", () => {
  it("ilNational / phoneToTel / ilDisplay", () => {
    const table: Array<[string, string | null, string | null]> = [
      ["050-123-4567", "501234567", "tel:+972501234567"], ["050 1234567", "501234567", "tel:+972501234567"], ["(050) 123-4567", "501234567", "tel:+972501234567"],
      ["+972 50 123 4567", "501234567", "tel:+972501234567"], ["+972-050-1234567", "501234567", "tel:+972501234567"], ["972501234567", "501234567", "tel:+972501234567"],
      ["00972501234567", "501234567", "tel:+972501234567"], ["03-1234567", "31234567", "tel:+97231234567"], ["072-123-4567", "721234567", "tel:+972721234567"],
      ["02-1234567", "21234567", "tel:+97221234567"], ["08-1234567", "81234567", "tel:+97281234567"],
      // 1-599 / 1-700 / 1-800 / 1-801 — as they are dialled in Israel, without +972 (also when typed with it)
      ["1-800-123-456", "1800123456", "tel:1800123456"], ["1-700-123-456", "1700123456", "tel:1700123456"], ["1599-123-456", "1599123456", "tel:1599123456"],
      ["+972 1 801 123 456", "1801123456", "tel:1801123456"],
      ["*2700", "*2700", "tel:*2700"], ["*123", "*123", "tel:*123"],
      // review row 2: by the prefix, not only the length — a missing or an extra digit is not a number
      ["050-123-456", null, null], ["050-1234-5678", null, null], ["03-123456", null, null], ["03-12345678", null, null], ["06-1234567", null, null],
      ["1-900-123-456", null, null], ["1-800-123-45", null, null], ["01-234-5678", null, null], ["⁦050-123-4567⁩", "501234567", "tel:+972501234567"],
      // an 09 number typed without its 0 starts with "972" — it is not the country code (8 digits)
      ["97212345", "97212345", "tel:+97297212345"],
      ["", null, null], ["050-123", null, null], ["+1 415 555 0123", null, null], ["*12", null, null], ["*123456", null, null], ["abc", null, null], ["0", null, null],
    ];
    for (const [input, nat, tel] of table) {
      expect([input, ilNational(input), phoneToTel(input)]).toEqual([input, nat, tel]);
      if (tel) expect([input, AD_TEL_RE.test(tel)]).toEqual([input, true]);
    }
    expect(["501234567", "31234567", "1800123456", "*2700", "771234567"].map(ilDisplay)).toEqual(["050-123-4567", "03-123-4567", "1-800-123-456", "*2700", "077-123-4567"]);
  });
  it("ilPhoneProblem — what is wrong: how many digits are missing / extra, the prefix, a star number", () => {
    expect(ilPhoneProblem("050-123-4567")).toBeNull();
    expect(ilPhoneProblem("050-123-456")).toEqual({ kind: "short", by: 1 });
    expect(ilPhoneProblem("050-123")).toEqual({ kind: "short", by: 4 });
    expect(ilPhoneProblem("050-1234-5678")).toEqual({ kind: "long", by: 1 });
    expect(ilPhoneProblem("03-123456")).toEqual({ kind: "short", by: 1 });
    expect(ilPhoneProblem("03-12345678")).toEqual({ kind: "long", by: 1 });
    expect(ilPhoneProblem("1-800-123-45")).toEqual({ kind: "short", by: 1 });
    expect(ilPhoneProblem("06-1234567")).toEqual({ kind: "prefix" });
    expect(ilPhoneProblem("1-900-123-456")).toEqual({ kind: "prefix" });
    expect(ilPhoneProblem("*12")).toEqual({ kind: "star" });
    expect(ilPhoneProblem("abc")).toEqual({ kind: "chars" });
  });
});

describe("the draft and the address", () => {
  it("a draft → the address saved; an empty / bad draft → \"\" (the checklist says why)", () => {
    expect(ctaUrlFrom(D({ kind: "link", url: " https://cafe.example/menu " }))).toBe("https://cafe.example/menu");
    expect(ctaUrlFrom(D({ kind: "call", phone: "050-123-4567" }))).toBe("tel:+972501234567");
    expect(ctaUrlFrom(D({ kind: "whatsapp", waPhone: "0501234567", waText: "היי" }))).toBe("https://wa.me/972501234567?text=%D7%94%D7%99%D7%99");
    expect(ctaUrlFrom(D({ kind: "whatsapp", waPhone: "0501234567", waText: "  " }))).toBe("https://wa.me/972501234567");
    expect(ctaUrlFrom(D({ kind: "navigate", place: "הרצל 1, חיפה" }))).toBe("https://waze.com/ul?q=%D7%94%D7%A8%D7%A6%D7%9C%201%2C%20%D7%97%D7%99%D7%A4%D7%94&navigate=yes");
    expect(ctaUrlFrom(D({ kind: "navigate", place: "https://maps.app.goo.gl/AbC" }))).toBe("https://maps.app.goo.gl/AbC");
    for (const d of [D({ kind: "call", phone: "050" }), D({ kind: "call", phone: "050-123-456" }), D({ kind: "whatsapp", waPhone: "*2700" }),
      D({ kind: "whatsapp", waPhone: "1-800-123-456" }), D({ kind: "navigate", place: "https://cafe.example" }), D({ kind: "navigate", place: "א" })]) {
      expect([d.kind, ctaUrlFrom(d)]).toEqual([d.kind, ""]);
    }
  });
  it("an address → the draft (edit / duplicate): every kind back in its own fields — and the round trip keeps the address", () => {
    expect(ctaDraftFrom("tel:+972501234567")).toMatchObject({ kind: "call", phone: "050-123-4567" });
    expect(ctaDraftFrom("tel:*2700")).toMatchObject({ kind: "call", phone: "*2700" });
    expect(ctaDraftFrom("tel:1700123456")).toMatchObject({ kind: "call", phone: "1-700-123-456" });
    expect(ctaDraftFrom("https://wa.me/972501234567?text=%D7%94%D7%99%D7%99")).toMatchObject({ kind: "whatsapp", waPhone: "050-123-4567", waText: "היי" });
    expect(ctaDraftFrom("https://api.whatsapp.com/send?phone=972501234567")).toMatchObject({ kind: "whatsapp", waPhone: "050-123-4567", waText: "" });
    expect(ctaDraftFrom("https://waze.com/ul?q=%D7%94%D7%A8%D7%A6%D7%9C%201&navigate=yes")).toMatchObject({ kind: "navigate", place: "הרצל 1" });
    expect(ctaDraftFrom("https://maps.app.goo.gl/AbC")).toMatchObject({ kind: "navigate", place: "https://maps.app.goo.gl/AbC" });
    expect(ctaDraftFrom("https://cafe.example/menu")).toMatchObject({ kind: "link", url: "https://cafe.example/menu" });
    expect(ctaDraftFrom("")).toEqual(emptyCtaDraft("link"));
    for (const url of ["tel:+972501234567", "tel:*2700", "tel:1700123456", "https://wa.me/972501234567?text=%D7%94%D7%99%D7%99", "https://wa.me/972501234567",
      "https://waze.com/ul?q=%D7%94%D7%A8%D7%A6%D7%9C%201&navigate=yes", "https://maps.app.goo.gl/AbC", "https://cafe.example/menu"]) {
      expect([url, ctaUrlFrom(ctaDraftFrom(url))]).toEqual([url, url]);
    }
  });
  it("a WhatsApp / navigation address the fields cannot hold stays as it is — saved unchanged, never \"not valid\" (review row 8)", () => {
    for (const url of ["https://wa.me/message/AB12CD3EF", "https://wa.me/14155550123", "https://wa.me/0501234567", "https://wa.me/972501234567?text=hi&lang=he",
      "https://api.whatsapp.com/send?phone=14155550123", "https://wa.me/97217001234567"]) {
      const d = ctaDraftFrom(url);
      expect([url, d.kind, d.url, ctaIssue(d), ctaUrlFrom(d)]).toEqual([url, "link", url, null, url]);
    }
    // the same meaning in another spelling — still the WhatsApp fields (saved as wa.me)
    expect(ctaDraftFrom("https://wa.me/972501234567/")).toMatchObject({ kind: "whatsapp", waPhone: "050-123-4567" });
    expect(ctaDraftFrom("https://api.whatsapp.com/send?phone=972501234567&text=%D7%94%D7%99%D7%99")).toMatchObject({ kind: "whatsapp", waText: "היי" });
    // a Waze link with more than the address: the link itself (kept word for word)
    const waze = "https://waze.com/ul?q=%D7%94%D7%A8%D7%A6%D7%9C%201&navigate=yes&ll=32.08,34.78";
    expect(ctaDraftFrom(waze)).toMatchObject({ kind: "navigate", place: waze });
    expect(ctaUrlFrom(ctaDraftFrom(waze))).toBe(waze);
  });
  it("\"Https://\" from a phone keyboard is saved as https:// (the CHECK compares the letters as they are — review row 7)", () => {
    expect(ctaUrlFrom(D({ kind: "link", url: "Https://cafe.example/menu" }))).toBe("https://cafe.example/menu");
    expect(ctaIssue(D({ kind: "link", url: "HTTPS://cafe.example/menu" }))).toBeNull();
    expect(ctaUrlFrom(D({ kind: "navigate", place: "Https://waze.com/ul?q=x&navigate=yes" }))).toBe("https://waze.com/ul?q=x&navigate=yes");
    expect(ctaIssue(D({ kind: "navigate", place: "Https://waze.com/ul?q=x&navigate=yes" }))).toBeNull();
    expect(AD_TEL_RE.test("tel:+972501234567")).toBe(true);
  });
  it("what is missing, per kind (a sentence without a full stop)", () => {
    expect(ctaIssue(D({ kind: "link" }))).toBe("חסר הקישור של הכפתור");
    expect(ctaIssue(D({ kind: "link", url: "www.cafe.example" }))).toBe("הקישור של הכפתור צריך להתחיל ב-https://");
    expect(ctaIssue(D({ kind: "link", url: `https://x.example/${"a".repeat(1000)}` }))).toBe("הקישור ארוך מ-1,000 תווים");
    expect(ctaIssue(D({ kind: "call" }))).toBe("חסר מספר הטלפון");
    expect(ctaIssue(D({ kind: "call", phone: "050-12" }))).toBe("חסרות 5 ספרות במספר הטלפון");
    expect(ctaIssue(D({ kind: "call", phone: "050-123-456" }))).toBe("חסרה ספרה במספר הטלפון");
    expect(ctaIssue(D({ kind: "call", phone: "050-1234-5678" }))).toBe("יש ספרה מיותרת במספר הטלפון");
    expect(ctaIssue(D({ kind: "call", phone: "050-1234-56789" }))).toBe("יש 2 ספרות מיותרות במספר הטלפון");
    expect(ctaIssue(D({ kind: "call", phone: "06-1234567" }))).toBe("מספר הטלפון לא תקין — נייד (050-1234567), קווי (03-1234567), 1-700 או כוכבית (*2700)");
    expect(ctaIssue(D({ kind: "call", phone: "*12" }))).toBe("מספר כוכבית הוא כוכבית ו-3 עד 5 ספרות (למשל *2700)");
    expect(ctaIssue(D({ kind: "whatsapp", waPhone: "1-800-123-456" }))).toBe("בוואטסאפ צריך מספר נייד או קווי, לא 1-700 / 1-800");
    expect(ctaIssue(D({ kind: "whatsapp", waPhone: "050-123-456" }))).toBe("חסרה ספרה במספר הוואטסאפ");
    expect(ctaIssue(D({ kind: "whatsapp" }))).toBe("חסר מספר הוואטסאפ");
    expect(ctaIssue(D({ kind: "whatsapp", waPhone: "*2700" }))).toBe("בוואטסאפ צריך מספר טלפון רגיל, לא כוכבית");
    expect(ctaIssue(D({ kind: "whatsapp", waPhone: "12" }))).toBe("מספר הוואטסאפ לא תקין — מספר ישראלי, למשל 050-1234567");
    expect(ctaIssue(D({ kind: "whatsapp", waPhone: "*27" }))).toBe("בוואטסאפ צריך מספר טלפון רגיל, לא כוכבית");
    expect(ctaIssue(D({ kind: "whatsapp", waPhone: "0501234567", waText: "א".repeat(WA_TEXT_MAX + 1) }))).toBe(`ההודעה המוכנה ארוכה מ-${WA_TEXT_MAX} תווים`);
    expect(ctaIssue(D({ kind: "whatsapp", waPhone: "0501234567", waText: "א".repeat(WA_TEXT_MAX) }))).toBeNull();
    expect(ctaUrlFrom(D({ kind: "whatsapp", waPhone: "0501234567", waText: "א".repeat(WA_TEXT_MAX) })).length).toBeLessThanOrEqual(1000);
    expect(ctaIssue(D({ kind: "navigate" }))).toBe("חסרה כתובת לניווט");
    expect(ctaIssue(D({ kind: "navigate", place: "http://waze.com/ul" }))).toBe("קישור הניווט צריך להתחיל ב-https://");
    expect(ctaIssue(D({ kind: "navigate", place: "https://cafe.example" }))).toContain("זה לא קישור של Waze או של מפות");
    expect(ctaIssue(D({ kind: "navigate", place: "אב" }))).toBe("הכתובת קצרה מדי — רחוב, מספר ועיר");
    for (const d of [D({ kind: "link", url: "https://cafe.example" }), D({ kind: "call", phone: "*2700" }), D({ kind: "call", phone: "1-700-123-456" }),
      D({ kind: "whatsapp", waPhone: "050-1234567" }), D({ kind: "whatsapp", waPhone: "03-1234567" }), D({ kind: "navigate", place: "הרצל 1, חיפה" })]) {
      expect([d.kind, ctaIssue(d)]).toEqual([d.kind, null]);
    }
  });
  it("switching the kind: what was typed stays; a ready name (or the old default) changes to the new kind's first; a name you wrote stays", () => {
    const d = D({ kind: "link", url: "https://cafe.example", phone: "050-1234567" });
    expect(switchCtaKind(d, "לפרטים", "call")).toEqual({ draft: { ...d, kind: "call" }, label: "התקשרו עכשיו" });
    expect(switchCtaKind(d, "למבצע", "whatsapp").label).toBe("שלחו הודעה");
    expect(switchCtaKind(d, "", "navigate").label).toBe("איך מגיעים");
    expect(switchCtaKind(d, "פיצה עד הבית", "call").label).toBe("פיצה עד הבית");
    expect(switchCtaKind(d, "לפרטים", "link").label).toBe("לפרטים");
    expect(CTA_KINDS.every((k) => CTA_LABEL_SUGGESTIONS[k].every((t) => t.length >= 2 && t.length <= 24))).toBe(true);
  });
});

describe("what the tenant gets, the creative card, and the report", () => {
  it("ctaOutcome / ctaShort", () => {
    // review row 6: the number in an LTR isolate — "*2700" stays "*2700" inside Hebrew (not "2700*")
    expect(ltr("*2700")).toBe("\u2066*2700\u2069");
    expect(ctaOutcome("tel:+972501234567")).toBe(`הדייר יחייג אליכם: ${ltr("050-123-4567")}`);
    expect(ctaOutcome("tel:*2700")).toBe(`הדייר יחייג אליכם: ${ltr("*2700")}`);
    expect(ctaOutcome("tel:1700123456")).toBe(`הדייר יחייג אליכם: ${ltr("1-700-123-456")}`);
    expect(ctaOutcome("https://wa.me/972501234567?text=%D7%94%D7%99%D7%99")).toBe(`תיפתח שיחת וואטסאפ עם ${ltr("050-123-4567")}, וההודעה "היי" כבר כתובה`);
    expect(ctaOutcome("https://wa.me/972501234567")).toBe(`תיפתח שיחת וואטסאפ עם ${ltr("050-123-4567")}`);
    expect(ctaOutcome("https://wa.me/message/AB12CD3EF")).toBe("תיפתח שיחת וואטסאפ מהקישור שהדבקתם");
    expect(ctaOutcome("https://waze.com/ul?q=%D7%94%D7%A8%D7%A6%D7%9C%201&navigate=yes")).toBe("ייפתח ניווט ב-Waze אל: הרצל 1");
    expect(ctaOutcome("https://maps.app.goo.gl/AbC")).toBe("ייפתח הניווט מהקישור שהדבקתם");
    expect(ctaOutcome("https://cafe.example")).toBeNull();
    expect(ctaShort("tel:*2700")).toBe(`שיחה · ${ltr("*2700")}`);
    expect(ctaShort("https://wa.me/972501234567")).toBe(`וואטסאפ · ${ltr("050-123-4567")}`);
    expect(ctaShort("https://wa.me/message/AB12CD3EF")).toBe("וואטסאפ · קישור");
    expect(ctaShort("https://waze.com/ul?q=%D7%94%D7%A8%D7%A6%D7%9C%201&navigate=yes")).toBe("ניווט · הרצל 1");
    expect(ctaShort("https://cafe.example/menu")).toBe("https://cafe.example/menu");
  });
  it("clicks named by the action — taps on the button, not calls made (bloc decision 405; review row 10)", () => {
    const f = (n: number) => String(n);
    expect([clicksText(12, "call", f), clicksText(1, "call", f)]).toEqual(["12 לחיצות לשיחה", "לחיצה אחת לשיחה"]);
    expect([clicksText(3, "whatsapp", f), clicksText(1, "whatsapp", f)]).toEqual(["3 לחיצות לוואטסאפ", "לחיצה אחת לוואטסאפ"]);
    expect([clicksText(7, "navigate", f), clicksText(1, "navigate", f)]).toEqual(["7 לחיצות לניווט", "לחיצה אחת לניווט"]);
    expect(clicksText(5, "link", f)).toBe("5 הקלקות");
    expect(clicksTitle(["call", "call"])).toBe("לחיצות לשיחה");
    expect(clicksTitle(["whatsapp"])).toBe("לחיצות לוואטסאפ");
    expect(clicksTitle(["navigate"])).toBe("לחיצות לניווט");
    expect(clicksTitle(["call", "link"])).toBe("הקלקות");
    expect(clicksTitle([])).toBe("הקלקות");
    // a carousel whose cards have their own links: a tap there is a website — "הקלקות"
    expect(clickKindOf({ cta_url: "tel:*2700", frames: null })).toBe("call");
    expect(clickKindOf({ cta_url: "tel:*2700", frames: [{ cta_url: null }, { cta_url: null }] })).toBe("call");
    expect(clickKindOf({ cta_url: "tel:*2700", frames: [{ cta_url: "https://cafe.example/a" }, { cta_url: null }] })).toBe("link");
  });
});
