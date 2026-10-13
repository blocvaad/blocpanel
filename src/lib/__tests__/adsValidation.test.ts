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

describe("settings", () => {
  it("switch, excluded buildings, up to 20 test devices by email (lower-cased)", () => {
    const r = ok({ action: "settings.save", enabled: false, excluded_buildings: [ID], tester_emails: ["Tal@Example.com"] });
    expect(r.success && r.data.action === "settings.save" && r.data.tester_emails).toEqual(["tal@example.com"]);
    expect(msg({ action: "settings.save", tester_emails: Array.from({ length: 21 }, (_, i) => `u${i}@x.co`) })).toBe("עד 20 מכשירי בדיקה");
    expect(msg({ action: "settings.save", tester_emails: ["nope"] })).toBe("אימייל לא תקין");
    expect(ok({ action: "settings.save", testers: [ID] }).success).toBe(false);
  });
});
