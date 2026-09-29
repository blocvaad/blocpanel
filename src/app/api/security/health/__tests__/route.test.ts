import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let rpcResult: any;
let blocResult: any;

vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/rpc", () => ({ isMissingRpc: (e: any) => e?.code === "PGRST202" }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async () => blocResult }));
vi.mock("@/lib/supabase", () => ({ adminClient: { rpc: async () => rpcResult } }));

let GET: any;

beforeEach(async () => {
  ({ GET } = await import("../route"));
  guardResult = { ok: true };
  rpcResult = { data: [{ check_key: "rls_enabled", ok: true, detail: null }], error: null };
  blocResult = { ok: true, status: 200, data: { checks: [
    { check_key: "bloc_push", ok: true, detail: null },
    { check_key: "bloc_email", ok: false, detail: "חסר RESEND_API_KEY" },
    { check_key: "rls_enabled", ok: true, detail: null },   // bloc can't answer for the DB
  ] } };
});

describe("security/health — DB + bloc server config (143)", () => {
  it("merges DB rows with bloc_ rows only; bloc reachable is its own green row", async () => {
    const body = await (await GET()).json();
    expect(body.rows.map((r: any) => r.check_key)).toEqual(["rls_enabled", "bloc_reachable", "bloc_push", "bloc_email"]);
    expect(body.summary).toEqual({ ok: 3, failed: 1, knownOpen: 0 });
  });

  it("bloc unreachable → one red row with the reason; DB rows still shown", async () => {
    blocResult = { ok: false, status: 502, code: "EDGE_BLOCKED", error: "Cloudflare חסם" };
    const body = await (await GET()).json();
    expect(body.rows).toContainEqual({ check_key: "bloc_reachable", ok: false, detail: "Cloudflare חסם" });
    expect(body.rows.some((r: any) => r.check_key === "rls_enabled")).toBe(true);
  });

  it("DB check missing (125 not run) — bloc rows still shown, available", async () => {
    rpcResult = { data: null, error: { code: "PGRST202" } };
    const body = await (await GET()).json();
    expect(body.available).toBe(true);
    expect(body.rows[0].check_key).toBe("bloc_reachable");
  });

  it("guard denies → its response", async () => {
    guardResult = { ok: false, response: new Response("no", { status: 403 }) };
    expect((await GET()).status).toBe(403);
  });
});
