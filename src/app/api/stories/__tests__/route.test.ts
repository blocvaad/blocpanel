// המיתון של הסטורי (bloc STORIES-1, החלטות 439, 441): הפאנל קורא את התור בלי מי דיווח, וכל פעולה עוברת ל-bloc החתום
// (/api/internal/stories). הרשאה לפי הפעולה — הסתרה / החזרה / דחייה: stories.manage; הפיילוט: stories.pilot (סופר-אדמין).
// הצלחה רק כש-bloc ענה ok עם אותה פעולה; אחרת "לא ברור" — ביומן BLOC_ACTION_UNKNOWN.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let guardArgs: any[] = [];
const calls: Array<{ path: string; payload: any }> = [];
const audits: any[][] = [];
let blocAnswer: any;
let queue: any;

vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/storiesServer", () => ({ loadStoriesQueue: async () => queue }));
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("no direct write"); } } }));

import { GET, POST } from "../route";
const B = "11111111-1111-4111-8111-111111111111";
const SID = "22222222-2222-4222-8222-222222222222";
const req = (body: any): any => ({ json: async () => body, headers: { get: () => "1.2.3.4, 5.6.7.8" } });
const as = (role: string) => ({ id: "44444444-4444-4444-8444-444444444444", email: "tal@bloc.co.il", full_name: "טל", role, auth_level: "mfa" });

beforeEach(() => {
  guardResult = { ok: true, session: as("admin") };
  guardArgs = []; calls.length = 0; audits.length = 0;
  blocAnswer = { ok: true, status: 200, data: { ok: true, action: "hide", changed: true, closed: 2 } };
  queue = { state: "ok", reports: [], hidden: [], pilot: [], truncated: false };
});

describe("GET /api/stories", () => {
  it("stories.read; the queue as it is, no-store; before SQL 235 — 503 sql_missing; a failed read — 500, never an empty list", async () => {
    let res: any = await GET();
    expect(guardArgs[0]).toEqual({ permission: "stories.read" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(queue);
    queue = { state: "missing" };
    res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("sql_missing");
    queue = { state: "error" };
    res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("read_failed");
    guardResult = { ok: false, response: { status: 403 } };
    res = await GET();
    expect(res.status).toBe(403);
  });
});

describe("POST /api/stories", () => {
  it("hide: through bloc with the actor and the item; on ok the log has STORY_HIDE with the reason and how many reports closed", async () => {
    const res: any = await POST(req({ action: "hide", building_id: B, source: "market", source_id: SID, reason: "תמונה פוגענית" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: "hide", changed: true, closed: 2 });
    expect(calls).toEqual([{ path: "/api/internal/stories", payload: { actor: { id: as("admin").id, email: "tal@bloc.co.il", role: "admin" }, action: "hide", building_id: B, source: "market", source_id: SID, reason: "תמונה פוגענית" } }]);
    expect(audits).toHaveLength(1);
    expect(audits[0].slice(1, 4)).toEqual(["STORY_HIDE", "story_item", B]);
    expect(audits[0][4]).toEqual({ source: "market", source_id: SID, reason: "תמונה פוגענית", changed: true, closed: 2 });
    expect(audits[0][5]).toBe("1.2.3.4");
  });

  it("a viewer cannot hide; an admin cannot open a pilot — 403 before bloc and before the log; a superadmin can", async () => {
    guardResult = { ok: true, session: as("viewer") };
    let res: any = await POST(req({ action: "dismiss", building_id: B, source: "event", source_id: SID }));
    expect(res.status).toBe(403);
    guardResult = { ok: true, session: as("admin") };
    res = await POST(req({ action: "pilot_on", building_id: B }));
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
    guardResult = { ok: true, session: as("superadmin") };
    blocAnswer = { ok: true, status: 200, data: { ok: true, action: "pilot_on", changed: true } };
    res = await POST(req({ action: "pilot_on", building_id: B, note: "בניין ראשון" }));
    expect(res.status).toBe(200);
    expect(audits[0].slice(1, 5)).toEqual(["STORIES_PILOT_ON", "building", B, { note: "בניין ראשון", changed: true, closed: null }]);
  });

  it("a shape bloc does not answer (ok without the same action) is never a success: 502 bad_shape, BLOC_ACTION_UNKNOWN", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, action: "dismiss", changed: true } };
    const res: any = await POST(req({ action: "unhide", building_id: B, source: "poll", source_id: SID }));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("bad_shape");
    expect(audits[0][1]).toBe("BLOC_ACTION_UNKNOWN");
    expect(audits[0][4]).toMatchObject({ action: "STORY_UNHIDE", outcome: "unknown", source: "poll", source_id: SID });
  });

  it("a refusal from bloc: the Hebrew sentence, the code, and BLOC_ACTION_FAILED; a timeout — maybe done (UNKNOWN)", async () => {
    blocAnswer = { ok: false, status: 503, error: "sql_missing", code: "sql_missing" };
    let res: any = await POST(req({ action: "dismiss", building_id: B, source: "announcement", source_id: SID }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "הסטורי עוד לא הותקן ב-bloc (SQL 235). אחרי ההתקנה נסו שוב.", code: "sql_missing" });
    expect(audits[0][1]).toBe("BLOC_ACTION_FAILED");
    audits.length = 0;
    blocAnswer = { ok: false, status: 504, error: "bloc לא ענה בזמן", code: "TIMEOUT" };
    res = await POST(req({ action: "dismiss", building_id: B, source: "announcement", source_id: SID }));
    expect(res.status).toBe(504);
    expect(audits[0][1]).toBe("BLOC_ACTION_UNKNOWN");
  });

  it("a bad body (unknown action, short reason, extra field, bad id) — 400 before bloc", async () => {
    for (const body of [
      { action: "delete", building_id: B },
      { action: "hide", building_id: B, source: "market", source_id: SID, reason: "x" },
      { action: "dismiss", building_id: B, source: "market", source_id: SID, extra: 1 },
      { action: "unhide", building_id: "nope", source: "market", source_id: SID },
      { action: "dismiss", building_id: B, source: "chat", source_id: SID },
    ]) {
      const res: any = await POST(req(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
});
