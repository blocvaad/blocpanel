import { describe, it, expect, beforeEach, vi } from "vitest";

// 144 (bloc): תעודת הספק נשמרת כ-path ב-bucket הפרטי. הפאנל חותם קישור קצר רק לקובץ
// שבתיקייה של הספק עצמו; קישור https ישן מוצג כמו-שהוא.
let rows: any[] = [];
const signCalls: Array<{ paths: string[]; ttl: number }> = [];

vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "adm-1", email: "a@x.co", role: "admin" } }) }));
vi.mock("@/lib/auth", () => ({ auditLog: async () => {} }));
vi.mock("@/lib/notify", () => ({ notifyUser: async () => true }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const chain: any = {
        select: () => chain, order: () => chain, eq: () => chain,
        limit: async () => ({ data: table === "supplier_profiles" ? rows : [], error: null }),
      };
      return chain;
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], ttl: number) => {
          signCalls.push({ paths, ttl });
          return { data: paths.map((p) => ({ signedUrl: `https://x.supabase.co/sign/${bucket}/${p}?token=t` })), error: null };
        },
      }),
    },
  },
}));

let GET: any;
beforeEach(async () => {
  ({ GET } = await import("../route"));
  signCalls.length = 0;
});

const U1 = "aaaaaaaa-1111-4111-8111-111111111111";
const U2 = "bbbbbbbb-2222-4222-8222-222222222222";

describe("suppliers GET — license links (144)", () => {
  it("signs a short-lived link only for a path in the supplier's own folder", async () => {
    rows = [
      { id: "s1", user_id: U1, verification_status: "pending", professional_license_url: `${U1}/license_1.pdf` },
      { id: "s2", user_id: U2, verification_status: "pending", professional_license_url: `${U1}/license_1.pdf` }, // path של ספק אחר
      { id: "s3", user_id: U2, verification_status: "verified", professional_license_url: "https://old.example/signed?token=y" },
      { id: "s4", user_id: U2, verification_status: "none", professional_license_url: null },
    ];
    const res = await GET();
    const body = await res.json();
    const byId = Object.fromEntries(body.suppliers.map((s: any) => [s.id, s.professional_license_url]));
    expect(byId.s1).toMatch(/^https:\/\/x\.supabase\.co\/sign\/supplier-verification\//);
    expect(byId.s2).toBeNull();
    expect(byId.s3).toBe("https://old.example/signed?token=y");
    expect(byId.s4).toBeNull();
    expect(signCalls).toEqual([{ paths: [`${U1}/license_1.pdf`], ttl: 600 }]);
  });

  it("no paths → no signing call", async () => {
    rows = [{ id: "s1", user_id: U1, verification_status: "none", professional_license_url: null }];
    await GET();
    expect(signCalls).toHaveLength(0);
  });
});
