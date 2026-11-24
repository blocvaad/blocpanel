// bloc COMPANY-1 (D5 — הבעלים 24/11; bloc החלטה 650) — /api/management-companies/links.
//   GET:  הממתינות (כולן) ומה שהוחלט ב-30 הימים האחרונים, עם שם החברה, הבניין, החותם/ת ומי ביקש/ה. viewer — בלי שם החותם/ת,
//         בלי מי ביקש/ה ובלי קוד ההצטרפות של הבניין (ובלי קריאה של profiles בכלל). קריאה שנכשלה — 503, לעולם לא "אין בקשות".
//   POST: management.approve בלבד; הפאנל לא כותב — הבקשה נחתמת ל-bloc (/api/internal/management-links); דחייה — רק עם סיבה;
//         יומן הפאנל אחרי הצלחה; bloc שלא ענה בזמן — שורה ביומן "לא ידוע אם נשמרה".
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let guardResult: any;
const guardCalls: any[] = [];
const calls: any[] = [];
const audits: any[] = [];
let blocAnswer: any;
const reads: Array<{ table: string; cols: string; filters: string[]; order: string[]; limit?: number }> = [];
let answers: Record<string, { data: any; error: any } | ((r: { filters: string[] }) => { data: any; error: any })>;

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => { guardCalls.push(opts ?? null); return typeof guardResult === "function" ? guardResult(opts) : guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const rec = { table, cols: "", filters: [] as string[], order: [] as string[], limit: undefined as number | undefined };
      const chain: any = {
        select: (cols: string) => { rec.cols = cols; reads.push(rec); return chain; },
        eq: (c: string, v: unknown) => { rec.filters.push(`eq ${c} ${v}`); return chain; },
        neq: (c: string, v: unknown) => { rec.filters.push(`neq ${c} ${v}`); return chain; },
        gte: (c: string, v: unknown) => { rec.filters.push(`gte ${c} ${String(v)}`); return chain; },
        in: (c: string, v: unknown[]) => { rec.filters.push(`in ${c} ${v.join("|")}`); return chain; },
        order: (c: string, o?: { ascending?: boolean }) => { rec.order.push(`${c}:${o?.ascending === false ? "desc" : "asc"}`); return chain; },
        limit: (n: number) => { rec.limit = n; return chain; },
        then: (resolve: any) => {
          const a = answers[table];
          return resolve(typeof a === "function" ? a(rec) : a ?? { data: [], error: null });
        },
        update: () => { throw new Error("the panel must not write here"); },
        insert: () => { throw new Error("the panel must not write here"); },
      };
      return chain;
    },
  },
}));

let GET: any, POST: any;
const ADMIN = { id: "5b1f0a3c-8d2e-4f6a-9b7c-1e2d3f4a5b6c", email: "ops@bloc.co.il", role: "admin" };
const VIEWER = { id: "6b1f0a3c-8d2e-4f6a-9b7c-1e2d3f4a5b6c", email: "view@bloc.co.il", role: "viewer" };
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const C1 = "33333333-3333-4333-8333-333333333333";
const B1 = "44444444-4444-4444-8444-444444444444";
const U1 = "55555555-5555-4555-8555-555555555555";
const REASON = "לא הצלחנו לאמת שהחברה מוסמכת לנהל את הבניין";
const postReq = (body: any, ip: string | null = "9.9.9.9, 10.0.0.1") => new Request("https://panel.blocvaad.co.il/api/management-companies/links", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) },
});
const pendingRow = { id: L1, company_id: C1, building_id: B1, new_building: null, requested_by: U1, signer_name: "דנה כהן", signer_role: "מנכ״לית",
  declaration_version: "company-link-2026-11-24", status: "pending", decided_at: null, decline_reason: null, created_at: "2026-11-20T08:00:00Z" };
const declinedRow = { ...pendingRow, id: L2, building_id: null, new_building: { name: "הרימון 7", address: "הרימון 7", city: "חולון", units: 12 },
  status: "declined", decided_at: "2026-11-21T08:00:00Z", decline_reason: REASON };

afterEach(() => { vi.useRealTimers(); });

beforeEach(async () => {
  ({ GET, POST } = await import("../route"));
  guardResult = { ok: true, session: ADMIN };
  blocAnswer = { ok: true, status: 200, data: { ok: true, building_id: B1, created: false } };
  calls.length = 0; audits.length = 0; reads.length = 0; guardCalls.length = 0;
  answers = {
    management_link_requests: (r) => (r.filters.includes("eq status pending") ? { data: [pendingRow], error: null } : { data: [declinedRow], error: null }),
    management_companies: { data: [{ id: C1, name: "נווה ניהול" }], error: null },
    buildings: { data: [{ id: B1, name: "השקד 4", address: "השקד 4, רחובות", invite_code: "B-AB12CD" }], error: null },
    profiles: { data: [{ id: U1, full_name: "דנה כהן" }], error: null },
  };
});

describe("GET", () => {
  it("pending (all, oldest first) and decided in the last 30 days, with the names; canDecide for an admin", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canDecide).toBe(true);
    expect(body.links.map((l: any) => l.id)).toEqual([L1, L2]);
    expect(body.links[0]).toMatchObject({
      status: "pending", company: { id: C1, name: "נווה ניהול" },
      building: { id: B1, name: "השקד 4", address: "השקד 4, רחובות", invite_code: "B-AB12CD" },
      signer_name: "דנה כהן", signer_role: "מנכ״לית", requester: "דנה כהן",
    });
    expect(body.links[1]).toMatchObject({ status: "declined", building: null, new_building: { name: "הרימון 7" }, decline_reason: REASON });
    const lr = reads.filter((r) => r.table === "management_link_requests");
    expect(lr).toHaveLength(2);
    expect(lr[0]).toMatchObject({ filters: ["eq status pending"], order: ["created_at:asc"], limit: 500 });
    expect(lr[1].filters[0]).toBe("neq status pending");
    expect(lr[1].filters[1]).toMatch(/^gte decided_at \d{4}-\d{2}-\d{2}T/);
    expect(lr[1]).toMatchObject({ order: ["decided_at:desc"], limit: 200 });
  });
  it("REGRESSION: the decided window is exactly the last 30×24 hours of the clock, at any hour (the old check rounded days and failed after 14:00 Israel time)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (const [now, since] of [
      ["2026-11-24T06:00:00.000Z", "2026-10-25T06:00:00.000Z"],
      ["2026-11-24T18:08:00.000Z", "2026-10-25T18:08:00.000Z"],
      ["2026-11-24T22:30:00.000Z", "2026-10-25T22:30:00.000Z"],
    ]) {
      vi.setSystemTime(new Date(now));
      reads.length = 0;
      expect((await GET()).status).toBe(200);
      const lr = reads.filter((r) => r.table === "management_link_requests");
      expect([now, lr[1].filters[1]]).toEqual([now, `gte decided_at ${since}`]);
    }
  });
  it("a viewer: no signer name, no requester, no invite code — and profiles is not read at all", async () => {
    guardResult = { ok: true, session: VIEWER };
    const body = await (await GET()).json();
    expect(body.canDecide).toBe(false);
    for (const l of body.links) { expect(l.signer_name).toBeNull(); expect(l.requester).toBeNull(); }
    expect(body.links[0].building.invite_code).toBeNull();
    expect(body.links[0].signer_role).toBe("מנכ״לית");
    expect(reads.some((r) => r.table === "profiles")).toBe(false);
  });
  it("a failed read is 503 with words (never an empty list as if there were none)", async () => {
    answers.management_link_requests = (r) => (r.filters.includes("eq status pending") ? { data: null, error: { code: "42P01", message: "relation does not exist" } } : { data: [], error: null });
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("SQL 252");
  });
  it("a failed read of the decided ones is 503 too; a failed read of the names — 503", async () => {
    answers.management_link_requests = (r) => (r.filters.includes("eq status pending") ? { data: [pendingRow], error: null } : { data: null, error: { message: "boom" } });
    expect((await GET()).status).toBe(503);
    answers.management_link_requests = (r) => (r.filters.includes("eq status pending") ? { data: [pendingRow], error: null } : { data: [], error: null });
    answers.buildings = { data: null, error: { message: "boom" } };
    expect((await GET()).status).toBe(503);
  });
  it("not signed in — the guard answers", async () => {
    guardResult = { ok: false, response: new Response(null, { status: 401 }) };
    expect((await GET()).status).toBe(401);
  });
});

describe("POST", () => {
  it("asks the guard for management.approve (a viewer gets the guard's answer, nothing is sent)", async () => {
    guardResult = (opts: any) => (opts?.permission === "management.approve" ? { ok: false, response: new Response(null, { status: 403 }) } : { ok: true, session: VIEWER });
    const res = await POST(postReq({ action: "approve", id: L1 }));
    expect(res.status).toBe(403);
    expect(guardCalls).toEqual([{ permission: "management.approve" }]);
    expect(calls).toHaveLength(0);
  });
  it("approve: signed to bloc with the actor; the panel log after success", async () => {
    const res = await POST(postReq({ action: "approve", id: L1, note: "ראינו הסכם ניהול חתום" }));
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ path: "/api/internal/management-links", payload: {
      action: "approve", request_id: L1, panel_note: "ראינו הסכם ניהול חתום", actor: { id: ADMIN.id, email: ADMIN.email, role: "admin" },
    } }]);
    expect(audits).toHaveLength(1);
    expect(audits[0].slice(1, 4)).toEqual(["MANAGEMENT_LINK_APPROVE", "management_link", L1]);
    expect(audits[0][4]).toMatchObject({ action: "approve", building_id: B1, created: false, note: "ראינו הסכם ניהול חתום" });
    expect(audits[0][5]).toBe("9.9.9.9");
  });
  it("decline: only with a reason (10–1000), the reason goes to bloc and to the log", async () => {
    expect((await POST(postReq({ action: "decline", id: L1 }))).status).toBe(400);
    expect((await POST(postReq({ action: "decline", id: L1, reason: "קצר" }))).status).toBe(400);
    expect(calls).toHaveLength(0);
    const res = await POST(postReq({ action: "decline", id: L1, reason: REASON }));
    expect(res.status).toBe(200);
    expect(calls[0].payload).toMatchObject({ action: "decline", request_id: L1, reason: REASON });
    expect(audits[0][1]).toBe("MANAGEMENT_LINK_DECLINE");
    expect(audits[0][4]).toMatchObject({ reason: REASON });
  });
  it("an unknown field or action is refused before bloc", async () => {
    expect((await POST(postReq({ action: "approve", id: L1, extra: 1 }))).status).toBe(400);
    expect((await POST(postReq({ action: "delete", id: L1 }))).status).toBe(400);
    expect((await POST(postReq({ action: "approve", id: "not-a-uuid" }))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("bloc did not answer in time — the answer passes through, and the log says it is unknown whether it was saved", async () => {
    blocAnswer = { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן" };
    const res = await POST(postReq({ action: "approve", id: L1 }));
    expect(res.status).toBe(504);
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toBe("MANAGEMENT_LINK_UNKNOWN");
    expect(audits[0][4]).toMatchObject({ action: "approve", outcome: "unknown", error: "TIMEOUT" });
  });
  it("bloc refused (for example the building got a committee meanwhile) — passed through, no panel log", async () => {
    blocAnswer = { ok: false, status: 409, code: "HAS_COMMITTEE", error: "לבניין יש כבר ועד פעיל" };
    const res = await POST(postReq({ action: "approve", id: L1 }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "לבניין יש כבר ועד פעיל", code: "HAS_COMMITTEE" });
    expect(audits).toHaveLength(0);
  });
});
