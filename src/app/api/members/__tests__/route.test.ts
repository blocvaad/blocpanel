// bloc UI-R5c-1 — /api/members: הפאנל לא כותב ל-DB; כל פעולה על אדם נחתמת ונשלחת ל-bloc.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
const calls: any[] = [];
const audits: any[] = [];
let blocAnswer: any;

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => (typeof guardResult === "function" ? guardResult(opts) : guardResult) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("the panel must not write to the DB here"); } } }));

let POST: any;
const ADMIN = { id: "adm-1", email: "ops@bloc.co.il", role: "admin" };
const B = "22222222-2222-4222-8222-222222222222";
const B2 = "44444444-4444-4444-8444-444444444444";
const U = "33333333-3333-4333-8333-333333333333";
const NOTE = "אומת בטלפון מול ראש הוועד";
const req = (body: any, ip: string | null = null): any => ({ json: async () => body, headers: { get: (h: string) => (h === "x-forwarded-for" ? ip : null) } });

beforeEach(async () => {
  ({ POST } = await import("../route"));
  guardResult = { ok: true, session: ADMIN };
  blocAnswer = { ok: true, status: 200, data: { ok: true } };
  calls.length = 0; audits.length = 0;
});

describe("members POST — every change goes to bloc, signed", () => {
  it("requires tenants.modify (a viewer never reaches bloc)", async () => {
    let asked: any;
    guardResult = (opts: any) => { asked = opts; return { ok: false, response: { status: 403 } }; };
    const r = await POST(req({ action: "approve", building_id: B, user_id: U }));
    expect(r.status).toBe(403);
    expect(asked).toEqual({ permission: "tenants.modify" });
    expect(calls).toHaveLength(0);
  });

  it("approve: sent with the actor; audited as MEMBER_APPROVE under the person, with the building", async () => {
    const r = await POST(req({ action: "approve", building_id: B, user_id: U }, "1.2.3.4, 10.0.0.1"));
    expect(r.status).toBe(200);
    expect(calls).toEqual([{ path: "/api/internal/members", payload: { action: "approve", building_id: B, user_id: U, actor: ADMIN } }]);
    expect(audits[0][1]).toBe("MEMBER_APPROVE");
    expect(audits[0][2]).toBe("tenant");
    expect(audits[0][3]).toBe(U);
    expect(audits[0][4]).toMatchObject({ action: "approve", building_id: B });
    expect(audits[0][5]).toBe("1.2.3.4");
  });

  it("remove / block: the UI confirmation is required, and is NOT forwarded", async () => {
    expect((await POST(req({ action: "remove", building_id: B, user_id: U, panel_note: NOTE }))).status).toBe(400);
    expect(calls).toHaveLength(0);
    await POST(req({ action: "remove", building_id: B, user_id: U, panel_note: NOTE, confirm: true }));
    expect(calls[0].payload).toEqual({ action: "remove", building_id: B, user_id: U, panel_note: NOTE, actor: ADMIN });
    await POST(req({ action: "block", user_id: U, reason: "התחזות לוועד", confirm: true }));
    expect(calls[1].payload).toEqual({ action: "block", user_id: U, reason: "התחזות לוועד", actor: ADMIN });
    expect(audits.map((a) => a[1])).toEqual(["MEMBER_REMOVE", "ACCOUNT_BLOCK"]);
    expect(audits[1][4]).toMatchObject({ reason: "התחזות לוועד" });
  });

  it("documentation is mandatory (Hebrew message from the schema)", async () => {
    const r = await POST(req({ action: "set_role", building_id: B, user_id: U, role: "admin", panel_note: "קצר" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("תיעוד");
    expect(calls).toHaveLength(0);
  });

  it("REGRESSION: a role outside the building (management) cannot be set from the panel", async () => {
    const r = await POST(req({ action: "set_role", building_id: B, user_id: U, role: "management", panel_note: NOTE }));
    expect(r.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("transfer: audited under the target building with the source", async () => {
    await POST(req({ action: "transfer", user_id: U, from_building_id: B, to_building_id: B2, panel_note: NOTE }));
    expect(calls[0].payload).toMatchObject({ action: "transfer", approve: false, from_building_id: B, to_building_id: B2 });
    expect(audits[0][1]).toBe("MEMBER_TRANSFER");
    expect(audits[0][4]).toMatchObject({ building_id: B2, from_building_id: B, note: NOTE });
  });

  it("a bloc refusal keeps its status, code and Hebrew message — and nothing is audited", async () => {
    blocAnswer = { ok: false, status: 409, code: "LAST_ADMIN", error: "זה חבר הוועד האחרון בבניין." };
    const r = await POST(req({ action: "remove", building_id: B, user_id: U, panel_note: NOTE, confirm: true }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "זה חבר הוועד האחרון בבניין.", code: "LAST_ADMIN" });
    expect(audits).toHaveLength(0);
  });

  it("bloc's answer is passed back (e.g. the new head, the Auth ban result)", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, banned: false } };
    const r = await POST(req({ action: "block", user_id: U, reason: "התחזות לוועד", confirm: true }));
    expect(await r.json()).toEqual({ ok: true, banned: false });
  });
});
