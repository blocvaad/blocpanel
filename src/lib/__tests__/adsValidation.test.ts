// פרסומות (bloc ADS-1): הגבולות של כל שדה — כמו ה-CHECK ב-DB, עם משפט בעברית.
import { describe, it, expect } from "vitest";
import { adActionSchema } from "../validation";

const ID = "11111111-1111-4111-8111-111111111111";
const ok = (b: Record<string, unknown>) => adActionSchema.safeParse(b);
const msg = (b: Record<string, unknown>) => { const r = ok(b); return r.success ? null : r.error.issues[0].message; };

const campaign = (o: Record<string, unknown> = {}) => ({
  action: "campaign.save", contract_id: ID, name: "פיצה סתיו", starts_on: "2026-10-13", ends_on: "2026-11-12",
  days: [0, 1, 2, 3, 4], hour_from: 8, hour_to: 22, screens: ["home"], goal_views: 10000, daily_cap: null,
  per_user_cap: 3, plans: ["free", "building"], roles: ["tenant", "committee"], cities: [], building_ids: [], weight: 1, ...o,
});
const creative = (o: Record<string, unknown> = {}) => ({
  action: "creative.save", campaign_id: ID, image_url: "https://x.supabase.co/storage/v1/object/public/ads/a.webp", image_alt: "פיצה",
  headline: "פיצה ב-49", body: "", cta_label: "להזמנה", cta_url: "https://pizza.example/order", ...o,
});
const contract = (o: Record<string, unknown> = {}) => ({
  action: "contract.save", advertiser_id: ID, pricing: "cpm", price_ils: 50, starts_on: "2026-10-01", ends_on: "2026-12-31", ...o,
});

describe("advertiser", () => {
  it("name 2–80; business id digits only (dashes and spaces dropped); site https; empty = null", () => {
    const r = ok({ action: "advertiser.save", name: " פיצה השכונה ", business_id: "51-400 0001", website: "", contact_email: "" });
    expect(r.success).toBe(true);
    if (r.success && r.data.action === "advertiser.save") {
      expect(r.data.name).toBe("פיצה השכונה");
      expect(r.data.business_id).toBe("514000001");
      expect(r.data.website).toBeNull();
      expect(r.data.contact_email).toBeNull();
      expect(r.data.legal_name).toBeNull();
    }
    expect(msg({ action: "advertiser.save", name: "א" })).toContain("לפחות 2");
    expect(msg({ action: "advertiser.save", name: "עסק", business_id: "12" })).toContain("5 עד 12 ספרות");
    expect(msg({ action: "advertiser.save", name: "עסק", website: "http://x.example" })).toContain("https://");
    expect(msg({ action: "advertiser.save", name: "עסק", contact_email: "x" })).toBe("אימייל לא תקין");
    expect(ok({ action: "advertiser.save", name: "עסק", is_admin: true }).success).toBe(false);
  });
});

describe("contract", () => {
  it("pricing, price, cap, dates", () => {
    expect(ok(contract()).success).toBe(true);
    expect(ok(contract({ pricing: "cpa" })).success).toBe(false);
    expect(msg(contract({ price_ils: -1 }))).toContain("שלילי");
    expect(msg(contract({ impression_cap: 0 }))).toBe("לפחות חשיפה אחת");
    expect(msg(contract({ ends_on: "2026-09-30" }))).toBe("תאריך הסיום לפני תאריך ההתחלה");
    expect(msg(contract({ starts_on: "2026-13-01" }))).toBe("תאריך לא תקין");
    expect(msg(contract({ document_url: "ftp://x" }))).toContain("https://");
    const r = ok(contract({ price_ils: 12.346, impression_cap: null }));
    expect(r.success && r.data.action === "contract.save" && r.data.price_ils).toBe(12.35);
  });
});

describe("campaign", () => {
  it("a valid campaign; days sorted and unique; subsets unique", () => {
    const r = ok(campaign({ days: [4, 0, 4], screens: ["home", "home"] }));
    expect(r.success).toBe(true);
    if (r.success && r.data.action === "campaign.save") {
      expect(r.data.days).toEqual([0, 4]);
      expect(r.data.screens).toEqual(["home"]);
    }
  });
  it("refuses what the database refuses", () => {
    expect(msg(campaign({ days: [] }))).toBe("בחרו לפחות יום אחד");
    expect(ok(campaign({ days: [7] })).success).toBe(false);
    expect(msg(campaign({ hour_from: 22, hour_to: 8 }))).toBe("שעת הסיום צריכה להיות אחרי שעת ההתחלה");
    expect(msg(campaign({ hour_from: 10, hour_to: 10 }))).toBe("שעת הסיום צריכה להיות אחרי שעת ההתחלה");
    expect(ok(campaign({ hour_from: 23, hour_to: 24 })).success).toBe(true);
    expect(ok(campaign({ hour_to: 25 })).success).toBe(false);
    expect(ok(campaign({ screens: ["payments"] })).success).toBe(false);
    expect(msg(campaign({ screens: [] }))).toBe("בחרו לפחות מסך אחד");
    expect(ok(campaign({ plans: ["gold"] })).success).toBe(false);
    expect(ok(campaign({ roles: ["management"] })).success).toBe(false);
    expect(msg(campaign({ per_user_cap: 31 }))).toBe("עד 30 פעמים לאדם");
    expect(ok(campaign({ weight: 11 })).success).toBe(false);
    expect(msg(campaign({ ends_on: "2026-10-01" }))).toBe("תאריך הסיום לפני תאריך ההתחלה");
    expect(ok(campaign({ status: "active" })).success).toBe(false); // status — only through campaign.status
    expect(ok(campaign({ building_ids: ["x"] })).success).toBe(false);
    expect(msg(campaign({ cities: Array.from({ length: 51 }, (_, i) => `עיר ${i}`) }))).toBe("עד 50 ערים");
  });
  it("status: four values; duplicate and delete take an id", () => {
    expect(ok({ action: "campaign.status", id: ID, status: "active" }).success).toBe(true);
    expect(ok({ action: "campaign.status", id: ID, status: "live" }).success).toBe(false);
    expect(ok({ action: "campaign.duplicate", id: ID }).success).toBe(true);
    expect(ok({ action: "campaign.delete", id: "x" }).success).toBe(false);
  });
});

describe("creative", () => {
  it("https image and link, lengths; empty body = null", () => {
    const r = ok(creative());
    expect(r.success && r.data.action === "creative.save" && r.data.body).toBeNull();
    expect(msg(creative({ image_url: "http://x.example/a.png" }))).toContain("https://");
    expect(msg(creative({ cta_url: "javascript:alert(1)" }))).toContain("https://");
    expect(msg(creative({ cta_url: "https://user:pw@x.example" }))).toContain("https://");
    expect(msg(creative({ headline: "א".repeat(61) }))).toContain("עד 60");
    expect(msg(creative({ body: "ב".repeat(181) }))).toContain("עד 180");
    expect(msg(creative({ cta_label: "א" }))).toContain("לפחות 2");
    expect(msg(creative({ image_alt: " " }))).toContain("לפחות 2");
  });
});

// ── ADS-2א v2 (C5 v2): הפורמט שייך למודעה — פורמט, מיקום פס, סגנון, צבע כפתור, נקודת מיקוד ותמונות; המותג של המפרסם. אותם גבולות
// כמו ב-bloc (וה-CHECK של SQL 228), משפט בעברית לכל אחד ──
const OURS = (n: number) => `https://x.supabase.co/storage/v1/object/public/ads/f${n}.webp`;
const frame = (n: number, o: Record<string, unknown> = {}) => ({ image_url: OURS(n), image_alt: `תמונה ${n}`, ...o });
const issue = (b: Record<string, unknown>) => { const r = ok(b); return r.success ? null : r.error.issues[0]; };
const out = (b: Record<string, unknown>) => { const r = ok(b); if (!r.success) throw new Error(r.error.issues[0].message); return r.data as Record<string, unknown>; };

describe("ADS-2א v2 — the campaign has no format again (C3)", () => {
  it("format / banner_position on campaign.save are unknown keys — refused, never forwarded", () => {
    expect(ok(campaign({ format: "card" })).success).toBe(false);
    expect(ok(campaign({ banner_position: "top" })).success).toBe(false);
    expect(ok(campaign()).success).toBe(true);
  });
});

describe("ADS-2א v2 — the creative's format and the banner's position", () => {
  it("each of the seven formats (in its own shape); absent → not sent (bloc: card); anything else refused in Hebrew", () => {
    for (const format of ["card", "dialog", "fullscreen", "native"]) expect(out(creative({ format })).format, format).toBe(format);
    expect(out(creative({ format: "banner", banner_position: "top" })).format).toBe("banner");
    for (const format of ["story", "carousel"]) expect(out(creative({ format, frames: [frame(1), frame(2)] })).format, format).toBe(format);
    expect("format" in out(creative())).toBe(false);
    expect(msg(creative({ format: "popup" }))).toBe("בחרו פורמט למודעה");
    expect(msg(creative({ format: "" }))).toBe("בחרו פורמט למודעה");
  });
  it("a banner needs top or bottom; no other format has a position (null is fine)", () => {
    for (const p of ["top", "bottom"]) expect(out(creative({ format: "banner", banner_position: p })).banner_position, p).toBe(p);
    expect(issue(creative({ format: "banner" }))).toMatchObject({ message: "בחרו איפה הפס מוצג: למעלה או למטה", path: ["banner_position"] });
    expect(issue(creative({ format: "banner", banner_position: null }))?.message).toBe("בחרו איפה הפס מוצג: למעלה או למטה");
    expect(issue(creative({ format: "dialog", banner_position: "top" }))).toMatchObject({ message: "מיקום יש רק לפס", path: ["banner_position"] });
    expect(issue(creative({ banner_position: "bottom" }))?.message).toBe("מיקום יש רק לפס");   // no format = card
    expect(ok(creative({ format: "card", banner_position: null })).success).toBe(true);
    expect(msg(creative({ format: "banner", banner_position: "middle" }))).toBe("מיקום הפס: למעלה או למטה");
  });
});

describe("ADS-2א v2 — the creative's style: theme, accent, focal point", () => {
  it("theme light / dark; absent → not sent (bloc: light); anything else refused", () => {
    for (const theme of ["light", "dark"]) expect(out(creative({ theme })).theme).toBe(theme);
    expect("theme" in out(creative())).toBe(false);
    expect(msg(creative({ theme: "neon" }))).toBe("סגנון: בהיר או כהה");
  });
  it("accent: #RRGGBB (stored upper-case); empty / null / absent → null (= bloc's color); anything else refused", () => {
    expect(out(creative({ accent: "#16a34a" })).accent).toBe("#16A34A");
    for (const v of ["", null]) expect(out(creative({ accent: v })).accent, String(v)).toBeNull();
    expect(out(creative()).accent).toBeNull();
    for (const v of ["red", "#16a34", "16a34a", "#16a34aff"]) expect(msg(creative({ accent: v })), v).toBe("צבע הכפתור: צבע בצורה #RRGGBB");
  });
  it("review #9 — like bloc (400 invalid, field accent): an accent under 4.5:1 with both texts is refused, on the accent, in Hebrew", () => {
    for (const v of ["#777777", "#2e8b57", "#0077FF"]) {
      const r = ok(creative({ accent: v }));
      expect(r.success, v).toBe(false);
      if (!r.success) {
        expect(r.error.issues[0].path).toEqual(["accent"]);
        expect(r.error.issues[0].message).toContain("4.5:1");
      }
    }
    for (const v of ["#757575", "#DC2626", "#FACC15", "#0A7CFF"]) expect(out(creative({ accent: v })).accent, v).toBe(v.toUpperCase());
  });
  it("focal_x / focal_y: numbers 0..1 (absent → not sent, bloc: 0.5); outside or not a number — Hebrew", () => {
    const r = out(creative({ focal_x: 0, focal_y: 1 }));
    expect([r.focal_x, r.focal_y]).toEqual([0, 1]);
    expect("focal_x" in out(creative())).toBe(false);
    expect(msg(creative({ focal_x: 1.2 }))).toBe("נקודת המיקוד: מספר בין 0 ל-1");
    expect(msg(creative({ focal_y: -0.1 }))).toBe("נקודת המיקוד: מספר בין 0 ל-1");
    expect(msg(creative({ focal_x: "0.5" }))).toBe("נקודת המיקוד: מספר בין 0 ל-1");
  });
});

describe("ADS-2א v2 — the frames of a story / carousel", () => {
  const story = (o: Record<string, unknown> = {}) => creative({ format: "story", ...o });
  it("frames only with story / carousel (2..5); a story without them, or frames on another format — Hebrew, path frames", () => {
    expect(out(creative({ frames: null })).frames).toBeNull();
    expect("frames" in out(creative())).toBe(false);
    expect(ok(story({ frames: [frame(1), frame(2)] })).success).toBe(true);
    expect(ok(creative({ format: "carousel", frames: [1, 2, 3, 4, 5].map((i) => frame(i)) })).success).toBe(true);
    expect(issue(story())).toMatchObject({ message: "סטורי וקרוסלה: לפחות 2 תמונות", path: ["frames"] });
    expect(issue(story({ frames: null }))?.message).toBe("סטורי וקרוסלה: לפחות 2 תמונות");
    expect(issue(creative({ frames: [frame(1), frame(2)] }))).toMatchObject({ message: "תמונות נוספות יש רק בסטורי ובקרוסלה", path: ["frames"] });
    expect(issue(creative({ format: "dialog", frames: [frame(1), frame(2)] }))?.message).toBe("תמונות נוספות יש רק בסטורי ובקרוסלה");
    expect(msg(story({ frames: [frame(1)] }))).toBe("סטורי וקרוסלה: לפחות 2 תמונות");
    expect(msg(story({ frames: [] }))).toBe("סטורי וקרוסלה: לפחות 2 תמונות");
    expect(msg(story({ frames: [1, 2, 3, 4, 5, 6].map((i) => frame(i)) }))).toBe("סטורי וקרוסלה: עד 5 תמונות");
    expect(msg(story({ frames: "x" }))).toBe("התמונות: רשימה לא תקינה");
  });
  it("each frame like ad_frames_ok: https image ≤1000, alt 2..200, caption ≤60, link https ≤1000, focal [x, y] in 0..1 — the message names the frame, the path is frames.N.field", () => {
    const cases: Array<[Record<string, unknown>, number, Array<string | number>, string]> = [
      [frame(2, { image_url: "http://x.example/a.png" }), 1, ["image_url"], "תמונה 2 — התמונה: כתובת מלאה שמתחילה ב-https://"],
      [frame(2, { image_url: `https://x.example/${"a".repeat(1000)}` }), 1, ["image_url"], "תמונה 2 — התמונה: עד 1,000 תווים"],
      [frame(2, { image_alt: "א" }), 1, ["image_alt"], "תמונה 2 — תיאור התמונה: לפחות 2 תווים"],
      [frame(2, { image_alt: "א".repeat(201) }), 1, ["image_alt"], "תמונה 2 — תיאור התמונה: עד 200 תווים"],
      [frame(2, { caption: "כ".repeat(61) }), 1, ["caption"], "תמונה 2 — הכיתוב: עד 60 תווים"],
      [frame(2, { cta_url: "javascript:alert(1)" }), 1, ["cta_url"], "תמונה 2 — הקישור: כתובת מלאה שמתחילה ב-https://"],
      [frame(2, { focal: [2, 0.5] }), 1, ["focal", 0], "תמונה 2 — נקודת המיקוד: מספר בין 0 ל-1"],
      [frame(2, { focal: [0.5, -1] }), 1, ["focal", 1], "תמונה 2 — נקודת המיקוד: מספר בין 0 ל-1"],
      [frame(2, { focal: "center" }), 1, ["focal"], "תמונה 2 — נקודת המיקוד: שני מספרים בין 0 ל-1"],
    ];
    for (const [bad, i, field, text] of cases) {
      const iss = issue(creative({ format: "carousel", frames: [frame(1), bad] }));
      expect(iss?.message, field.join(".")).toBe(text);
      expect(iss?.path, field.join(".")).toEqual(["frames", i, ...field]);
    }
    expect(issue(story({ frames: [frame(1, { extra: 1 }), frame(2)] }))).toMatchObject({ message: "תמונה 1 — שדה לא מוכר", path: ["frames", 0] });
    expect(issue(story({ frames: [frame(1), "x"] }))).toMatchObject({ message: "תמונה 2 — ערך לא תקין", path: ["frames", 1] });
    expect(issue(story({ frames: [frame(1), frame(2, { image_alt: 7 })] }))?.message).toBe("תמונה 2 — ערך לא תקין");
    expect(ok(story({ frames: [frame(1, { caption: "כ".repeat(60) }), frame(2)] })).success).toBe(true);
  });
  it("REGRESSION: a story whose frame list failed (z.NEVER) does not throw in the cross-field check — the frame's own message", () => {
    expect(() => adActionSchema.safeParse(story({ frames: [frame(1), "x"] }))).not.toThrow();
    expect(() => adActionSchema.safeParse(creative({ format: "native", frames: [frame(1), 7] }))).not.toThrow();
    expect(issue(creative({ format: "native", frames: [frame(1), 7] }))?.message).toBe("תמונה 2 — ערך לא תקין");
  });
  it("a frame's own link — only in a carousel: in a story it is refused with the frame's number and path", () => {
    expect(issue(story({ frames: [frame(1), frame(2, { cta_url: "https://pizza.example/b" })] })))
      .toMatchObject({ message: "תמונה 2 — קישור לכל תמונה יש רק בקרוסלה", path: ["frames", 1, "cta_url"] });
    expect(ok(creative({ format: "carousel", frames: [frame(1), frame(2, { cta_url: "https://pizza.example/b" })] })).success).toBe(true);
    // a one-image format with frames: refused for the frames — and each frame link is named too (every issue is in the 400's list)
    const r = ok(creative({ format: "dialog", frames: [frame(1), frame(2, { cta_url: "https://pizza.example/b" })] }));
    expect(r.success ? [] : r.error.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["frames", "תמונות נוספות יש רק בסטורי ובקרוסלה"], ["frames.1.cta_url", "תמונה 2 — קישור לכל תמונה יש רק בקרוסלה"],
    ]);
  });
  it("the output: trimmed; an empty caption / link / focal is left out (never null); a focal kept as sent; the other fields kept", () => {
    const r = out(creative({ format: "carousel", frames: [
      frame(1, { image_alt: "  שער  ", caption: " מבצע ", cta_url: "", focal: [0.2, 0.8] }),
      frame(2, { caption: "", cta_url: "https://pizza.example/b", focal: null }),
    ] }));
    expect(r.frames).toEqual([
      { image_url: OURS(1), image_alt: "שער", caption: "מבצע", focal: [0.2, 0.8] },
      { image_url: OURS(2), image_alt: "תמונה 2", cta_url: "https://pizza.example/b" },
    ]);
    expect(r.image_url).toBe("https://x.supabase.co/storage/v1/object/public/ads/a.webp");
  });
});

describe("ADS-2א v2 — the advertiser's brand", () => {
  it("logo_url: https (bloc checks it is in its bucket); empty → null; brand_color #RRGGBB upper-case; absent → null", () => {
    const r = out({ action: "advertiser.save", name: "פיצה", logo_url: OURS(9), brand_color: "#dc2626" });
    expect([r.logo_url, r.brand_color]).toEqual([OURS(9), "#DC2626"]);
    const e = out({ action: "advertiser.save", name: "פיצה", logo_url: "", brand_color: "" });
    expect([e.logo_url, e.brand_color]).toEqual([null, null]);
    const a = out({ action: "advertiser.save", name: "פיצה" });
    expect([a.logo_url, a.brand_color]).toEqual([null, null]);
    expect(msg({ action: "advertiser.save", name: "פיצה", logo_url: "http://x.example/l.png" })).toBe("הלוגו: כתובת מלאה שמתחילה ב-https://");
    expect(msg({ action: "advertiser.save", name: "פיצה", brand_color: "red" })).toBe("צבע המותג: צבע בצורה #RRGGBB");
  });
});

describe("settings", () => {
  it("switch, excluded buildings, up to 20 test devices by email (lower-cased)", () => {
    const r = ok({ action: "settings.save", enabled: false, excluded_buildings: [ID], tester_emails: ["Tal@Example.com"] });
    expect(r.success && r.data.action === "settings.save" && r.data.tester_emails).toEqual(["tal@example.com"]);
    expect(msg({ action: "settings.save", tester_emails: Array.from({ length: 21 }, (_, i) => `u${i}@x.co`) })).toBe("עד 20 מכשירי בדיקה");
    expect(msg({ action: "settings.save", tester_emails: ["nope"] })).toBe("אימייל לא תקין");
    expect(ok({ action: "settings.save", testers: [ID] }).success).toBe(false);
  });
});
