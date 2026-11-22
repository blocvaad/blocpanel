// PAY-0 (אודיט BLOC PAY C#7, C#2): מה שמוצג בפאנל.
//   • גביית הדיירים בבניינים היא כסף של הבניינים — לא "הכנסות" (של bloc). ההכנסה של bloc היא המנויים (MRR).
//   • דחיות של חיובי מנוי מופיעות בבקרת הכסף ובמסך המנויים; פריט "לבדיקה" מראה את הסיבה והסכומים.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const COLLECTION_SCREENS = [
  "src/app/(panel)/overview/page.tsx",
  "src/app/(panel)/analytics/page.tsx",
  "src/app/(panel)/buildings/[id]/page.tsx",
  "src/app/(panel)/buildings/[id]/report/page.tsx",
  "src/components/charts/RevenueChart.tsx",
  "src/components/charts/AnalyticsCharts.tsx",
  "src/components/ui/AnalyticsExportBtn.tsx",
];

describe("building collections are not called revenue", () => {
  for (const f of COLLECTION_SCREENS) {
    it(f, () => {
      const src = read(f).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(src.includes("הכנסות"), f).toBe(false);
      expect(src.includes("גבייה") || src.includes("נגבה"), f).toBe(true);
    });
  }
  it("bloc's own revenue is labelled as bloc's", () => {
    expect(read("src/app/(panel)/billing/page.tsx")).toContain("הכנסה חודשית חוזרת של bloc");
  });
});

describe("the money screens show what PAY-0 records", () => {
  it("the money route reads failed platform callbacks and passes the review details", () => {
    const route = read("src/app/api/money/route.ts");
    expect(route).toContain('from("billing_webhook_events")');
    expect(route).toContain('.eq("status", "failed")');
    // S345 (שלב 4): השדות מתוך ה-payload נבחרים בשאילתה (owed:raw_payload->owed) — ה-payload כולו לא יוצא מ-bloc
    expect(route).toContain('owed:raw_payload->owed');
    expect(route).toMatch(/owed: r\.owed \?\? null/);
    expect(route).not.toMatch(/select\("[^"]*\braw_payload,/);
    expect(route).toContain("billingRejected,");
  });
  it("the review list is filtered in the query (a reason, not db_error) and counted by the DB (the review, P2)", () => {
    const route = read("src/app/api/money/route.ts");
    expect(route).toContain('.not("raw_payload->>reason", "is", null).neq("raw_payload->>reason", "db_error")');
    expect(route).toContain('.eq("raw_payload->>reason", "db_error")');
    expect(route).toMatch(/reviewTotal = reviewsFailed \? null/);
  });
  it("the money page renders the board (rendered with the route shape in moneyBoard.test)", () => {
    expect(read("src/app/(panel)/money/page.tsx")).toContain("<MoneyBoard data={data} />");
  });
  it("the billing page labels a failed event in Hebrew", () => {
    expect(read("src/app/(panel)/billing/page.tsx")).toContain("billingRejection(e.error).label");
  });
});
