// מתג לכל ספק סליקה (bloc PAY-M, SQL 202): סופר-אדמין בלבד, שורה אחת בטבלה, ביומן — עם כמה בניינים מחוברים.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let guardArgs: any[] = [];
const updates: Array<{ table: string; values: any; eq: [string, string] | null }> = [];
const audits: any[][] = [];
let updateResult: any;
let usageResult: any;

vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const u: { table: string; values: any; eq: [string, string] | null } = { table, values: null, eq: null };
      const chain: any = {
        update: (values: any) => { u.values = values; updates.push(u); return chain; },
        eq: (c: string, v: string) => { u.eq = [c, v]; return chain; },
        select: async () => updateResult,
      };
      return chain;
    },
    rpc: async () => usageResult,
  },
}));

import { POST } from "../route";
const req = (body: any): any => ({ json: async () => body, headers: { get: () => "1.2.3.4" } });
const SESSION = { id: "a1", email: "tal@bloc.co.il", full_name: "טל", role: "superadmin", auth_level: "mfa" };

beforeEach(() => {
  guardResult = { ok: true, session: SESSION };
  guardArgs = []; updates.length = 0; audits.length = 0;
  updateResult = { data: [{ provider: "cardcom", offered: true, updated_at: "2026-11-01T09:00:00Z", updated_by: "tal@bloc.co.il" }], error: null };
  usageResult = { data: [{ provider: "payplus", buildings: 7 }, { provider: "cardcom", buildings: 2 }, { provider: "none", buildings: 30 }], error: null };
});

describe("POST /api/collection-providers", () => {
  it("superadmin only — the guard asks for the role, and a refusal writes nothing", async () => {
    await POST(req({ provider: "cardcom", offered: true }));
    expect(guardArgs[0]).toEqual({ role: "superadmin" });
    guardResult = { ok: false, response: { status: 403 } };
    updates.length = 0; audits.length = 0;
    const res: any = await POST(req({ provider: "cardcom", offered: true }));
    expect(res.status).toBe(403);
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("turns one provider on: one row, who and when; the log says which and how many buildings use it", async () => {
    const res: any = await POST(req({ provider: "cardcom", offered: true }));
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("platform_payment_providers");
    expect(updates[0].eq).toEqual(["provider", "cardcom"]);
    expect(updates[0].values).toMatchObject({ offered: true, updated_by: "tal@bloc.co.il" });
    expect(typeof updates[0].values.updated_at).toBe("string");
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_ON");
    expect(audits[0][2]).toBe("platform");
    expect(audits[0][3]).toBe("cardcom");
    expect(audits[0][4]).toEqual({ label: "Cardcom", offered: true, buildings: 2 });
    expect(audits[0][5]).toBe("1.2.3.4");
  });

  it("turning off is logged as off; a failed count — the change is kept, without the number", async () => {
    updateResult = { data: [{ provider: "payplus", offered: false }], error: null };
    usageResult = { data: null, error: { message: "boom" } };
    const res: any = await POST(req({ provider: "payplus", offered: false }));
    expect(res.status).toBe(200);
    expect(audits[0][1]).toBe("COLLECTION_PROVIDER_OFF");
    expect(audits[0][4]).toEqual({ label: "PayPlus", offered: false, buildings: null });
  });

  it("a provider that is not in the list, a missing field, an extra field — 400, nothing written", async () => {
    for (const body of [{ provider: "stripe", offered: true }, { provider: "payplus" }, { provider: "payplus", offered: "yes" }, { provider: "payplus", offered: true, building_id: "x" }]) {
      const res: any = await POST(req(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("before SQL 202 (no table / no row) — 503 that says so; a DB error — 500; nothing logged", async () => {
    updateResult = { data: null, error: { code: "42P01", message: 'relation "public.platform_payment_providers" does not exist' } };
    let res: any = await POST(req({ provider: "grow", offered: true }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("SQL 202");
    updateResult = { data: [], error: null };
    res = await POST(req({ provider: "grow", offered: true }));
    expect(res.status).toBe(503);
    updateResult = { data: null, error: { code: "57014", message: "timeout" } };
    res = await POST(req({ provider: "grow", offered: true }));
    expect(res.status).toBe(500);
    expect(audits).toHaveLength(0);
  });
});
