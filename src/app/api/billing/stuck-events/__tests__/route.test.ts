// BILL-1d (C3): POST /api/billing/stuck-events — permission, validation, the signed bloc call shape, each result.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let guardArgs: any[] = [];
let blocAnswer: any;
const blocCalls: any[] = [];
const audits: any[] = [];
vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs.push(a); return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { blocCalls.push({ path, payload }); return blocAnswer; } }));

const EID = "e1111111-1111-4111-8111-111111111111";
const NOTE = "נבדק ב-PayPlus, לא נגבה כסף";
const post = async (body: unknown) => (await import("../route")).POST({ json: async () => body } as any);
beforeEach(() => {
  guardResult = { ok: true, session: { id: "s1", email: "tal@bloc.test", role: "superadmin" } };
  guardArgs = []; blocCalls.length = 0; audits.length = 0;
  blocAnswer = { ok: true, status: 200, data: { ok: true, result: "closed" } };
});

describe("permission", () => {
  it("asks guard for billing.manage", async () => {
    await post({ event_id: EID, note: NOTE });
    expect(guardArgs[0]).toEqual([{ permission: "billing.manage" }]);
  });
  it("403 from guard: nothing is sent to bloc", async () => {
    const { NextResponse } = await import("next/server");
    guardResult = { ok: false, response: NextResponse.json({ error: "אין הרשאה" }, { status: 403 }) };
    const res = await post({ event_id: EID, note: NOTE });
    expect(res.status).toBe(403);
    expect(blocCalls).toEqual([]);
    expect(audits).toEqual([]);
  });
});

describe("validation", () => {
  it.each([
    ["bad uuid", { event_id: "nope", note: NOTE }],
    ["missing id", { note: NOTE }],
    ["short note", { event_id: EID, note: "קצר" }],
    ["note short after trim", { event_id: EID, note: "   123456789   " }],
    ["note too long", { event_id: EID, note: "א".repeat(501) }],
    ["missing note", { event_id: EID }],
  ])("%s → 400, no bloc call", async (_n, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(blocCalls).toEqual([]);
  });
  it("a body that is not JSON → 400", async () => {
    const res = await (await import("../route")).POST({ json: async () => { throw new Error("x"); } } as any);
    expect(res.status).toBe(400);
    expect(blocCalls).toEqual([]);
  });
  it("exactly 10 chars after trim passes", async () => {
    expect((await post({ event_id: EID, note: "  1234567890  " })).status).toBe(200);
    expect(blocCalls[0].payload.note).toBe("1234567890");
  });
  it("500 chars passes", async () => {
    expect((await post({ event_id: EID, note: "א".repeat(500) })).status).toBe(200);
  });
});

describe("the bloc call", () => {
  it("is the signed internal billing action close_stuck_event with the staff email as actor", async () => {
    await post({ event_id: EID, note: `  ${NOTE}  ` });
    expect(blocCalls).toEqual([{ path: "/api/internal/billing", payload: { action: "close_stuck_event", event_id: EID, note: NOTE, actor: "tal@bloc.test" } }]);
  });
});

describe("results", () => {
  it("closed → ok + message, audited", async () => {
    const res = await post({ event_id: EID, note: NOTE });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, result: "closed" });
    expect(j.message).toContain("נסגר");
    expect(audits[0][1]).toBe("BILLING_STUCK_EVENT_CLOSED");
    expect(audits[0][3]).toBe(EID);
    expect(audits[0][4]).toMatchObject({ note: NOTE, actor_email: "tal@bloc.test" });
  });
  it("not_stuck → ok + its own message, not audited as closed", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, result: "not_stuck" } };
    const res = await post({ event_id: EID, note: NOTE });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, result: "not_stuck" });
    expect(j.message).toContain("כבר לא תקוע");
    expect(audits).toEqual([]);
  });
  it("404 → its own message", async () => {
    blocAnswer = { ok: false, status: 404, code: "not_found", error: "x" };
    const res = await post({ event_id: EID, note: NOTE });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("לא נמצא");
    expect(audits).toEqual([]);
  });
  it("503 from bloc → its own message (nothing saved)", async () => {
    blocAnswer = { ok: false, status: 503, code: "db_unavailable", error: "x" };
    const res = await post({ event_id: EID, note: NOTE });
    expect(res.status).toBe(503);
    const j = await res.json();
    expect(j.error).toContain("לא נשמר כלום");
    expect(j.code).toBe("unavailable");
    expect(audits).toEqual([]);
  });
  it("503 NOT_CONFIGURED keeps callBloc's own explanation", async () => {
    blocAnswer = { ok: false, status: 503, code: "NOT_CONFIGURED", error: "החיבור ל-bloc לא מוגדר" };
    const j = await (await post({ event_id: EID, note: NOTE })).json();
    expect(j).toEqual({ error: "החיבור ל-bloc לא מוגדר", code: "NOT_CONFIGURED" });
  });
  it("503 SELF_URL keeps callBloc's own explanation", async () => {
    blocAnswer = { ok: false, status: 503, code: "SELF_URL", error: "BLOC_APP_URL מצביע על הפאנל עצמו" };
    expect(await (await post({ event_id: EID, note: NOTE })).json()).toEqual({ error: "BLOC_APP_URL מצביע על הפאנל עצמו", code: "SELF_URL" });
  });
  it("other failures pass through with status", async () => {
    blocAnswer = { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה" };
    const res = await post({ event_id: EID, note: NOTE });
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "bloc לא ענה", code: "TIMEOUT" });
  });
  it("an unknown result is never shown as success", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, result: "weird" } };
    const res = await post({ event_id: EID, note: NOTE });
    expect(res.status).toBe(502);
    expect(audits).toEqual([]);
  });
});
