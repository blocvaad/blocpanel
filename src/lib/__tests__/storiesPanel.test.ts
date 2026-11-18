// STORIES-1 (bloc, החלטות 439, 441) — lib/storiesPanel: מה עובר לדפדפן ומה נשלח ל-bloc. מי דיווח לא נקרא בכלל.
import { describe, it, expect } from "vitest";
import { AUDIT_LABELS } from "../auditLabels";
import {
  STORY_ACTION_AUDIT, STORY_REPORT_COLUMNS, groupStoryReports, itemKey, itemPhoto, parseReportRows, storyActionSchema, storyAnswer, storyFailure, storyItem,
} from "../storiesPanel";

const B = "11111111-1111-4111-8111-111111111111", B2 = "33333333-3333-4333-8333-333333333333";
const S1 = "22222222-2222-4222-8222-222222222222", S2 = "44444444-4444-4444-8444-444444444444";
const row = (id: string, o: Record<string, unknown> = {}) => ({ id, building_id: B, source: "market", source_id: S1, reason: "spam", created_at: "2026-11-18T08:00:00Z", ...o });

describe("lib/storiesPanel", () => {
  it("never reads who reported", () => {
    expect(STORY_REPORT_COLUMNS).not.toContain("reporter");
  });
  it("rows: only valid ids, a known source and a known reason", () => {
    const ok = "55555555-5555-4555-8555-555555555555";
    expect(parseReportRows([row(ok), row("x"), row(ok, { source: "chat" }), row(ok, { reason: "hate" }), null, 3]).map((r) => r.id)).toEqual([ok]);
    expect(parseReportRows("nope")).toEqual([]);
  });
  it("the item: a title, a short text for an announcement or an event, a https photo only for an image listing; a deleted row is gone", () => {
    expect(storyItem("announcement", { title: "  מים  ", content: "a ".repeat(200) })).toMatchObject({ title: "מים", gone: false });
    expect(storyItem("announcement", { title: "מים", content: "a ".repeat(200) }).text!.length).toBeLessThanOrEqual(160);
    expect(storyItem("poll", { question: "צובעים?" }).title).toBe("צובעים?");
    expect(storyItem("event", undefined)).toEqual({ title: "הפריט נמחק", text: null, photo: null, gone: true });
    const SUPA = "https://proj.supabase.co", U = "abcdef12-3456-4789-8abc-def123456789";
    const own = `${SUPA}/storage/v1/object/public/chat_uploads/${U}/market_2.jpg`;
    expect(itemPhoto({ user_id: U, media_url: "http://x/1.jpg", media_urls: [own] }, SUPA)).toBe(own);
    expect(itemPhoto({ user_id: U, media_url: own, media_type: "video" }, SUPA)).toBeNull();
    expect(itemPhoto({ user_id: U, media_url: `${own}\"onerror` }, SUPA)).toBeNull();
    // only what the poster uploaded to the bloc board: a foreign https url, another folder, no poster, a query — nothing
    expect(itemPhoto({ user_id: U, media_url: "https://cdn.example.test/x.jpg" }, SUPA)).toBeNull();
    expect(itemPhoto({ user_id: "ffffffff-3456-4789-8abc-def123456789", media_url: own }, SUPA)).toBeNull();
    expect(itemPhoto({ media_url: own }, SUPA)).toBeNull();
    expect(itemPhoto({ user_id: U, media_url: `${own}?t=1` }, SUPA)).toBeNull();
    expect(itemPhoto({ user_id: U, media_url: own }, null)).toBeNull();
    // ".." anywhere in the path (the URL parser keeps it inside a name) — refused, as in bloc (lib/market/media)
    expect(itemPhoto({ user_id: U, media_url: `${SUPA}/storage/v1/object/public/chat_uploads/${U}/x..jpg` }, SUPA)).toBeNull();
    expect(storyItem("market", { title: "ספה", user_id: U, media_url: own }, SUPA).photo).toBe(own);
  });
  it("groups: one per item (the same id in another building is another item), most reports first, then the latest", () => {
    const r = parseReportRows([
      row("55555555-5555-4555-8555-000000000001", { created_at: "2026-11-18T08:00:00Z" }),
      row("55555555-5555-4555-8555-000000000002", { reason: "offensive", created_at: "2026-11-18T09:00:00Z" }),
      row("55555555-5555-4555-8555-000000000003", { building_id: B2, created_at: "2026-11-18T10:00:00Z" }),
      row("55555555-5555-4555-8555-000000000004", { source_id: S2, source: "event", created_at: "2026-11-18T11:00:00Z" }),
    ]);
    const g = groupStoryReports(r, new Map(), new Map([[B, "השקד 104"]]));
    expect(g.map((x) => [x.key, x.count])).toEqual([[itemKey(B, "market", S1), 2], [itemKey(B, "event", S2), 1], [itemKey(B2, "market", S1), 1]]);
    expect(g[0].reasons.map((x) => x.reason)).toEqual(["offensive", "spam"]);
    expect(g[0].first).toBe("2026-11-18T08:00:00Z");
    expect(g[0].last).toBe("2026-11-18T09:00:00Z");
    expect(g[2].building).toBe("בניין לא ידוע");
  });
  it("actions: strict; hide needs a reason of 3 to 300; pilot only a building and a note", () => {
    expect(storyActionSchema.safeParse({ action: "hide", building_id: B, source: "market", source_id: S1, reason: "ok!" }).success).toBe(true);
    expect(storyActionSchema.safeParse({ action: "hide", building_id: B, source: "market", source_id: S1, reason: "no" }).success).toBe(false);
    expect(storyActionSchema.safeParse({ action: "hide", building_id: B, source: "market", source_id: S1, reason: "x".repeat(301) }).success).toBe(false);
    expect(storyActionSchema.safeParse({ action: "pilot_on", building_id: B, note: "n", source: "market" }).success).toBe(false);
    expect(storyActionSchema.safeParse({ action: "dismiss", building_id: B, source: "market", source_id: S1, reporter_id: S2 }).success).toBe(false);
  });
  it("the answer: only ok with the same action and a boolean changed; failures in Hebrew, connection codes as they are", () => {
    expect(storyAnswer("hide", { ok: true, action: "hide", changed: true, closed: 2 })).toEqual({ changed: true, closed: 2 });
    expect(storyAnswer("hide", { ok: true, action: "unhide", changed: true })).toBeNull();
    expect(storyAnswer("hide", { ok: true, action: "hide" })).toBeNull();
    expect(storyAnswer("dismiss", { ok: true, action: "dismiss", changed: false, closed: Infinity })).toEqual({ changed: false, closed: null });
    expect(storyFailure({ status: 403, error: "x", code: "forbidden" }).error).toBe("אין הרשאה לפעולה הזו.");
    expect(storyFailure({ status: 404, error: "x" }).code).toBe("not_found");
    // maybe done (a timeout, the network, a 5xx with no known code) — never a definite failure
    expect(storyFailure({ status: 504, error: "bloc לא ענה", code: "TIMEOUT" })).toEqual({ status: 504, code: "TIMEOUT", error: "לא ברור אם הפעולה בוצעה — רעננו את הרשימה." });
    expect(storyFailure({ status: 500, error: "x" }).error).toBe("לא ברור אם הפעולה בוצעה — רעננו את הרשימה.");
    // every connection code of callBloc keeps its diagnosis (the panel deployed before bloc, the secret, the edge)
    for (const code of ["EDGE_BLOCKED", "ORIGIN_PROTECTED", "OLD_BLOC", "UPSTREAM_401", "REJECTED", "NOT_CONFIGURED"]) {
      expect(storyFailure({ status: 502, error: `diag ${code}`, code })).toEqual({ status: 502, code, error: `diag ${code}` });
    }
    expect(storyFailure({ status: 503, error: "x", code: "write_failed" }).status).toBe(503);
    expect(storyFailure({ status: 409, error: "x" })).toEqual({ status: 409, code: "failed", error: "הפעולה לא הצליחה. נסו שוב." });
  });
  it("every stories action has a Hebrew name in the panel log (not a raw code)", () => {
    for (const code of Object.values(STORY_ACTION_AUDIT)) expect([code, AUDIT_LABELS[code]?.label ?? null]).toEqual([code, expect.stringMatching(/[\u0590-\u05FF]/)]);
  });
});
