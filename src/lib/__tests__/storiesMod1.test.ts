// MOD-1 (bloc MG-S1211) — תור המיתון של הסטורי: סינון לפי סיבה / בניין / גיל, "הישנים קודם" (שגם טוען את הישנים), ויעד לבדיקה
// (SLA) לפי הסיבה החמורה בפריט, מהדיווח הפתוח הראשון.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("use the injected db"); } } }));
import {
  STORY_SLA_HOURS, filterStoryGroups, storiesHref, storyBuildings, storyFilterOf, storyLoadOrder, storySla, type StoryReportGroup,
} from "../storiesPanel";
import { loadStoriesQueue } from "../storiesServer";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const B1 = "11111111-1111-4111-8111-111111111111", B2 = "22222222-2222-4222-8222-222222222222";
const g = (key: string, o: Partial<StoryReportGroup>): StoryReportGroup => ({
  key, building_id: B1, building: "השקד 104", source: "market", source_id: key, item: { title: key, text: null, photo: null, gone: false },
  count: 1, reasons: [{ reason: "spam", label: "ספאם או פרסום", count: 1 }], first: "2026-11-22T10:00:00Z", last: "2026-11-22T10:00:00Z", ...o,
});
const A = g("a", { count: 3, first: "2026-11-21T08:00:00Z", last: "2026-11-22T11:00:00Z", reasons: [{ reason: "offensive", label: "פוגעני או לא ראוי", count: 3 }] });
const Bx = g("b", { building_id: B2, building: "הרצל 12", first: "2026-11-18T08:00:00Z", last: "2026-11-18T08:00:00Z", reasons: [{ reason: "private", label: "חושף מידע אישי", count: 1 }] });
const C = g("c", { count: 2, first: "2026-11-22T11:30:00Z", last: "2026-11-22T11:50:00Z" });

describe("the filter in the address", () => {
  it("defaults as before (the most reports, everything); only known values; links write only what differs", () => {
    const d = storyFilterOf({});
    expect(d).toEqual({ sort: "count", reason: null, building: null, age: "all" });
    expect(storiesHref(d)).toBe("/stories");
    expect(storyFilterOf({ sort: "oldest", reason: "private", building: B2.toUpperCase(), age: "days3" })).toEqual({ sort: "oldest", reason: "private", building: B2, age: "days3" });
    expect(storyFilterOf({ sort: "x", reason: "y", building: "z", age: "w" })).toEqual(d);
    expect(storiesHref(d, { sort: "oldest", age: "day" })).toBe("/stories?sort=oldest&age=day");
    expect(storyLoadOrder({ ...d, sort: "oldest" })).toBe("oldest");
    expect(storyLoadOrder({ ...d, sort: "newest" })).toBe("newest");
    expect(storyLoadOrder(d)).toBe("newest");
    // a filter by age loads the oldest too — otherwise "waiting more than 3 days" would look at the newest 300 (review #4)
    expect(storyLoadOrder({ ...d, age: "days3" })).toBe("oldest");
    expect(storyLoadOrder({ ...d, age: "day", sort: "newest" })).toBe("oldest");
  });
});

describe("filtering and order", () => {
  const all = [A, Bx, C];
  it("by reason, building, age (the first open report); the three orders", () => {
    const f = storyFilterOf({});
    expect(filterStoryGroups(all, f, NOW).map((x) => x.key)).toEqual(["a", "c", "b"]);
    expect(filterStoryGroups(all, { ...f, sort: "oldest" }, NOW).map((x) => x.key)).toEqual(["b", "a", "c"]);
    expect(filterStoryGroups(all, { ...f, sort: "newest" }, NOW).map((x) => x.key)).toEqual(["c", "a", "b"]);
    // "the oldest first" — by the first report (waiting the longest), not by the last one
    const D = g("d", { first: "2026-11-20T08:00:00Z", last: "2026-11-22T11:55:00Z" });
    expect(filterStoryGroups([A, D], { ...f, sort: "oldest" }, NOW).map((x) => x.key)).toEqual(["d", "a"]);
    expect(filterStoryGroups(all, { ...f, reason: "private" }, NOW).map((x) => x.key)).toEqual(["b"]);
    expect(filterStoryGroups(all, { ...f, building: B1 }, NOW).map((x) => x.key)).toEqual(["a", "c"]);
    expect(filterStoryGroups(all, { ...f, age: "day" }, NOW).map((x) => x.key)).toEqual(["a", "b"]);
    expect(filterStoryGroups(all, { ...f, age: "days3" }, NOW).map((x) => x.key)).toEqual(["b"]);
    expect(filterStoryGroups(all, { ...f, reason: "wrong" }, NOW)).toEqual([]);
  });
  it("the buildings to filter by — the most reports first", () => {
    expect(storyBuildings(all)).toEqual([{ id: B1, name: "השקד 104", count: 5 }, { id: B2, name: "הרצל 12", count: 1 }]);
  });
});

describe("the review target", () => {
  it("by the most serious reason in the item, from its first open report", () => {
    expect(STORY_SLA_HOURS).toEqual({ private: 12, offensive: 24, spam: 72, wrong: 72, other: 72 });
    expect(storySla(A, NOW)).toEqual({ level: "late", text: "באיחור של 4 שעות" });
    expect(storySla(Bx, NOW)).toEqual({ level: "late", text: "באיחור של 3 ימים" });
    expect(storySla(C, NOW)).toEqual({ level: "ok", text: "נשארו יומיים" });
    expect(storySla(g("d", { reasons: [{ reason: "spam", label: "", count: 1 }, { reason: "private", label: "", count: 1 }], first: "2026-11-22T05:00:00Z" }), NOW))
      .toEqual({ level: "soon", text: "נשארו 5 שעות" });
    expect(storySla(g("e", { reasons: [] }), NOW)).toBeNull();
  });
});

describe("the loader", () => {
  it('"oldest first" loads the 300 oldest; otherwise the newest, as before', async () => {
    const orders: Array<{ table: string; col: string; ascending: unknown }> = [];
    const db = {
      from(table: string) {
        const q: Record<string, unknown> = {};
        Object.assign(q, {
          select: () => q, eq: () => q, limit: () => q, in: () => q, or: () => q, maybeSingle: () => q,
          order: (col: string, o?: { ascending?: boolean }) => { orders.push({ table, col, ascending: o?.ascending }); return q; },
          then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(r),
        });
        return q;
      },
    };
    const a = await loadStoriesQueue(db as never, null, "oldest");
    expect(orders.find((o) => o.table === "story_reports")).toEqual({ table: "story_reports", col: "created_at", ascending: true });
    expect(a.state === "ok" && a.order).toBe("oldest");
    orders.length = 0;
    const b = await loadStoriesQueue(db as never, null);
    expect(orders.find((o) => o.table === "story_reports")?.ascending).toBe(false);
    expect(b.state === "ok" && b.order).toBe("newest");
  });
});
