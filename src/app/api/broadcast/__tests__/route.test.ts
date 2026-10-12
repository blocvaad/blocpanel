// /api/broadcast — הודעות לבניינים (bloc UI-R5a): שליחה דרך bloc, רשימה של מה שנשלח, הורדה / עריכה / תוקף,
// מחיקה (סופר-אדמין). השער האמיתי (guard + permissions) — רק requireFullSession מדומה.
import { describe, it, expect, beforeEach, vi } from "vitest";

let authResult: any = { ok: false, reason: "unauthenticated" };
const auditCalls: any[][] = [];
vi.mock("@/lib/auth", () => ({
  requireFullSession: async () => authResult,
  auditLog: async (...args: any[]) => { auditCalls.push(args); },
}));

const blocCalls: any[] = [];
let blocReplies: any[] = [];
let configured = true;
vi.mock("@/lib/blocApi", () => ({
  callBloc: async (path: string, payload: any) => {
    blocCalls.push({ path, payload });
    return blocReplies.length > 1 ? blocReplies.shift() : blocReplies[0];
  },
  blocConfig: () => (configured ? { url: "https://x", secret: "s".repeat(40) } : null),
}));

// ── DB מדומה לרשימה ──
let annRows: any[] = [];
let annFailWithAck = false;
let annFail = false;
let countsFail = false;
let counts: any[] = [];
let memberships: any[] = [];
let buildings: any[] = [];
let audits: any[] = [];
let namesFail = false;
const selects: string[] = [];
vi.mock("@/lib/supabase", () => {
  const chain = (table: string) => {
    let cols = "";
    let inIds: string[] | null = null;
    let range: [number, number] | null = null;
    const c: any = {
      select: (s: string) => { cols = s; if (table === "announcements") selects.push(s); return c; },
      eq: () => c, gte: () => c, not: () => c, order: () => c, limit: () => c, is: () => c,
      in: (_col: string, ids: string[]) => { inIds = ids; return c; },
      range: (f: number, t: number) => { range = [f, t]; return c; },
      then: (ok: any, fail: any) => {
        let res: any = { data: [], error: null };
        if (table === "announcements") {
          if (cols.includes("content")) res = { data: annRows.filter((r) => inIds?.includes(r.id)).map((r) => ({ id: r.id, content: r.content })), error: null };
          else if (annFail || (annFailWithAck && cols.includes("requires_ack"))) res = { data: null, error: { code: "42703" } };
          else res = { data: annRows.slice(range?.[0] ?? 0, (range?.[1] ?? 999) + 1), error: null };
        }
        if (table === "buildings") res = namesFail ? { data: null, error: { message: "boom" } } : { data: buildings.filter((b) => inIds?.includes(b.id)), error: null };
        if (table === "building_memberships") res = { data: memberships.filter((m) => inIds?.includes(m.building_id)).slice(range?.[0] ?? 0, (range?.[1] ?? 999) + 1), error: null };
        if (table === "panel_audit_logs") res = { data: audits, error: null };
        return Promise.resolve(res).then(ok, fail);
      },
    };
    return c;
  };
  return {
    adminClient: {
      from: (t: string) => chain(t),
      rpc: async (_fn: string, args: any) => (countsFail ? { data: null, error: { message: "no fn" } } : { data: counts.filter((x) => args.p_ids.includes(x.announcement_id)), error: null }),
    },
  };
});

import { GET, POST, PATCH, DELETE } from "../route";

const BID = "11111111-1111-4111-8111-111111111111";
const B = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, "0")}`;
const A = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const req = (body?: any): any => ({ json: async () => body, headers: { get: () => null } });
const session = (role: string) => ({ ok: true, session: { id: "a1", email: "ops@bloc.co.il", full_name: "A", role, auth_level: "mfa" } });
const SEND = (o: Record<string, unknown> = {}) => ({ broadcast_id: BID, title: "עדכון מערכת", content: "תחזוקה בלילה", priority: "normal", duration: "1w", ...o });
const OK = (o: Record<string, unknown> = {}) => ({ ok: true, status: 200, data: { ok: true, total: 3, sent: 3, already: 0, failed: 0, remaining: 0, skipped: 0, ...o } });

beforeEach(() => {
  authResult = session("admin");
  auditCalls.length = 0; blocCalls.length = 0; selects.length = 0;
  blocReplies = [OK()];
  configured = true;
  annRows = []; annFailWithAck = false; annFail = false; countsFail = false; counts = []; memberships = []; buildings = []; audits = []; namesFail = false;
});

describe("POST /api/broadcast — the gate", () => {
  it("401 without a full session (also pre-MFA / revoked); nothing sent", async () => {
    for (const reason of ["unauthenticated", "mfa_required", "revoked"]) {
      authResult = { ok: false, reason };
      expect((await POST(req(SEND()))).status).toBe(401);
    }
    expect(blocCalls).toHaveLength(0);
  });
  it("403 for a viewer; nothing sent", async () => {
    authResult = session("viewer");
    expect((await POST(req(SEND()))).status).toBe(403);
    expect(blocCalls).toHaveLength(0);
  });
});

describe("POST /api/broadcast — validation (Hebrew, before bloc)", () => {
  it("title / content / how long / the broadcast id are required", async () => {
    for (const body of [SEND({ title: "" }), SEND({ content: "  " }), SEND({ duration: undefined }), SEND({ broadcast_id: "x" }), { title: "t", content: "c" }]) {
      const r = await POST(req(body));
      expect(r.status).toBe(400);
    }
    const r = await POST(req(SEND({ title: "" })));
    expect((await r.json()).issues[0].message).toBe("כתבו כותרת");
    expect(blocCalls).toHaveLength(0);
  });
  it("blanks, a bad date, an unknown field (strict) — 400", async () => {
    expect((await POST(req(SEND({ content: "ביום ___" })))).status).toBe(400);
    const bad = await POST(req(SEND({ duration: "date", date: "2020-01-01" })));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toContain("שנה");
    expect((await POST(req(SEND({ author_id: "x" })))).status).toBe(400);
    expect((await POST(req(SEND({ expires_in_days: 0 })))).status).toBe(400);
    expect(blocCalls).toHaveLength(0);
  });
});

describe("POST /api/broadcast — sending through bloc", () => {
  it("default week; the actor, the id and the options go to bloc; all buildings = null", async () => {
    const before = Date.now();
    const r = await POST(req(SEND({ requires_ack: true, is_pinned: true, priority: "urgent" })));
    expect(r.status).toBe(200);
    expect(blocCalls).toHaveLength(1);
    const { path, payload } = blocCalls[0];
    expect(path).toBe("/api/internal/broadcast");
    expect(payload).toMatchObject({
      action: "send", broadcast_id: BID, title: "עדכון מערכת", priority: "urgent", requires_ack: true, is_pinned: true, building_ids: null,
      actor: { id: "a1", email: "ops@bloc.co.il", role: "admin" },
    });
    const ms = new Date(payload.expires_at).getTime() - before;
    expect(ms).toBeGreaterThan(7 * 86_400_000 - 5000);
    expect(ms).toBeLessThan(7 * 86_400_000 + 5000);
    expect(await r.json()).toMatchObject({ ok: true, broadcast_id: BID, total: 3, delivered: 3, failed: 0, remaining: 0, expires_at: payload.expires_at });
  });
  it("no end date — null; until a date — 23:59 in Israel; chosen buildings pass through", async () => {
    await POST(req(SEND({ duration: "none" })));
    expect(blocCalls[0].payload.expires_at).toBeNull();
    const d = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await POST(req(SEND({ duration: "date", date: d, building_ids: [B(1), B(2)] })));
    expect(blocCalls[1].payload.expires_at).toMatch(/T2[01]:59:59\.000Z$/);
    expect(blocCalls[1].payload.building_ids).toEqual([B(1), B(2)]);
  });
  it("a resume sends the given end date as is", async () => {
    const at = new Date(Date.now() + 86_400_000).toISOString();
    await POST(req({ ...SEND({ duration: undefined }), expires_at: at }));
    expect(blocCalls[0].payload.expires_at).toBe(at);
  });
  it("remaining — the route continues with the same payload; delivered = already + sent of the last round", async () => {
    blocReplies = [OK({ total: 20, sent: 6, already: 0, remaining: 14 }), OK({ total: 20, sent: 14, already: 6, remaining: 0 })];
    const j = await (await POST(req(SEND()))).json();
    expect(blocCalls).toHaveLength(2);
    expect(blocCalls[1].payload).toEqual(blocCalls[0].payload);
    expect(j).toMatchObject({ delivered: 20, remaining: 0, failed: 0 });
  });
  it("audit — BROADCAST with the broadcast id, the target and the result", async () => {
    await POST(req(SEND({ building_ids: [B(1)] })));
    expect(auditCalls).toHaveLength(1);
    const [, action, type, id, meta] = auditCalls[0];
    expect([action, type, id]).toEqual(["BROADCAST", "broadcast", BID]);
    expect(meta).toMatchObject({ title: "עדכון מערכת", target: 1, ok: true, delivered: 3 });
  });
  it("a resume of a broadcast that was taken down / deleted (the panel log) — 409, nothing sent", async () => {
    audits = [{ action: "BROADCAST_DELETE", entity_id: BID, metadata: { ok: true } }];
    const r = await POST(req(SEND()));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "BROADCAST_CLOSED" });
    expect(blocCalls).toHaveLength(0);
  });

  it("a later round fails — what was sent stays (the screen continues); the audit keeps the counts and the error", async () => {
    blocReplies = [OK({ total: 20, sent: 6, already: 0, remaining: 14 }), { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן" }];
    const r = await POST(req(SEND()));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, delivered: 6, remaining: 14 });
    expect(auditCalls[0][4]).toMatchObject({ ok: true, delivered: 6, remaining: 14, resume_error: { code: "TIMEOUT" } });
  });

  it("bloc refuses — the status and the Hebrew error pass through, and the audit says so", async () => {
    blocReplies = [{ ok: false, status: 400, error: "הבניינים שנבחרו אינם פעילים (מושעים או בארכיון)" }];
    const r = await POST(req(SEND()));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("אינם פעילים");
    expect(auditCalls[0][4]).toMatchObject({ ok: false, error: expect.stringContaining("אינם פעילים") });
  });
});

describe("GET /api/broadcast — what was sent", () => {
  const T = "2026-10-10T10:00:00+00:00";
  beforeEach(() => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    annRows = [
      { id: A(1), building_id: B(1), title: "עדכון", content: "תוכן מלא", priority: "high", is_pinned: true, requires_ack: true, expires_at: future, created_at: T, dedupe_key: `panel:${BID}:${B(1)}` },
      { id: A(2), building_id: B(2), title: "עדכון", content: "תוכן מלא", priority: "high", is_pinned: true, requires_ack: true, expires_at: future, created_at: T, dedupe_key: `panel:${BID}:${B(2)}` },
      { id: A(3), building_id: B(1), title: "ישנה", content: "מלפני", priority: "normal", is_pinned: false, requires_ack: false, expires_at: null, created_at: "2026-09-21T10:00:00+00:00", dedupe_key: null },
    ];
    buildings = [{ id: B(1), name: "הרצל 5", is_active: true, is_archived: false }, { id: B(2), name: "אלנבי 2", is_active: false, is_archived: false }];
    counts = [{ announcement_id: A(1), seen: 4, acked: 2 }, { announcement_id: A(2), seen: 1, acked: 0 }, { announcement_id: A(3), seen: 7, acked: 0 }];
    memberships = [...Array(6)].map(() => ({ building_id: B(1) })).concat([...Array(3)].map(() => ({ building_id: B(2) })));
    audits = [
      { entity_id: BID, admin_email: "ops@bloc.co.il", metadata: { title: "עדכון" }, created_at: T },
      { entity_id: null, admin_email: "old@bloc.co.il", metadata: { title: "ישנה" }, created_at: "2026-09-21T10:01:00+00:00" },
    ];
  });

  it("a viewer — 403", async () => {
    authResult = session("viewer");
    expect((await GET()).status).toBe(403);
  });

  it("grouped, with content, buildings, read counts out of members, the sender; old ones with their ids", async () => {
    const j = await (await GET()).json();
    expect(j).toMatchObject({ configured: true, canManage: true, canDelete: false, ack: true, stats: true });
    expect(j.broadcasts.map((x: any) => x.key)).toEqual([`panel:${BID}`, `legacy:${A(3)}`]);
    const [main, old] = j.broadcasts;
    expect(main).toMatchObject({
      broadcastId: BID, legacy: false, title: "עדכון", content: "תוכן מלא", priority: "high", isPinned: true, requiresAck: true,
      state: "active", sender: "ops@bloc.co.il", totals: { buildings: 2, seen: 5, acked: 2, members: 9 },
    });
    expect(main.ids).toBeUndefined();
    expect(main.buildings).toEqual([
      { id: B(2), name: "אלנבי 2", suspended: true, active: true, seen: 1, acked: 0, members: 3 },
      { id: B(1), name: "הרצל 5", suspended: false, active: true, seen: 4, acked: 2, members: 6 },
    ]);
    expect(old).toMatchObject({ legacy: true, ids: [A(3)], sender: "old@bloc.co.il", content: "מלפני", totals: { seen: 7 } });
  });

  it("superadmin can delete; without the bloc connection — configured false", async () => {
    authResult = session("superadmin");
    configured = false;
    expect(await (await GET()).json()).toMatchObject({ canDelete: true, configured: false });
  });

  it("before bloc 170 (no requires_ack / no counts function) — the list still loads, without those numbers", async () => {
    annFailWithAck = true; countsFail = true;
    const j = await (await GET()).json();
    expect(j).toMatchObject({ ack: false, stats: false });
    expect(j.broadcasts[0].totals).toMatchObject({ seen: null, acked: null, members: 9 });
    expect(selects.some((s) => !s.includes("requires_ack") && !s.includes("content"))).toBe(true);
  });

  it("a failed read — 500 in Hebrew, never an empty list (also the building names — not \"a deleted building\")", async () => {
    annFail = true;
    const r = await GET();
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/[א-ת]/);
    annFail = false; namesFail = true;
    expect((await GET()).status).toBe(500);
  });
});

describe("PATCH /api/broadcast — take down / edit / end date", () => {
  it("a viewer — 403; nothing sent to bloc", async () => {
    authResult = session("viewer");
    expect((await PATCH(req({ action: "end", broadcast_id: BID }))).status).toBe(403);
    expect(blocCalls).toHaveLength(0);
  });
  it("end — by the broadcast id; audit BROADCAST_END", async () => {
    blocReplies = [{ ok: true, status: 200, data: { ok: true, matched: 3, changed: 2 } }];
    const r = await PATCH(req({ action: "end", broadcast_id: BID }));
    expect(await r.json()).toMatchObject({ ok: true, matched: 3, changed: 2 });
    expect(blocCalls[0].payload).toEqual({ action: "end", actor: { id: "a1", email: "ops@bloc.co.il", role: "admin" }, broadcast_id: BID });
    expect(auditCalls[0].slice(1, 4)).toEqual(["BROADCAST_END", "broadcast", BID]);
  });
  it("update an old broadcast by ids: fields + a new end date from the duration", async () => {
    blocReplies = [{ ok: true, status: 200, data: { ok: true, matched: 1, changed: 1 } }];
    const r = await PATCH(req({ action: "update", ids: [A(3)], title: "חדש", is_pinned: false, duration: "none" }));
    expect(r.status).toBe(200);
    expect(blocCalls[0].payload).toMatchObject({ action: "update", ids: [A(3)], title: "חדש", is_pinned: false, expires_at: null });
    expect(auditCalls[0].slice(1, 4)).toEqual(["BROADCAST_UPDATE", "broadcast", `legacy:${A(3)}`]);
  });
  it("nothing to save / both targets / neither / a past date / blanks — 400 before bloc", async () => {
    expect((await PATCH(req({ action: "update", broadcast_id: BID }))).status).toBe(400);
    expect((await PATCH(req({ action: "end", broadcast_id: BID, ids: [A(1)] }))).status).toBe(400);
    expect((await PATCH(req({ action: "end" }))).status).toBe(400);
    expect((await PATCH(req({ action: "update", broadcast_id: BID, duration: "date", date: "2020-01-01" }))).status).toBe(400);
    expect((await PATCH(req({ action: "update", broadcast_id: BID, content: "___" }))).status).toBe(400);
    expect(blocCalls).toHaveLength(0);
  });
  it("not found in bloc — 404 passes through", async () => {
    blocReplies = [{ ok: false, status: 404, code: "NOT_FOUND", error: "ההודעה לא נמצאה. אולי היא כבר נמחקה." }];
    const r = await PATCH(req({ action: "end", broadcast_id: BID }));
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("DELETE /api/broadcast — superadmin only", () => {
  it("admin — 403 that suggests taking it down instead; nothing sent", async () => {
    const r = await DELETE(req({ broadcast_id: BID, confirm: true }));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toContain("להוריד");
    expect(blocCalls).toHaveLength(0);
  });
  it("superadmin — needs confirm; then bloc deletes; audit BROADCAST_DELETE", async () => {
    authResult = session("superadmin");
    expect((await DELETE(req({ broadcast_id: BID }))).status).toBe(400);
    blocReplies = [{ ok: true, status: 200, data: { ok: true, matched: 2, changed: 2 } }];
    const r = await DELETE(req({ broadcast_id: BID, confirm: true }));
    expect(await r.json()).toEqual({ ok: true, deleted: 2 });
    expect(blocCalls[0].payload).toMatchObject({ action: "delete", broadcast_id: BID, actor: { role: "superadmin" } });
    expect(auditCalls.at(-1)!.slice(1, 4)).toEqual(["BROADCAST_DELETE", "broadcast", BID]);
  });
});
