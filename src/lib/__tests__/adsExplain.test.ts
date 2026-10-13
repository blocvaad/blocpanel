// "למה המשתמש הזה לא רואה פרסומת?" (bloc ADS-1b): התשובה של bloc נבדקת ונהפכת למשפטים — כל הכרעה, כל מה
// שעוצר לפני הקמפיינים, ולכל קמפיין מה לא מתאים (עם היום / המסלול / המסך עצמם). ומה שהשרת לא רואה — כטיפ.
import { describe, it, expect } from "vitest";
import { parseExplain, explainView, ilWhen, ilDow, AD_CHECKS, CHECK_FAIL } from "../adsExplain";

// יום שלישי 13.10.2026, 16:40 בישראל
const NOW = new Date("2026-10-13T13:40:00Z");
const ALL_OK = Object.fromEntries(AD_CHECKS.map((k) => [k, true]));
const found = (o: Record<string, unknown> = {}, db: Record<string, unknown> | null = {}) => ({
  found: true, ambiguous: false,
  person: { name: "טל", createdAt: "2026-06-01T08:00:00Z", management: false },
  building: { id: "b1", name: "יהואלה 4", city: "חולון" },
  role: "committee", plan: "tower", urgentUntil: null, blockers: [], screen: "home", sqlMissing: false,
  db: db === null ? null : {
    verdict: "none", until: null, shownToday: 0, lastShownAt: null, now: "2026-10-13T13:40:00Z",
    campaigns: [{ id: "c1", name: "bloc", advertiser: "bloc", status: "active", eligible: false, checks: { ...ALL_OK, screen: false } }],
    ...db,
  },
  ...o,
});
const view = (o: Record<string, unknown> = {}, db: Record<string, unknown> | null = {}) => explainView(parseExplain(found(o, db)), NOW);

describe("who, and the verdict", () => {
  it("the person in one line: name, building and city, role, plan", () => {
    const v = view();
    expect(v.title).toBe("טל");
    expect(v.who).toBe("טל, יהואלה 4, חולון, ועד הבית, מסלול Pro");
  });
  it("REGRESSION (13.10): a campaign only on the events board, asked for the home screen — none, and the screen said by name", () => {
    const v = view();
    expect(v.verdict).toEqual({ tone: "danger", text: "אין קמפיין שמתאים לו עכשיו במסך הבית. למטה: מה לא מתאים בכל קמפיין." });
    expect(v.campaigns).toEqual([{ id: "c1", name: "bloc", advertiser: "bloc", eligible: false, failed: ["המסך הזה לא נבחר (מסך הבית)"] }]);
  });
  it("REGRESSION (13.10): today not among the days — the day by name", () => {
    const v = view({}, { campaigns: [{ id: "c1", name: "bloc", eligible: false, checks: { ...ALL_OK, day: false } }] });
    expect(v.campaigns[0].failed).toEqual(["היום לא בימים שנבחרו (היום שלישי)"]);
  });
  it("the plan by name; Pro — with the managed-building hint", () => {
    const v = view({}, { campaigns: [{ id: "c1", name: "bloc", eligible: false, checks: { ...ALL_OK, plan: false } }] });
    expect(v.campaigns[0].failed).toEqual(["המסלול של הבניין לא נבחר (Pro, למשל בניין שחברת ניהול מנהלת)"]);
    const v2 = view({ plan: "free" }, { campaigns: [{ id: "c1", name: "bloc", eligible: false, checks: { ...ALL_OK, plan: false } }] });
    expect(v2.campaigns[0].failed).toEqual(["המסלול של הבניין לא נבחר (התנסות)"]);
  });
  it("every failed rule is said, in order; a campaign that fits — \"all rules pass\" (no list)", () => {
    const none = Object.fromEntries(AD_CHECKS.map((k) => [k, false]));
    const v = view({}, { campaigns: [{ id: "c1", name: "x", eligible: false, checks: none }, { id: "c2", name: "y", eligible: true, checks: ALL_OK }] });
    expect(v.campaigns[0].failed).toHaveLength(AD_CHECKS.length);
    expect(v.campaigns[0].failed[0]).toBe(CHECK_FAIL.status);
    expect(v.campaigns[1]).toMatchObject({ eligible: true, failed: [] });
  });
  it("each verdict in words, with when", () => {
    const at = (verdict: string, until: string | null = null) => view({}, { verdict, until, campaigns: [] }).verdict;
    expect(at("ad")).toEqual({ tone: "ok", text: "יקבל פרסומת בכניסה הבאה במסך הבית." });
    expect(at("tester")!.tone).toBe("ok");
    expect(at("off")!.text).toContain("כבויות לכל המערכת");
    expect(at("excluded")!.text).toContain("בניינים בלי פרסומות");
    expect(at("no_user")!.tone).toBe("danger");
    expect(at("new_user", "2026-10-15T09:00:00Z")!.text).toBe("משתמש חדש: בלי פרסומות 3 ימים מההרשמה, עד 15.10 ב-12:00.");
    expect(at("pending", "2026-10-13T13:42:00Z")!.text).toBe("הוגשה לו פרסומת לפני רגע, והיא עוד לא הוצגה. אם לא תוצג, הוא ישוחרר היום ב-16:42.");
    expect(at("capped", "2026-10-13T21:00:00Z")).toEqual({ tone: "wait", text: "כבר ראה פרסומת היום. הבאה מחר ב-00:00." });
    expect(at("gap", "2026-10-13T18:00:00Z")!.text).toBe("ראה פרסומת לפני פחות מ-6 שעות. הבאה היום ב-21:00.");
    expect(at("weird")!.text).toBe("תשובה לא מוכרת מ-bloc.");
  });
  it("the board and the events board are named in the sentence", () => {
    expect(view({ screen: "market" }, { verdict: "ad", campaigns: [] }).verdict!.text).toBe("יקבל פרסומת בכניסה הבאה בלוח הקהילתי.");
    expect(view({ screen: "events" }, { verdict: "ad", campaigns: [] }).verdict!.text).toBe("יקבל פרסומת בכניסה הבאה בלוח האירועים.");
  });
});

describe("what stops before the campaigns, and notes", () => {
  it("each blocker in words; the urgent quiet with its end", () => {
    const v = view({ blockers: ["no_role", "urgent"], urgentUntil: "2026-10-14T07:00:00Z" });
    expect(v.blockers).toEqual([
      "אין לו תפקיד של דייר או ועד בבניין (רק חברת ניהול או ספק). פרסומות מוצגות רק לדיירים ולוועד.",
      "בבניין יש הודעה דחופה מ-24 השעות האחרונות, ולכן אין פרסומות עד מחר ב-10:00.",
    ]);
    expect(view({ blockers: ["deleted"] }, null).blockers).toEqual(["החשבון נמחק."]);
    expect(view({ blockers: ["no_building"] }, null).blockers).toEqual(["החשבון לא חבר באף בניין."]);
    expect(view({ blockers: ["not_approved"] }).blockers).toEqual(["הוא עוד לא אושר בבניין."]);
  });
  it("the database would serve, but a blocker stops it — said as stopped, not \"will get\"", () => {
    const v = view({ blockers: ["not_approved"] }, { verdict: "ad", campaigns: [] });
    expect(v.verdict).toEqual({ tone: "danger", text: "לפי הקמפיינים הייתה לו פרסומת במסך הבית, אבל מה שלמעלה עוצר אותה." });
  });
  it("REGRESSION (13.10): an account that is also a management company — the note about the mode", () => {
    const v = view({ person: { name: "טל", management: true } });
    expect(v.notes).toEqual(["החשבון הוא גם חברת ניהול. במצב חברת ניהול אין פרסומות אף פעם, גם בתוך בניין. הן מוצגות רק כשהוא בבניין כוועד או כדייר."]);
    expect(view().notes).toEqual([]);
  });
  it("the phone's side as tips (the settle, sheets, the push question, the remembered answer and the cache)", () => {
    const tips = view().tips.join(" ");
    expect(tips).toContain("2.5 שניות");
    expect(tips).toContain("ניקוי מטמון");
  });
  it("SQL 176 not run — said, no tips", () => {
    const v = view({ sqlMissing: true }, null);
    expect(v.verdict).toEqual({ tone: "danger", text: "צריך להריץ קודם את SQL 176 של bloc. בלעדיו אי אפשר לבדוק." });
    expect(v.tips).toEqual([]);
  });
  it("no account / two accounts with the email", () => {
    expect(explainView(parseExplain({ found: false }), NOW).title).toBe("אין ב-bloc חשבון עם המייל הזה");
    const two = explainView(parseExplain({ found: true, ambiguous: true }), NOW);
    expect(two.title).toBe("יש יותר מחשבון אחד עם המייל הזה");
    expect(two.campaigns).toEqual([]);
  });
});

describe("parseExplain — what bloc sent, checked", () => {
  it("junk — empty values, not a crash; unknown blockers, plans and screens dropped", () => {
    const r = parseExplain({ found: true, blockers: ["urgent", "hack", 3], plan: "gold", screen: "payments", role: "admin", db: { verdict: 7, campaigns: "x", shownToday: -2 } });
    expect(r).toMatchObject({ found: true, ambiguous: false, blockers: ["urgent"], plan: null, screen: "home", role: null, verdict: null, campaigns: [], shownToday: 0 });
    expect(parseExplain(null).found).toBe(false);
    expect(parseExplain("x").found).toBe(false);
  });
  it("a check missing from a campaign is false; at most 20 campaigns", () => {
    const r = parseExplain(found({}, { campaigns: [{ id: "c1", eligible: true, checks: { day: true } }] }));
    expect(r.campaigns[0].checks.day).toBe(true);
    expect(r.campaigns[0].checks.hour).toBe(false);
    expect(r.campaigns[0].name).toBe("קמפיין");
    const many = parseExplain(found({}, { campaigns: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, checks: {} })) }));
    expect(many.campaigns).toHaveLength(20);
  });
});

describe("times by Israel", () => {
  it("today / tomorrow / a date", () => {
    expect(ilWhen("2026-10-13T15:05:00Z", NOW)).toBe("היום ב-18:05");
    expect(ilWhen("2026-10-13T21:30:00Z", NOW)).toBe("מחר ב-00:30");
    expect(ilWhen("2026-10-20T06:00:00Z", NOW)).toBe("20.10 ב-09:00");
    expect(ilDow(NOW)).toBe(2);
    expect(ilDow(new Date("2026-10-17T21:30:00Z"))).toBe(0); // מוצאי שבת 00:30 — כבר ראשון
  });
});
