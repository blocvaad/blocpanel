// הקרדיטים של ה-AI בדף הבניין (bloc AI-1, SQL 173) — מראה של bloc/lib/ai/quota ותצוגה.
import { describe, it, expect } from "vitest";
import { AI_MONTHLY_CREDITS, aiMonthlyFor, aiCreditsView, type AIQuotaStatus } from "../aiCredits";
import { aiGrantSchema } from "../validation";
import { AUDIT_LABELS } from "../auditLabels";

const status = (over: Partial<AIQuotaStatus> = {}): AIQuotaStatus => ({
  period: "2026-10", pool: 2000, pool_used: 500, resident_limit: 1800, topup_total: 0, topup_left: 0, topups: [],
  by_feature: {}, staff_units: 300, resident_units: 200, system_calls: 0, ...over,
});

describe("aiMonthlyFor — the same credits as bloc (lib/ai/quota)", () => {
  it("per plan, legacy ids included, unknown = 0", () => {
    expect(AI_MONTHLY_CREDITS).toEqual({ free: 0, building: 200, large: 2000, tower: 6000, company: 6000 });
    expect(aiMonthlyFor("building")).toBe(200);
    expect(aiMonthlyFor("large")).toBe(2000);
    expect(aiMonthlyFor("tower")).toBe(6000);
    expect(aiMonthlyFor("pro")).toBe(6000);
    expect(aiMonthlyFor("business")).toBe(6000);
    expect(aiMonthlyFor("free")).toBe(0);
    expect(aiMonthlyFor(null)).toBe(0);
    expect(aiMonthlyFor("nonsense")).toBe(0);
  });
});

describe("aiCreditsView", () => {
  it("the month in words and percent; the tone at 80 and 100", () => {
    const v = aiCreditsView(status());
    expect(v.monthly).toBe("500 מתוך 2,000 קרדיטים (25%)");
    expect(v.pct).toBe(25);
    expect(v.tone).toBe("green");
    expect(aiCreditsView(status({ pool_used: 1600 })).tone).toBe("yellow");
    // הצבע לפי האחוז שמוצג (מעוגל): 79.45% → 79 → ירוק; 79.95% → 80 → צהוב
    expect(aiCreditsView(status({ pool_used: 1589 })).tone).toBe("green");
    expect(aiCreditsView(status({ pool_used: 1599 })).tone).toBe("yellow");
    expect(aiCreditsView(status({ pool_used: 2000 })).tone).toBe("red");
    // מעבר למכסה (ההפרש של קריאה אחרונה) — עד 100%
    expect(aiCreditsView(status({ pool_used: 2012 })).pct).toBe(100);
  });

  it("no credits in the plan is said, not 0 of 0", () => {
    expect(aiCreditsView(status({ pool: 0, pool_used: 0 })).monthly).toBe("אין קרדיטים במסלול");
    expect(aiCreditsView(status({ pool: 0, pool_used: 12 })).pct).toBe(100);
  });

  it("features largest first with Hebrew names; packs with what is left and until when; insights counted apart", () => {
    const v = aiCreditsView(status({
      by_feature: { rewrite: 3, assistant: 40, photo: 25, insight: 0 },
      topup_total: 1050, topup_left: 900,
      topups: [
        { id: "t1", source: "purchase", units: 1000, units_used: 100, paid_at: "2026-10-01T10:00:00Z", expires_at: "2027-10-01T10:00:00Z" },
        { id: "t2", source: "grant", units: 50, units_used: 50, paid_at: "2026-10-02T10:00:00Z", expires_at: null },
      ],
      system_calls: 31,
    }));
    expect(v.features.map((f) => f.label)).toEqual(["שאלות ובקשות לעוזר", "זיהוי תקלה מתמונה", "ניסוח הודעות"]);
    expect(v.features[0].credits).toBe("40");
    expect(v.topups).toBe("900 מתוך 1,050");
    expect(v.packs[0].line).toBe("1,000 קרדיטים ברכישה, נשארו 900, עד 1.10.2027");
    expect(v.packs[1].line).toBe("50 קרדיטים במתנה, נשארו 0");
    expect(v.who).toBe("ועד וחברת הניהול 300, דיירים 200");
    expect(v.systemCalls).toBe("31 תובנות יומיות החודש (לא נספרות)");
    expect(aiCreditsView(status()).systemCalls).toBeNull();
    expect(aiCreditsView(status()).topups).toBe("אין");
  });
});

describe("aiGrantSchema", () => {
  it("units 1..100,000 whole; months 1..24 (12 by default); a reason of 3+ chars; nothing else", () => {
    expect(aiGrantSchema.safeParse({ units: 1000, note: "פיילוט" }).success).toBe(true);
    expect(aiGrantSchema.parse({ units: "500", note: "פיצוי על תקלה" })).toEqual({ units: 500, months: 12, note: "פיצוי על תקלה" });
    expect(aiGrantSchema.safeParse({ units: 0, note: "פיילוט" }).success).toBe(false);
    expect(aiGrantSchema.safeParse({ units: 100001, note: "פיילוט" }).success).toBe(false);
    expect(aiGrantSchema.safeParse({ units: 10.5, note: "פיילוט" }).success).toBe(false);
    expect(aiGrantSchema.safeParse({ units: 10, months: 25, note: "פיילוט" }).success).toBe(false);
    expect(aiGrantSchema.safeParse({ units: 10, months: 0, note: "פיילוט" }).success).toBe(false);
    expect(aiGrantSchema.safeParse({ units: 10, note: "  א " }).success).toBe(false);
    expect(aiGrantSchema.safeParse({ units: 10 }).success).toBe(false);
    expect(aiGrantSchema.safeParse({ units: 10, note: "פיילוט", building_id: "x" }).success).toBe(false);
  });

  it("the grant has a name in the audit log", () => {
    expect(AUDIT_LABELS.AI_CREDITS_GRANT?.label).toBe("קרדיטים ל-AI במתנה");
  });
});
