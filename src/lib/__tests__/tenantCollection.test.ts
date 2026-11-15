// PANEL-PAY א2ב (החלטה 375): "סליקת דיירים" בדף הבניין — מה שהבחירה של הוועד אומרת, עם שם הספק, אף פעם לא מזהה גולמי.
// REGRESSION: בבניין הבדיקה של הבעלים (payment_provider = 'none' עם פרטי חיבור שמורים) הופיע "מחוברת · none".
import { describe, it, expect } from "vitest";
import { tenantCollectionText, COLLECTION_FACT, COLLECTION_PROVIDERS } from "../collectionProviders";

describe("tenantCollectionText", () => {
  it("REGRESSION: 'none' with saved details → \"כבויה · יש פרטי חיבור שמורים\", never \"מחוברת · none\"", () => {
    expect(tenantCollectionText("none", true)).toBe("כבויה · יש פרטי חיבור שמורים");
    expect(tenantCollectionText("none", true)).not.toContain("none");
  });
  it("'none' / null / empty without details → manual (bit / transfer), as before", () => {
    for (const p of ["none", null, undefined, "", "  ", "NONE"]) expect(tenantCollectionText(p, false), String(p)).toBe("ידנית (ביט/העברה)");
    expect(tenantCollectionText(null, true)).toBe("כבויה · יש פרטי חיבור שמורים");
    expect(tenantCollectionText(null, null)).toBe("ידנית (ביט/העברה)");
  });
  it("through the management company — whatever the details", () => {
    expect(tenantCollectionText("management", true)).toBe("דרך חברת הניהול");
    expect(tenantCollectionText("management", false)).toBe("דרך חברת הניהול");
    expect(tenantCollectionText(" Management ", null)).toBe("דרך חברת הניהול");
  });
  it("a real provider with details → \"מחוברת · <display name>\"; without → \"<name> · בלי פרטי חיבור\"", () => {
    expect(tenantCollectionText("payplus", true)).toBe("מחוברת · PayPlus");
    expect(tenantCollectionText("cardcom", true)).toBe("מחוברת · Cardcom");
    expect(tenantCollectionText("grow", true)).toBe("מחוברת · Grow (משולם)");
    expect(tenantCollectionText("PayPlus", true)).toBe("מחוברת · PayPlus");
    expect(tenantCollectionText("payplus", false)).toBe("PayPlus · בלי פרטי חיבור");
    expect(tenantCollectionText("grow", null)).toBe("Grow (משולם) · בלי פרטי חיבור");
  });
  it("the display names are the collection card's (one list)", () => {
    for (const p of COLLECTION_PROVIDERS.filter((x) => x.kind === "card")) expect(tenantCollectionText(p.id, true)).toBe(`מחוברת · ${p.label}`);
  });
  it("an id the panel does not know is never shown raw", () => {
    expect(tenantCollectionText("tranzila", true)).toBe("מחוברת · ספק לא מוכר");
    expect(tenantCollectionText("tranzila", false)).toBe("ספק לא מוכר · בלי פרטי חיבור");
    for (const p of ["tranzila", "x_y", "constructor"]) {
      expect(tenantCollectionText(p, true)).not.toContain(p);
    }
  });
  it("only true is \"saved details\" (a string or 1 is not)", () => {
    expect(tenantCollectionText("payplus", "true" as unknown as boolean)).toBe("PayPlus · בלי פרטי חיבור");
    expect(tenantCollectionText("none", 1 as unknown as boolean)).toBe("ידנית (ביט/העברה)");
  });
  it("the words", () => {
    expect(COLLECTION_FACT).toEqual({
      management: "דרך חברת הניהול", off: "כבויה", savedDetails: "יש פרטי חיבור שמורים", manual: "ידנית (ביט/העברה)",
      connected: "מחוברת", noDetails: "בלי פרטי חיבור", unknownProvider: "ספק לא מוכר",
    });
  });
});
