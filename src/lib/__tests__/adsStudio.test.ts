// ADS-2א v2 (החלטה 383) — lib/adsStudio: הלוגיקה של "סטודיו הפרסום", טהורה. מסך הבית (לשוניות, טווח, מדדים — נכשל ≠ 0, קצב, קו
// קטן, דמות), האשף (שם מוצע, תזמון מוכן, ימים ושעות, קצב, הבקשות, שלב הטיוטה, מה חוסם שמירה), סטודיו המודעה (טופס אחד לכמה פורמטים,
// מה חסר לכל פורמט, creative.save לכל פורמט, הקישור הסופי עם utm, ריצת "צור בכל פורמט"), רשימת הבדיקה, "הכי טובה", ומד הקהל.
import { describe, it, expect } from "vitest";
import {
  tabOf, STUDIO_TABS, RANGES, RANGE_LABEL, rangeStart, studioKpis, daysBetween, whenText, paceView, sparkValues, sparkPath, avatarOf, tabCounts,
  filterCampaigns, suggestedName, TEMPLATES, SCHEDULE_PRESETS, applyPreset, presetOn, setHours, servingDays, pacingHint, campaignPayload,
  newCampaignForm, formFromCampaign, formProblem, wizardStep, WIZARD_STEPS, CAMPAIGN_TABS, campaignTabOf, emptyCreativeForm, emptyImage, imageFor,
  accentIssue, ACCENT_LOW_TEXT, longAdvertiserName, longAdvertiserText, ADVERTISER_NAME_SHOWN,
  formFromCreative, formIssues, creativePayloadFor, UTM_PARAMS, finalLink, batchStart, batchNext, batchDone, batchStopped, reviewChecklist,
  BEST_MIN_VIEWS, bestAd, byFormat, parseEstimate, estimateAnswer, estimateBody, reachText, ESTIMATE_FAILED_TEXT, ESTIMATE_SQL_MISSING_TEXT,
  runBatch, createAutosave, type SaveState,
  type StudioCampaignLike, type CreativeForm, type BatchItem,
} from "../adsStudio";
import { fmtCtr, ilMidnightMs } from "../ads";
import type { FrameDraft } from "../adsFormats";

const TODAY = "2026-11-15";   // a Sunday
const BASE = "https://abc.supabase.co/storage/v1/object/public/ads/";
const OURS = (n: number) => `${BASE}creatives/2026-11/${n}.webp`;
const FOREIGN = "https://cdn.example.com/x.jpg";
const camp = (o: Partial<StudioCampaignLike> = {}): StudioCampaignLike => ({
  id: "a", name: "פיצה סתיו", advertiser: "פיצה השכונה", advertiser_id: "adv1", phase: "running", phase_label: "פעיל", tone: "ok",
  status: "active", starts_on: "2026-11-01", ends_on: "2026-11-30", goal_views: null, views: 0, clicks: 0, today_views: 0, today_clicks: 0,
  placements: ["card"], advertiser_logo: null, advertiser_color: null, ...o,
});

describe("the home: status tabs, the range", () => {
  it("each phase → its tab (a blocked contract sits with the paused: it is not running; the goal reached — ended)", () => {
    expect(["running", "scheduled", "draft", "paused", "blocked", "ended", "goal"].map((p) => tabOf(p as any)))
      .toEqual(["running", "scheduled", "draft", "paused", "paused", "ended", "ended"]);
    expect(STUDIO_TABS.map((t) => t.label)).toEqual(["פעילים", "מתוזמנים", "טיוטות", "מושהים", "הסתיימו", "הכל"]);
  });
  it("counts per tab and the filter: tab, advertiser, search (name or advertiser, any case)", () => {
    const list = ["running", "scheduled", "draft", "paused", "blocked", "ended", "goal"].map((p, i) => camp({ id: `c${i}`, phase: p as any, name: `Camp ${i}`, advertiser_id: i % 2 ? "adv2" : "adv1", advertiser: i % 2 ? "Falafel" : "פיצה" }));
    expect(tabCounts(list)).toEqual({ running: 1, scheduled: 1, draft: 1, paused: 2, ended: 2, all: 7 });
    expect(filterCampaigns(list, { tab: "paused", q: "", advertiser: "" }).map((c) => c.id)).toEqual(["c3", "c4"]);
    expect(filterCampaigns(list, { tab: "all", q: "", advertiser: "adv2" }).map((c) => c.id)).toEqual(["c1", "c3", "c5"]);
    expect(filterCampaigns(list, { tab: "all", q: "  camp 6 ", advertiser: "" }).map((c) => c.id)).toEqual(["c6"]);
    expect(filterCampaigns(list, { tab: "all", q: "falafel", advertiser: "" }).map((c) => c.id)).toEqual(["c1", "c3", "c5"]);
    expect(filterCampaigns(list, { tab: "ended", q: "", advertiser: "adv2" }).map((c) => c.id)).toEqual(["c5"]);
  });
  it("the range: today / the last 7 / the last 30 days, inclusive", () => {
    expect([...RANGES]).toEqual(["today", "7d", "30d"]);
    expect(RANGE_LABEL).toEqual({ today: "היום", "7d": "7 ימים", "30d": "30 יום" });
    expect([rangeStart("today", TODAY), rangeStart("7d", TODAY), rangeStart("30d", TODAY)]).toEqual(["2026-11-15", "2026-11-09", "2026-10-17"]);
  });
});

describe("the home's KPIs — a failed read is \"—\", never 0", () => {
  const A = camp({ id: "A", today_views: 10, today_clicks: 1 });
  const B = camp({ id: "B", phase: "paused", today_views: 5 });
  const C = camp({ id: "C", phase: "draft" });
  const daily = {
    A: { days: [{ day: "2026-11-15", views: 100, clicks: 10 }, { day: "2026-11-09", views: 50, clicks: 5 }, { day: "2026-11-08", views: 999, clicks: 1 }], reach: 80 },
    B: { days: [{ day: "2026-10-20", views: 30, clicks: 3 }], reach: 20 },
  };
  it("today: from ad_totals (always exact); active = running campaigns; reach = the sum per campaign", () => {
    expect(studioKpis([A, B, C], daily, "today", TODAY)).toEqual({ views: 15, clicks: 1, ctr: fmtCtr(15, 1), active: 1, reach: 100, partial: false });
  });
  it("7 / 30 days: the days of each campaign inside the range", () => {
    expect(studioKpis([A, B, C], daily, "7d", TODAY)).toEqual({ views: 150, clicks: 15, ctr: fmtCtr(150, 15), active: 1, reach: 100, partial: false });
    expect(studioKpis([A, B, C], daily, "30d", TODAY)).toMatchObject({ views: 1179, clicks: 19 });
  });
  it("one campaign's days failed — partial (said on the screen); all failed — \"—\" (null), not zeros; none loaded at all — 0 reach", () => {
    expect(studioKpis([A, B], { A: daily.A, B: null }, "7d", TODAY)).toEqual({ views: 150, clicks: 15, ctr: fmtCtr(150, 15), active: 1, reach: 80, partial: true });
    expect(studioKpis([A], { A: null }, "7d", TODAY)).toEqual({ views: null, clicks: null, ctr: "—", active: 1, reach: null, partial: true });
    expect(studioKpis([A], { A: null }, "today", TODAY)).toEqual({ views: 10, clicks: 1, ctr: fmtCtr(10, 1), active: 1, reach: null, partial: true });
    expect(studioKpis([C], {}, "30d", TODAY)).toEqual({ views: 0, clicks: 0, ctr: fmtCtr(0, 0), active: 0, reach: 0, partial: false });
  });
});

describe("a campaign card: when, pace, the 7-day line, the avatar", () => {
  it("days between two date keys (across months and DST)", () => {
    expect([daysBetween("2026-11-15", "2026-11-20"), daysBetween("2026-10-20", "2026-11-02"), daysBetween("2026-11-15", "2026-11-15"), daysBetween("2026-11-20", "2026-11-15")]).toEqual([5, 13, 0, -5]);
  });
  it("\"מסתיים בעוד N ימים\" / today / tomorrow; scheduled — when it starts; ended — when it ended; a draft — nothing", () => {
    const w = (o: Partial<StudioCampaignLike>) => whenText({ ...camp(), ...o }, TODAY);
    expect([w({ ends_on: "2026-11-20" }), w({ ends_on: "2026-11-16" }), w({ ends_on: "2026-11-15" })]).toEqual(["מסתיים בעוד 5 ימים", "מסתיים מחר", "מסתיים היום"]);
    expect(w({ phase: "paused", ends_on: "2026-11-25" })).toBe("מסתיים בעוד 10 ימים");
    expect([w({ phase: "scheduled", starts_on: "2026-11-16" }), w({ phase: "scheduled", starts_on: "2026-11-18" })]).toEqual(["מתחיל מחר", "מתחיל בעוד 3 ימים"]);
    expect([w({ phase: "ended", ends_on: "2026-11-02" }), w({ phase: "goal", ends_on: "2026-12-31" })]).toEqual(["הסתיים ב-2.11", "הסתיים ב-31.12"]);
    expect(w({ phase: "draft" })).toBeNull();
  });
  it("pace against the goal (ad_next's formula): behind / on track / ahead, the % done and the % expected; no goal — none", () => {
    const now = ilMidnightMs("2026-11-16");   // half of 1.11–30.11
    const c = { status: "active" as const, starts_on: "2026-11-01", ends_on: "2026-11-30", goal_views: 1000 };
    expect(paceView({ ...c, views: 400 }, now)).toEqual({ state: "behind", label: "מאחור", pct: 40, expectedPct: 50 });
    expect(paceView({ ...c, views: 500 }, now)).toEqual({ state: "on_track", label: "בקצב", pct: 50, expectedPct: 50 });
    expect(paceView({ ...c, views: 600 }, now)).toEqual({ state: "ahead", label: "לפני הקצב", pct: 60, expectedPct: 50 });
    expect(paceView({ ...c, views: 5000 }, now)?.pct).toBe(100);
    expect(paceView({ ...c, goal_views: null, views: 10 }, now)).toBeNull();
  });
  it("the last 7 days, oldest first, a missing day = 0; not read — null", () => {
    expect(sparkValues({ days: [{ day: "2026-11-15", views: 5, clicks: 0 }, { day: "2026-11-10", views: 2, clicks: 0 }, { day: "2026-11-01", views: 9, clicks: 0 }], reach: 0 }, TODAY)).toEqual([0, 2, 0, 0, 0, 0, 5]);
    expect(sparkValues(null, TODAY)).toBeNull();
    expect(sparkValues(undefined, TODAY)).toBeNull();
  });
  it("the line: time right to left (the oldest at the right), the highest at the top; all zero — flat at the bottom", () => {
    expect(sparkPath([0, 5, 10], 100, 20)).toBe("M100,20 L50,10 L0,0");
    expect(sparkPath([0, 0], 100, 20)).toBe("M100,20 L0,20");
    expect(sparkPath([3], 100, 20)).toBe("M100,0");
    expect(sparkPath([], 100, 20)).toBe("");
  });
  it("the avatar: the logo if any, else the initial on the brand color (or a fixed color by the name)", () => {
    expect(avatarOf("פיצה", null, "#dc2626")).toEqual({ logo: null, initial: "פ", color: "#dc2626" });
    expect(avatarOf("abc", OURS(1), null)).toMatchObject({ logo: OURS(1), initial: "A" });
    const x = avatarOf("Falafel", null, "red");
    expect(x.color).toMatch(/^#[0-9A-F]{6}$/);
    expect(avatarOf("Falafel", null, null).color).toBe(x.color);
    expect(avatarOf("  ", null, null).initial).toBe("?");
  });
});

describe("the wizard: name, schedule, days and hours, the request", () => {
  const f = newCampaignForm(TODAY, "k1", "פיצה");
  it("a new campaign: today to +29, every day 08–22, all screens, the trial and Core plans, tenants and committee, 3 per person, weight 1", () => {
    expect(f).toEqual({
      name: "פיצה", contract_id: "k1", starts_on: TODAY, ends_on: "2026-12-14", days: [0, 1, 2, 3, 4, 5, 6], hour_from: 8, hour_to: 22,
      screens: ["home", "market", "events"], plans: ["free", "building"], roles: ["tenant", "committee"], cities: [], building_ids: [],
      goal: "", daily: "", per_user: 3, weight: 1,
    });
    expect([...WIZARD_STEPS]).toEqual(["מפרסם", "מודעות", "קהל", "תזמון ויעד", "סקירה ופרסום"]);
  });
  it("the suggested name: \"<advertiser> · <month year>\" (a blank advertiser — \"קמפיין\")", () => {
    expect(suggestedName("פיצה השכונה", TODAY)).toBe("פיצה השכונה · נובמבר 2026");
    expect(suggestedName("  ", "2027-01-03")).toBe("קמפיין · ינואר 2027");
  });
  it("presets: all day = 00–24, evening = 17–22, weekend = Friday + Saturday; which one is on", () => {
    const [allday, evening, weekend] = SCHEDULE_PRESETS;
    expect(SCHEDULE_PRESETS.map((p) => p.label)).toEqual(["כל היום", "ערב", "סופ״ש"]);
    expect(applyPreset(f, evening)).toMatchObject({ hour_from: 17, hour_to: 22, days: f.days });
    expect(applyPreset(f, allday)).toMatchObject({ hour_from: 0, hour_to: 24 });
    expect(applyPreset(f, weekend)).toMatchObject({ days: [5, 6], hour_from: 8, hour_to: 22 });
    expect([presetOn(f, allday), presetOn(f, evening), presetOn(f, weekend)]).toEqual([false, false, false]);
    expect(presetOn({ ...f, days: [6, 5] }, weekend)).toBe(true);
    expect(presetOn({ ...f, hour_from: 17, hour_to: 22 }, evening)).toBe(true);
  });
  it("ONE hour range from the slider: always from < to inside 0..24 (the DB's hour_from / hour_to)", () => {
    expect(setHours(8, 22)).toEqual({ hour_from: 8, hour_to: 22 });
    expect(setHours(5, 3)).toEqual({ hour_from: 5, hour_to: 6 });
    expect(setHours(23, 23)).toEqual({ hour_from: 23, hour_to: 24 });
    expect(setHours(-3, 30)).toEqual({ hour_from: 0, hour_to: 24 });
    expect(setHours(23.6, 24)).toEqual({ hour_from: 23, hour_to: 24 });
    expect(setHours(24, 24)).toEqual({ hour_from: 23, hour_to: 24 });
  });
  it("serving days in the period by the chosen weekdays; the pacing hint", () => {
    expect(servingDays("2026-11-15", "2026-11-21", [5, 6])).toBe(2);
    expect(servingDays("2026-11-15", "2026-11-21", [0, 1, 2, 3, 4, 5, 6])).toBe(7);
    expect(servingDays("2026-11-21", "2026-11-15", [6])).toBe(0);
    expect(servingDays("", "2026-11-15", [6])).toBe(0);
    expect(pacingHint({ goal: "10,000", starts_on: TODAY, ends_on: "2026-12-14", days: [0, 1, 2, 3, 4, 5, 6] }))
      .toBe("יעד של 10,000 חשיפות ב-30 ימי הצגה — כ-334 ביום. הקמפיין מתפרס באופן אחיד עד הסוף.");
    expect(pacingHint({ goal: "", starts_on: TODAY, ends_on: "2026-12-14", days: [0] })).toBeNull();
    expect(pacingHint({ goal: "abc", starts_on: TODAY, ends_on: "2026-12-14", days: [0] })).toBeNull();
    expect(pacingHint({ goal: "100", starts_on: TODAY, ends_on: "2026-12-14", days: [] })).toBeNull();
  });
  it("campaign.save (C3 — no format): numbers from the text fields (empty → null); the id only when editing", () => {
    const p = campaignPayload(null, { ...f, name: "  פיצה ", goal: "1,000", daily: " 50 " });
    expect(p).toEqual({
      action: "campaign.save", contract_id: "k1", name: "פיצה", starts_on: TODAY, ends_on: "2026-12-14", days: f.days, hour_from: 8, hour_to: 22,
      screens: f.screens, plans: f.plans, roles: f.roles, cities: [], building_ids: [], goal_views: 1000, daily_cap: 50, per_user_cap: 3, weight: 1,
    });
    expect(campaignPayload("c1", f)).toMatchObject({ id: "c1", goal_views: null, daily_cap: null });
    expect(p).not.toHaveProperty("format");
  });
  it("a campaign row → the form and back (a round trip changes nothing)", () => {
    const row = { name: "פ", contract_id: "k1", starts_on: TODAY, ends_on: "2026-11-30", days: [5, 6], hour_from: 17, hour_to: 22, screens: ["home" as const], plans: ["free" as const], roles: ["tenant" as const], cities: ["חיפה"], building_ids: [], goal_views: 500, daily_cap: null, per_user_cap: 2, weight: 4 };
    const g = formFromCampaign(row);
    expect(g).toMatchObject({ goal: "500", daily: "", per_user: 2, weight: 4, days: [5, 6] });
    expect(campaignPayload("x", g)).toMatchObject({ goal_views: 500, daily_cap: null, per_user_cap: 2, weight: 4, cities: ["חיפה"] });
    g.days.push(0);
    expect(row.days).toEqual([5, 6]);   // copied, not shared
  });
  it("what blocks a save (one sentence; the same rules as the schema, so a doomed save is never sent)", () => {
    expect(formProblem(f)).toBeNull();
    expect(formProblem({ ...f, name: " א " })).toBe("חסר שם לקמפיין (לפחות 2 תווים).");
    expect(formProblem({ ...f, contract_id: "" })).toBe("לא נבחר חוזה.");
    expect(formProblem({ ...f, ends_on: "" })).toBe("חסרים תאריכים.");
    expect(formProblem({ ...f, ends_on: "2026-11-01" })).toBe("תאריך הסיום לפני תאריך ההתחלה.");
    expect(formProblem({ ...f, days: [] })).toBe("בחרו לפחות יום אחד.");
    expect(formProblem({ ...f, hour_from: 10, hour_to: 10 })).toBe("שעת הסיום צריכה להיות אחרי שעת ההתחלה.");
    for (const goal of ["0", "1.5", "-3", "abc", "1234567890"]) expect(formProblem({ ...f, goal }), goal).toBe("יעד החשיפות — מספר שלם חיובי (או ריק).");
    expect(formProblem({ ...f, goal: "1,000" })).toBeNull();
    expect(formProblem({ ...f, daily: "0" })).toBe("התקרה ליום — מספר שלם חיובי (או ריק).");
  });
  it("which step a draft opens at: ?step=N when valid; no ads — \"מודעות\"; ads — \"סקירה ופרסום\"; a new campaign — 1", () => {
    expect(wizardStep(false, 0, "3")).toBe(1);
    expect([wizardStep(true, 0, null), wizardStep(true, 2, null), wizardStep(true, 2, "3"), wizardStep(true, 0, "9"), wizardStep(true, 0, "2.5"), wizardStep(true, 1, "1")]).toEqual([2, 5, 3, 2, 2, 1]);
  });
  it("the campaign page's tabs (?tab=): five; anything else — performance", () => {
    expect(CAMPAIGN_TABS.map((t) => t.key)).toEqual(["performance", "ads", "audience", "why", "history"]);
    expect([campaignTabOf("ads"), campaignTabOf("x"), campaignTabOf(null), campaignTabOf(["ads"])]).toEqual(["ads", "performance", "performance", "performance"]);
  });
});

describe("the creative studio: one form, an ad per format", () => {
  const key = (i: number) => `k${i}`;
  const fr = (i: number, o: Partial<FrameDraft> = {}): FrameDraft => ({ key: `f${i}`, image_url: OURS(i), image_alt: `תמונה ${i}`, caption: "", cta_url: "", focal: [0.5, 0.5], ...o });
  const form = (o: Partial<CreativeForm> = {}): CreativeForm => ({
    ...emptyCreativeForm(key), image: { image_url: OURS(1), image_alt: "פיצה", focal: [0.3, 0.7] }, headline: " פיצה ב-49 ", body: " משפח ", cta_label: "להזמנה", cta_url: " https://pizza.example ", ...o,
  });
  it("an empty form: a card, the brand color as the default accent, two empty frames, the bottom for a banner", () => {
    const e = emptyCreativeForm(key, "#DC2626");
    expect(e).toMatchObject({ formats: ["card"], accent: "#DC2626", cta_label: "לפרטים", theme: "light", banner_position: "bottom", overrides: {} });
    expect(e.image).toEqual(emptyImage());
    expect(e.frames.map((x) => x.key)).toEqual(["k0", "k1"]);
    expect(emptyCreativeForm(key).accent).toBeNull();
    // a brand whose text cannot be read (review #9) starts as its nearest shade that passes — never an accent bloc refuses
    expect(emptyCreativeForm(key, "#2E8B57").accent).toBe("#2C8554");
    expect(emptyCreativeForm(key, "bad").accent).toBeNull();
  });
  it("review #9 — an accent under 4.5:1 with both texts is an issue (said once, for every format); none / a readable one — none", () => {
    expect(accentIssue("#777777")).toBe(ACCENT_LOW_TEXT);
    expect(ACCENT_LOW_TEXT).toContain("4.5:1");
    expect(ACCENT_LOW_TEXT).toContain("bloc לא שומר");
    for (const a of [null, "#DC2626", "#757575", "#FACC15", "red"]) expect(accentIssue(a), String(a)).toBeNull();
  });
  it("review #12 — a name over 30 characters is cut in the banner: said gently, with the count", () => {
    expect(ADVERTISER_NAME_SHOWN).toBe(30);
    expect(longAdvertiserName("א".repeat(30))).toBe(false);
    expect(longAdvertiserName(` ${"א".repeat(30)} `)).toBe(false);   // trimmed
    expect(longAdvertiserName("א".repeat(31))).toBe(true);
    const t = longAdvertiserText("סטודיו היוגה והפילאטיס של השכונה הירוקה");
    expect(t.startsWith("שם ארוך ייחתך בפס")).toBe(true);
    expect(t).toContain("(כאן 39)");
  });
  it("one image for all, or one per format (an override wins for its format only)", () => {
    const f = form({ overrides: { dialog: { image_url: OURS(5), image_alt: "רחבה", focal: [0.5, 0.2] } } });
    expect(imageFor(f, "dialog").image_url).toBe(OURS(5));
    expect(imageFor(f, "card").image_url).toBe(OURS(1));
  });
  it("templates prefill the texts: \"מבצע\", \"אירוע\", \"שירות חדש\", \"הטבה לדיירים\" (within the limits)", () => {
    expect(TEMPLATES.map((t) => t.label)).toEqual(["מבצע", "אירוע", "שירות חדש", "הטבה לדיירים"]);
    for (const t of TEMPLATES) {
      expect(t.headline.length, t.key).toBeLessThanOrEqual(60);
      expect(t.body.length, t.key).toBeLessThanOrEqual(180);
      expect(t.cta_label.length, t.key).toBeLessThanOrEqual(24);
    }
  });
  it("what each format still needs, in sentences (empty = ready)", () => {
    const empty = emptyCreativeForm(key);
    expect(formIssues("card", empty, BASE)).toEqual(["חסרה תמונה.", "חסר תיאור של התמונה (לקורא מסך).", "חסרה כותרת.", "חסר קישור מלא שמתחיל ב-https://."]);
    expect(formIssues("card", form(), BASE)).toEqual([]);
    expect(formIssues("card", form({ image: { image_url: FOREIGN, image_alt: "פיצה", focal: [0.5, 0.5] } }), BASE)).toEqual(["התמונה מאתר אחר — מעלים אותה בכפתור ההעלאה."]);
    expect(formIssues("card", form({ image: { image_url: FOREIGN, image_alt: "פיצה", focal: [0.5, 0.5] } }), null)).toEqual([]);
    expect(formIssues("story", form(), BASE)).toEqual(["כל תמונה צריכה תמונה שהועלתה ותיאור (2 עד 200 תווים)."]);
    expect(formIssues("dialog", form({ cta_label: "א", cta_url: "http://x" }), BASE)).toEqual(["חסר טקסט לכפתור.", "חסר קישור מלא שמתחיל ב-https://."]);
  });
  it("frames are shared by story and carousel: a card's own link is ignored for the story (not sent), checked for the carousel", () => {
    const f = form({ formats: ["story", "carousel"], frames: [fr(1), fr(2, { cta_url: "http://bad" })] });
    expect(formIssues("story", f, BASE)).toEqual([]);
    expect(formIssues("carousel", f, BASE)).toEqual(["כל כרטיס צריך תמונה שהועלתה ותיאור (2 עד 200 תווים); קישור לכרטיס — כתובת מלאה שמתחילה ב-https://."]);
    expect(formIssues("carousel", form({ frames: [fr(1), fr(2, { cta_url: "https://x.example/b" })] }), BASE)).toEqual([]);
  });
  it("creative.save per format (C5 v2): format, position only for a banner, focal rounded, theme, accent, frames only for story / carousel; trimmed", () => {
    const f = form({ accent: "#16A34A", theme: "dark", banner_position: "top", frames: [fr(1, { focal: [0.12345, 0.5], caption: " שער " }), fr(2, { cta_url: "https://x.example/b" })] });
    expect(creativePayloadFor("card", f, "c1")).toEqual({
      action: "creative.save", campaign_id: "c1", format: "card", banner_position: null, image_url: OURS(1), image_alt: "פיצה", focal_x: 0.3, focal_y: 0.7,
      headline: "פיצה ב-49", body: "משפח", cta_label: "להזמנה", cta_url: "https://pizza.example", theme: "dark", accent: "#16A34A", frames: null,
      coupon_code: null, offer_ends_on: null,   // ADS-2ב1: always sent (null — none)
    });
    expect(creativePayloadFor("banner", f, "c1")).toMatchObject({ format: "banner", banner_position: "top", frames: null });
    const s = creativePayloadFor("story", f, "c1");
    expect(s).toMatchObject({ format: "story", banner_position: null, image_url: OURS(1), image_alt: "תמונה 1", focal_x: 0.123, focal_y: 0.5 });
    expect(s.frames).toEqual([{ image_url: OURS(1), image_alt: "תמונה 1", caption: "שער", focal: [0.123, 0.5] }, { image_url: OURS(2), image_alt: "תמונה 2" }]);
    expect((creativePayloadFor("carousel", f, "c1").frames as any[])[1]).toEqual({ image_url: OURS(2), image_alt: "תמונה 2", cta_url: "https://x.example/b" });
    expect(creativePayloadFor("dialog", form({ overrides: { dialog: { image_url: OURS(5), image_alt: "רחבה", focal: [0.5, 0.2] } } }), "c1", "cr9"))
      .toMatchObject({ id: "cr9", format: "dialog", image_url: OURS(5), image_alt: "רחבה", focal_x: 0.5, focal_y: 0.2 });
    expect(creativePayloadFor("card", f, "c1")).not.toHaveProperty("id");
  });
  it("an existing creative → the form (edit / duplicate): its format, image + focal, frames (a one-image ad's cover becomes frame 1)", () => {
    const row = { format: "dialog" as const, image_url: OURS(1), image_alt: "א", focal_x: 0.2, focal_y: 0.4, frames: null, headline: "h", body: null, cta_label: "לפרטים", cta_url: "https://x.example", theme: "dark" as const, accent: null, banner_position: null };
    const g = formFromCreative(row, key);
    expect(g).toMatchObject({ formats: ["dialog"], image: { image_url: OURS(1), image_alt: "א", focal: [0.2, 0.4] }, body: "", theme: "dark", accent: null, banner_position: "bottom" });
    expect(g.frames.map((x) => [x.image_url, x.focal])).toEqual([[OURS(1), [0.2, 0.4]], ["", [0.5, 0.5]]]);
    const st = formFromCreative({ ...row, format: "story", frames: [{ image_url: OURS(2), image_alt: "ב", caption: "כ", cta_url: null, focal: null }, { image_url: OURS(3), image_alt: "ג", caption: null, cta_url: null, focal: [0.1, 0.1] }], banner_position: null }, key);
    expect(st.frames.map((x) => x.image_url)).toEqual([OURS(2), OURS(3)]);
    expect(formFromCreative({ ...row, format: "banner", banner_position: "top" }, key).banner_position).toBe("top");
  });
  it("the final link the tenant opens: bloc's utm tags added — unless the link already has utm of its own", () => {
    expect(UTM_PARAMS).toEqual([["utm_source", "bloc"], ["utm_medium", "sponsored"]]);
    expect(finalLink(" https://pizza.example/order?x=1 ")).toEqual({ href: "https://pizza.example/order?x=1&utm_source=bloc&utm_medium=sponsored", own: false });
    // bloc's ctaHref: only utm_source counts as "your own" (case-sensitive, like URLSearchParams.has)
    expect(finalLink("https://pizza.example/?utm_source=fb&x=1")).toEqual({ href: "https://pizza.example/?utm_source=fb&x=1", own: true });
    expect(finalLink("https://pizza.example/?UTM_Campaign=fall")).toEqual({ href: "https://pizza.example/?UTM_Campaign=fall&utm_source=bloc&utm_medium=sponsored", own: false });
    // with the campaign: utm_campaign=c-<first 8 of the id, lower case>, as bloc adds it
    expect(finalLink("https://pizza.example/", "ABCDEF12-3456-4789-8abc-def012345678")).toEqual({ href: "https://pizza.example/?utm_source=bloc&utm_medium=sponsored&utm_campaign=c-abcdef12", own: false });
    expect(finalLink("https://pizza.example/", "not-a-uuid")?.href).toBe("https://pizza.example/?utm_source=bloc&utm_medium=sponsored");
    expect(finalLink("https://pizza.example/?utm_source=x", "abcdef12-3456-4789-8abc-def012345678")?.href).toBe("https://pizza.example/?utm_source=x");
    for (const bad of ["http://pizza.example", "https://pizza example", "", "pizza.example"]) expect(finalLink(bad), bad).toBeNull();
  });
});

describe("\"צור מודעה בכל פורמט שבחרתי\" — one after the other; an unclear answer stops it", () => {
  const set = (items: BatchItem[], i: number, state: BatchItem["state"]) => items.map((x, j) => (j === i ? { ...x, state } : x));
  it("the queue in the gallery's order, all waiting", () => {
    expect(batchStart(["carousel", "card", "dialog"])).toEqual([{ format: "card", state: "waiting" }, { format: "dialog", state: "waiting" }, { format: "carousel", state: "waiting" }]);
    expect(batchStart([])).toEqual([]);
  });
  it("next: the first waiting; a failure does not stop the others (it gets a retry); unclear — stop everything", () => {
    let b = batchStart(["card", "dialog", "story"]);
    expect(batchNext(b)).toBe(0);
    b = set(b, 0, "ok");
    expect(batchNext(b)).toBe(1);
    b = set(b, 1, "failed");
    expect(batchNext(b)).toBe(2);
    expect(batchNext(set(b, 2, "unclear"))).toBeNull();
    expect(batchNext(set(b, 2, "ok"))).toBeNull();
    expect(batchStopped(set(b, 2, "unclear"))).toBe(true);
    expect(batchStopped(b)).toBe(false);
  });
  it("done only when every format succeeded (an empty run is not done)", () => {
    expect(batchDone([{ format: "card", state: "ok" }, { format: "dialog", state: "ok" }])).toBe(true);
    expect(batchDone([{ format: "card", state: "ok" }, { format: "dialog", state: "failed" }])).toBe(false);
    expect(batchDone([])).toBe(false);
  });
});

describe("runBatch — the partial-failure run, one request at a time", () => {
  it("sequential (never two in flight); a failure is marked and the next one still runs; every step reported", async () => {
    let inFlight = 0, maxInFlight = 0;
    const sent: string[] = [];
    const seen: string[] = [];
    const out = await runBatch(batchStart(["card", "dialog", "native"]), async (f) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); sent.push(f);
      await Promise.resolve();
      inFlight--;
      return f === "dialog" ? { ok: false, error: "תמונה מאתר אחר", unclear: false } : { ok: true, id: `id-${f}` };
    }, (items) => seen.push(items.map((x) => `${x.format}:${x.state}`).join(",")));
    expect(maxInFlight).toBe(1);
    expect(sent).toEqual(["card", "dialog", "native"]);
    expect(out).toEqual([{ format: "card", state: "ok", id: "id-card" }, { format: "dialog", state: "failed", error: "תמונה מאתר אחר" }, { format: "native", state: "ok", id: "id-native" }]);
    expect(seen[0]).toBe("card:waiting,dialog:waiting,native:waiting");
    expect(seen[1]).toBe("card:saving,dialog:waiting,native:waiting");
    expect(seen).toContain("card:ok,dialog:saving,native:waiting");
    expect(seen[seen.length - 1]).toBe("card:ok,dialog:failed,native:ok");
  });
  it("an unclear answer stops the run: nothing after it is sent (maybe it was created — refresh first)", async () => {
    const sent: string[] = [];
    const out = await runBatch(batchStart(["card", "dialog", "native"]), async (f) => {
      sent.push(f);
      return f === "dialog" ? { ok: false, error: "ייתכן שבוצע", unclear: true } : { ok: true, id: f };
    }, () => {});
    expect(sent).toEqual(["card", "dialog"]);
    expect(out.map((x) => x.state)).toEqual(["ok", "unclear", "waiting"]);
    expect(batchStopped(out)).toBe(true);
  });
  it("a retry runs only what is waiting again; the successes are never re-sent", async () => {
    const sent: string[] = [];
    const start: BatchItem[] = [{ format: "card", state: "ok", id: "x" }, { format: "dialog", state: "waiting" }, { format: "native", state: "failed", error: "e" }];
    const out = await runBatch(start, async (f) => { sent.push(f); return { ok: true, id: f }; }, () => {});
    expect(sent).toEqual(["dialog"]);
    expect(out.map((x) => x.state)).toEqual(["ok", "ok", "failed"]);
  });
});

describe("createAutosave — the wizard's draft saves itself", () => {
  type F = { name: string };
  const setup = (send: (f: F) => Promise<{ ok: true } | { ok: false; error: string; unclear?: boolean }>, problem: (f: F) => string | null = () => null) => {
    const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
    const states: Array<[SaveState, string | null]> = [];
    const a = createAutosave<F>({ name: "א" }, {
      delay: 900, problem, send, onState: (st, e) => states.push([st, e]),
      setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
      clearTimer: (t) => { (t as { cleared: boolean }).cleared = true; },
    });
    return { a, timers, states, fire: () => { const t = timers.filter((x) => !x.cleared).pop(); t?.fn(); } };
  };
  it("a change waits (debounced 900ms) — another change resets the wait; then ONE save with the latest form: \"שומרים…\" → \"נשמר\"", async () => {
    const sent: F[] = [];
    const { a, timers, states, fire } = setup(async (f) => { sent.push(f); return { ok: true }; });
    a.change({ name: "פי" });
    a.change({ name: "פיצה" });
    expect(timers.map((t) => [t.ms, t.cleared])).toEqual([[900, true], [900, false]]);
    expect(sent).toEqual([]);
    fire();
    await a.flush();
    expect(sent).toEqual([{ name: "פיצה" }]);
    expect(states).toEqual([["saving", null], ["saved", null]]);
  });
  it("nothing changed — nothing sent; flush now (a step change / publish) cancels the wait and saves at once", async () => {
    const sent: F[] = [];
    const { a, timers } = setup(async (f) => { sent.push(f); return { ok: true }; });
    expect(await a.flush()).toBe(true);
    expect(sent).toEqual([]);
    a.change({ name: "ב" });
    expect(await a.flush()).toBe(true);
    expect(timers[0].cleared).toBe(true);
    expect(sent).toEqual([{ name: "ב" }]);
  });
  it("saves never overlap: a change during a save is saved after it, with the newest form", async () => {
    const sent: F[] = [];
    let release!: () => void;
    const { a } = setup((f) => { sent.push(f); return sent.length === 1 ? new Promise((r) => { release = () => r({ ok: true }); }) : Promise.resolve({ ok: true }); });
    a.change({ name: "1" });
    const p1 = a.flush();
    await Promise.resolve();
    a.change({ name: "2" });
    const p2 = a.flush();
    expect(sent).toEqual([{ name: "1" }]);
    release();
    await p1; await p2;
    expect(sent).toEqual([{ name: "1" }, { name: "2" }]);
  });
  it("a form the schema would refuse is not sent: \"לא נשמר — <why>\"", async () => {
    const sent: F[] = [];
    const { a, states } = setup(async (f) => { sent.push(f); return { ok: true }; }, (f) => (f.name.length < 2 ? "חסר שם לקמפיין (לפחות 2 תווים)." : null));
    a.change({ name: "א" });
    expect(await a.flush()).toBe(false);
    expect(sent).toEqual([]);
    expect(states).toEqual([["error", "חסר שם לקמפיין (לפחות 2 תווים)."]]);
  });
  it("a failure keeps the form dirty (\"נסו שוב\" sends it again); an unclear answer says \"maybe saved — refresh\"", async () => {
    let n = 0;
    const { a, states } = setup(async () => (++n === 1 ? { ok: false, error: "שמירת הקמפיין נכשלה. נסו שוב." } : n === 2 ? { ok: false, error: "ייתכן שבוצע", unclear: true } : { ok: true }));
    a.change({ name: "פיצה" });
    expect(await a.flush()).toBe(false);
    expect(states[states.length - 1]).toEqual(["error", "שמירת הקמפיין נכשלה. נסו שוב."]);
    expect(await a.retry()).toBe(false);
    expect(states[states.length - 1]).toEqual(["unclear", "ייתכן שבוצע"]);
    expect(await a.flush()).toBe(true);   // still dirty — sent again
    expect(states[states.length - 1]).toEqual(["saved", null]);
    expect(n).toBe(3);
  });
  it("dispose clears a pending wait", () => {
    const { a, timers } = setup(async () => ({ ok: true }));
    a.change({ name: "פיצה" });
    a.dispose();
    expect(timers[0].cleared).toBe(true);
  });
});

describe("the review checklist — each red item links to its step", () => {
  const form = newCampaignForm(TODAY, "k1", "פיצה");
  const contract = { status: "active", starts_on: "2026-11-01", ends_on: "2026-12-31" };
  const cr = { active: true, ready: true, headline: "פיצה", image_alt: "מגש", cta_label: "להזמנה" };
  const check = (o: Partial<Parameters<typeof reviewChecklist>[0]> = {}) => reviewChecklist({ advertiserId: "adv1", contract, form, creatives: [cr], today: TODAY, ...o });
  it("all green: advertiser, an active contract covering the dates, an active ad with our images, the texts, the audience, the schedule", () => {
    const c = check();
    expect(c.map((x) => [x.key, x.ok, x.step])).toEqual([["advertiser", true, 1], ["contract", true, 1], ["ads", true, 2], ["texts", true, 2], ["audience", true, 3], ["schedule", true, 4]]);
    expect(c[2].text).toBe("מודעה פעילה אחת עם תמונות שהועלו ל-bloc.");
  });
  it("each failure in words", () => {
    const t = (o: Partial<Parameters<typeof reviewChecklist>[0]>, k: string) => check(o).find((x) => x.key === k)!;
    expect(t({ advertiserId: "" }, "advertiser")).toMatchObject({ ok: false, text: "לא נבחר מפרסם." });
    expect(t({ contract: null }, "contract")).toMatchObject({ ok: false, text: "לא נבחר חוזה." });
    expect(t({ contract: { ...contract, status: "draft" } }, "contract").text).toBe("החוזה עדיין לא פעיל — מסמנים אותו כפעיל בדף המפרסם.");
    expect(t({ contract: { ...contract, ends_on: "2026-11-30" } }, "contract").text).toBe("החוזה לא מכסה את כל התאריכים של הקמפיין.");
    expect(t({ creatives: [{ ...cr, ready: false }] }, "ads")).toMatchObject({ ok: false, text: "אין מודעה פעילה עם תמונות שהועלו ל-bloc." });
    expect(t({ creatives: [{ ...cr, active: false }] }, "ads").ok).toBe(false);
    expect(t({ creatives: [cr, { ...cr }] }, "ads").text).toBe("2 מודעות פעילות עם תמונות שהועלו ל-bloc.");
    expect(t({ creatives: [{ ...cr, image_alt: "" }] }, "texts").ok).toBe(false);
    expect(t({ creatives: [cr, { ...cr, active: false, headline: "" }] }, "texts").ok).toBe(true);   // only active ads count
    expect(t({ form: { ...form, roles: [] } }, "audience").ok).toBe(false);
    expect(t({ form: { ...form, ends_on: "2026-11-10", starts_on: "2026-11-01" } }, "schedule").ok).toBe(false);   // already ended
    expect(t({ form: { ...form, days: [] } }, "schedule").ok).toBe(false);
    expect(t({ form: { ...form, hour_from: 22, hour_to: 8 } }, "schedule").ok).toBe(false);
  });
});

describe("the report: \"הכי טובה\" and per format", () => {
  it("the highest CTR — only when at least two are compared and each has ≥500 views; a tie at the top — none", () => {
    expect(BEST_MIN_VIEWS).toBe(500);
    const a = { creative_id: "a", views: 1000, clicks: 50 }, b = { creative_id: "b", views: 600, clicks: 12 };
    expect(bestAd([a, b])).toBe("a");
    expect(bestAd([b, a])).toBe("a");
    expect(bestAd([a])).toBeNull();
    expect(bestAd([a, { ...b, views: 499 }])).toBeNull();
    expect(bestAd([a, { creative_id: "c", views: 2000, clicks: 100 }])).toBeNull();
    expect(bestAd([{ ...a, views: 500, clicks: 5 }, { ...b, views: 500, clicks: 4 }])).toBe("a");
  });
  it("per format: sums per format in the gallery's order; a creative without a known format is left out", () => {
    const rows = [
      { creative_id: "1", serves: 10, views: 8, clicks: 1 }, { creative_id: "2", serves: 5, views: 4, clicks: 2 },
      { creative_id: "3", serves: 3, views: 3, clicks: 0 }, { creative_id: "4", serves: 9, views: 9, clicks: 9 },
    ];
    const fmt: Record<string, any> = { 1: "native", 2: "card", 3: "native" };
    expect(byFormat(rows, (id) => fmt[id])).toEqual([
      { format: "card", ads: 1, serves: 5, views: 4, clicks: 2, copies: 0 },
      { format: "native", ads: 2, serves: 13, views: 11, clicks: 1, copies: 0 },
    ]);
  });
});

describe("the audience gauge (ad_estimate_reach) — numbers only; failure is never 0", () => {
  it("the RPC's answer: whole non-negative numbers; under 10 → 0 with the flag; anything else null", () => {
    expect(parseEstimate({ users: 1240, buildings: 38 })).toEqual({ users: 1240, buildings: 38, under10: false });
    expect(parseEstimate({ users: 6, buildings: 1, under_10: true })).toEqual({ users: 0, buildings: 1, under10: true });
    for (const bad of [null, [], "x", { users: -1, buildings: 1 }, { users: 1.5, buildings: 1 }, { users: 1 }, { users: "1", buildings: "x" }]) expect(parseEstimate(bad), JSON.stringify(bad)).toBeNull();
  });
  it("the route's answer → the gauge: 503 sql_missing — after SQL 230; only ok === true with numbers — the estimate; the rest — failed", () => {
    expect(estimateAnswer(200, { ok: true, users: 1240, buildings: 38, under10: false })).toEqual({ kind: "ok", users: 1240, buildings: 38, under10: false });
    expect(estimateAnswer(200, { ok: true, users: 0, buildings: 2, under10: true })).toEqual({ kind: "ok", users: 0, buildings: 2, under10: true });
    expect(estimateAnswer(503, { code: "sql_missing" })).toEqual({ kind: "sql_missing" });
    for (const [s, b] of [[503, { code: "x" }], [200, { users: 5, buildings: 1 }], [500, null], [200, { ok: true, users: -1, buildings: 1 }], [502, { ok: true, users: 1, buildings: 1 }], [200, []]] as const) {
      expect(estimateAnswer(s, b), `${s} ${JSON.stringify(b)}`).toEqual({ kind: "failed" });
    }
  });
  it("the request: only the audience fields, sorted and deduplicated (the same audience — the same request)", () => {
    expect(estimateBody({ screens: ["market", "home", "home"], plans: ["free"], roles: ["tenant"], cities: ["חיפה", "בת ים"], building_ids: [] }))
      .toEqual({ screens: ["home", "market"], plans: ["free"], roles: ["tenant"], cities: ["בת ים", "חיפה"], building_ids: [] });
  });
  it("the gauge's sentence", () => {
    expect(reachText({ kind: "ok", users: 1240, buildings: 38, under10: false })).toBe("כ-1,240 משתמשים ב-38 בניינים");
    expect(reachText({ kind: "ok", users: 12, buildings: 1, under10: false })).toBe("כ-12 משתמשים ב-1 בניין");
    expect(reachText({ kind: "ok", users: 0, buildings: 1, under10: true })).toBe("פחות מ-10 משתמשים");
    expect(reachText({ kind: "loading" })).toBe("מעריכים…");
    expect(reachText({ kind: "sql_missing" })).toBe(ESTIMATE_SQL_MISSING_TEXT);
    expect(reachText({ kind: "failed" })).toBe(ESTIMATE_FAILED_TEXT);
    expect(reachText({ kind: "idle" })).toBe("");
  });
});
