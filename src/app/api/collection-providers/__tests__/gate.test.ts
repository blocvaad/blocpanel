// PAY-1b (SQL 225, החלטה 356): שער G14 — תיעוד סגירה, פתיחה מחדש, והדלקה שנחסמת. סופר-אדמין בלבד.
// PANEL-PAY א1 (C3): הכללים רצים ב-bloc (/api/internal/collection-providers: close_gate / reopen_gate / set_offered); הפאנל
// שולח, מתרגם את הקודים של bloc לעברית ורושם ביומן — הראיה עצמה לא נרשמת אצלו, רק האורך שלה.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let stepUpOk = true;
const calls: Array<{ path: string; payload: any }> = [];
const audits: any[][] = [];
let blocAnswer: any;
let usageResult: any;

vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return typeof blocAnswer === "function" ? blocAnswer(payload) : blocAnswer; } }));
vi.mock("@/lib/stepUp", () => ({
  requireStepUp: () => (stepUpOk ? { ok: true } : { ok: false, reason: "expired", response: Response.json({ error: "x", code: "stepup_required" }, { status: 403 }) }),
}));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: () => { throw new Error("no direct read or write of platform_payment_providers"); },
    rpc: async () => usageResult,
  },
}));

import { POST } from "../route";
import { gateFromDb, GATE_HINT } from "@/lib/collectionProviders";

const req = (body: any): any => ({ json: async () => body, headers: { get: () => "1.2.3.4" } });
const SESSION = { id: "66666666-6666-4666-8666-666666666666", email: "tal@bloc.co.il", role: "superadmin" };
const ACTOR = { id: SESSION.id, email: SESSION.email, role: "superadmin" };
const CLOSED_ROW = { provider: "cardcom", offered: false, updated_at: null, updated_by: null, gate_closed_at: "2026-11-14T09:00:00Z", gate_closed_by: "tal@bloc.co.il", gate_evidence: "נבדק מול ספק" };
const OPEN_ROW = { ...CLOSED_ROW, gate_closed_at: null, gate_closed_by: null, gate_evidence: null };
const EVIDENCE = "אושר מול Cardcom במייל מ-12/11";
const fail = (status: number, code: string) => ({ ok: false, status, code, error: code });

beforeEach(() => {
  guardResult = { ok: true, session: SESSION };
  stepUpOk = true; calls.length = 0; audits.length = 0;
  blocAnswer = { ok: true, status: 200, data: { ok: true, provider: CLOSED_ROW } };
  usageResult = { data: [{ provider: "cardcom", buildings: 0 }], error: null };
});

describe("close_gate", () => {
  it("sent to bloc with the trimmed evidence and the actor; one audit entry with the length only", async () => {
    const res: any = await POST(req({ action: "close_gate", provider: "cardcom", evidence: `  ${EVIDENCE}  ` }));
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ path: "/api/internal/collection-providers", payload: { actor: ACTOR, action: "close_gate", provider: "cardcom", evidence: EVIDENCE } }]);
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_GATE_CLOSED");
    expect(audits[0][3]).toBe("cardcom");
    expect(audits[0][4]).toEqual({ label: "Cardcom", evidence_length: EVIDENCE.length });
    expect(JSON.stringify(audits[0])).not.toContain("אושר מול");
  });
  it("the answer is the row the card reads (gateFromDb → closed), only the known columns", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, provider: { ...CLOSED_ROW, secret_column: "x" } } };
    const j = await (await POST(req({ action: "close_gate", provider: "cardcom", evidence: EVIDENCE }))).json();
    expect(j.provider).toEqual(CLOSED_ROW);
    expect(gateFromDb("cardcom", j.provider, true).closed).toBe(true);
  });
  it("validation: evidence under 10 chars (after trim), missing, over 1000, management, unknown field — 400, nothing sent", async () => {
    for (const body of [
      { action: "close_gate", provider: "cardcom", evidence: "  קצר  " },
      { action: "close_gate", provider: "cardcom" },
      { action: "close_gate", provider: "cardcom", evidence: "x".repeat(1001) },
      { action: "close_gate", provider: "management", evidence: EVIDENCE },
      { action: "close_gate", provider: "cardcom", evidence: EVIDENCE, gate_closed_by: "someone" },
    ]) {
      const res: any = await POST(req(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("exactly 10 characters passes", async () => {
    expect((await POST(req({ action: "close_gate", provider: "grow", evidence: "1234567890" }))).status).toBe(200);
  });
});

describe("close_gate on a gate that is already closed (decision 356)", () => {
  it("bloc refuses (gate_already_closed): 409 in Hebrew — reopen first; logged as failed, not as closed", async () => {
    blocAnswer = fail(409, "gate_already_closed");
    const res: any = await POST(req({ action: "close_gate", provider: "cardcom", evidence: EVIDENCE }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("פותחים אותו מחדש");
    expect(audits.map((a) => a[1])).toEqual(["MONEY_ACTION_FAILED"]);
    expect(audits[0][4]).toMatchObject({ action: "COLLECTION_PROVIDER_GATE_CLOSED", code: "gate_already_closed", evidence_length: EVIDENCE.length });
  });
});

describe("reopen_gate", () => {
  it("sent to bloc; audit says which provider", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, provider: OPEN_ROW } };
    const res: any = await POST(req({ action: "reopen_gate", provider: "cardcom" }));
    expect(res.status).toBe(200);
    expect(calls[0].payload).toEqual({ actor: ACTOR, action: "reopen_gate", provider: "cardcom" });
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_GATE_REOPENED");
    expect(audits[0][4]).toEqual({ label: "Cardcom" });
    expect(gateFromDb("cardcom", (await res.json()).provider, true).closed).toBe(false);
  });
  it("the provider is ON — bloc refuses (gate_reopen_while_offered): 409 in Hebrew", async () => {
    blocAnswer = fail(409, "gate_reopen_while_offered");
    const res: any = await POST(req({ action: "reopen_gate", provider: "cardcom" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("קודם מכבים את הספק");
  });
  it("only a recorded gate is reopened — an open gate → 409 gate_not_closed in Hebrew", async () => {
    blocAnswer = fail(409, "gate_not_closed");
    const res: any = await POST(req({ action: "reopen_gate", provider: "grow" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("השער לא תועד כסגור, ולכן אין מה לפתוח מחדש.");
    expect(audits.some((a) => a[1] === "COLLECTION_PROVIDER_GATE_REOPENED")).toBe(false);
  });
  it("no row in bloc → 404; bloc's read failed → 503 'nothing changed' (never \"open\")", async () => {
    blocAnswer = fail(404, "not_found");
    expect((await POST(req({ action: "reopen_gate", provider: "grow" }))).status).toBe(404);
    blocAnswer = fail(503, "read_failed");
    const res: any = await POST(req({ action: "reopen_gate", provider: "grow" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("לא הצלחנו לבדוק — שום דבר לא השתנה. נסו שוב.");
  });
  it("management has no gate — 400", async () => {
    expect((await POST(req({ action: "reopen_gate", provider: "management" }))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("turning ON with an open gate", () => {
  it("bloc refuses (gate_open) — 409 with the gate hint; logged as failed", async () => {
    blocAnswer = fail(409, "gate_open");
    const res: any = await POST(req({ provider: "cardcom", offered: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(`${GATE_HINT}.`);
    expect(audits.map((a) => a[1])).toEqual(["MONEY_ACTION_FAILED"]);
  });
  it("the row changed under us (409 changed) — 'refresh and check'", async () => {
    blocAnswer = fail(409, "changed");
    const res: any = await POST(req({ provider: "cardcom", offered: true }));
    expect((await res.json()).error).toContain("רעננו את הדף");
  });
  it("a closed gate — the ON path and its audit entry", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, provider: { ...CLOSED_ROW, offered: true } } };
    const res: any = await POST(req({ provider: "cardcom", offered: true }));
    expect(res.status).toBe(200);
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_ON");
    expect(audits[0][4]).toEqual({ label: "Cardcom", offered: true, buildings: 0 });
  });
  it("OFF goes through set_offered with offered:false (never a gate action)", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, provider: { ...OPEN_ROW, provider: "payplus", offered: false } } };
    const res: any = await POST(req({ provider: "payplus", offered: false }));
    expect(res.status).toBe(200);
    expect(calls[0].payload).toEqual({ actor: ACTOR, action: "set_offered", provider: "payplus", offered: false });
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_OFF");
  });
});

describe("superadmin only, with a step-up", () => {
  it("a refusal from the guard sends nothing, for every action", async () => {
    guardResult = { ok: false, response: { status: 403 } };
    for (const body of [{ action: "close_gate", provider: "cardcom", evidence: EVIDENCE }, { action: "reopen_gate", provider: "cardcom" }, { provider: "cardcom", offered: true }]) {
      expect((await POST(req(body))).status).toBe(403);
    }
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
  it("an expired step-up stops every action before bloc", async () => {
    stepUpOk = false;
    for (const body of [{ action: "close_gate", provider: "cardcom", evidence: EVIDENCE }, { action: "reopen_gate", provider: "cardcom" }, { provider: "cardcom", offered: false }]) {
      const res: any = await POST(req(body));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("stepup_required");
    }
    expect(calls).toHaveLength(0);
  });
});

describe("bloc unreachable (SQL 225 is in production — there is no fallback path any more)", () => {
  it("timeout on a gate action — 'may have happened', logged as unknown", async () => {
    blocAnswer = { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב." };
    const res: any = await POST(req({ action: "close_gate", provider: "cardcom", evidence: EVIDENCE }));
    expect(res.status).toBe(504);
    expect(audits[0][1]).toBe("MONEY_ACTION_UNKNOWN");
    expect(audits[0][4]).toMatchObject({ action: "COLLECTION_PROVIDER_GATE_CLOSED", outcome: "unknown" });
  });
  it("bloc's write failed (503 write_failed) — 'nothing changed', logged as failed", async () => {
    blocAnswer = fail(503, "write_failed");
    const res: any = await POST(req({ provider: "grow", offered: true }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("שום דבר לא השתנה");
    expect(audits[0][1]).toBe("MONEY_ACTION_FAILED");
  });
  it("the route has no fallback write without the gate columns", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "src", "app", "api", "collection-providers", "route.ts"), "utf8");
    expect(src).not.toMatch(/isMissing225|retry|\.update\(/);
  });
});

describe("review #6: gate actions need ok === true and the provider row", () => {
  it("close / reopen with a 2xx that is not bloc's answer → 502 bad_shape, logged as unknown (not as closed / reopened)", async () => {
    for (const body of [{ action: "close_gate", provider: "cardcom", evidence: EVIDENCE }, { action: "reopen_gate", provider: "cardcom" }]) {
      for (const data of [{ provider: CLOSED_ROW }, { ok: true }, {}]) {
        blocAnswer = { ok: true, status: 200, data };
        const res: any = await POST(req(body));
        expect(res.status).toBe(502);
        expect((await res.json()).code).toBe("bad_shape");
      }
    }
    expect(audits.every((a) => a[1] === "MONEY_ACTION_UNKNOWN")).toBe(true);
    expect(audits.map((a) => a[4].action)).toContain("COLLECTION_PROVIDER_GATE_REOPENED");
  });
});

