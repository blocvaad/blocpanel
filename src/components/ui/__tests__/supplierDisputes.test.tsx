// ספקים בפאנל (LEDGER-1b) — מחלוקות התשלום, מרונדרות עם הצורה ש-/api/suppliers מחזיר: open_disputes (מספר / null)
// ו-disputes_failed. מחלוקת על סימון שבוטל לא נספרת (בשרת); קריאה שנכשלה — "לא נטענו", לא "אין".
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DisputesBadge, DisputesFailedNotice } from "../SupplierDisputes";

const badge = (count: number | null) => renderToStaticMarkup(createElement(DisputesBadge, { count }));
const notice = (failed: boolean) => renderToStaticMarkup(createElement(DisputesFailedNotice, { failed }));

describe("supplier payment disputes in the panel", () => {
  it("a supplier with open disputes — the count in red", () => {
    expect(badge(2)).toContain('data-open-disputes="2"');
    expect(badge(2)).toContain("2 מחלוקות תשלום פתוחות");
  });
  it("none, or the read failed (null) — no badge (the page says it did not load, once, at the top)", () => {
    expect(badge(0)).toBe("");
    expect(badge(null)).toBe("");
  });
  it("disputes_failed — one notice; otherwise nothing", () => {
    expect(notice(true)).toContain("data-disputes-failed");
    expect(notice(true)).toContain("מחלוקות התשלום של הספקים לא נטענו — נסו לרענן.");
    expect(notice(false)).toBe("");
  });
});
