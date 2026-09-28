import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let tables: Record<string, any[]>;
let succError: any;

vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/auth", () => ({ auditLog: async () => {} }));
vi.mock("@/lib/blocApi", () => ({ blocConfig: () => null, callBloc: async () => ({ ok: true, status: 200, data: {} }) }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const res = () => (table === "committee_successions" && succError ? { data: null, error: succError } : { data: tables[table] ?? [], error: null });
      const chain: any = {
        select: () => chain, or: () => chain, order: () => chain, eq: () => chain, is: () => chain, in: () => chain,
        limit: async () => res(), range: async () => res(), maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
        then: (ok: any, err: any) => Promise.resolve(res()).then(ok, err),
      };
      return chain;
    },
  },
}));

let GET: any;
const B = "22222222-2222-4222-8222-222222222222";
const req = (q = ""): any => ({ url: `https://panel.test/api/committee${q}`, headers: { get: () => null } });

beforeEach(async () => {
  ({ GET } = await import("../route"));
  succError = null;
  tables = {
    committee_successions: [{ id: "r1", building_id: B, status: "pending", requested_by: "u2", head_user_id: "u1", reason: "deceased", note: null,
      execute_after: "2026-10-01T10:00:00Z", created_at: "2026-09-28T10:00:00Z", panel_actor: "ops@bloc.co.il", panel_note: "אומת מול המשפחה" }],
    buildings: [{ id: B, name: "השקד 104", founder_id: "u1", subscription_status: "active" }],
    profiles: [{ id: "u1", full_name: "יוסי", email: "y@x.co", phone: "0521234567" }, { id: "u2", full_name: "דנה", email: "d@x.co", phone: "0507654321" }],
    building_memberships: [], committee_deputies: [], building_collection_holds: [],
  };
});

describe("committee GET", () => {
  it("before migration 133 → available:false (not a 500)", async () => {
    succError = { code: "42P01", message: 'relation "committee_successions" does not exist' };
    guardResult = { ok: true, session: { id: "a", email: "a@x", role: "admin" } };
    expect(await (await GET(req())).json()).toEqual({ available: false });
  });

  it("admin sees contact details to verify; the panel flags requests the team opened; actions report not configured", async () => {
    guardResult = { ok: true, session: { id: "a", email: "a@x", role: "admin" } };
    const j = await (await GET(req())).json();
    expect(j).toMatchObject({ available: true, canManage: true, canExecute: false, configured: false });
    expect(j.pending[0]).toMatchObject({ id: "r1", viaPanel: true, reasonLabel: "נפטר/ה", head: { name: "יוסי", email: "y@x.co", phone: "0521234567" } });
  });

  it("a viewer sees names only", async () => {
    guardResult = { ok: true, session: { id: "v", email: "v@x", role: "viewer" } };
    const j = await (await GET(req())).json();
    expect(j.canManage).toBe(false);
    expect(j.pending[0].head).toMatchObject({ name: "יוסי", email: null, phone: null });
    expect(j.pending[0].requester).toMatchObject({ name: "דנה", email: null, phone: null });
  });

  it("rejects a malformed building id", async () => {
    guardResult = { ok: true, session: { id: "a", email: "a@x", role: "admin" } };
    expect((await GET(req("?building=abc"))).status).toBe(400);
  });
});
