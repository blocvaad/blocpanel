// ADS-2ב1 wiring (החלטות 384–391) — מה שחייב להישאר מחובר:
//   • אף פעם לא מי דיווח: כל קריאה של ad_reports בפאנל — רק REPORT_COLUMNS (בלי user_id / building_id / serve_id ובלי "*"); הפאנל לא
//     קורא את ad_hides בכלל (ההסתרות של דייר — רק שלו); התור מקבל לדפדפן רק קבוצות (לא את הקמפיינים והמודעות כולם).
//   • כל כתיבה דרך bloc: ההחלטות — reports.review (postAds → /api/ads → callBloc); הקוד וסוף המבצע — creative.save; ההשהיה — settings.save;
//     שום rpc של כתיבה (ad_reports_review / ad_report_submit / ad_hide…) מהפאנל.
//   • לכל קוד חדש של bloc — משפט בעברית; היומן מכיר את AD_REPORTS_REVIEW; הדף החדש עובר requirePageSession; הניווט — "דיווחים".
//   • ES2017 בקבצים החדשים / שהשתנו: בלי regex s / d / v, lookbehind, named groups, ובלי .at( / replaceAll / Object.hasOwn / structuredClone…
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { invalidText, sqlMissingText, AD_ACTIONS, FIELD_LABEL } from "@/lib/adsActions";
import { AUDIT_LABELS } from "@/lib/auditLabels";
import { REPORT_COLUMNS } from "@/lib/adsReports";
import { INVALID_TEXT } from "@/lib/moneyActions";
import { ADS_SQL_MISSING } from "@/lib/ads";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
function files(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "__tests__" && n !== "node_modules" && !n.startsWith(".")) files(p, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) && !n.startsWith(".__mt")) out.push(p);
  }
  return out;
}
const ALL = files(SRC).map((f) => ({ f: relative(SRC, f), src: readFileSync(f, "utf8") }));
/** the package's new and changed source files */
const NEW = [
  "lib/adsOffer.ts", "lib/adsReports.ts", "components/ads/studio/ReportsQueue.tsx", "components/ads/studio/OfferSheet.tsx",
  "app/(panel)/ads/reports/page.tsx", "app/(panel)/ads/reports/loading.tsx",
];
const CHANGED = [
  "lib/ads.ts", "lib/adsActions.ts", "lib/adsExplain.ts", "lib/adsServer.ts", "lib/adsStudio.ts", "lib/validation.ts", "lib/auditLabels.ts",
  "app/api/ads/route.ts", "app/api/ads/report/route.ts", "app/(panel)/ads/page.tsx", "app/(panel)/ads/campaigns/[id]/print/page.tsx",
  "components/ads/studio/AdPreview.tsx", "components/ads/studio/StudioPreview.tsx", "components/ads/studio/CreativeStudio.tsx",
  "components/ads/studio/CreativeCard.tsx", "components/ads/studio/CreativeList.tsx", "components/ads/studio/CampaignStudio.tsx",
  "components/ads/studio/CampaignWizard.tsx", "components/ads/studio/StudioHome.tsx", "components/ads/studio/StudioSettings.tsx", "components/ads/studio/kit.tsx",
];
const PKG = [...NEW, ...CHANGED];

describe("never who reported — the panel reads no identity of a reporter, and no hide at all", () => {
  it("REPORT_COLUMNS names no person, building or serve — and every ad_reports read in the panel uses it (never \"*\" or a hand-written list)", () => {
    expect(REPORT_COLUMNS.split(/,\s*/)).toEqual(["id", "campaign_id", "creative_id", "reason", "note", "status", "created_at", "reviewed_at"]);
    const reads = ALL.flatMap(({ f, src }) => Array.from(src.matchAll(/\.from\(\s*["']ad_reports["']\s*\)\s*\.select\(\s*([^,)]+)/g)).map((m) => `${f}: ${m[1].trim()}`));
    expect(reads.length).toBeGreaterThanOrEqual(3);
    for (const r of reads) expect(r, r).toMatch(/: (REPORT_COLUMNS|"id")$/);
  });
  it("no file names user_id / building_id / serve_id next to the reports (code, not comments)", () => {
    for (const f of ["lib/adsReports.ts", "components/ads/studio/ReportsQueue.tsx", "app/(panel)/ads/reports/page.tsx", "lib/adsServer.ts"]) {
      expect(code(f), f).not.toMatch(/\b(user_id|building_id|serve_id)\b/);
    }
  });
  it("the panel never reads ad_hides (a tenant's hides are his own — bloc only)", () => {
    expect(ALL.filter(({ src }) => /["']ad_hides["']/.test(src)).map((x) => x.f)).toEqual([]);
  });
  it("the reports page sends the browser only the groups — campaigns / creatives picked to what the queue shows", () => {
    const c = code("app/(panel)/ads/reports/page.tsx");
    expect(c).toContain('requirePageSession("ads.read")');
    expect(c).toContain("groupReports(data.reports, data.campaigns.map(toReportCampaign), data.creatives.map(toReportCreative))");
    expect(c).not.toMatch(/<ReportsQueue[^>]*\b(campaigns|creatives|reports)=/);
  });
});

describe("every write goes through bloc", () => {
  it("no write rpc of ADS-2ב1 from the panel; no insert / update on ad_reports / ad_hides anywhere", () => {
    expect(ALL.filter(({ src }) => /\.rpc\(\s*["'](ad_reports_review|ad_report_submit|ad_hide|ad_unhide|ad_forget_old_reports)["']/.test(src)).map((x) => x.f)).toEqual([]);
    expect(ALL.filter(({ src }) => /\.from\(\s*["']ad_(reports|hides)["']\s*\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\(/.test(src)).map((x) => x.f)).toEqual([]);
  });
  it("the decisions → reports.review via postAds; the served ad's offer → creative.save via postAds; the auto-pause → settings.save", () => {
    expect(code("components/ads/studio/ReportsQueue.tsx")).toContain("const r = await postAds(reviewBody(c.campaignId, c.decision, seenUntilFor(g, filter)));");
    expect(code("lib/adsReports.ts")).toContain("decision, seen_until: seenUntil });");
    expect(code("lib/adsReports.ts")).toContain('action: "reports.review" as const');
    expect(code("components/ads/studio/OfferSheet.tsx")).toContain("const r = await postAds(offerPayloadFor(creative, v));");
    expect(code("lib/adsStudio.ts")).toMatch(/action: "creative\.save", id: c\.id/);
    expect(code("components/ads/studio/StudioSettings.tsx")).toContain('void save("pause", { report_pause_at: n }');
    for (const f of ["components/ads/studio/ReportsQueue.tsx", "components/ads/studio/OfferSheet.tsx"]) {
      expect(code(f), f).not.toMatch(/adminClient|@\/lib\/supabase|callBloc|@\/lib\/blocApi|fetch\(/);
    }
  });
  it("the action table: reports.review on the campaign (its history shows it), with a label in the log", () => {
    expect(AD_ACTIONS["reports.review"]).toMatchObject({ audit: "AD_REPORTS_REVIEW", entity: "campaign", kind: "review" });
    expect(AUDIT_LABELS.AD_REPORTS_REVIEW?.label).toBe("החלטה על דיווחים");
  });
});

describe("every new code of bloc has its Hebrew sentence", () => {
  it("invalid on coupon_code / offer_ends_on / report_pause_at / decision — each its own sentence (not the generic one)", () => {
    for (const f of ["coupon_code", "offer_ends_on", "report_pause_at", "decision"]) {
      expect(invalidText(f), f).not.toBe(INVALID_TEXT);
      expect(invalidText(f), f).toMatch(/[א-ת]/);
      expect(FIELD_LABEL[f], f).toMatch(/[א-ת]/);
    }
  });
  it("sql_missing names SQL 231 where 231 is what is missing; 175 otherwise", () => {
    expect(sqlMissingText("reports.review")).toMatch(/SQL 231/);
    expect(sqlMissingText("creative.save", { action: "creative.save", coupon_code: "A1" } as never)).toMatch(/SQL 231/);
    expect(sqlMissingText("settings.save", { action: "settings.save", report_pause_at: 3 } as never)).toMatch(/SQL 231/);
    expect(sqlMissingText("creative.save", { action: "creative.save", coupon_code: null, offer_ends_on: null } as never)).toBe(ADS_SQL_MISSING);
    expect(sqlMissingText("campaign.status")).toBe(ADS_SQL_MISSING);
  });
});

describe("the screens are wired", () => {
  it("the studio nav has \"דיווחים\"; the reports page has its own loading state; the home page reads the open count", () => {
    expect(code("components/ads/studio/kit.tsx")).toContain('{ href: "/ads/reports", key: "reports", label: "דיווחים" }');
    expect(code("app/(panel)/ads/reports/loading.tsx")).toContain("<ReportsQueueSkeleton />");
    expect(code("app/(panel)/ads/page.tsx")).toContain("loadOpenReportsCount()");
    expect(code("app/(panel)/ads/page.tsx")).toContain("reportsCount={data.state === \"ok\" ? reportsCount : null}");
  });
  it("review #6: the settings' hint says only reports not yet reviewed count", () => {
    expect(code("components/ads/studio/StudioSettings.tsx")).toContain("כשמספיק משתמשים שונים דיווחו על קמפיין פעיל כחמור, בדיווחים שעוד לא נבדקו, בשבוע האחרון");
  });
  it("the banner never shows a coupon (no room) — the preview drops it, the studio warns", () => {
    expect(code("components/ads/studio/AdPreview.tsx")).toContain('const code = format === "banner" || ended ? null : parseCoupon(p.coupon ?? null);');
    // an ended offer — nothing (388a): the card's room and the mock list follow showCoupon, and CouponBlock itself returns null
    expect(code("components/ads/studio/AdPreview.tsx")).toContain("if (offerEnded(offerEndsOn, today)) return null;");
    expect(code("components/ads/studio/AdPreview.tsx")).toContain('const line = format === "banner" ? null : offerLine(');
    expect(code("components/ads/studio/CreativeStudio.tsx")).toContain("bannerCouponWarning(formats, coupon)");
  });
  it("the creative list passes the campaign's end and today to the studio; served ads get the offer sheet", () => {
    expect(code("components/ads/studio/CampaignStudio.tsx")).toContain("today={today} campaignEndsOn={c.ends_on}");
    expect(code("components/ads/studio/CreativeList.tsx")).toContain("onOffer={canManage && served > 0 ? () => setOffer(c) : undefined}");
  });
  it("the print report: copies in the tiles, per creative and per format — when shown", () => {
    const c = code("app/(panel)/ads/campaigns/[id]/print/page.tsx");
    expect(c).toContain("const copies = showCopies(r, data.creatives.some((x) => !!x.coupon_code));");
    expect(c).toContain('{copies && <div className="tile">{COPIES_LABEL}<b data-ad-print-copies="">{fmtInt(r.totals.copies)}</b></div>}');
    expect(c).toContain('{copies && <td data-ad-print-creative-copies="">{fmtInt(x.copies)}</td>}');
    expect(c).toContain("{copies && <td>{fmtInt(x.copies)}</td>}");
  });
  it("the wizard's checklist knows an ended offer; the report CSV knows a campaign with a code", () => {
    expect(code("components/ads/studio/CampaignWizard.tsx")).toContain("ended: offerEnded(c.offer_ends_on, today),");
    expect(code("app/api/ads/report/route.ts")).toContain("hasCoupon: ((crs.data ?? []) as Row[]).some((r) => parseCoupon(r.coupon_code) !== null),");
  });
  it("the advertiser's documents (print / CSV) carry copies but never the reports", () => {
    for (const f of ["app/(panel)/ads/campaigns/[id]/print/page.tsx", "app/api/ads/report/route.ts"]) expect(code(f), f).not.toMatch(/\.reports\b|reportsSummaryText|דיווח/);
    expect(code("lib/ads.ts")).not.toMatch(/rep\.reports/);
  });
});

describe("ES2017 and the browser", () => {
  it("no regex flag s / d / v, no lookbehind, no named group in the package's files", () => {
    for (const f of PKG) {
      const c = code(f);
      expect(c, f).not.toMatch(/\(\?<[=!]/);
      expect(c, f).not.toMatch(/\(\?<[A-Za-z]/);
      expect(c, f).not.toMatch(/\/[gimuy]*[sdv][gimuy]*\s*\.(test|exec)\(|new RegExp\([^)]*,\s*["'][a-z]*[sdv][a-z]*["']\)/);
    }
  });
  it("no library call newer than ES2017 (no .at( / replaceAll / Object.hasOwn / structuredClone / findLast / toSorted)", () => {
    for (const f of PKG) expect(code(f), f).not.toMatch(/\.at\(-?\d|\.replaceAll\(|Object\.hasOwn\(|structuredClone\(|\.findLast(Index)?\(|\.toSorted\(|\.toReversed\(/);
  });
  it("browser files of the package import neither the service client nor the server reads (a type-only import is erased)", () => {
    for (const f of PKG.filter((x) => existsSync(join(SRC, x)) && /^\s*["']use client["']/.test(read(x)))) {
      const c = code(f);
      expect(c, f).not.toMatch(/from\s+["']@\/lib\/supabase["']/);
      expect(c, f).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+["']@\/lib\/adsServer["']/m);
    }
  });
  it("no env() inline in a top / bottom / padding / height of the new components (happy-dom drops it — MG-S1097; the panel keeps the rule too)", () => {
    for (const f of NEW.filter((x) => x.endsWith(".tsx"))) expect(code(f), f).not.toMatch(/(top|bottom|padding\w*|height|width)\s*:\s*["'`][^"'`]*env\(/);
  });
});
