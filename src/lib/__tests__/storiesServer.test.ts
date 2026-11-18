// STORIES-1 (bloc, החלטות 439, 441) — lib/storiesServer: מה הפאנל קורא. מי דיווח — לא נקרא בכלל (גם לא נבחר בשאילתה);
// כמה פתוחים בסך הכול (כשמוצגים רק 300); המוסתרים — עם סימן כשנחתכו; לפני SQL 235 — missing; כשל — error (לא רשימה ריקה).
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("use the injected db"); } } }));
import { loadStoriesQueue } from "../storiesServer";

const B = "11111111-1111-4111-8111-111111111111", S1 = "22222222-2222-4222-8222-222222222222", R1 = "33333333-3333-4333-8333-333333333333";
type Call = { table: string; cols: string; opts?: Record<string, unknown> };
function fakeDb(answers: Record<string, unknown>, calls: Call[]) {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {};
      let cols = "", opts: Record<string, unknown> | undefined;
      const res = () => {
        const key = opts?.head ? `${table}#count` : table;
        const a = answers[key] as { data?: unknown; error?: unknown; count?: number } | undefined;
        return Promise.resolve({ data: a?.data ?? [], error: a?.error ?? null, count: a?.count ?? null });
      };
      Object.assign(q, {
        select(c: string, o?: Record<string, unknown>) { cols = c; opts = o; calls.push({ table, cols: c, opts: o }); return q; },
        eq() { return q; }, order() { return q; }, limit() { return q; }, in() { return q; },
        then(r: (v: unknown) => unknown, j?: (e: unknown) => unknown) { return res().then(r, j); },
      });
      return q;
    },
  };
}

describe("lib/storiesServer — what the panel reads", () => {
  it("never selects who reported; counts the open reports; the photo only from the poster folder", async () => {
    const calls: Call[] = [];
    const SUPA = "https://proj.supabase.co", U = "abcdef12-3456-4789-8abc-def123456789";
    const db = fakeDb({
      story_reports: { data: [{ id: R1, building_id: B, source: "market", source_id: S1, reason: "spam", created_at: "2026-11-18T08:00:00Z" }] },
      "story_reports#count": { count: 412 },
      story_hidden: { data: [] }, story_pilot_buildings: { data: [] },
      marketplace_items: { data: [{ id: S1, building_id: B, title: "ספה", user_id: U, media_url: `${SUPA}/storage/v1/object/public/chat_uploads/${U}/market_1.jpg` }] },
      buildings: { data: [{ id: B, name: "השקד 104" }] },
    }, calls);
    const r = await loadStoriesQueue(db as never, SUPA);
    for (const c of calls) expect(c.cols, c.table).not.toMatch(/reporter/);
    expect(calls.find((c) => c.table === "story_reports" && !c.opts)!.cols).toBe("id, building_id, source, source_id, reason, created_at");
    expect(r.state).toBe("ok");
    if (r.state !== "ok") return;
    expect(r.openTotal).toBe(412);
    expect(r.hiddenTruncated).toBe(false);
    expect(r.reports[0].item.photo).toBe(`${SUPA}/storage/v1/object/public/chat_uploads/${U}/market_1.jpg`);
    expect(r.reports[0].building).toBe("השקד 104");
  });
  it("before SQL 235 — missing; a failed read — error, never an empty queue", async () => {
    const missing = await loadStoriesQueue(fakeDb({ story_reports: { error: { code: "42P01", message: "relation does not exist" } } }, []) as never, null);
    expect(missing.state).toBe("missing");
    const failed = await loadStoriesQueue(fakeDb({ story_hidden: { error: { code: "XX000", message: "boom" } } }, []) as never, null);
    expect(failed.state).toBe("error");
  });
});
