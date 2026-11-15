// bloc UI-R5c-1 — בניין חדש עם ראש ועד: דרך bloc (founder), בלי לכתוב לפרופיל של אף אחד.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
const calls: any[] = [];
const audits: any[] = [];
const touched: string[] = [];
let blocAnswer: any;
let insertError: any;
const inserted: any[] = [];

vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/externalNotify", () => ({ notifyExternal: async () => {} }));
// PANEL-PAY א1 (החלטה 364): מינוי ראש ועד ביצירה (admin_email → founder ב-bloc) דורש אישור בקוד. כאן — נשלט מהבדיקה.
let stepUpOk = true;
let stepUpCalls = 0;
vi.mock("@/lib/stepUp", () => ({
  requireStepUp: () => {
    stepUpCalls++;
    return stepUpOk ? { ok: true } : { ok: false, reason: "missing", response: Response.json({ error: "פעולת כסף — צריך לאשר", code: "stepup_required" }, { status: 403 }) };
  },
}));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    auth: { admin: { listUsers: async () => { touched.push("auth.listUsers"); return { data: { users: [] } }; } } },
    from: (table: string) => {
      touched.push(table);
      if (table !== "buildings") throw new Error(`unexpected write to ${table}`);
      const chain: any = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: null }),
        insert: (row: any) => { chain.row = row; inserted.push(row); return chain; },
        single: async () => (insertError ? { data: null, error: insertError } : { data: { id: "b-new", ...chain.row }, error: null }),
      };
      return chain;
    },
  },
}));

let POST: any;
const ADMIN = { id: "adm-1", email: "ops@bloc.co.il", role: "admin" };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });

beforeEach(async () => {
  ({ POST } = await import("../route"));
  guardResult = { ok: true, session: ADMIN };
  blocAnswer = { ok: true, status: 200, data: { ok: true, userId: "u1", name: "דנה" } };
  insertError = null;
  calls.length = 0; audits.length = 0; touched.length = 0; inserted.length = 0;
  stepUpOk = true; stepUpCalls = 0;
});

describe("buildings POST — the committee head through bloc", () => {
  it("REGRESSION: no profile is overwritten, no user list is scanned — bloc assigns the head", async () => {
    const r = await POST(req({ name: "השקד 104", admin_email: "dana@example.com", admin_name: "שם אחר" }));
    expect(r.status).toBe(200);
    expect(touched).not.toContain("profiles");
    expect(touched).not.toContain("auth.listUsers");
    expect(calls).toEqual([{ path: "/api/internal/members", payload: { action: "founder", building_id: "b-new", email: "dana@example.com", actor: ADMIN } }]);
    expect((await r.json()).founder).toEqual({ ok: true });
    expect(audits[0][1]).toBe("CREATE_BUILDING");
    expect(audits[0][4].founder).toEqual({ email: "dana@example.com", assigned: true, code: null });
  });

  it("no account with that email → the building stays, without a head, and the screen is told", async () => {
    blocAnswer = { ok: false, status: 404, code: "NO_USER", error: "אין ב-bloc חשבון עם המייל הזה." };
    const r = await POST(req({ name: "השקד 104", admin_email: "nobody@example.com" }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.data.id).toBe("b-new");
    expect(j.founder).toEqual({ ok: false, code: "NO_USER", message: "אין ב-bloc חשבון עם המייל הזה." });
    expect(audits[0][4].founder).toEqual({ email: "nobody@example.com", assigned: false, code: "NO_USER" });
  });

  it("without an email — no call to bloc, no founder in the answer", async () => {
    const r = await POST(req({ name: "השקד 104" }));
    expect(calls).toHaveLength(0);
    expect((await r.json()).founder).toBeUndefined();
    expect(audits[0][4].founder).toBeNull();
  });

  it("an insert failure is a Hebrew 500 (no DB text)", async () => {
    insertError = { message: 'duplicate key value violates unique constraint "buildings_invite_code_key"' };
    const r = await POST(req({ name: "השקד 104" }));
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe("יצירת הבניין נכשלה. נסו שוב.");
    expect(calls).toHaveLength(0);
  });
});

describe("PANEL-PAY א1 (decision 363): a new building opens on the default plan", () => {
  it("the insert carries no plan / comp_reason / plan_expires (the DB default is free); the audit has no plan", async () => {
    const r = await POST(req({ name: "השקד 104", address: "השקד 104, חולון", max_tenants: 30 }));
    expect(r.status).toBe(200);
    expect(Object.keys(inserted[0]).sort()).toEqual(["address", "invite_code", "is_active", "max_tenants", "name"]);
    expect(audits[0][4]).not.toHaveProperty("plan");
    expect(audits[0][4]).not.toHaveProperty("comp_reason");
  });
  it("a plan in the body (even free) → 400 plan_moved, nothing created", async () => {
    for (const body of [{ name: "בניין", plan: "tower", comp_reason: "פיילוט" }, { name: "בניין", plan: "free" }, { name: "בניין", comp_reason: "x" }]) {
      const r = await POST(req(body));
      expect(r.status).toBe(400);
      expect((await r.json()).code).toBe("plan_moved");
    }
    expect(inserted).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

describe("PANEL-PAY א1 (decision 364): appointing the committee head at creation needs a fresh step-up", () => {
  it("admin_email without a step-up: 403 stepup_required before anything — no insert, no bloc call, no log", async () => {
    stepUpOk = false;
    const r = await POST(req({ name: "השקד 104", admin_email: "dana@example.com" }));
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe("stepup_required");
    expect(inserted).toHaveLength(0);
    expect(touched).toHaveLength(0);
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("admin_email with a fresh step-up: the building is created and bloc appoints the head", async () => {
    const r = await POST(req({ name: "השקד 104", admin_email: "dana@example.com" }));
    expect(r.status).toBe(200);
    expect(stepUpCalls).toBe(1);
    expect(inserted).toHaveLength(1);
    expect(calls[0].payload).toMatchObject({ action: "founder", building_id: "b-new", email: "dana@example.com" });
  });
  it("without admin_email no code is asked, even when there is no step-up", async () => {
    stepUpOk = false;
    const r = await POST(req({ name: "השקד 104" }));
    expect(r.status).toBe(200);
    expect(stepUpCalls).toBe(0);
    expect(inserted).toHaveLength(1);
    expect(calls).toHaveLength(0);
  });
});

