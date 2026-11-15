// PAY-1b (SQL 225, החלטה 356): שער G14 — תיעוד סגירה, פתיחה מחדש, והדלקה שנחסמת. סופר-אדמין בלבד.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
const updates: Array<{ values: any; eq: [string, string] | null; select: string | null; not?: [string, string, unknown] }> = [];
const audits: any[][] = [];
let results: any[] = [];
let usageResult: any;

vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: () => {
      const u: { values: any; eq: [string, string] | null; select: string | null; not?: [string, string, unknown] } = { values: null, eq: null, select: null };
      // the chain is awaitable at any point (update…select, or select…eq for a read) — each await takes the next answer
      const chain: any = {
        update: (values: any) => { u.values = values; updates.push(u); return chain; },
        eq: (c: string, v: string) => { u.eq = [c, v]; return chain; },
        not: (c: string, op: string, v: unknown) => { u.not = [c, op, v]; return chain; },
        select: (cols: string) => { u.select = cols; return chain; },
        then: (res: (v: any) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(results.length > 1 ? results.shift() : results[0]).then(res, rej),
      };
      return chain;
    },
    rpc: async () => usageResult,
  },
}));

import { POST } from "../route";
const req = (body: any): any => ({ json: async () => body, headers: { get: () => "1.2.3.4" } });
const SESSION = { id: "a1", email: "tal@bloc.co.il", role: "superadmin" };
const GATE_ROW = { provider: "cardcom", offered: false, gate_closed_at: "2026-11-14T09:00:00Z", gate_closed_by: "tal@bloc.co.il", gate_evidence: "נבדק מול ספק" };
const EVIDENCE = "אושר מול Cardcom במייל מ-12/11";

beforeEach(() => {
  guardResult = { ok: true, session: SESSION };
  updates.length = 0; audits.length = 0;
  results = [{ data: [GATE_ROW], error: null }];
  usageResult = { data: [{ provider: "cardcom", buildings: 0 }], error: null };
});

describe("close_gate", () => {
  it("sets all three columns together: who, when, the evidence; one audit entry with the length only", async () => {
    const res: any = await POST(req({ action: "close_gate", provider: "cardcom", evidence: `  ${EVIDENCE}  ` }));
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].eq).toEqual(["provider", "cardcom"]);
    expect(Object.keys(updates[0].values).sort()).toEqual(["gate_closed_at", "gate_closed_by", "gate_evidence"]);
    expect(updates[0].values.gate_closed_by).toBe("tal@bloc.co.il");
    expect(updates[0].values.gate_evidence).toBe(EVIDENCE);
    expect(Number.isNaN(Date.parse(updates[0].values.gate_closed_at))).toBe(false);
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_GATE_CLOSED");
    expect(audits[0][3]).toBe("cardcom");
    expect(audits[0][4]).toEqual({ label: "Cardcom", evidence_length: EVIDENCE.length });
    expect(JSON.stringify(audits[0])).not.toContain("אושר מול");
  });

  it("validation: evidence under 10 chars (after trim), missing, over 1000, management, unknown field — 400, nothing written", async () => {
    const bad = [
      { action: "close_gate", provider: "grow", evidence: "קצר" },
      { action: "close_gate", provider: "grow", evidence: "123456789" },
      { action: "close_gate", provider: "grow", evidence: "         x         " },
      { action: "close_gate", provider: "grow" },
      { action: "close_gate", provider: "grow", evidence: "א".repeat(1001) },
      { action: "close_gate", provider: "management", evidence: EVIDENCE },
      { action: "close_gate", provider: "grow", evidence: EVIDENCE, offered: true },
      { action: "explode", provider: "grow" },
    ];
    for (const body of bad) expect((await POST(req(body)) as any).status, JSON.stringify(body)).toBe(400);
    const r: any = await POST(req(bad[1]));
    expect((await r.json()).error).toContain("10");
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("exactly 10 characters passes", async () => {
    expect(((await POST(req({ action: "close_gate", provider: "grow", evidence: "1234567890" }))) as any).status).toBe(200);
  });
});

describe("close_gate on a gate that is already closed (decision 356)", () => {
  it("the DB refuses (provider_gate_already_closed): 409 in Hebrew — reopen first; nothing logged", async () => {
    results = [{ data: null, error: { code: "P0001", message: "provider_gate_already_closed" } }];
    const res: any = await POST(req({ action: "close_gate", provider: "payplus", evidence: EVIDENCE }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("פותחים אותו מחדש");
    expect(audits).toHaveLength(0);
  });
});

describe("reopen_gate", () => {
  it("clears all three columns; audit says which provider", async () => {
    results = [{ data: [{ provider: "cardcom", offered: false, gate_closed_at: null, gate_closed_by: null, gate_evidence: null }], error: null }];
    const res: any = await POST(req({ action: "reopen_gate", provider: "cardcom" }));
    expect(res.status).toBe(200);
    expect(updates[0].values).toEqual({ gate_closed_at: null, gate_closed_by: null, gate_evidence: null });
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_GATE_REOPENED");
    expect(audits[0][4]).toEqual({ label: "Cardcom" });
  });

  it("the provider is ON — the DB refuses (provider_gate_reopen_while_offered): 409 in Hebrew, nothing logged", async () => {
    results = [{ data: null, error: { code: "P0001", message: "provider_gate_reopen_while_offered" } }];
    const res: any = await POST(req({ action: "reopen_gate", provider: "payplus" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("מכבים");
    expect(audits).toHaveLength(0);
  });

  it("only a closed gate is reopened: the update is filtered on gate_closed_at, and an open gate → 409, nothing logged", async () => {
    results = [{ data: [], error: null }, { data: [{ provider: "grow" }], error: null }];
    const res: any = await POST(req({ action: "reopen_gate", provider: "grow" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("לא תועד כסגור");
    expect(updates[0].not).toEqual(["gate_closed_at", "is", null]);
    expect(audits).toHaveLength(0);
  });

  it("no row at all (SQL 202 missing) → 503; the existence read failed → 500 (never \"open\")", async () => {
    results = [{ data: [], error: null }, { data: [], error: null }];
    expect(((await POST(req({ action: "reopen_gate", provider: "grow" }))) as any).status).toBe(503);
    results = [{ data: [], error: null }, { data: null, error: { message: "boom" } }];
    expect(((await POST(req({ action: "reopen_gate", provider: "grow" }))) as any).status).toBe(500);
    expect(audits).toHaveLength(0);
  });

  it("management has no gate — 400", async () => {
    expect(((await POST(req({ action: "reopen_gate", provider: "management" }))) as any).status).toBe(400);
    expect(updates).toHaveLength(0);
  });
});

describe("turning ON with an open gate", () => {
  it("provider_gate_open from the DB — 409 with the gate hint; nothing logged", async () => {
    results = [{ data: null, error: { code: "P0001", message: "provider_gate_open" } }];
    const res: any = await POST(req({ provider: "cardcom", offered: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("G14");
    expect(audits).toHaveLength(0);
  });

  it("the error in details (PostgREST shape) is mapped the same", async () => {
    results = [{ data: null, error: { code: "P0001", message: "x", details: "provider_gate_open" } }];
    expect(((await POST(req({ provider: "grow", offered: true }))) as any).status).toBe(409);
  });

  it("a closed gate — the existing ON path and its audit entry are unchanged", async () => {
    results = [{ data: [{ ...GATE_ROW, offered: true }], error: null }];
    const res: any = await POST(req({ provider: "cardcom", offered: true }));
    expect(res.status).toBe(200);
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_ON");
    expect(audits[0][4]).toEqual({ label: "Cardcom", offered: true, buildings: 0 });
  });

  it("OFF is never blocked by the gate code (no gate error path for a normal OFF)", async () => {
    results = [{ data: [{ provider: "payplus", offered: false }], error: null }];
    const res: any = await POST(req({ provider: "payplus", offered: false }));
    expect(res.status).toBe(200);
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_OFF");
  });
});

describe("superadmin only", () => {
  it("a refusal from the guard writes nothing, for every action", async () => {
    guardResult = { ok: false, response: { status: 403 } };
    for (const body of [{ action: "close_gate", provider: "grow", evidence: EVIDENCE }, { action: "reopen_gate", provider: "grow" }, { provider: "grow", offered: true }]) {
      expect(((await POST(req(body))) as any).status).toBe(403);
    }
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
});

describe("before SQL 225 (columns missing)", () => {
  const COL_ERR = { code: "42703", message: 'column platform_payment_providers.gate_closed_at does not exist' };
  it("close / reopen — 503 that names SQL 225, nothing logged", async () => {
    results = [{ data: null, error: COL_ERR }];
    for (const body of [{ action: "close_gate", provider: "grow", evidence: EVIDENCE }, { action: "reopen_gate", provider: "grow" }]) {
      const res: any = await POST(req(body));
      expect(res.status).toBe(503);
      expect((await res.json()).error).toContain("SQL 225");
    }
    expect(audits).toHaveLength(0);
  });

  it("plain ON/OFF keeps working without the gate columns (retries the old column list)", async () => {
    results = [{ data: null, error: COL_ERR }, { data: [{ provider: "payplus", offered: false }], error: null }];
    const res: any = await POST(req({ provider: "payplus", offered: false }));
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(2);
    expect(updates[1].select).toBe("provider, offered, updated_at, updated_by");
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_OFF");
  });

  it("no row / other DB error on a gate action — 503 / 500, nothing logged", async () => {
    results = [{ data: [], error: null }];
    expect(((await POST(req({ action: "reopen_gate", provider: "grow" }))) as any).status).toBe(503);
    results = [{ data: null, error: { code: "57014", message: "timeout" } }];
    expect(((await POST(req({ action: "close_gate", provider: "grow", evidence: EVIDENCE }))) as any).status).toBe(500);
    expect(audits).toHaveLength(0);
  });
});
