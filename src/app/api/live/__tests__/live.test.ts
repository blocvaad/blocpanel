// א3-1 (bloc, החלטה 444): GET /api/live — הקריאות ב-bloc (readBloc "live"); כאן רק האירועים בעברית.
//   • ה-cursor מוגבל לפני שנשלח (lib/liveEvents: clampSince); actor — מהסשן.
//   • כשל בערוץ → 502 עם הסיבה (המסך: "העדכון נכשל — מנסה שוב"), לא רשימה ריקה ומונים של אפס.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ result: null as unknown, calls: [] as unknown[][] }));
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "00000000-0000-4000-8000-000000000092", email: "view@bloc.co.il", role: "viewer" } }) }));
vi.mock("@/lib/blocRead", () => ({ readBloc: async (...a: unknown[]) => { h.calls.push(a); return h.result; } }));
// adminClient שזורק על כל שימוש — אבל לא על then / symbol (בדיקה של thenable או הדפסה לא ייחשבו "קריאה", ושום await לא ייתקע).
vi.mock("@/lib/supabase", () => ({ adminClient: new Proxy({}, { get: (_t, k) => { if (k === "then" || typeof k === "symbol") return undefined; throw new Error("the live route must not read the DB"); } }) }));

import { NextRequest } from "next/server";
import { GET } from "../route";

const B1 = "c0f1cb42-8e52-4a4e-a8d7-5563c10d6a2e";
const live = {
  cursor: "2026-11-18T10:00:00.000Z",
  src: {
    tenants: [{ id: "u1", full_name: "דנה לוי", building_id: B1, created_at: "2026-11-18T09:55:00.000Z" }],
    tickets: [], declined: [], webhookErrors: [],
  },
  names: { [B1]: "השקד 104" },
  stats: { pending_approvals: 1, open_tickets: 3, pending_reports: 1, supplier_queue: 0 },
  failed: [],
};

beforeEach(() => { h.calls.length = 0; });

describe("GET /api/live", () => {
  it("asks bloc with the clamped cursor and the staff actor; returns the cursor, the Hebrew events and the counters", async () => {
    h.result = { ok: true, data: live };
    const res = await GET(new NextRequest("https://panel.example/api/live?since=junk"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cursor).toBe(live.cursor);
    expect(body.stats).toEqual(live.stats);
    expect(body.events.length).toBe(1);
    expect(JSON.stringify(body.events)).toContain("השקד 104");
    const [read, params, actor] = h.calls[0] as [string, { since: string }, { role: string }];
    expect(read).toBe("live");
    expect(Date.parse(params.since)).toBeGreaterThan(Date.now() - 2 * 3_600_000);   // junk → an hour back
    expect(actor.role).toBe("viewer");
  });
  it("a part bloc could not read passes through: the counter stays null (the screen says —) and failed is listed", async () => {
    h.result = { ok: true, data: { ...live, stats: { ...live.stats, pending_approvals: null, open_tickets: null }, failed: ["stats"] } };
    const body = await (await GET(new NextRequest("https://panel.example/api/live"))).json();
    expect(body.stats).toEqual({ pending_approvals: null, open_tickets: null, pending_reports: 1, supplier_queue: 0 });
    expect(body.failed).toEqual(["stats"]);
  });
  it("the channel failed → 502 with the reason, never an empty feed with zero counters", async () => {
    h.result = { ok: false, error: "bloc לא ענה בזמן", code: "TIMEOUT" };
    const res = await GET(new NextRequest("https://panel.example/api/live"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "bloc לא ענה בזמן", code: "TIMEOUT" });
  });
});
