// PANEL-PAY א1 (S988, החלטה 365): שינוי תפקיד של איש צוות נרשם ביומן "מה היה → מה נהיה". בלי המצב הקודם — לא משנים.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let before: any;
let readError: any = null;
let updateError: any = null;
const updates: any[] = [];
const audits: any[][] = [];

vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("bcryptjs", () => ({ default: { hash: async (p: string) => `hash(${p.length})` }, hash: async (p: string) => `hash(${p.length})` }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: () => {
      let updating: any = null;
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        update: (u: any) => { updating = u; updates.push(u); return chain; },
        maybeSingle: async () => ({ data: readError ? null : before, error: readError }),
        single: async () => (updateError ? { data: null, error: updateError } : { data: { id: "t1", email: "ops@bloc.co.il", full_name: "Ops", ...before, ...updating }, error: null }),
        delete: () => chain,
      };
      return chain;
    },
  },
}));

import { PATCH } from "../route";
const SUPER = { id: "s1", email: "tal@bloc.co.il", full_name: "טל", role: "superadmin" };
const ctx = { params: Promise.resolve({ id: "t1" }) };
const req = (body: any): any => ({ json: async () => body, headers: { get: (n: string) => (n === "x-forwarded-for" ? "7.7.7.7, 10.0.0.9" : null) } });

beforeEach(() => {
  guardResult = { ok: true, session: SUPER };
  before = { id: "t1", role: "viewer", is_active: true };
  readError = null; updateError = null; updates.length = 0; audits.length = 0;
});

describe("PATCH /api/settings/admin/[id] — the log says old → new", () => {
  it("a role change: { role: { from, to } } beside the changed keys", async () => {
    const res: any = await PATCH(req({ role: "superadmin" }), ctx);
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ role: "superadmin" }]);
    expect(audits[0].slice(1, 4)).toEqual(["UPDATE_ADMIN", "panel_admin", "t1"]);
    expect(audits[0][4]).toEqual({ updates: ["role"], role: { from: "viewer", to: "superadmin" } });
  });
  it("deactivating: { is_active: { from: true, to: false } }; a name change has no role / is_active entry", async () => {
    await PATCH(req({ is_active: false }), ctx);
    expect(audits[0][4]).toEqual({ updates: ["is_active"], is_active: { from: true, to: false } });
    await PATCH(req({ full_name: "שם חדש" }), ctx);
    expect(audits[1][4]).toEqual({ updates: ["full_name"] });
  });
  it("the same role again is not logged as a change of role", async () => {
    await PATCH(req({ role: "viewer" }), ctx);
    expect(audits[0][4]).toEqual({ updates: ["role"] });
  });
  it("the previous state cannot be read → 503 'nothing changed', no update, no log", async () => {
    readError = { message: "timeout" };
    const res: any = await PATCH(req({ role: "admin" }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("לא הצלחנו לבדוק — שום דבר לא השתנה. נסו שוב.");
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("an unknown admin → 404; a failed update → 500 in Hebrew (no DB text), not logged", async () => {
    before = null;
    expect((await PATCH(req({ role: "admin" }), ctx)).status).toBe(404);
    before = { id: "t1", role: "viewer", is_active: true };
    updateError = { message: 'duplicate key value violates unique constraint "x"' };
    const res: any = await PATCH(req({ role: "admin" }), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("השמירה נכשלה. נסו שוב.");
    expect(audits).toHaveLength(0);
  });
  it("the IP passed to the log is the raw header — auditLog keeps its first entry (lib/auth auditIp)", async () => {
    await PATCH(req({ role: "admin" }), ctx);
    expect(audits[0][5]).toBe("7.7.7.7, 10.0.0.9");
  });
});
