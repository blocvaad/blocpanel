import { describe, it, expect } from "vitest";
import { countdown, ilEndOfDay, ilDate, extendOptions, riskRows, notificationLink } from "../committee";

describe("committee — time (Israel)", () => {
  it("end of day in Israel, summer (UTC+3) and winter (UTC+2)", () => {
    expect(ilEndOfDay(new Date("2026-09-28T10:00:00Z")).toISOString()).toBe("2026-09-28T20:59:59.000Z");
    expect(ilEndOfDay(new Date("2026-12-01T10:00:00Z"), 2).toISOString()).toBe("2026-12-03T21:59:59.000Z");
    // 23:30 UTC on 28/09 is already 29/09 in Israel
    expect(ilDate(ilEndOfDay(new Date("2026-09-28T23:30:00Z")).toISOString())).toBe("29/09/2026");
  });
  it("countdown", () => {
    const now = Date.parse("2026-09-28T12:00:00Z");
    expect(countdown("2026-09-30T17:00:00Z", now)).toMatchObject({ text: "בעוד 2 ימים ו-5 שעות", due: false, urgent: false });
    expect(countdown("2026-09-28T13:00:00Z", now)).toMatchObject({ text: "בעוד שעה", urgent: true });
    expect(countdown("2026-09-28T11:00:00Z", now)).toMatchObject({ due: true });
  });
  it("extension options: +3/+7/+14 from the current deadline, never beyond 30 days from the handover", () => {
    const now = Date.parse("2026-09-28T12:00:00Z");
    const o = extendOptions({ executedAt: "2026-09-28T09:00:00Z", deadline: "2026-10-05T20:59:59Z", now });
    expect(o.map((x) => x.days)).toEqual([3, 7, 14]);
    expect(ilDate(o[0].until)).toBe("08/10/2026");
    const late = extendOptions({ executedAt: "2026-09-06T09:00:00Z", deadline: "2026-10-05T20:59:59Z", now });
    expect(late.map((x) => x.days)).toEqual([]);           // 05/10 + 3 = 08/10 > 06/09 + 30 = 06/10
    const lapsed = extendOptions({ executedAt: "2026-09-20T09:00:00Z", deadline: "2026-09-27T20:59:59Z", now });
    expect(ilDate(lapsed[0].until)).toBe("01/10/2026");      // deadline passed → counted from today
  });
});

describe("committee — risk", () => {
  it("orphan (no active committee but residents) and sole committee without an active deputy", () => {
    const rows = riskRows({
      buildings: [
        { id: "a", name: "א", founder_id: null }, { id: "b", name: "ב", founder_id: "h" },
        { id: "c", name: "ג", founder_id: "h2" }, { id: "d", name: "ד", founder_id: "h3" },
        { id: "e", name: "ה", founder_id: null }, { id: "f", name: "ו", founder_id: null, is_archived: true },
      ],
      admins: [{ building_id: "b", user_id: "h" }, { building_id: "c", user_id: "h2" }, { building_id: "d", user_id: "h3" }, { building_id: "d", user_id: "x" }],
      deputies: [{ building_id: "c", user_id: "dd", status: "active" }, { building_id: "b", user_id: "p", status: "pending" }],
      members: [{ building_id: "a" }, { building_id: "a" }, { building_id: "b" }, { building_id: "f" }],
    });
    expect(rows.map((r) => [r.id, r.level])).toEqual([["a", "orphan"], ["b", "single_no_deputy"]]);
    expect(rows[0].members).toBe(2);
  });
});

describe("committee — panel notification links", () => {
  it("committee alerts open the committee screen; buildings open /buildings/<id>", () => {
    expect(notificationLink({ type: "committee_succession_disputed", entity_type: "building", entity_id: "b1" })).toBe("/committee?building=b1");
    expect(notificationLink({ type: "new_building", entity_type: "building", entity_id: "b1" })).toBe("/buildings/b1");
    expect(notificationLink({ type: "x", entity_type: "tickets", entity_id: "t1" })).toBe("/tickets/t1");
    expect(notificationLink({ type: "x", entity_type: null, entity_id: null })).toBeNull();
  });
});
