// bloc ADS-2ג1 בפאנל (החלטות 400–405): שני מקומות חדשים וכפתור לכל מודעה.
//   • המסכים: חמישה (SCREENS) עם שם ו"ב…" לכל אחד; SCREEN_SLOTS — בדיוק AD_SCREEN_SLOTS של bloc (נבדק מול העץ של bloc כשהוא כאן);
//     קמפיין חדש — בכל החמישה; ההערכה, הבדיקה והשמירה מקבלים את החמישה.
//   • מודעה מופיעה רק במקום של הפורמט שלה ובמסך שיש בו המקום הזה: כשאף מודעה לא מתאימה לאף מסך — "לא מוצג" (placementIssue, liveNow).
//   • הכפתור: שיחה / וואטסאפ / ניווט עוברים את מה חסר ואת השמירה (tel רק כמו ה-CHECK); utm רק לאתר; עריכה מחזירה את הסוג.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SCREENS, SCREEN_IN, SCREEN_LABEL, SCREEN_NOTE, SCREEN_SLOTS, SCREENS_HINT, liveNow, placementIssue, screenHasSlot, type AdScreen,
} from "../ads";
import { AD_SLOTS } from "../adsFormats";
import { adActionSchema } from "../validation";
import { creativePayloadFor, ctaDraftOf, emptyCreativeForm, finalLink, formFromCreative, formIssues, newCampaignForm, withCta, type CreativeForm } from "../adsStudio";
import { contentChecks } from "../adsWizard";
import { emptyCtaDraft } from "../adsCta";

const BLOC = process.env.BLOC_ROOT ?? "/home/claude/hood-ads2";
const blocFile = (p: string) => (existsSync(join(BLOC, p)) ? readFileSync(join(BLOC, p), "utf8") : null);
const OURS = "https://abc.supabase.co/storage/v1/object/public/ads/creatives/2026-11/a.webp";
const C1 = "11111111-1111-4111-8111-111111111111";
const K1 = "33333333-3333-4333-8333-333333333333";
const TODAY = "2026-11-17";
const FORM = (o: Partial<CreativeForm> = {}): CreativeForm => ({
  ...emptyCreativeForm((i) => `k${i}`), image: { image_url: OURS, image_alt: "פיצה משפחתית", focal: [0.5, 0.5] }, headline: "פיצה ב-49", cta_label: "להזמנה", cta_url: "https://pizza.example", ...o,
});

describe("the places (decision 400)", () => {
  it("five screens, each with its name and its \"in …\"", () => {
    expect(SCREENS).toEqual(["home", "market", "events", "inbox", "announcements"]);
    expect(SCREENS.map((s) => SCREEN_LABEL[s])).toEqual(["מסך הבית", "הלוח הקהילתי", "לוח האירועים", "דואר נכנס", "הודעות הוועד"]);
    expect(SCREENS.map((s) => SCREEN_IN[s])).toEqual(["במסך הבית", "בלוח הקהילתי", "בלוח האירועים", "בדואר הנכנס", "בהודעות הוועד"]);
    expect(Object.keys(SCREEN_NOTE).sort()).toEqual(["announcements", "inbox"]);
    expect(SCREENS_HINT).toContain("בדואר הנכנס — פס, או כרטיס בין ההתראות");
    expect(SCREENS_HINT).toContain("בהודעות הוועד — רק כרטיס בין ההודעות");
  });
  it("SCREEN_SLOTS — exactly bloc's AD_SCREEN_SLOTS (when bloc's tree is here); every pair", () => {
    expect(SCREEN_SLOTS).toEqual({ home: ["full", "banner", "inline"], market: ["full", "banner", "inline"], events: ["full", "banner", "inline"], inbox: ["banner", "inline"], announcements: ["inline"] });
    const lib = blocFile("src/lib/ads.ts");
    if (lib) expect(lib).toContain("home: AD_SLOTS, market: AD_SLOTS, events: AD_SLOTS, inbox: ['banner', 'inline'], announcements: ['inline'],");
    for (const s of SCREENS) for (const slot of AD_SLOTS) expect([s, slot, screenHasSlot(s, slot)]).toEqual([s, slot, SCREEN_SLOTS[s].includes(slot)]);
  });
  it("a new campaign — all five; the save takes the five and refuses another", () => {
    expect(newCampaignForm(TODAY).screens).toEqual(SCREENS);
    const campaign = (screens: string[]) => adActionSchema.safeParse({
      action: "campaign.save", contract_id: K1, name: "חורף", starts_on: TODAY, ends_on: "2026-12-16", days: [0, 1, 2, 3, 4, 5, 6], hour_from: 8, hour_to: 22,
      screens, goal_views: null, daily_cap: null, per_user_cap: 3, plans: ["free"], roles: ["tenant"], cities: [], building_ids: [], weight: 1,
    });
    expect(campaign([...SCREENS]).success).toBe(true);
    expect(campaign(["announcements"]).success).toBe(true);
    expect(campaign(["inbox", "lobby"]).success).toBe(false);
  });
});

describe("an ad shows only where its format has a place (placementIssue)", () => {
  it("no format fits any chosen screen — said, with the screens' notes; one fits — nothing", () => {
    expect(placementIssue(["announcements"], ["banner", "card"])).toContain("בהודעות הוועד: רק כרטיס בין ההודעות");
    expect(placementIssue(["announcements"], ["banner", "card"])).toContain("לא מוצג לאף אחד");
    expect(placementIssue(["inbox"], ["card", "story"])).toContain("בדואר הנכנס: פס, או כרטיס בין ההתראות");
    expect(placementIssue(["inbox", "announcements"], ["fullscreen"])).toMatch(/בדואר הנכנס.*בהודעות הוועד/);
    expect(placementIssue(["announcements"], ["native"])).toBeNull();
    expect(placementIssue(["inbox"], ["banner"])).toBeNull();
    expect(placementIssue(["announcements", "home"], ["card"])).toBeNull();
    expect(placementIssue([], ["card"])).toBeNull();
    expect(placementIssue(["inbox"], [])).toBeNull();
  });
  it("liveNow says it before the day and the hour", () => {
    const base = { days: [0, 1, 2, 3, 4, 5, 6], hour_from: 0, hour_to: 24, creatives_active: 1, creatives_ready: 1, creatives_ended: 0 };
    expect(liveNow({ ...base, screens: ["announcements"] as AdScreen[], placements: ["banner"] })).toMatchObject({ live: false });
    expect(liveNow({ ...base, screens: ["announcements"] as AdScreen[], placements: ["banner"] }).reason).toContain("בהודעות הוועד");
    expect(liveNow({ ...base, screens: ["announcements"] as AdScreen[], placements: ["carousel"] })).toEqual({ live: true, reason: null });
    expect(liveNow(base)).toEqual({ live: true, reason: null });   // an older row without screens / placements — as before
  });
});

describe("the button per ad (decisions 402, 404)", () => {
  it("contentChecks / formIssues per kind: a call with a valid number is ready; a bad one — its own sentence", () => {
    const call = withCta(FORM(), { ...emptyCtaDraft("call"), phone: "050-1234567" });
    expect(call.cta_url).toBe("tel:+972501234567");
    expect(contentChecks(call, TODAY)).toEqual([]);
    expect(formIssues("card", call, null)).toEqual([]);
    const bad = withCta(FORM(), { ...emptyCtaDraft("call"), phone: "050-12" });
    expect(bad.cta_url).toBe("");
    // review row 2: how many digits are missing (not only "not valid")
    expect(contentChecks(bad, TODAY).map((c) => [c.field, c.text])).toEqual([["cta_url", "חסרות 5 ספרות במספר הטלפון"]]);
    expect(formIssues("card", bad, null)[0]).toBe("חסרות 5 ספרות במספר הטלפון.");
    const short = withCta(FORM(), { ...emptyCtaDraft("call"), phone: "050-123-456" });
    expect([short.cta_url, contentChecks(short, TODAY).map((c) => c.text)]).toEqual(["", ["חסרה ספרה במספר הטלפון"]]);
    // a website keeps its sentences (the old tests stand)
    expect(contentChecks(FORM({ cta_url: "" }), TODAY).map((c) => c.text)).toEqual(["חסר הקישור של הכפתור"]);
    expect(formIssues("card", FORM({ cta_url: "http://x" }), null)).toEqual(["חסר קישור מלא שמתחיל ב-https://."]);
  });
  it("the save: tel:+972… and tel:*NNNN pass as the button; a local number does not; the payload sends the address as is", () => {
    const save = (cta_url: string) => adActionSchema.safeParse({
      action: "creative.save", campaign_id: C1, image_url: OURS, image_alt: "פיצה", headline: "פיצה ב-49", body: null, cta_label: "התקשרו עכשיו", cta_url,
      coupon_code: null, offer_ends_on: null,
    });
    for (const ok of ["tel:+972501234567", "tel:*2700", "tel:1700123456", "https://wa.me/972501234567?text=%D7%94", "https://waze.com/ul?q=x&navigate=yes"]) expect([ok, save(ok).success]).toEqual([ok, true]);
    // review rows 2 and 7: a missing / an extra digit, 1-800 after +972, and "Https://" — refused here as the CHECK refuses them
    for (const bad of ["tel:0501234567", "tel:+972 50 1234567", "sms:+972501234567", "javascript:alert(1)", "tel:+97250123456", "tel:+9725012345678",
      "tel:+9721800123456", "Https://cafe.example"]) {
      const r = save(bad);
      expect([bad, r.success]).toEqual([bad, false]);
      if (!r.success) expect(r.error.issues[0].message).toContain("או מספר טלפון ישראלי");
    }
    const call = withCta(FORM(), { ...emptyCtaDraft("call"), phone: "*2700" });
    expect(creativePayloadFor("card", call, C1)).toMatchObject({ cta_label: "להזמנה", cta_url: "tel:*2700" });
  });
  it("utm only on a website (as bloc's ctaHref): WhatsApp / navigation / a call — no final link with tags", () => {
    expect(finalLink("https://cafe.example/menu", C1)?.href).toContain("utm_source=bloc");
    expect(finalLink("https://wa.me/972501234567", C1)).toBeNull();
    expect(finalLink("https://waze.com/ul?q=x&navigate=yes", C1)).toBeNull();
    expect(finalLink("tel:+972501234567", C1)).toBeNull();
  });
  it("edit / duplicate: the saved address comes back as its kind, with what was typed", () => {
    const row = { format: "card" as const, image_url: OURS, image_alt: "א", focal_x: 0.5, focal_y: 0.5, frames: null, headline: "h", body: null, cta_label: "שלחו הודעה",
      cta_url: "https://wa.me/972501234567?text=%D7%94%D7%99%D7%99", theme: "light" as const, accent: null, banner_position: null };
    const f = formFromCreative(row, (i) => `k${i}`);
    expect(ctaDraftOf(f)).toMatchObject({ kind: "whatsapp", waPhone: "050-123-4567", waText: "היי" });
    expect(ctaDraftOf({ cta_url: "tel:*2700" })).toMatchObject({ kind: "call", phone: "*2700" });   // a form without a draft — from the address
  });
});
