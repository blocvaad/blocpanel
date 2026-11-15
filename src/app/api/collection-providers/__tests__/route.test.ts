// מתג לכל ספק סליקה (bloc PAY-M, SQL 202): סופר-אדמין בלבד, ביומן — עם כמה בניינים מחוברים.
// PANEL-PAY א1 (C3): השינוי נכתב ב-bloc (/api/internal/collection-providers, set_offered), עם קוד אישור. הפאנל לא כותב
// ל-platform_payment_providers; הוא רק קורא כמה בניינים מחוברים, ליומן.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let guardArgs: any[] = [];
let stepUpOk = true;
const calls: Array<{ path: string; payload: any }> = [];
const audits: any[][] = [];
let blocAnswer: any;
let usageResult: any;

vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/stepUp", () => ({
  requireStepUp: () => (stepUpOk ? { ok: true } : { ok: false, reason: "missing", response: Response.json({ error: "x", code: "stepup_required" }, { status: 403 }) }),
}));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: () => { throw new Error("the panel must not write platform_payment_providers"); },
    rpc: async () => usageResult,
  },
}));

import { POST } from "../route";
const req = (body: any): any => ({ json: async () => body, headers: { get: (n: string) => (n === "x-forwarded-for" ? "1.2.3.4" : null) } });
const SESSION = { id: "55555555-5555-4555-8555-555555555555", email: "tal@bloc.co.il", full_name: "טל", role: "superadmin", auth_level: "mfa" };
const ROW = { provider: "cardcom", offered: true, updated_at: "2026-11-01T09:00:00Z", updated_by: "tal@bloc.co.il", gate_closed_at: "2026-10-30T09:00:00Z", gate_closed_by: "tal@bloc.co.il", gate_evidence: "אושר" };

beforeEach(() => {
  guardResult = { ok: true, session: SESSION };
  guardArgs = []; calls.length = 0; audits.length = 0; stepUpOk = true;
  blocAnswer = { ok: true, status: 200, data: { ok: true, provider: ROW } };
  usageResult = { data: [{ provider: "payplus", buildings: 7 }, { provider: "cardcom", buildings: 2 }, { provider: "none", buildings: 30 }], error: null };
});

describe("POST /api/collection-providers", () => {
  it("superadmin only — the guard asks for the role, and a refusal reaches neither bloc nor the log", async () => {
    await POST(req({ provider: "cardcom", offered: true }));
    expect(guardArgs[0]).toEqual({ role: "superadmin" });
    guardResult = { ok: false, response: { status: 403 } };
    calls.length = 0; audits.length = 0;
    const res: any = await POST(req({ provider: "cardcom", offered: true }));
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("without a fresh step-up: 403 stepup_required, nothing changes", async () => {
    stepUpOk = false;
    const res: any = await POST(req({ provider: "cardcom", offered: true }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("stepup_required");
    expect(calls).toHaveLength(0);
  });

  it("turns one provider on through bloc (set_offered, the session's actor); the log says which and how many buildings use it", async () => {
    const res: any = await POST(req({ provider: "cardcom", offered: true }));
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ path: "/api/internal/collection-providers", payload: {
      actor: { id: SESSION.id, email: "tal@bloc.co.il", role: "superadmin" }, action: "set_offered", provider: "cardcom", offered: true,
    } }]);
    expect(await res.json()).toEqual({ ok: true, provider: ROW });
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_ON");
    expect(audits[0][2]).toBe("platform");
    expect(audits[0][3]).toBe("cardcom");
    expect(audits[0][4]).toEqual({ label: "Cardcom", offered: true, buildings: 2 });
    expect(audits[0][5]).toBe("1.2.3.4");
  });

  it("turning off is logged as off; a failed count — the change is kept, without the number", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, provider: { ...ROW, provider: "payplus", offered: false } } };
    usageResult = { data: null, error: { message: "boom" } };
    const res: any = await POST(req({ provider: "payplus", offered: false }));
    expect(res.status).toBe(200);
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_OFF");
    expect(audits[0][4]).toEqual({ label: "PayPlus", offered: false, buildings: null });
  });

  it("a provider that is not in the list, a missing field, an extra field — 400, nothing sent", async () => {
    for (const body of [{ provider: "stripe", offered: true }, { provider: "payplus" }, { provider: "payplus", offered: "yes" }, { provider: "payplus", offered: true, building_id: "x" }]) {
      const res: any = await POST(req(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("bloc could not read (503) — 'nothing changed'; the provider is missing in bloc (404); neither is logged as a change", async () => {
    blocAnswer = { ok: false, status: 503, code: "read_failed", error: "read_failed" };
    let res: any = await POST(req({ provider: "grow", offered: true }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("לא הצלחנו לבדוק — שום דבר לא השתנה. נסו שוב.");
    blocAnswer = { ok: false, status: 404, code: "not_found", error: "not_found" };
    res = await POST(req({ provider: "grow", offered: true }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/[א-ת]/);
    expect(audits.map((a) => a[1])).toEqual(["MONEY_ACTION_FAILED", "MONEY_ACTION_FAILED"]);
    expect(audits[0][4]).toMatchObject({ action: "COLLECTION_PROVIDER_ON", code: "read_failed", label: "Grow (משולם)" });
  });

  it("review #6: set_offered — a 2xx without ok === true or without the provider row is 'may have happened' (502), logged as unknown", async () => {
    for (const data of [{ provider: ROW }, { ok: true }, { ok: true, provider: { offered: true } }, {}]) {
      blocAnswer = { ok: true, status: 200, data };
      const res: any = await POST(req({ provider: "cardcom", offered: true }));
      expect(res.status).toBe(502);
      expect((await res.json()).code).toBe("bad_shape");
    }
    expect(audits.every((a) => a[1] === "MONEY_ACTION_UNKNOWN")).toBe(true);
    expect(audits[0][4]).toMatchObject({ action: "COLLECTION_PROVIDER_ON", code: "bad_shape", label: "Cardcom" });
  });
});

