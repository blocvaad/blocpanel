// PANEL-PAY א2ב (החלטה 375) — כרטיס "מנוי, משלם, סליקה" בדף הבניין (מרונדר לשרת, בלי דפדפן): "סליקת דיירים" אומרת מה
// הבחירה של הוועד, עם שם הספק — אף פעם לא מזהה. REGRESSION: "מחוברת · none" בבניין הבדיקה של הבעלים.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BillingFactsCard, { type BillingFacts } from "../BillingFactsCard";

const BILLING: BillingFacts = { company_name: null, company_state: null, payment_provider: "none", has_gateway: true, has_door_code: false };
const card = (o: Partial<BillingFacts> = {}, payer: string | null = "הבניין") =>
  renderToStaticMarkup(createElement(BillingFactsCard, { billing: { ...BILLING, ...o }, payer }));
const fact = (html: string, label: string) => {
  const at = html.indexOf(`data-fact="${label}"`);
  return html.slice(at, html.indexOf("</div></div>", at) + "</div>".length);
};

describe("BillingFactsCard — סליקת דיירים", () => {
  it("REGRESSION: 'none' with saved details → \"כבויה · יש פרטי חיבור שמורים\" (not \"מחוברת · none\")", () => {
    const html = card();
    expect(fact(html, "סליקת דיירים")).toContain("כבויה · יש פרטי חיבור שמורים");
    expect(html).not.toContain("none");
    expect(html).not.toContain("מחוברת");
  });
  it("a real provider → \"מחוברת · PayPlus\"; without details → \"PayPlus · בלי פרטי חיבור\"; an unknown id is never shown", () => {
    expect(fact(card({ payment_provider: "payplus" }), "סליקת דיירים")).toContain("מחוברת · PayPlus");
    expect(fact(card({ payment_provider: "payplus", has_gateway: false }), "סליקת דיירים")).toContain("PayPlus · בלי פרטי חיבור");
    const odd = card({ payment_provider: "tranzila" });
    expect(odd).toContain("מחוברת · ספק לא מוכר");
    expect(odd).not.toContain("tranzila");
  });
  it("manual and management — as before", () => {
    expect(fact(card({ payment_provider: null, has_gateway: false }), "סליקת דיירים")).toContain("ידנית (ביט/העברה)");
    expect(fact(card({ payment_provider: "management", has_gateway: true }), "סליקת דיירים")).toContain("דרך חברת הניהול");
  });
  it("the other facts stay: payer, the company (+ ללא מסלול), the door code (hidden)", () => {
    const html = card({ company_name: "ניהול נכסים בע״מ", company_state: "managed_unpaid", has_door_code: true }, null);
    expect(fact(html, "משלם על המנוי")).toContain(">—<");
    expect(fact(html, "חברת ניהול")).toContain("ניהול נכסים בע״מ · ללא מסלול");
    expect(fact(html, "קוד כניסה")).toContain("מוגדר (מוסתר)");
    expect(fact(card(), "קוד כניסה")).toContain("לא הוגדר");
    expect(fact(card(), "חברת ניהול")).toContain(">—<");
    expect(html.split("data-fact=").length - 1).toBe(4);
  });
});
