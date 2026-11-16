// "למה המשתמש הזה לא רואה פרסומת?" (bloc ADS-1b): התשובה של bloc נבדקת ונהפכת למשפטים — כל הכרעה, כל מה
// שעוצר לפני הקמפיינים, ולכל קמפיין מה לא מתאים (עם היום / המסלול / המסך עצמם). ומה שהשרת לא רואה — כטיפ.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseExplain, explainView, formatsOf, ilWhen, ilDow, AD_CHECKS, CHECK_FAIL } from "../adsExplain";

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
    expect(v.campaigns).toEqual([{ id: "c1", name: "bloc", advertiser: "bloc", eligible: false, formats: [], failed: ["המסך הזה לא נבחר (מסך הבית)"] }]);
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

// ── ADS-2א (החלטות 376, 378): לכל slot כללי תדירות משלו — ההכרעות במילים של ה-slot; תשובה ל-slot אחר נאמרת ──
describe("ADS-2א — the slot", () => {
  const at = (slot: "full" | "banner" | "inline", verdict: string, until: string | null = null, o: Record<string, unknown> = {}) =>
    explainView(parseExplain(found({ slot, ...o }, { verdict, until, campaigns: [] })), NOW, slot);
  it("bloc echoes the slot it checked (like screen); missing / unknown → null", () => {
    expect(parseExplain(found({ slot: "banner" })).slot).toBe("banner");
    expect(parseExplain(found({ slot: "inline" })).slot).toBe("inline");
    expect(parseExplain(found({ slot: "popup" })).slot).toBeNull();
    expect(parseExplain(found()).slot).toBeNull();
  });
  it("full: today's sentences, word for word", () => {
    expect(at("full", "capped", "2026-10-13T21:00:00Z")!.verdict).toEqual({ tone: "wait", text: "כבר ראה פרסומת היום. הבאה מחר ב-00:00." });
    expect(at("full", "gap", "2026-10-13T18:00:00Z")!.verdict!.text).toBe("ראה פרסומת לפני פחות מ-6 שעות. הבאה היום ב-21:00.");
    expect(at("full", "ad")!.verdict!.text).toBe("יקבל פרסומת בכניסה הבאה במסך הבית.");
  });
  it("banner: 4 a day, 30 minutes apart — said with a banner's words (masculine)", () => {
    expect(at("banner", "capped", "2026-10-13T21:00:00Z")!.verdict).toEqual({ tone: "wait", text: "כבר ראה היום 4 פסים, המרבי ליום. הבא מחר ב-00:00." });
    expect(at("banner", "capped")!.verdict!.text).toBe("כבר ראה היום 4 פסים, המרבי ליום. הבא מחר.");
    expect(at("banner", "gap", "2026-10-13T14:05:00Z")!.verdict!.text).toBe("ראה פס לפני פחות מ-30 דקות. הבא היום ב-17:05.");
    expect(at("banner", "gap")!.verdict!.text).toBe("ראה פס לפני פחות מ-30 דקות. הבא בעוד כמה דקות.");
    expect(at("banner", "ad")!.verdict!.text).toBe("יקבל פס ממומן בכניסה הבאה במסך הבית.");
    expect(at("banner", "ad", null, { blockers: ["not_approved"] })!.verdict!.text).toBe("לפי הקמפיינים היה לו פס ממומן במסך הבית, אבל מה שלמעלה עוצר אותו.");
    expect(at("banner", "none")!.verdict!.text).toBe("אין קמפיין של פס שמתאים לו עכשיו במסך הבית. למטה: מה לא מתאים בכל קמפיין.");
  });
  it("inline: 3 a day, 10 minutes apart", () => {
    expect(at("inline", "capped", "2026-10-13T21:00:00Z")!.verdict!.text).toBe("כבר ראה היום 3 פרסומות ברשימה, המרבי ליום. הבאה מחר ב-00:00.");
    expect(at("inline", "gap")!.verdict!.text).toBe("ראה פרסומת ברשימה לפני פחות מ-10 דקות. הבאה בעוד כמה דקות.");
    expect(at("inline", "ad", null, { screen: "market" })!.verdict!.text).toBe("יקבל פרסומת ברשימה בכניסה הבאה בלוח הקהילתי.");
    expect(at("inline", "ad", null, { blockers: ["urgent"] })!.verdict!.text).toBe("לפי הקמפיינים הייתה לו פרסומת ברשימה במסך הבית, אבל מה שלמעלה עוצר אותה.");
    expect(at("inline", "none")!.verdict!.text).toBe("אין קמפיין ברשימה שמתאים לו עכשיו במסך הבית. למטה: מה לא מתאים בכל קמפיין.");
  });
  it("asked about a banner, bloc answered for another slot — said, never shown as the banner's answer", () => {
    const v = explainView(parseExplain(found({ slot: "full" }, { verdict: "capped", campaigns: [] })), NOW, "banner");
    expect(v.notes[0]).toBe("התשובה של bloc היא ל\"מעל המסך\", לא ל\"פס\" — הגרסה של bloc עוד לא בודקת לפי סוג הפרסומת.");
    expect(v.verdict!.text).toBe("כבר ראה פרסומת היום. הבאה מחר.");   // the words of the slot bloc checked
  });
  it("asked about inline, bloc did not say which slot — the note; asked about full without an echo — nothing (as before)", () => {
    const v = explainView(parseExplain(found({}, { verdict: "none", campaigns: [] })), NOW, "inline");
    expect(v.notes[0]).toBe("bloc לא אמר לאיזה סוג פרסומת התשובה — ייתכן שהיא ל\"מעל המסך\" ולא ל\"ברשימה\".");
    expect(v.verdict!.text).toContain("אין קמפיין ברשימה");
    expect(explainView(parseExplain(found()), NOW, "full").notes).toEqual([]);
    expect(explainView(parseExplain(found({ slot: "banner" })), NOW, "banner").notes).toEqual([]);
  });
  it("the phone's side per slot: banner and inline — the visibility rule; the cache tip always", () => {
    const b = at("banner", "none").tips.join(" ");
    expect(b).toContain("חצי ממנו היה על המסך שנייה רצופה");
    expect(b).toContain("ניקוי מטמון");
    expect(b).not.toContain("2.5 שניות");
    expect(at("inline", "none").tips.join(" ")).toContain("אחרי הפריט השלישי");
    expect(at("full", "none").tips.join(" ")).toContain("2.5 שניות");
  });
  it("a campaign's formats (an array — the formats of its active ads): gallery order, no repeats, junk dropped; [] / missing → []", () => {
    const r = parseExplain(found({}, { campaigns: [
      { id: "c1", formats: ["carousel", "card", "popup", "card"], checks: {} },
      { id: "c2", formats: [], checks: {} },
      { id: "c3", checks: {} },
      { id: "c4", formats: "card", checks: {} },
    ] }));
    expect(r.campaigns.map((c) => c.formats)).toEqual([["card", "carousel"], [], [], []]);
    expect(explainView(r, NOW).campaigns.map((c) => c.formats)).toEqual([["card", "carousel"], [], [], []]);
    expect(formatsOf(["story", "dialog", "native"])).toEqual(["dialog", "story", "native"]);
    expect(formatsOf(null)).toEqual([]);
  });
});

// ── the cross-shape check (review ADS-2א #1): the answer bloc REALLY sends — slot at the top, formats (an array) per campaign ──
// bloc writes its exact answer to the file below; when it is there it is checked like the inline copy (the same shape), so a
// drift on either side turns this red instead of both sides passing against a made-up shape.
const BLOC_EXPLAIN_FILE = process.env.BLOC_EXPLAIN_ANSWER
  ?? "/tmp/claude-0/-home-claude/f63d5d2b-c1fd-5ee7-b9a5-b2b8ad17ea67/scratchpad/panelpay/ads2a_contract/explain_answer.json";
const INLINE_BLOC_ANSWER = {
  found: true, ambiguous: false, slot: "banner", screen: "home",
  person: { name: "טל", createdAt: "2026-06-01T08:00:00Z", management: false },
  building: { id: "b1", name: "יהואלה 4", city: "חולון" },
  role: "tenant", plan: "building", urgentUntil: null, blockers: [], sqlMissing: false,
  db: {
    verdict: "none", until: null, shownToday: 0, lastShownAt: null, now: "2026-10-13T13:40:00Z",
    campaigns: [
      { id: "c1", name: "פיצה סתיו", advertiser: "פיצה השכונה", status: "active", eligible: false, checks: { ...ALL_OK, hour: false }, formats: ["banner"] },
      { id: "c2", name: "יוגה בבוקר", advertiser: "סטודיו יוגה", status: "active", eligible: false, checks: { ...ALL_OK, creative: false }, formats: [] },
    ],
  },
};
function checkBlocAnswer(raw: unknown) {
  const r = raw as Record<string, unknown>;
  const p = parseExplain(raw);
  expect(typeof r.found).toBe("boolean");
  if (!p.found || p.ambiguous) return;
  expect(["full", "banner", "inline"]).toContain(r.slot);       // the slot bloc checked — always there now
  expect(p.slot).toBe(r.slot);
  const db = (r.db ?? {}) as Record<string, unknown>;
  const raws = (Array.isArray(db.campaigns) ? db.campaigns : []) as Array<Record<string, unknown>>;
  expect(p.campaigns).toHaveLength(Math.min(raws.length, 20));
  raws.slice(0, 20).forEach((c, i) => {
    expect(Array.isArray(c.formats), `campaign ${i}: formats is an array`).toBe(true);
    const fs = c.formats as unknown[];
    expect(formatsOf(fs), `campaign ${i}: every format is one the panel knows`).toHaveLength(new Set(fs).size);
    expect(p.campaigns[i].formats).toEqual(formatsOf(fs));
    // a check bloc does not send would be shown as "failed" — every one of the panel's checks must be there, true or false
    const ck = (c.checks ?? {}) as Record<string, unknown>;
    for (const k of AD_CHECKS) expect(typeof ck[k], `campaign ${i}: check ${k}`).toBe("boolean");
  });
  const v = explainView(p, NOW, p.slot!);
  expect(v.notes.join(" ")).not.toMatch(/bloc לא אמר לאיזה סוג|התשובה של bloc היא ל/);   // no false caveat
}
describe("bloc's explain answer — the shape bloc sends (cross-shape)", () => {
  it("the inline copy: slot at the top, formats per campaign, every check present", () => {
    checkBlocAnswer(INLINE_BLOC_ANSWER);
    const p = parseExplain(INLINE_BLOC_ANSWER);
    expect(p.campaigns.map((c) => c.formats)).toEqual([["banner"], []]);
  });
  it("bloc's own file, when it exists (an answer or a list of answers)", () => {
    if (!existsSync(BLOC_EXPLAIN_FILE)) return;
    const j: unknown = JSON.parse(readFileSync(BLOC_EXPLAIN_FILE, "utf8"));
    for (const one of Array.isArray(j) ? j : [j]) checkBlocAnswer(one);
  });
});
