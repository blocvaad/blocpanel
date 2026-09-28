import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let succRow: any;
const calls: any[] = [];
const audits: any[] = [];
let blocAnswer: any;

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => (typeof guardResult === "function" ? guardResult(opts) : guardResult) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({
  blocConfig: () => ({ url: "https://www.blocvaad.co.il", secret: "x".repeat(40) }),
  callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; },
}));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: () => {
      const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: succRow }) };
      return chain;
    },
  },
}));

let POST: any;
const ADMIN = { id: "adm-1", email: "ops@bloc.co.il", role: "admin" };
const SUPER = { ...ADMIN, role: "superadmin" };
const RID = "11111111-1111-4111-8111-111111111111";
const BID = "22222222-2222-4222-8222-222222222222";
const UID = "33333333-3333-4333-8333-333333333333";
const NOTE = "אומת בטלפון מול ראש הוועד";
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });

beforeEach(async () => {
  ({ POST } = await import("../route"));
  guardResult = { ok: true, session: ADMIN };
  succRow = { building_id: BID };
  blocAnswer = { ok: true, status: 200, data: { ok: true } };
  calls.length = 0; audits.length = 0;
});

describe("committee POST — panel actions go to bloc, signed", () => {
  it("requires committee.manage", async () => {
    let asked: any;
    guardResult = (opts: any) => { asked = opts; return { ok: false, response: { status: 403 } }; };
    const r = await POST(req({ action: "cancel", request_id: RID, panel_note: NOTE }));
    expect(r.status).toBe(403);
    expect(asked).toEqual({ permission: "committee.manage" });
    expect(calls).toHaveLength(0);
  });

  it("documentation and explicit confirmation are mandatory", async () => {
    expect((await POST(req({ action: "cancel", request_id: RID, panel_note: "קצר" }))).status).toBe(400);
    expect((await POST(req({ action: "request", building_id: BID, user_id: UID, reason: "deceased", panel_note: NOTE }))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("immediate execution is superadmin-only", async () => {
    expect((await POST(req({ action: "execute", request_id: RID, panel_note: NOTE, confirm: true }))).status).toBe(403);
    guardResult = { ok: true, session: SUPER };
    expect((await POST(req({ action: "execute", request_id: RID, panel_note: NOTE, confirm: true }))).status).toBe(200);
    expect(calls[0].payload).toEqual({ action: "execute", request_id: RID, panel_note: NOTE, actor: { id: "adm-1", email: "ops@bloc.co.il", role: "superadmin" } });
  });

  it("request: sent with the actor (without the UI-only confirm) and audited under the building", async () => {
    const r = await POST(req({ action: "request", building_id: BID, user_id: UID, reason: "deceased", note: null, panel_note: NOTE, confirm: true }));
    expect(r.status).toBe(200);
    expect(calls[0]).toEqual({ path: "/api/internal/committee", payload: {
      action: "request", building_id: BID, user_id: UID, reason: "deceased", note: null, panel_note: NOTE, actor: { id: "adm-1", email: "ops@bloc.co.il", role: "admin" },
    } });
    expect(audits[0][1]).toBe("COMMITTEE_REQUEST");
    expect(audits[0][3]).toBe(BID);
    expect(audits[0][4]).toMatchObject({ user_id: UID, ok: true, panel_note: NOTE });
  });

  it("unknown request → 404; bloc errors pass through and are audited as failed", async () => {
    succRow = null;
    expect((await POST(req({ action: "cancel", request_id: RID, panel_note: NOTE }))).status).toBe(404);
    succRow = { building_id: BID };
    blocAnswer = { ok: false, status: 400, code: "NOT_LATER", error: "התאריך החדש חייב להיות אחרי המועד הנוכחי" };
    const r = await POST(req({ action: "extend", request_id: RID, panel_note: NOTE, until: "2026-10-10T20:59:59Z" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "התאריך החדש חייב להיות אחרי המועד הנוכחי", code: "NOT_LATER" });
    expect(audits.at(-1)[4]).toMatchObject({ ok: false, code: "NOT_LATER", until: "2026-10-10T20:59:59Z" });
  });
});
