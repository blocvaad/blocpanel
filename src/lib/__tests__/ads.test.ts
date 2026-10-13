// פרסומות ממומנות (bloc ADS-1): מה הפאנל מציג ומחשב — מצב קמפיין, קצב מול היעד (כמו ad_next), שווי לפי
// החוזה, CTR, הדוח (מספרים מצטברים בלבד) וה-CSV למפרסם, זיהוי תמונה לפי הבייטים, ושגיאות ה-DB בעברית.
import { describe, it, expect } from "vitest";
import {
  campaignPhase, pacing, contractValue, ctrPct, fmtCtr, fmtIls, fmtRange, fmtDays, fmtHours, parseReport, reportCsv,
  reportFileName, sniffImage, adsSqlMissing, adsDbMessage, ilMidnightMs, ADS_SQL_MISSING, DEFAULT_PLANS, PLAN_LABEL,
} from "../ads";
import { can } from "../permissions";
import { NAV_GROUPS } from "../nav";

const camp = (o: Record<string, unknown> = {}) => ({ status: "active", starts_on: "2026-10-01", ends_on: "2026-10-30", goal_views: null, ...o }) as any;
const con = (o: Record<string, unknown> = {}) => ({ status: "active", starts_on: "2026-09-01", ends_on: "2026-12-31", ...o }) as any;

describe("campaignPhase — what the manager sees", () => {
  const today = "2026-10-13";
  it("running, scheduled, ended, paused, draft", () => {
    expect(campaignPhase(camp(), con(), 0, today)).toEqual({ phase: "running", label: "פעיל", tone: "ok" });
    expect(campaignPhase(camp({ starts_on: "2026-10-20" }), con(), 0, today).label).toBe("מתוזמן");
    expect(campaignPhase(camp(), con({ starts_on: "2026-10-15" }), 0, today).label).toBe("מתוזמן");
    expect(campaignPhase(camp({ ends_on: "2026-10-12" }), con(), 0, today).label).toBe("הסתיים");
    expect(campaignPhase(camp({ ends_on: "2026-10-13" }), con(), 0, today).label).toBe("פעיל");
    expect(campaignPhase(camp({ status: "paused" }), con(), 0, today)).toMatchObject({ phase: "paused", tone: "wait" });
    expect(campaignPhase(camp({ status: "draft" }), con(), 0, today)).toMatchObject({ phase: "draft", label: "טיוטה" });
    expect(campaignPhase(camp({ status: "ended" }), con(), 0, today).label).toBe("הסתיים");
  });
  it("the goal reached; a contract that is not active (or over) blocks", () => {
    expect(campaignPhase(camp({ goal_views: 100 }), con(), 100, today)).toMatchObject({ phase: "goal", label: "היעד הושג" });
    expect(campaignPhase(camp({ goal_views: 100 }), con(), 99, today).phase).toBe("running");
    expect(campaignPhase(camp(), con({ status: "draft" }), 0, today)).toMatchObject({ phase: "blocked", label: "החוזה לא פעיל", tone: "danger" });
    expect(campaignPhase(camp(), con({ status: "cancelled" }), 0, today).phase).toBe("blocked");
    expect(campaignPhase(camp(), null, 0, today).phase).toBe("blocked");
    expect(campaignPhase(camp(), con({ ends_on: "2026-10-12" }), 0, today).label).toBe("החוזה הסתיים");
  });
});

describe("pacing — the same even spread as ad_next", () => {
  it("Israel midnight, summer and winter", () => {
    expect(new Date(ilMidnightMs("2026-10-13")).toISOString()).toBe("2026-10-12T21:00:00.000Z");
    expect(new Date(ilMidnightMs("2026-12-01")).toISOString()).toBe("2026-11-30T22:00:00.000Z");
  });
  it("expected so far; behind / on track / ahead", () => {
    // נובמבר — בלי מעבר שעון באמצע (הקצב לפי שעון הקיר, כמו ב-SQL: ביום המעבר יש שעה יותר / פחות)
    const c = camp({ starts_on: "2026-11-01", ends_on: "2026-11-30", goal_views: 3000 });
    const mid = ilMidnightMs("2026-11-16"); // 15 of 30 days
    expect(pacing(c, 1500, mid)).toMatchObject({ expected: 1500, state: "on_track", label: "בקצב" });
    expect(pacing(c, 1000, mid)).toMatchObject({ state: "behind", label: "מפגר אחרי הקצב" });
    expect(pacing(c, 2000, mid)).toMatchObject({ state: "ahead" });
    expect(pacing(c, 0, ilMidnightMs("2026-10-20")).label).toBe("עוד לא התחיל");
    expect(pacing(camp({ goal_views: null }), 10).state).toBe("none");
  });
});

describe("money and rates", () => {
  it("value by the contract's model", () => {
    expect(contractValue("cpm", 50, { views: 12_345, clicks: 10 })).toBe(617.25);
    expect(contractValue("cpc", 2.5, { views: 1000, clicks: 33 })).toBe(82.5);
    expect(contractValue("flat", 4000, { views: 0, clicks: 0 })).toBe(4000);
  });
  it("CTR — none without views", () => {
    expect(ctrPct(1000, 25)).toBe(2.5);
    expect(ctrPct(0, 0)).toBeNull();
    expect(fmtCtr(0, 0)).toBe("—");
    expect(fmtCtr(3, 1)).toMatch(/^33\.3%$/);
  });
  it("formatting", () => {
    expect(fmtIls(1234.5)).toBe("₪1,234.50");
    expect(fmtIls(4000)).toBe("₪4,000");
    expect(fmtRange("2026-10-13", "2026-10-31")).toBe("13.10–31.10.2026");
    expect(fmtRange("2026-12-20", "2027-01-10")).toBe("20.12.2026–10.1.2027");
    expect(fmtDays([0, 1, 2, 3, 4, 5, 6])).toBe("כל הימים");
    expect(fmtDays([4, 0, 1, 2, 3])).toBe("ראשון עד חמישי");
    expect(fmtDays([5, 6])).toBe("ו׳, ש׳");
    expect(fmtHours(0, 24)).toBe("כל השעות");
    expect(fmtHours(8, 22)).toBe("08:00–22:00");
  });
  it("the default audience is decision 74's: trial and Core", () => {
    expect(DEFAULT_PLANS).toEqual(["free", "building"]);
    expect(PLAN_LABEL.building).toBe("Core");
  });
});

describe("the report — aggregates only", () => {
  const raw = {
    totals: { serves: 120, views: 100, clicks: 4, closes: 80, reach: 70 },
    days: [{ day: "2026-10-12", serves: 60, views: 50, clicks: 2, closes: 40, reach: 40 }, { day: "bad", views: 9 }],
    creatives: [{ creative_id: "c1", serves: 70, views: 60, clicks: 3, closes: 50 }],
    screens: [{ screen: "home", views: 90, clicks: 4 }, { screen: "payments", views: 1, clicks: 0 }],
    cities: [{ city: "תל אביב", views: 80, clicks: 3 }, { city: null, views: 20, clicks: 1 }],
  };
  it("parses numbers, drops what does not belong", () => {
    const r = parseReport(raw);
    expect(r.totals).toEqual({ serves: 120, views: 100, clicks: 4, closes: 80, reach: 70 });
    expect(r.days).toHaveLength(1);
    expect(r.screens.map((s) => s.screen)).toEqual(["home"]);
    expect(r.cities[1].city).toBeNull();
    expect(parseReport(null).totals).toEqual({ serves: 0, views: 0, clicks: 0, closes: 0, reach: 0 });
  });
  it("CSV for the advertiser: BOM, every section, no user or building fields, formulas neutralised", () => {
    const csv = reportCsv({ advertiser: "=פיצה", campaign: "סתיו", starts_on: "2026-10-01", ends_on: "2026-10-30", creatives: { c1: "פיצה ב-49" } }, parseReport(raw));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    for (const part of ["מפרסם", "קמפיין", "תקופה", "חשיפות", "אנשים שונים", "הקלקות", "CTR", "2026-10-12", "פיצה ב-49", "מסך הבית", "תל אביב", "לא ידוע"])
      expect(csv).toContain(part);
    expect(csv).toContain("'=פיצה");
    // סה"כ: חשיפות (לא הגשות), אנשים שונים, הקלקות, CTR, סגירות
    expect(csv).toContain("\r\n,100,70,4,4%,80\r\n");
    expect(csv).toContain("\r\n2026-10-12,50,40,2,4%,40\r\n");
    expect(csv).not.toMatch(/user_id|building_id|serve_id|@/);
  });
  it("a safe file name", () => {
    expect(reportFileName("פיצה / סתיו 2026!", "2026-10-13")).toBe("bloc-ad-report-פיצה-סתיו-2026-2026-10-13.csv");
    expect(reportFileName("///", "2026-10-13")).toBe("bloc-ad-report-campaign-2026-10-13.csv");
  });
});

describe("images by their bytes", () => {
  it("JPEG, PNG, WebP — anything else is refused", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ ext: "jpg", type: "image/jpeg" });
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({ ext: "png", type: "image/png" });
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toEqual({ ext: "webp", type: "image/webp" });
    expect(sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0x00, 0xe0]))).toBeNull(); // לא JPEG (שני בייטים בלבד מתאימים)
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x58, 0x45, 0x42, 0x50]))).toBeNull(); // RIFF....XEBP
    expect(sniffImage(new TextEncoder().encode("<svg xmlns"))).toBeNull();
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20]))).toBeNull(); // AVI
    expect(sniffImage(new Uint8Array([]))).toBeNull();
  });
});

describe("database errors in Hebrew", () => {
  it("SQL 175 missing", () => {
    for (const e of [{ code: "42P01" }, { code: "PGRST205" }, { code: "PGRST202" }, { code: "42883" }, { message: 'relation "public.ad_campaigns" does not exist' }])
      expect(adsSqlMissing(e)).toBe(true);
    expect(adsSqlMissing({ code: "23503" })).toBe(false);
    expect(adsSqlMissing(null)).toBe(false);
    expect(adsDbMessage({ code: "42P01" }, "x")).toBe(ADS_SQL_MISSING);
  });
  it("history is kept: locked contract / campaign / creative, and what has history is not deleted", () => {
    expect(adsDbMessage({ code: "P0001", message: "AD_CONTRACT_LOCKED" }, "x")).toContain("חוזה חדש");
    expect(adsDbMessage({ code: "P0001", message: "AD_CAMPAIGN_LOCKED" }, "x")).toContain("נשאר בחוזה שלו");
    expect(adsDbMessage({ code: "P0001", message: "AD_CREATIVE_LOCKED" }, "x")).toContain("פרסומת חדשה");
    expect(adsDbMessage({ code: "23503" }, "x")).toContain("אי אפשר למחוק");
    expect(adsDbMessage({ code: "23514" }, "x")).toContain("לא תקין");
    expect(adsDbMessage({ code: "XX000" }, "נכשל")).toBe("נכשל");
  });
});

describe("access", () => {
  it("everyone reads ads; admins and superadmins manage them", () => {
    expect(can("viewer", "ads.read")).toBe(true);
    expect(can("viewer", "ads.manage")).toBe(false);
    expect(can("admin", "ads.manage")).toBe(true);
    expect(can("superadmin", "ads.manage")).toBe(true);
  });
  it("in the navigation, under communication, by ads.read", () => {
    const g = NAV_GROUPS.find((x) => x.items.some((i) => i.href === "/ads"))!;
    expect(g.title).toBe("תקשורת");
    expect(g.items.find((i) => i.href === "/ads")).toMatchObject({ label: "פרסומות", icon: "Megaphone", permission: "ads.read" });
  });
});
