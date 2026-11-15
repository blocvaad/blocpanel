import { describe, it, expect, beforeEach, vi } from "vitest";

// LEDGER-1b (bloc 214 / 306): מחלוקת על רשומה שסימון התשלום שלה בוטל אינה "פתוחה" — הקריאה מסננת reversed_at.
// קריאה שנכשלה אינה "אין מחלוקות": open_disputes = null ו-disputes_failed — המסך אומר שלא נטען.
let disputeRows: any[] = [];
let disputesError: any = null;
const calls: Array<{ table: string; op: string; args: any[] }> = [];

vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "adm-1", email: "a@x.co", role: "admin" } }) }));
vi.mock("@/lib/auth", () => ({ auditLog: async () => {} }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const rec = (op: string, args: any[]) => calls.push({ table, op, args });
      const chain: any = {
        select: (...a: any[]) => { rec("select", a); return chain; },
        order: (...a: any[]) => { rec("order", a); return chain; },
        eq: (...a: any[]) => { rec("eq", a); return chain; },
        is: (...a: any[]) => { rec("is", a); return chain; },
        limit: async (...a: any[]) => {
          rec("limit", a);
          if (table === "supplier_profiles")
            return { data: [
              { id: "s-1", user_id: "u-1", business_name: "א", verification_status: "verified", professional_license_url: null },
              { id: "s-2", user_id: "u-2", business_name: "ב", verification_status: "pending", professional_license_url: null },
            ], error: null };
          return disputesError ? { data: null, error: disputesError } : { data: disputeRows, error: null };
        },
      };
      return chain;
    },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  },
}));

let GET: any;
beforeEach(async () => {
  ({ GET } = await import("../route"));
  calls.length = 0; disputeRows = []; disputesError = null;
});

describe("suppliers GET — open payment disputes (LEDGER-1b)", () => {
  it("counts only disputes on a live record (reversed_at is null)", async () => {
    disputeRows = [{ supplier_id: "s-1" }, { supplier_id: "s-1" }];
    const j = await (await GET()).json();
    const q = calls.filter((c) => c.table === "supplier_payments");
    expect(q).toContainEqual({ table: "supplier_payments", op: "eq", args: ["confirmation_status", "disputed"] });
    expect(q).toContainEqual({ table: "supplier_payments", op: "is", args: ["reversed_at", null] });
    expect(j.suppliers.map((s: any) => [s.id, s.open_disputes])).toEqual([["s-2", 0], ["s-1", 2]]);   // pending first
    expect(j.disputes_failed).toBeUndefined();
  });

  it("the disputes read failed — open_disputes null (not 0) and disputes_failed; the list itself still loads", async () => {
    disputesError = { message: "timeout" };
    const res = await GET();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.suppliers.map((s: any) => s.open_disputes)).toEqual([null, null]);
    expect(j.disputes_failed).toBe(true);
  });
});
