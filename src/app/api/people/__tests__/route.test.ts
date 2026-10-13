// bloc UI-R5c-1 — /api/people: הרשימות מהשרת; viewer בלי פרטי קשר מלאים; כשל — 500 בעברית (לא רשימה ריקה).
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let listResult: any;
let asked: any;

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => { asked = opts; return guardResult; } }));
vi.mock("@/lib/supabase", () => ({ adminClient: { tag: "db" } }));
vi.mock("@/lib/people", () => ({ listPeople: async (_db: any, p: any) => { listResult.asked = p; return listResult; } }));

let GET: any;
const item = { person: { id: "u1", full_name: "דנה", email: "dana@example.com", phone: "050-1234567", avatar_url: null, role: "tenant", building_id: null, approval_status: "approved", created_at: null }, memberships: [] };
const req = (qs: string): any => ({ url: `https://panel.test/api/people?${qs}` });

beforeEach(async () => {
  ({ GET } = await import("../route"));
  guardResult = { ok: true, session: { id: "a", email: "ops@bloc.co.il", role: "admin" } };
  listResult = { items: [item], total: 1, page: 1, pages: 1, error: false };
});

describe("people GET", () => {
  it("requires tenants.read; an unknown tab falls back to pending; q and page reach the list", async () => {
    await GET(req("tab=nope&q=דנה&page=2"));
    expect(asked).toEqual({ permission: "tenants.read" });
    expect(listResult.asked).toEqual({ tab: "pending", q: "דנה", page: 2 });
  });

  it("an admin sees full contact details and may act", async () => {
    const j = await (await GET(req("tab=all"))).json();
    expect(j.canAct).toBe(true);
    expect(j.items[0].person).toMatchObject({ phone: "050-1234567", email: "dana@example.com" });
  });

  it("a viewer sees contact details masked, and no actions", async () => {
    guardResult = { ok: true, session: { id: "v", email: "view@bloc.co.il", role: "viewer" } };
    const j = await (await GET(req("tab=all"))).json();
    expect(j.canAct).toBe(false);
    expect(j.items[0].person.phone).toBe("•••4567");
    expect(j.items[0].person.email).toBe("d•••@example.com");
  });

  it("a read failure is a Hebrew 500, never an empty list", async () => {
    listResult = { items: [], total: null, page: 1, pages: 1, error: true };
    const r = await GET(req("tab=pending"));
    expect(r.status).toBe(500);
    expect((await r.json()).error).toContain("לא הצלחנו לטעון");
  });
});
