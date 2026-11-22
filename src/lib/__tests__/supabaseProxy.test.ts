// S345 — שלב 4 (א3, bloc החלטה 444): lib/supabase בלי מפתח למסד. אותו ממשק של supabase-js, וכל שאילתה נשלחת ל-bloc
// (api/internal/panel-db) — מה נשלח, איך שאילתות של אותו סבב מתקבצות לבקשה אחת, ומה חוזר בכשל (error עם code, data: null — כמו
// supabase, כדי שהמסכים יגידו "לא נטען" ולא אפס).
import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("../blocApi", () => ({ callBloc: vi.fn() }));
import { callBloc } from "../blocApi";
import { adminClient, blocTransport, setPanelDbTransport, PanelQuery, type PanelDbOp } from "../supabase";

afterEach(() => { setPanelDbTransport(null); vi.mocked(callBloc).mockReset(); });

describe("the query → the op sent to bloc", () => {
  it("a read: columns, count / head, filters in order, order, range, maybeSingle", () => {
    const q = adminClient.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending_approval").lt("created_at", "2026-11-14")
      .in("building_id", ["b1", "b2"]).not("raw_payload->>reason", "is", null).or("error.is.null,error.not.like.staff:*").order("created_at", { ascending: false })
      .range(0, 49) as PanelQuery;
    expect(q.toOp()).toEqual({
      kind: "select", table: "payments", select: "id", count: "exact", head: true,
      filters: [
        { op: "eq", col: "status", val: "pending_approval" }, { op: "lt", col: "created_at", val: "2026-11-14" }, { op: "in", col: "building_id", val: ["b1", "b2"] },
        { op: "not", col: "raw_payload->>reason", notOp: "is", val: null }, { op: "or", expr: "error.is.null,error.not.like.staff:*" },
      ],
      order: [{ col: "created_at", ascending: false }], range: [0, 49],
    });
    expect((adminClient.from("buildings").select("*").eq("id", "x").maybeSingle() as PanelQuery).toOp()).toEqual({
      kind: "select", table: "buildings", select: "*", filters: [{ op: "eq", col: "id", val: "x" }], single: "maybe",
    });
  });
  it("writes: insert / update / delete with their filters and a select after them; a read without filters sends none", () => {
    expect((adminClient.from("panel_sessions").insert({ admin_id: "a" }) as PanelQuery).toOp()).toEqual({ kind: "insert", table: "panel_sessions", rows: [{ admin_id: "a" }] });
    expect((adminClient.from("panel_admins").update({ role: "admin" }).eq("id", "a1").select("id,email").single() as PanelQuery).toOp()).toEqual({
      kind: "update", table: "panel_admins", patch: { role: "admin" }, filters: [{ op: "eq", col: "id", val: "a1" }], select: "id,email", single: "one",
    });
    expect((adminClient.from("panel_admins").delete().eq("id", "a1") as PanelQuery).toOp()).toEqual({ kind: "delete", table: "panel_admins", filters: [{ op: "eq", col: "id", val: "a1" }] });
    expect((adminClient.from("panel_notifications").select("id") as PanelQuery).toOp()).toEqual({ kind: "select", table: "panel_notifications", select: "id" });
  });
});

describe("one request for a round of queries; the answers back in order", () => {
  it("Promise.all of three queries and an rpc → one call to bloc with four ops; supabase-like answers", async () => {
    const seen: PanelDbOp[][] = [];
    setPanelDbTransport(async (ops) => { seen.push(ops); return ops.map((op, i) => ({ data: i === 3 ? { total: 7 } : [{ n: i }], error: null, count: i === 0 ? 12 : null })); });
    const [a, b, c, d] = await Promise.all([
      adminClient.from("buildings").select("id", { count: "exact" }),
      adminClient.from("profiles").select("id").eq("id", "u1"),
      adminClient.from("payments").select("id").limit(5),
      adminClient.rpc("ad_totals"),
    ]);
    expect(seen).toHaveLength(1);
    expect(seen[0].map((o) => o.kind)).toEqual(["select", "select", "select", "rpc"]);
    expect(seen[0][3]).toEqual({ kind: "rpc", fn: "ad_totals" });
    expect([a.data, a.count, a.error, a.status]).toEqual([[{ n: 0 }], 12, null, 200]);
    expect([b.data, c.data, d.data]).toEqual([[{ n: 1 }], [{ n: 2 }], { total: 7 }]);
  });
  it("more than 25 ops in a round → split into requests of 25", async () => {
    const sizes: number[] = [];
    setPanelDbTransport(async (ops) => { sizes.push(ops.length); return ops.map(() => ({ data: [], error: null, count: null })); });
    await Promise.all(Array.from({ length: 30 }, (_, i) => adminClient.from("buildings").select("id").eq("id", String(i))));
    expect(sizes).toEqual([25, 5]);
  });
  it("an error from bloc — data null and the code (a missing table keeps its code, so the screens say 'not installed')", async () => {
    setPanelDbTransport(async (ops) => ops.map(() => ({ data: null, error: { code: "42P01", message: "relation does not exist" }, count: null })));
    const r = await adminClient.from("story_reports").select("id");
    expect(r).toEqual({ data: null, error: { code: "42P01", message: "relation does not exist", details: "", hint: "" }, count: null, status: 400, statusText: "Error" });
  });
  it("the channel down (the transport throws) — every query of the round gets BLOC_UNAVAILABLE, never data", async () => {
    setPanelDbTransport(async () => { throw new Error("socket hang up"); });
    const [a, b] = await Promise.all([adminClient.from("buildings").select("id"), adminClient.from("profiles").select("id")]);
    expect([a.error?.code, b.error?.code, a.data, b.data]).toEqual(["BLOC_UNAVAILABLE", "BLOC_UNAVAILABLE", null, null]);
  });
  it("signed links for the license files go through bloc too", async () => {
    let op: PanelDbOp | null = null;
    setPanelDbTransport(async (ops) => { op = ops[0]; return [{ data: [{ path: "p", signedUrl: "https://x/s", error: null }], error: null, count: null }]; });
    const r = await adminClient.storage.from("supplier-verification").createSignedUrls(["p"], 600);
    expect(op).toEqual({ kind: "signedUrls", bucket: "supplier-verification", paths: ["p"], expiresIn: 600 });
    expect(r.data).toEqual([{ path: "p", signedUrl: "https://x/s", error: null }]);
  });
});

describe("blocTransport — the signed call", () => {
  it("posts the ops to /api/internal/panel-db; not configured / a failed call → that code for every op; a reply of another length → BLOC_BAD_REPLY", async () => {
    vi.mocked(callBloc).mockResolvedValueOnce({ ok: true, status: 200, data: { ok: true, results: [{ data: [1], error: null, count: null }] } });
    expect(await blocTransport([{ kind: "select", table: "buildings" }])).toEqual([{ data: [1], error: null, count: null }]);
    expect(vi.mocked(callBloc).mock.calls[0][0]).toBe("/api/internal/panel-db");
    expect(vi.mocked(callBloc).mock.calls[0][1]).toEqual({ ops: [{ kind: "select", table: "buildings" }] });
    vi.mocked(callBloc).mockResolvedValueOnce({ ok: false, status: 503, code: "NOT_CONFIGURED", error: "לא מוגדר" });
    expect((await blocTransport([{ kind: "rpc", fn: "x" }, { kind: "rpc", fn: "y" }])).map((w) => w.error?.code)).toEqual(["NOT_CONFIGURED", "NOT_CONFIGURED"]);
    vi.mocked(callBloc).mockResolvedValueOnce({ ok: true, status: 200, data: { ok: true, results: [] } });
    expect((await blocTransport([{ kind: "rpc", fn: "x" }]))[0].error?.code).toBe("BLOC_BAD_REPLY");
  });
  it("no service key anywhere in the client", async () => {
    const { readFileSync } = await import("node:fs");
    // הקוד (בלי שורות ההערה): לא קורא את המפתח, לא יוצר client של supabase-js
    const code = readFileSync(`${process.cwd()}/src/lib/supabase.ts`, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|createClient|@supabase\/supabase-js|process\.env/);
  });
});
