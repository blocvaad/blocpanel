// bloc OPS-1 (שלב 9, החלטה 755): הימים של תרגול השחזור — בלוח השנה של ישראל.
//   • yesterdayIL: ברירת המחדל של "רישום תרגול" — אתמול בישראל, גם בלילה שבו עוברים לשעון קיץ (יום של 23 שעות), לא עכשיו פחות 24 שעות.
//   • drillDateOk: תאריך גיבוי לא בעתיד (היום בישראל — כן), ולא לפני 2026.
import { describe, it, expect } from "vitest";
import { drillDateOk, yesterdayIL } from "../ops";

describe("yesterdayIL", () => {
  it("yesterday on the Israel calendar, also just after midnight there (still the day before in UTC)", () => {
    expect(yesterdayIL(new Date("2026-11-26T08:00:00Z"))).toBe("2026-11-25");
    // 00:30 in Israel on 27/11 (22:30Z on 26/11)
    expect(yesterdayIL(new Date("2026-11-26T22:30:00Z"))).toBe("2026-11-26");
    expect(yesterdayIL(new Date("2027-01-01T10:00:00Z"))).toBe("2026-12-31");
  });
  it("the night summer time starts (a day of 23 hours): one calendar day back, not two", () => {
    // 26/3/2027 is 23 hours long in Israel; 00:30 on 27/3 (UTC+3) — now minus 24 hours would land on 25/3
    expect(yesterdayIL(new Date("2027-03-26T21:30:00Z"))).toBe("2027-03-26");
  });
});

describe("drillDateOk", () => {
  it("today in Israel and before — yes; tomorrow — no; before 2026 — no", () => {
    const now = new Date("2026-11-26T22:30:00Z"); // 27/11 in Israel
    expect(drillDateOk("2026-11-27", now)).toBe(true);
    expect(drillDateOk("2026-11-26", now)).toBe(true);
    expect(drillDateOk("2026-11-28", now)).toBe(false);
    expect(drillDateOk("2025-12-31", now)).toBe(false);
  });
});
