// MOD-1 (bloc MG-S1179) — lib/dmReportsServer: הקריאות של מסך הדיווחים — רק דרך bloc החתום, עם איש הצוות; לפני SQL 237 — missing;
// כשל — error עם המשפט (לא "אין דיווחים"); דיווח שנפתח — גם ביומן הפאנל (DM_REPORT_VIEW).
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("no direct db"); } } }));
vi.mock("@/lib/auth", () => ({ auditLog: vi.fn(async () => {}) }));
import { loadDmReport, loadDmReports } from "../dmReportsServer";
import { dmFilterOf } from "../dmReports";

const R1 = "77777777-7777-4777-8777-777777777771", B1 = "c0f1cb42-8e52-4a4e-a8d7-5563c10d6a2e";
const ADMIN = { id: "44444444-4444-4444-8444-444444444444", email: "tal@bloc.co.il", full_name: "טל", role: "admin" as const };
const item = { id: R1, status: "open", reason: "spam", created_at: "2026-11-22T06:00:00Z", reviewed_at: null, building: { id: B1, name: "הרצל 12" },
  reporter: null, reported: null, counts: { messages: 0, verified: 0, media: 0 }, has_note: false };
function caller(answer: unknown) {
  const calls: Array<{ path: string; payload: Record<string, unknown> }> = [];
  const call = (async (path: string, payload: Record<string, unknown>) => { calls.push({ path, payload }); return answer; }) as never;
  return { call, calls };
}

describe("the queue", () => {
  it("the signed route with the staff member and the filter; ok → the items", async () => {
    const c = caller({ ok: true, status: 200, data: { ok: true, items: [item], open_total: 1, truncated: false } });
    const r = await loadDmReports(ADMIN, dmFilterOf({ reason: "spam", order: "newest" }), c.call);
    expect(c.calls).toEqual([{ path: "/api/internal/dm-reports", payload: { actor: { id: ADMIN.id, email: ADMIN.email, role: "admin" }, action: "list", status: "open", order: "newest", reason: "spam" } }]);
    expect(r.state === "ok" && [r.items.length, r.openTotal]).toEqual([1, 1]);
  });
  it("before SQL 237 — missing; a failure — the sentence; a strange answer — error, never an empty queue", async () => {
    expect(await loadDmReports(ADMIN, dmFilterOf({}), caller({ ok: false, status: 503, code: "sql_missing", error: "x" }).call)).toEqual({ state: "missing" });
    expect(await loadDmReports(ADMIN, dmFilterOf({}), caller({ ok: false, status: 403, code: "forbidden", error: "x" }).call)).toEqual({ state: "error", message: "אין הרשאה לדיווחים על הודעות פרטיות." });
    const odd = await loadDmReports(ADMIN, dmFilterOf({}), caller({ ok: true, status: 200, data: { items: [] } }).call);
    expect(odd.state).toBe("error");
  });
});

describe("one report", () => {
  it("ok → the report, and a DM_REPORT_VIEW row in the panel log", async () => {
    const log = vi.fn(async () => {});
    const c = caller({ ok: true, status: 200, data: { ok: true, report: { ...item, note: null, messages: [], others: {}, history: [] } } });
    const r = await loadDmReport(ADMIN, R1, { call: c.call, log: log as never });
    expect(c.calls[0].payload).toEqual({ actor: { id: ADMIN.id, email: ADMIN.email, role: "admin" }, action: "one", id: R1 });
    expect(r.state).toBe("ok");
    expect(log).toHaveBeenCalledWith(ADMIN, "DM_REPORT_VIEW", "dm_report", R1, { building_id: B1 });
  });
  it("not found — not_found (a 404 page); the log refused in bloc — the content is not shown, and it says why; nothing logged in the panel", async () => {
    const log = vi.fn(async () => {});
    expect(await loadDmReport(ADMIN, R1, { call: caller({ ok: false, status: 404, code: "not_found", error: "x" }).call, log: log as never })).toEqual({ state: "not_found" });
    expect(await loadDmReport(ADMIN, R1, { call: caller({ ok: false, status: 503, code: "write_failed", error: "x" }).call, log: log as never }))
      .toEqual({ state: "error", message: "הפתיחה לא נרשמה ביומן, ולכן התוכן לא מוצג. נסו שוב בעוד רגע." });
    // a 404 without a code = the signature was refused (callBloc says REJECTED) — not "the report is gone"
    expect((await loadDmReport(ADMIN, R1, { call: caller({ ok: false, status: 502, code: "REJECTED", error: "bloc דחה" }).call, log: log as never })).state).toBe("error");
    expect(log).not.toHaveBeenCalled();
  });
});
