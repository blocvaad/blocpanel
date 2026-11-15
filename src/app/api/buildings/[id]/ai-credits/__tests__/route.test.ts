// מתנת קרדיטים ל-AI לבניין (bloc AI-1): סופר-אדמין בלבד, ביומן. PANEL-PAY א1 (C2): דרך bloc (/api/internal/ai-credits,
// אותם פרמטרים של ai_topup_grant), עם קוד אישור. הפאנל לא קורא ל-RPC ולא קורא את הבניין.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let guardArgs: any[] = [];
let stepUpOk = true;
const calls: Array<{ path: string; payload: any }> = [];
const audits: any[][] = [];
let blocAnswer: any;

vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/stepUp", () => ({
  requireStepUp: () => (stepUpOk ? { ok: true } : { ok: false, reason: "missing", response: Response.json({ error: "x", code: "stepup_required" }, { status: 403 }) }),
}));
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("no direct read"); }, rpc: () => { throw new Error("no direct ai_topup_grant"); } } }));

import { POST } from "../route";
const ID = "11111111-1111-1111-1111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
const SESSION = { id: "44444444-4444-4444-8444-444444444444", email: "tal@bloc.co.il", full_name: "טל", role: "superadmin", auth_level: "mfa" };

beforeEach(() => {
  guardResult = { ok: true, session: SESSION };
  guardArgs = []; calls.length = 0; audits.length = 0; stepUpOk = true;
  blocAnswer = { ok: true, status: 200, data: { ok: true, id: "o1" } };
});

describe("POST /api/buildings/[id]/ai-credits", () => {
  it("superadmin only — the guard asks for the role, and a refusal reaches neither bloc nor the log", async () => {
    await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect(guardArgs[0]).toEqual({ role: "superadmin" });
    guardResult = { ok: false, response: { status: 403 } };
    calls.length = 0; audits.length = 0;
    const res: any = await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("without a fresh step-up: 403 stepup_required, nothing granted", async () => {
    stepUpOk = false;
    const res: any = await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("stepup_required");
    expect(calls).toHaveLength(0);
  });

  it("grants through bloc with exactly the RPC's parameters (who = the session's actor), and logs it with the order id", async () => {
    const res: any = await POST(req({ units: 1500, months: 6, note: "פיצוי על תקלה" }), ctx);
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ path: "/api/internal/ai-credits", payload: {
      actor: { id: SESSION.id, email: "tal@bloc.co.il", role: "superadmin" }, building_id: ID, units: 1500, months: 6, note: "פיצוי על תקלה",
    } }]);
    expect(audits).toHaveLength(1);
    expect(audits[0].slice(1, 4)).toEqual(["AI_CREDITS_GRANT", "building", ID]);
    expect(audits[0][4]).toEqual({ units: 1500, months: 6, note: "פיצוי על תקלה", order_id: "o1" });
    expect(await res.json()).toEqual({ ok: true, id: "o1" });
  });

  it("months default to a year", async () => {
    await POST(req({ units: 10, note: "פיילוט" }), ctx);
    expect(calls[0].payload.months).toBe(12);
  });

  it("no reason, no units, too many — 400 in Hebrew, nothing granted", async () => {
    for (const body of [{ units: 100 }, { units: 0, note: "פיילוט" }, { units: 200000, note: "פיילוט" }, { units: 100, note: "x" }]) {
      const res: any = await POST(req(body), ctx);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/[֐-׿]/);
    }
    expect(calls).toHaveLength(0);
  });

  it("an unknown building (bloc 404) and a failed check (bloc 503 read_failed) — Hebrew, logged as failed, not as granted", async () => {
    blocAnswer = { ok: false, status: 404, code: "not_found", error: "not_found" };
    let res: any = await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("הבניין לא נמצא.");
    blocAnswer = { ok: false, status: 503, code: "read_failed", error: "read_failed" };
    res = await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("לא הצלחנו לבדוק — שום דבר לא השתנה. נסו שוב.");
    expect(audits.map((a) => a[1])).toEqual(["MONEY_ACTION_FAILED", "MONEY_ACTION_FAILED"]);
    expect(audits[0][4]).toMatchObject({ action: "AI_CREDITS_GRANT", code: "not_found", units: 100 });
  });

  it("the RPC failed in bloc (503 write_failed) — nothing granted; a timeout — 'may have happened', logged as unknown", async () => {
    blocAnswer = { ok: false, status: 503, code: "write_failed", error: "write_failed" };
    let res: any = await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect((await res.json()).error).toContain("שום דבר לא השתנה");
    blocAnswer = { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב." };
    res = await POST(req({ units: 100, note: "פיילוט" }), ctx);
    expect(res.status).toBe(504);
    expect(audits[audits.length - 1][1]).toBe("MONEY_ACTION_UNKNOWN");
    expect(audits.some((a) => a[1] === "AI_CREDITS_GRANT")).toBe(false);
  });

  it("review #6: a 2xx without ok === true is 'may have happened' (502), logged as unknown, never as granted", async () => {
    for (const data of [{ id: "o1" }, { ok: "yes", id: "o1" }, {}]) {
      blocAnswer = { ok: true, status: 200, data };
      const res: any = await POST(req({ units: 100, note: "פיילוט" }), ctx);
      expect(res.status).toBe(502);
      expect((await res.json()).code).toBe("bad_shape");
    }
    expect(audits.map((a) => a[1])).toEqual(["MONEY_ACTION_UNKNOWN", "MONEY_ACTION_UNKNOWN", "MONEY_ACTION_UNKNOWN"]);
    // an order id of null is fine when ok === true
    blocAnswer = { ok: true, status: 200, data: { ok: true, id: null } };
    expect((await POST(req({ units: 100, note: "פיילוט" }), ctx)).status).toBe(200);
  });
});

