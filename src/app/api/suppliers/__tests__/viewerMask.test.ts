// א3-1 (bloc): GET /api/suppliers למי שרק רואה (viewer) — פרטי הקשר ומספר העוסק מוסתרים, ובלי קישור לתעודה (לא חותמים בכלל).
// admin / סופר-אדמין — כמו קודם (license.test.ts).
import { describe, it, expect, beforeEach, vi } from "vitest";

let role = "viewer";
let rows: any[] = [];
const signCalls: string[][] = [];
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "adm-1", email: "a@x.co", role } }) }));
vi.mock("@/lib/auth", () => ({ auditLog: async () => {} }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const chain: any = {
        select: () => chain, order: () => chain, eq: () => chain, is: () => chain,
        limit: async () => ({ data: table === "supplier_profiles" ? rows : [], error: null }),
      };
      return chain;
    },
    storage: { from: () => ({ createSignedUrls: async (paths: string[]) => { signCalls.push(paths); return { data: paths.map(() => ({ signedUrl: "https://x/sign" })), error: null }; } }) },
  },
}));

let GET: any;
beforeEach(async () => { ({ GET } = await import("../route")); signCalls.length = 0; });
const U1 = "aaaaaaaa-1111-4111-8111-111111111111";
const row = { id: "s1", user_id: U1, business_name: "כהן חשמל", phone: "050-7654321", email: "kohen@elec.co.il", verification_status: "pending", business_license_number: "123456789", professional_license_url: `${U1}/license_1.pdf` };

describe("suppliers GET — a viewer", () => {
  it("phone, email and the license number hidden; no license link and no signing at all; canVerify false", async () => {
    role = "viewer"; rows = [{ ...row }];
    const body = await (await GET()).json();
    expect(body.suppliers[0]).toMatchObject({ business_name: "כהן חשמל", phone: "•••4321", email: "k•••@elec.co.il", business_license_number: "•••789", professional_license_url: null });
    expect(signCalls).toEqual([]);
    expect(body.canVerify).toBe(false);
    expect(body.suppliers[0].license_hidden).toBe(true);               // a certificate exists — the card says so, without a link
    rows = [{ ...row, professional_license_url: null }];
    expect((await (await GET()).json()).suppliers[0].license_hidden).toBe(false);
  });
  it("admin — everything as before, with the short-lived link", async () => {
    role = "admin"; rows = [{ ...row }];
    const body = await (await GET()).json();
    expect(body.suppliers[0]).toMatchObject({ phone: "050-7654321", email: "kohen@elec.co.il", business_license_number: "123456789", professional_license_url: "https://x/sign" });
    expect("license_hidden" in body.suppliers[0]).toBe(false);
    expect(body.canVerify).toBe(true);
  });
});
