// ADS-2ב1 (החלטה 388) — lib/adsOffer: קוד קופון וסוף מבצע. העותק של הפונקציות של bloc (offerLine / offerEnded / הקוד) נבדק מול הקובץ
// המשותף tests/fixtures/ads2b/helpers.json (זהה בבייטים לזה של bloc — ads2bContract.test.ts), ומול הקובץ של bloc עצמו כשהוא קיים
// (BLOC_ROOT, ברירת מחדל /home/claude/hood-ads2): כל משפט בעברית שה-offerLine של bloc מחזיר — גם אצלנו, אותו דבר.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COUPON_RE, COUPON_INVALID_TEXT, OFFER_PAST_TEXT, OFFER_INVALID_TEXT, COUPON_PREFIX, COUPON_COPY_TEXT, COUPON_COPIED_TEXT, BANNER_COUPON_SHORT,
  BANNER_COUPON_TEXT, BANNER_ONLY_COUPON_TEXT, OFFER_ENDED_TEXT, normalizeCoupon, couponOk, couponIssue, offerIssue, offerLine, offerEnded,
  parseCoupon, parseOfferEnd, couponChipText, bannerCouponWarning,
} from "../adsOffer";
import { showCopies, reportCsv, parseReport, liveNow, OFFER_ENDED_LIVE_TEXT, COPIES_LABEL } from "../ads";
import { reviewChecklist, newCampaignForm } from "../adsStudio";

const FIX = join(process.cwd(), "tests", "fixtures", "ads2b");
const helpers = JSON.parse(readFileSync(join(FIX, "helpers.json"), "utf8")) as {
  today: string;
  offerLine: Array<{ offerEndsOn: string | null; line: string | null }>;
  offerEnded: Array<{ offerEndsOn: string | null; ended: boolean }>;
  coupon: Array<{ input: string | null; code: string | null; valid?: boolean }>;
  couponChip: { label: string; copy: string; copied: string; copiedMs: number };
  bannerWarning: string;
};

describe("the shared helpers (tests/fixtures/ads2b/helpers.json — the same file as bloc's)", () => {
  it("offerLine: today / tomorrow / until d/m (another year — d/m/yyyy); ended, empty or not a real date — none", () => {
    expect(helpers.offerLine.length).toBeGreaterThanOrEqual(9);
    for (const c of helpers.offerLine) expect(offerLine(c.offerEndsOn, helpers.today), String(c.offerEndsOn)).toBe(c.line);
  });
  it("offerEnded: only a real date before today (Israel)", () => {
    for (const c of helpers.offerEnded) expect(offerEnded(c.offerEndsOn, helpers.today), String(c.offerEndsOn)).toBe(c.ended);
  });
  it("the coupon: trim + upper case, then ^[A-Z0-9][A-Z0-9-]{1,23}$ — empty is valid (none)", () => {
    for (const c of helpers.coupon) {
      expect(parseCoupon(c.input), String(c.input)).toBe(c.code);
      expect(couponOk(c.input), String(c.input)).toBe(c.valid ?? true);
      expect(couponIssue(c.input), String(c.input)).toBe((c.valid ?? true) ? null : COUPON_INVALID_TEXT);
    }
  });
  it("the chip's words and the banner warning are bloc's", () => {
    expect([COUPON_PREFIX, COUPON_COPY_TEXT, COUPON_COPIED_TEXT]).toEqual([helpers.couponChip.label, helpers.couponChip.copy, helpers.couponChip.copied]);
    expect(couponChipText("SAVE20")).toBe(`${helpers.couponChip.label} SAVE20`);
    expect(BANNER_COUPON_SHORT).toBe(helpers.bannerWarning);
    expect(BANNER_COUPON_TEXT.startsWith(helpers.bannerWarning)).toBe(true);
    expect(BANNER_ONLY_COUPON_TEXT.startsWith(helpers.bannerWarning)).toBe(true);
  });
});

// ── מול הקובץ של bloc עצמו (כשהוא קיים כאן) ──
const BLOC = process.env.BLOC_ROOT ?? "/home/claude/hood-ads2";
const BLOC_ADS = join(BLOC, "src", "lib", "ads.ts");
describe("parity with bloc's own file text (when bloc's tree is here)", () => {
  it("every Hebrew string of bloc's offerLine — the same in ours; the same regex", () => {
    if (!existsSync(BLOC_ADS)) return;
    const src = readFileSync(BLOC_ADS, "utf8");
    const at = src.search(/export function offerLine\b/);
    if (at < 0) return;   // bloc's helper is not written yet — the shared fixture above is the contract
    const body = src.slice(at, src.indexOf("\n}\n", at) + 2);
    const ours = readFileSync(join(process.cwd(), "src", "lib", "adsOffer.ts"), "utf8");
    const words = body.match(/['"`][^'"`]*[א-ת][^'"`]*['"`]/g) ?? [];
    expect(words.length).toBeGreaterThanOrEqual(2);
    for (const w of words) {
      const text = w.slice(1, -1).split("${")[0];
      expect(ours, `bloc's "${text}"`).toContain(text);
    }
    if (/A-Z0-9\]\[A-Z0-9-\]\{1,23\}/.test(src)) expect(src).toContain(COUPON_RE.source);
  });
});

describe("the form's checks — a Hebrew sentence each", () => {
  it("normalize: trim + upper; null / undefined — empty", () => {
    expect([normalizeCoupon(" winter-26 "), normalizeCoupon(null), normalizeCoupon(undefined)]).toEqual(["WINTER-26", "", ""]);
  });
  it("offerIssue: empty — fine; today — fine; yesterday — past; not a date / 30.02 — invalid", () => {
    const T = "2026-11-16";
    expect([offerIssue("", T), offerIssue("  ", T), offerIssue(null, T), offerIssue(T, T), offerIssue("2027-01-01", T)]).toEqual([null, null, null, null, null]);
    expect(offerIssue("2026-11-15", T)).toBe(OFFER_PAST_TEXT);
    expect([offerIssue("2026-02-30", T), offerIssue("30/11/2026", T)]).toEqual([OFFER_INVALID_TEXT, OFFER_INVALID_TEXT]);
  });
  it("parseOfferEnd: Postgres' date (or a timestamp's day) — else null; the ended text", () => {
    expect([parseOfferEnd("2026-11-30"), parseOfferEnd("2026-11-30T00:00:00"), parseOfferEnd("2026-02-30"), parseOfferEnd(20261130), parseOfferEnd(null)])
      .toEqual(["2026-11-30", "2026-11-30", null, null, null]);
    expect(OFFER_ENDED_TEXT).toBe("המבצע הסתיים");
  });
  it("the banner warning: only with a code and a banner; banner alone says to add another format", () => {
    expect(bannerCouponWarning(["card", "banner"], "SAVE20")).toBe(BANNER_COUPON_TEXT);
    expect(bannerCouponWarning(["banner"], "save20")).toBe(BANNER_ONLY_COUPON_TEXT);
    expect(bannerCouponWarning(["card"], "SAVE20")).toBeNull();
    expect(bannerCouponWarning(["banner"], "  ")).toBeNull();
  });
});

describe("copies of the code — where they show (report, print, CSV)", () => {
  it("showCopies: a campaign with a code (even 0 copies so far), or copies already counted — never just noise", () => {
    expect(showCopies({ totals: { copies: 0 } } as never, true)).toBe(true);
    expect(showCopies({ totals: { copies: 2 } } as never, false)).toBe(true);
    expect(showCopies({ totals: { copies: 0 } } as never, false)).toBe(false);
  });
  it("the CSV: a seventh column \"העתקות קוד\" in the totals and per creative — only when shown; never the reports", () => {
    const rep = parseReport(JSON.parse(readFileSync(join(FIX, "ad_report.raw.json"), "utf8")));
    const meta = { advertiser: "קפה", campaign: "חורף", starts_on: "2026-11-01", ends_on: "2026-11-30", creatives: { "00000000-0000-4000-f000-000000000001": "קפה ב-20%" } };
    const withCode = reportCsv({ ...meta, hasCoupon: true }, rep).split("\r\n");
    expect(withCode.find((l) => l.startsWith("סה\"\"כ") || l.startsWith('"סה""כ"'))).toContain(COPIES_LABEL);
    expect(withCode).toContain(",31,12,4,12.9%,9,6");
    expect(withCode).toContain("קפה ב-20%,22,כרטיס במרכז,3,13.6%,6,6");
    const plain = reportCsv({ ...meta, hasCoupon: false }, parseReport({ totals: { views: 5 }, creatives: [{ creative_id: "x", views: 5 }] }));
    expect(plain).not.toContain(COPIES_LABEL);
    expect(reportCsv({ ...meta, hasCoupon: true }, rep)).not.toMatch(/דיווח/);
  });
});

describe("an ended offer stops the ad — said where it matters", () => {
  it("liveNow: every active ad ended → the offer sentence; ended + foreign → the combined one; foreign only → as before", () => {
    const c = { days: [0, 1, 2, 3, 4, 5, 6], hour_from: 0, hour_to: 24, creatives_active: 2, creatives_ready: 0 };
    expect(liveNow({ ...c, creatives_ended: 2 }).reason).toBe(OFFER_ENDED_LIVE_TEXT);
    expect(liveNow({ ...c, creatives_ended: 1 }).reason).toContain("בחלק מהמודעות הפעילות המבצע הסתיים");
    expect(liveNow({ ...c, creatives_ended: 0 }).reason).toContain("בכל המודעות הפעילות בו יש תמונה מאתר אחר");
    expect(liveNow({ ...c, creatives_ready: 1, creatives_ended: 1 }).reason === OFFER_ENDED_LIVE_TEXT).toBe(false);
  });
  it("the wizard's checklist: an active ad whose offer ended is not ready — and the line says why", () => {
    const base = { advertiserId: "a1", contract: { status: "active", starts_on: "2026-11-01", ends_on: "2026-12-31" }, form: newCampaignForm("2026-11-16"), today: "2026-11-16" };
    const ad = { active: true, ready: true, headline: "קפה", image_alt: "קפה", cta_label: "לפרטים" };
    const ended = reviewChecklist({ ...base, creatives: [{ ...ad, ended: true }] }).find((x) => x.key === "ads")!;
    expect([ended.ok, ended.text]).toEqual([false, "המבצע הסתיים בכל המודעות הפעילות — מאריכים את סוף המבצע או מוסיפים מודעה."]);
    const fine = reviewChecklist({ ...base, creatives: [{ ...ad, ended: false }, { ...ad, ended: true }] }).find((x) => x.key === "ads")!;
    expect([fine.ok, fine.text]).toEqual([true, "מודעה פעילה אחת עם תמונות שהועלו ל-bloc."]);
    expect(reviewChecklist({ ...base, creatives: [] }).find((x) => x.key === "ads")!.text).toBe("אין מודעה פעילה עם תמונות שהועלו ל-bloc.");
  });
});
