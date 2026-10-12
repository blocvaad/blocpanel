// הודעות לבניינים (bloc UI-R5a) — lib/broadcasts: עדיפויות, "כמה זמן תוצג", וקיבוץ השורות לשידורים.
import { describe, it, expect } from "vitest";
import {
  PRIORITIES, priorityOf, priorityLabel, DURATIONS, DEFAULT_DURATION, MAX_DAYS,
  expiryFor, expiryProblem, expiryText, isDateKey, ilTodayKey, addDaysKey, hasBlanks,
  panelKeyParts, groupBroadcasts, completeGroups, LEGACY_GAP_MS, buildingsText, inBuildingsText, expiryShort, sendOutcomeText, readersText, type BroadcastRow,
} from "../broadcasts";

const DAY = 86_400_000;
const NOW = new Date("2026-10-12T09:00:00.000Z"); // 12:00 בישראל
const BID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const B = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, "0")}`;

describe("priorities — the app's words, not the old inverted labels", () => {
  it("urgent / high / normal / low = דחוף / חשוב / רגיל / לידיעה", () => {
    expect(PRIORITIES.map((p) => [p.key, p.label])).toEqual([["urgent", "דחוף"], ["high", "חשוב"], ["normal", "רגיל"], ["low", "לידיעה"]]);
    expect(priorityLabel("low")).toBe("לידיעה");
    expect(priorityLabel("normal")).toBe("רגיל");
  });
  it("anything else is normal", () => {
    expect(priorityOf("x")).toBe("normal");
    expect(priorityOf(null)).toBe("normal");
  });
  it("no emoji and no middle dots in what the screen shows", () => {
    const text = JSON.stringify([PRIORITIES, DURATIONS]);
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)).toBe(false);
    expect(text.includes("·")).toBe(false);
  });
});

describe("how long it shows", () => {
  it("default is a week, not permanent", () => {
    expect(DEFAULT_DURATION).toBe("1w");
    expect(expiryFor("1w", null, NOW)).toBe(new Date(NOW.getTime() + 7 * DAY).toISOString());
    expect(expiryFor("1d", null, NOW)).toBe(new Date(NOW.getTime() + DAY).toISOString());
    expect(expiryFor("2w", null, NOW)).toBe(new Date(NOW.getTime() + 14 * DAY).toISOString());
    expect(expiryFor("1m", null, NOW)).toBe(new Date(NOW.getTime() + 30 * DAY).toISOString());
  });
  it("no end date — null", () => {
    expect(expiryFor("none", null, NOW)).toBeNull();
  });
  it("until a date — 23:59 in Israel that day (summer and winter)", () => {
    expect(expiryFor("date", "2026-10-20", NOW)).toBe("2026-10-20T20:59:59.000Z"); // IDT (+3)
    expect(expiryFor("date", "2026-12-01", NOW)).toBe("2026-12-01T21:59:59.000Z"); // IST (+2)
    expect(expiryFor("date", "2026-10-12", NOW)).toBe("2026-10-12T20:59:59.000Z"); // today counts
  });
  it("a bad / past / too far date — undefined", () => {
    expect(expiryFor("date", "2026-10-11", NOW)).toBeUndefined();
    expect(expiryFor("date", "2026-02-31", NOW)).toBeUndefined();
    expect(expiryFor("date", "", NOW)).toBeUndefined();
    expect(expiryFor("date", addDaysKey("2026-10-12", MAX_DAYS + 2), NOW)).toBeUndefined();
    expect(expiryFor("date", addDaysKey("2026-10-12", MAX_DAYS), NOW)).toBeTypeOf("string");
  });
  it("expiryProblem — Hebrew; null when fine", () => {
    expect(expiryProblem(null, NOW)).toBeNull();
    expect(expiryProblem(new Date(NOW.getTime() + DAY).toISOString(), NOW)).toBeNull();
    expect(expiryProblem(new Date(NOW.getTime() - 1).toISOString(), NOW)).toBe("תאריך הסיום כבר עבר");
    expect(expiryProblem(NOW.toISOString(), NOW)).toBe("תאריך הסיום כבר עבר"); // בדיוק עכשיו — כבר עבר
    expect(expiryProblem(new Date(NOW.getTime() + 400 * DAY).toISOString(), NOW)).toContain("365");
    expect(expiryProblem("nope", NOW)).toBe("תאריך הסיום לא תקין");
  });
  it("expiryText", () => {
    expect(expiryText(null, NOW)).toBe("בלי תאריך סיום");
    expect(expiryText("2026-10-20T20:59:59.000Z", NOW)).toBe("בתוקף עד 20/10/2026 23:59");
    expect(expiryText("2026-10-12T08:00:00.000Z", NOW)).toBe("הסתיימה ב-12/10/2026 11:00");
  });
  it("date keys", () => {
    expect(isDateKey("2026-10-12")).toBe(true);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("12/10/2026")).toBe(false);
    expect(ilTodayKey(new Date("2026-10-12T22:30:00.000Z"))).toBe("2026-10-13"); // כבר אחרי חצות בישראל
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("blanks", () => {
    expect(hasBlanks("ביום ___", "")).toBe(true);
    expect(hasBlanks("ביום ראשון", "בשעה 10")).toBe(false);
  });
  it("expiryShort — for the card's field", () => {
    expect(expiryShort(null, NOW)).toBe("בלי תאריך סיום");
    expect(expiryShort("2026-10-20T20:59:59.000Z", NOW)).toBe("עד 20/10/2026 23:59");
    expect(expiryShort("2026-10-12T08:00:00.000Z", NOW)).toBe("הסתיימה 12/10/2026 11:00");
  });
  it("after sending — one / many, failed, remaining, skipped (no \"ל-בניין\")", () => {
    const base = { title: "עדכון", delivered: 6, failed: 0, remaining: 0, skipped: 0 };
    expect(sendOutcomeText(base)).toBe('"עדכון" נשלחה ל-6 בניינים.');
    expect(sendOutcomeText({ ...base, delivered: 1 })).toBe('"עדכון" נשלחה לבניין אחד.');
    expect(sendOutcomeText({ ...base, failed: 1 })).toBe('"עדכון" נשלחה ל-6 בניינים. לא הגיעה לבניין אחד.');
    expect(sendOutcomeText({ ...base, delivered: 0, failed: 3 })).toBe('"עדכון" עוד לא נשלחה. לא הגיעה ל-3 בניינים.');
    expect(sendOutcomeText({ ...base, remaining: 1 })).toContain("נשאר בניין אחד");
    expect(sendOutcomeText({ ...base, remaining: 4 })).toContain("נשארו 4 בניינים");
    expect(sendOutcomeText({ ...base, skipped: 1 })).toContain("בניין אחד שנבחר מושעה או בארכיון, ולא קיבל אותה.");
    expect(sendOutcomeText({ ...base, skipped: 2 })).toContain("2 בניינים שנבחרו מושעים או בארכיון, ולא קיבלו אותה.");
    expect(sendOutcomeText({ ...base, failed: 1 })).not.toContain("ל-בניין");
  });
  it("readers — one / many / none, out of the residents (not \"מתוך 1 דיירים\")", () => {
    expect(readersText(143, 212, false)).toBe("143 מתוך 212 דיירים ראו");
    expect(readersText(1, 30, true)).toBe("דייר אחד מתוך 30 אישר");
    expect(readersText(0, 30, false)).toBe("עוד אף דייר לא ראה (מתוך 30)");
    expect(readersText(5, null, true)).toBe("5 דיירים אישרו");
    expect(readersText(1, null, false)).toBe("דייר אחד ראה");
    expect(readersText(9, 6, false)).toBe("9 דיירים ראו"); // ראו יותר מהדיירים היום — בלי "מתוך"
    expect(readersText(1, 1, false)).toBe("דייר אחד מתוך 1 ראה");
  });
  it("counting words", () => {
    expect(buildingsText(1)).toBe("לבניין אחד");
    expect(buildingsText(3)).toBe("ל-3 בניינים");
    expect(inBuildingsText(1)).toBe("בבניין אחד");
    expect(inBuildingsText(4)).toBe("ב-4 בניינים");
  });
});

const row = (o: Partial<BroadcastRow> & { id: string }): BroadcastRow => ({
  building_id: B(1), title: "עדכון", priority: "normal", is_pinned: false, requires_ack: false,
  expires_at: null, created_at: "2026-10-10T10:00:00+00:00", dedupe_key: null, ...o,
});

describe("grouping rows into broadcasts", () => {
  it("panelKeyParts", () => {
    expect(panelKeyParts(`panel:${BID}:${B(1)}`)).toEqual({ broadcastId: BID, buildingId: B(1) });
    expect(panelKeyParts(`company:${BID}:${B(1)}`)).toBeNull();
    expect(panelKeyParts("panel:x:y")).toBeNull();
    expect(panelKeyParts(null)).toBeNull();
  });

  it("new broadcasts — by the id in dedupe_key; state, end date and per-building", () => {
    const now = new Date("2026-10-12T00:00:00Z").getTime();
    const g = groupBroadcasts([
      row({ id: "a1", building_id: B(1), dedupe_key: `panel:${BID}:${B(1)}`, expires_at: "2026-10-17T10:00:00+00:00", requires_ack: true, is_pinned: true, priority: "urgent" }),
      row({ id: "a2", building_id: B(2), dedupe_key: `panel:${BID}:${B(2)}`, expires_at: "2026-10-11T10:00:00+00:00" }),
      row({ id: "a3", building_id: B(1), dedupe_key: `panel:${OTHER}:${B(1)}`, title: "אחר", created_at: "2026-10-11T10:00:00+00:00" }),
    ], now);
    expect(g.map((x) => x.key)).toEqual([`panel:${OTHER}`, `panel:${BID}`]);
    const main = g[1];
    expect(main).toMatchObject({
      broadcastId: BID, legacy: false, ids: ["a1", "a2"], buildingIds: [B(1), B(2)], total: 2, active: 1, state: "partial",
      expiresAt: "2026-10-17T10:00:00+00:00", priority: "urgent", requiresAck: true, isPinned: true, rep: "a1",
    });
    expect(main.activeByBuilding).toEqual({ [B(1)]: true, [B(2)]: false });
    expect(g[0]).toMatchObject({ state: "active", expiresAt: null });
  });

  it("one building without an end date (edited there) — the broadcast shows as \"no end date\"", () => {
    const now = new Date("2026-10-12T00:00:00Z").getTime();
    const [g] = groupBroadcasts([
      row({ id: "a1", dedupe_key: `panel:${BID}:${B(1)}`, expires_at: "2026-10-20T10:00:00+00:00" }),
      row({ id: "a2", building_id: B(2), dedupe_key: `panel:${BID}:${B(2)}`, expires_at: null }),
    ], now);
    expect(g).toMatchObject({ state: "active", expiresAt: null });
  });

  it("an ended broadcast keeps the time it ended", () => {
    const now = new Date("2026-10-12T00:00:00Z").getTime();
    const [g] = groupBroadcasts([
      row({ id: "a1", dedupe_key: `panel:${BID}:${B(1)}`, expires_at: "2026-10-11T08:00:00+00:00" }),
      row({ id: "a2", building_id: B(2), dedupe_key: `panel:${BID}:${B(2)}`, expires_at: "2026-10-11T09:00:00+00:00" }),
    ], now);
    expect(g).toMatchObject({ state: "ended", active: 0, expiresAt: "2026-10-11T09:00:00+00:00" });
  });

  it("old broadcasts (no dedupe_key) — same title / priority / end, sent in a row; a gap or a change starts a new one", () => {
    const t = (min: number) => new Date(Date.parse("2026-09-21T10:00:00Z") + min * 60_000).toISOString();
    const g = groupBroadcasts([
      row({ id: "l1", building_id: B(1), created_at: t(0) }),
      row({ id: "l2", building_id: B(2), created_at: t(2) }),
      row({ id: "l3", building_id: B(3), created_at: t(2 + LEGACY_GAP_MS / 60_000) }),         // עדיין ברצף (בדיוק 15 דקות)
      row({ id: "l4", building_id: B(1), created_at: t(60) }),                                  // אחרי פער — שידור אחר
      row({ id: "l5", building_id: B(2), created_at: t(1), priority: "urgent" }),               // עדיפות אחרת — אחר
      row({ id: "c1", building_id: B(1), created_at: t(1), dedupe_key: `company:${BID}:${B(1)}` }), // לא של הפאנל
    ], Date.parse("2026-10-12T00:00:00Z"));
    const legacy = g.filter((x) => x.legacy);
    expect(legacy.map((x) => [x.key, x.ids])).toEqual([
      ["legacy:l4", ["l4"]],
      ["legacy:l5", ["l5"]],
      ["legacy:l1", ["l1", "l2", "l3"]],
    ]);
    expect(g.find((x) => x.ids.includes("c1"))).toBeUndefined();
    expect(legacy[2]).toMatchObject({ broadcastId: null, state: "active", total: 3 });
  });

  it("a cut read — broadcasts near the cut (maybe partial) are dropped; nothing cut — all stay", () => {
    const g = groupBroadcasts([
      row({ id: "n1", dedupe_key: `panel:${BID}:${B(1)}`, created_at: "2026-10-10T10:00:00Z" }),
      row({ id: "o1", dedupe_key: `panel:${OTHER}:${B(1)}`, created_at: "2026-10-01T10:30:00Z" }),
    ]);
    expect(completeGroups(g, "2026-10-01T10:00:00Z", 3_600_000).map((x) => x.broadcastId)).toEqual([BID]);
    expect(completeGroups(g, null, 3_600_000)).toHaveLength(2);
  });

  it("microsecond timestamps from PostgREST sort by time, not as strings", () => {
    const g = groupBroadcasts([
      row({ id: "x1", dedupe_key: `panel:${BID}:${B(1)}`, created_at: "2026-10-10T10:00:00+00:00" }),
      row({ id: "x2", dedupe_key: `panel:${OTHER}:${B(1)}`, created_at: "2026-10-10T10:00:00.5+00:00" }),
    ]);
    expect(g.map((x) => x.broadcastId)).toEqual([OTHER, BID]);
  });
});
