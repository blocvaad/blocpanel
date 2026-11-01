// בקרת כסף (bloc PAY-0) — האריחים והרשימות, מרונדרים עם הצורה ש-/api/money מחזיר: סיבה בעברית עם הסכומים, הספירה
// מה-DB (לא אורך הרשימה), חיובי מנוי שנדחו, ומה שלא נקרא — "הקריאה נכשלה", לא "אין".
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement("a", { href, ...rest }, children as never),
}));
import MoneyBoard, { type MoneyData } from "../MoneyBoard";
import { summarizeMoney } from "@/lib/money";

const base: MoneyData = {
  tiles: summarizeMoney({ webhookReviews: [], staleReports: 0, disputes: 0, recurringNotStopped: 0, stuckCheckouts: 0, staleExternal: 0, reviewTotal: 63, transientTotal: 2, billingRejected: 1 }),
  reviews: [
    { id: "r1", payment_id: "p1", building_id: "b1", building_name: "השקד 104", reason: "amount_mismatch", amount: 200, owed: 250, detail: "underpaid", provider: "payplus", at: "2026-11-01T09:00:00Z" },
    { id: "r2", payment_id: "p2", building_id: "b2", building_name: "האלון 7", reason: "amount_mismatch", amount: 180, owed: 250, detail: "underpaid", provider: "grow", untrusted: true, at: "2026-11-01T08:00:00Z" },
  ],
  reviewTotal: 63,
  billingRejected: [{ id: "e1", subscription_id: "6d2f3c1a-1b2c-4d5e", reason: "not_a_charge", label: "זיכוי או ביטול מ-PayPlus — לא הוחל", amount: 119, at: "2026-11-01T07:00:00Z" }],
  billingRejectedTotal: 1,
  staleReports: [], disputes: [], batches: [],
};
const html = (d: Partial<MoneyData> = {}) => renderToStaticMarkup(createElement(MoneyBoard, { data: { ...base, ...d } }));

describe("MoneyBoard", () => {
  it("a review row says why, with what was paid and what is owed; the header counts every item, not the 50 shown", () => {
    const h = html();
    expect(h).toContain("שולם ₪200, החיוב ₪250");
    expect(h).toContain("תשלומים מקוונים לבדיקה (63)");
    expect(h).toContain("השקד 104");
  });
  it("a review that was not proven by the provider (no URL token) says so", () => {
    expect(html()).toContain("לא אומת מול הספק");
  });
  it("rejected bloc subscription charges: the list and its count", () => {
    const h = html();
    expect(h).toContain("חיובי מנוי ל-bloc שנדחו (1)");
    expect(h).toContain("זיכוי או ביטול מ-PayPlus");
    expect(h).toContain("₪119");
  });
  it("reads that failed are said — never 'nothing'", () => {
    const h = html({ reviews: null, reviewTotal: null, billingRejected: null, billingRejectedTotal: null });
    expect(h).toContain('data-money-failed="reviews"');
    expect(h).toContain('data-money-failed="billing"');
    expect(h).not.toContain("אין — כל ה-callbacks נסגרו אוטומטית");
    expect(h).not.toContain("אין — כל חיובי המנוי שהגיעו הוחלו");
  });
  it("a tile whose count was not read shows a dash and why, as a warning", () => {
    const tiles = summarizeMoney({ webhookReviews: [], staleReports: 0, disputes: 0, recurringNotStopped: 0, stuckCheckouts: 0, staleExternal: 0, reviewTotal: null });
    const t = tiles.find((x) => x.key === "webhook_review")!;
    expect(t).toMatchObject({ count: null, severity: "warning" });
    const h = html({ tiles });
    expect(h).toMatch(/data-money-tile="webhook_review"[^]*?>—</);
    expect(h).toContain("הקריאה נכשלה");
  });
  it("empty lists say they are empty", () => {
    const h = html({ reviews: [], reviewTotal: 0, billingRejected: [], billingRejectedTotal: 0 });
    expect(h).toContain("אין — כל ה-callbacks נסגרו אוטומטית");
    expect(h).toContain("אין — כל חיובי המנוי שהגיעו הוחלו");
  });
});
