// bloc OPS-1 (שלב 9, החלטות 752–755): מרכז התפעול בפאנל.
//   • GET: ops.read; מצב התפעול מ-bloc החתום, יומן התקלות עם ציר הזמן, תרגולי השחזור; כל חלק לבד — כשל ב-bloc לא מסתיר את היומן
//     (snapshot null + הסיבה), כשל ביומן — incidents null (לא רשימה ריקה); canManage לפי התפקיד; no-store.
//   • POST: ops.manage; open / update / resolve / drill; כל פעולה ביומן הפאנל; 409 על תקלה פתוחה מאותו מקור ועל תקלה שנסגרה;
//     404 על תקלה שלא קיימת; תאריך גיבוי בעתיד — 400; גוף לא תקין — 400 לפני כל כתיבה.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let guardArgs: any[] = [];
const audits: any[][] = [];
const calls: Array<{ path: string; payload: any }> = [];
let blocAnswer: any;
type Op = { table: string; kind: string; payload?: any; filters: Array<[string, string, any]>; select?: string; single?: boolean };
const ops: Op[] = [];
let answers: Record<string, any> = {};

function builder(table: string) {
  const op: Op = { table, kind: "select", filters: [] };
  const b: any = {
    select(cols?: string) { if (op.kind === "select") op.select = cols; else op.select = cols; return b; },
    insert(v: any) { op.kind = "insert"; op.payload = v; return b; },
    update(v: any) { op.kind = "update"; op.payload = v; return b; },
    eq(c: string, v: any) { op.filters.push(["eq", c, v]); return b; },
    neq(c: string, v: any) { op.filters.push(["neq", c, v]); return b; },
    in(c: string, v: any) { op.filters.push(["in", c, v]); return b; },
    order() { return b; }, limit() { return b; },
    single() { op.single = true; return b; }, maybeSingle() { op.single = true; return b; },
    then(res: any, rej: any) {
      ops.push(op);
      const key = `${op.kind}:${table}`;
      const a = answers[key];
      const out = typeof a === "function" ? a(op) : a ?? { data: op.kind === "select" ? [] : null, error: null };
      return Promise.resolve(out).then(res, rej);
    },
  };
  return b;
}

vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/supabase", () => ({ adminClient: { from: (t: string) => builder(t) } }));

import { GET, POST } from "../route";

const I1 = "11111111-1111-4111-8111-111111111111";
// the exact shape guard() returns: the session is the staff member (PanelSession — id, email, full_name, role, auth_level)
const as = (role: string) => ({ id: "44444444-4444-4444-8444-444444444444", email: "tal@bloc.co.il", full_name: "טל צוות", role, auth_level: "mfa" });
const req = (body: any): any => ({ json: async () => body });
const SNAP = { generated_at: "2026-11-26T08:00:00Z", overall: "warn", counts: { ok: 0, warn: 1, down: 0, unknown: 0 }, items: [], jobs: [], backup: {}, queues: [], failed: [] };

beforeEach(() => {
  guardResult = { ok: true, session: as("admin") };
  guardArgs = []; audits.length = 0; calls.length = 0; ops.length = 0; answers = {};
  blocAnswer = { ok: true, status: 200, data: { ok: true, snapshot: SNAP } };
});

describe("GET /api/ops", () => {
  it("ops.read; the snapshot from bloc, incidents with their timeline, drills; canManage; no-store", async () => {
    answers["select:ops_incidents"] = { data: [{ id: I1, status: "open", title: "הגיבוי" }], error: null };
    answers["select:ops_incident_updates"] = { data: [{ id: 1, incident_id: I1, note: "בדקתי" }], error: null };
    answers["select:ops_restore_drills"] = { data: [{ id: "d1", result: "passed" }], error: null };
    const res: any = await GET();
    expect(guardArgs[0]).toEqual({ permission: "ops.read" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(calls).toEqual([{ path: "/api/internal/ops", payload: {} }]);
    const body = await res.json();
    expect(body).toMatchObject({ snapshot: SNAP, snapshotError: null, incidents: [{ id: I1 }], updates: [{ incident_id: I1 }], drills: [{ id: "d1" }], canManage: true });
    const upd = ops.find((o) => o.table === "ops_incident_updates")!;
    expect(upd.filters).toContainEqual(["in", "incident_id", [I1]]);
  });
  it("a viewer reads but does not manage", async () => {
    guardResult = { ok: true, session: as("viewer") };
    expect((await (await GET() as any).json()).canManage).toBe(false);
  });
  it("bloc failed — snapshot null with the reason, and the journal still loads", async () => {
    blocAnswer = { ok: false, status: 503, code: "NOT_CONFIGURED", error: "החיבור ל-bloc לא מוגדר" };
    answers["select:ops_incidents"] = { data: [], error: null };
    const body = await (await GET() as any).json();
    expect(body.snapshot).toBeNull();
    expect(body.snapshotError).toBe("החיבור ל-bloc לא מוגדר");
    expect(body.incidents).toEqual([]);
  });
  it("an unexpected bloc answer is not a snapshot", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true } };
    const body = await (await GET() as any).json();
    expect(body.snapshot).toBeNull();
    expect(body.snapshotError).toBe("תשובה לא צפויה מ-bloc");
  });
  it("a failed journal / drills read — null (not an empty list), and no timeline read", async () => {
    answers["select:ops_incidents"] = { data: null, error: { code: "x" } };
    answers["select:ops_restore_drills"] = { data: null, error: { code: "x" } };
    const body = await (await GET() as any).json();
    expect(body.incidents).toBeNull();
    expect(body.drills).toBeNull();
    expect(ops.some((o) => o.table === "ops_incident_updates")).toBe(false);
  });
  it("the guard stops a request without a session (no bloc call)", async () => {
    guardResult = { ok: false, response: new Response("{}", { status: 401 }) };
    expect((await GET() as any).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/ops", () => {
  it("ops.manage; open — the row with who opened, audited", async () => {
    answers["insert:ops_incidents"] = { data: { id: I1 }, error: null };
    const res: any = await POST(req({ action: "open", title: "הגיבוי לא רץ", severity: "p1", playbook: "backup-failed", source: "cron:backup", summary: "" }));
    expect(guardArgs[0]).toEqual({ permission: "ops.manage" });
    expect(res.status).toBe(200);
    const ins = ops.find((o) => o.kind === "insert")!;
    expect(ins.payload).toEqual({ title: "הגיבוי לא רץ", severity: "p1", playbook: "backup-failed", source: "cron:backup", summary: null, opened_by_email: "tal@bloc.co.il" });
    expect(audits[0][1]).toBe("ops_incident_opened");
    // the panel log is written as the staff member of the session (auditLog(admin, …) — the session itself)
    expect(audits[0][0]).toMatchObject({ id: "44444444-4444-4444-8444-444444444444", email: "tal@bloc.co.il", role: "admin" });
    expect(audits[0][4]).toEqual({ severity: "p1", playbook: "backup-failed", source: "cron:backup" });
  });
  it("open on a source that already has an open incident — 409, nothing audited", async () => {
    answers["insert:ops_incidents"] = { data: null, error: { code: "23505" } };
    const res: any = await POST(req({ action: "open", title: "שוב", severity: "p2", source: "cron:backup" }));
    expect(res.status).toBe(409);
    expect(audits).toHaveLength(0);
  });
  it("a bad body — 400 before any write (bad severity, short title, extra field, bad playbook key)", async () => {
    for (const b of [{ action: "open", title: "תקלה", severity: "high" }, { action: "open", title: "x", severity: "p1" },
      { action: "open", title: "תקלה טובה", severity: "p1", extra: 1 }, { action: "open", title: "תקלה טובה", severity: "p1", playbook: "Backup Failed!" },
      { action: "nope" }]) {
      expect(((await POST(req(b))) as any).status).toBe(400);
    }
    expect(ops).toHaveLength(0);
  });
  it("update — a note on the timeline and the status, only while open", async () => {
    answers["select:ops_incidents"] = { data: { id: I1, status: "open" }, error: null };
    const res: any = await POST(req({ action: "update", id: I1, note: "הרצתי ידנית", status: "monitoring" }));
    expect(res.status).toBe(200);
    const note = ops.find((o) => o.kind === "insert" && o.table === "ops_incident_updates")!;
    expect(note.payload).toEqual({ incident_id: I1, by_email: "tal@bloc.co.il", status: "monitoring", note: "הרצתי ידנית" });
    const up = ops.find((o) => o.kind === "update")!;
    expect(up.payload).toMatchObject({ status: "monitoring" });
    expect(up.filters).toEqual([["eq", "id", I1], ["neq", "status", "resolved"]]);
    expect(audits[0][1]).toBe("ops_incident_updated");
  });
  it("resolve — status, who and when, the summary, and a resolved note", async () => {
    answers["select:ops_incidents"] = { data: { id: I1, status: "monitoring" }, error: null };
    const res: any = await POST(req({ action: "resolve", id: I1, summary: "הטוקן הוחלף והגיבוי רץ" }));
    expect(res.status).toBe(200);
    const up = ops.find((o) => o.kind === "update")!;
    expect(up.payload).toMatchObject({ status: "resolved", resolved_by_email: "tal@bloc.co.il", summary: "הטוקן הוחלף והגיבוי רץ" });
    expect(typeof up.payload.resolved_at).toBe("string");
    expect(ops.find((o) => o.kind === "insert")!.payload).toMatchObject({ status: "resolved", note: "הטוקן הוחלף והגיבוי רץ" });
    expect(audits[0][1]).toBe("ops_incident_resolved");
  });
  it("update / resolve: missing — 404; already resolved — 409; a read failure — 500", async () => {
    answers["select:ops_incidents"] = { data: null, error: null };
    expect(((await POST(req({ action: "update", id: I1, note: "x" }))) as any).status).toBe(404);
    answers["select:ops_incidents"] = { data: { id: I1, status: "resolved" }, error: null };
    expect(((await POST(req({ action: "resolve", id: I1, summary: "סוף" }))) as any).status).toBe(409);
    answers["select:ops_incidents"] = { data: null, error: { code: "x" } };
    expect(((await POST(req({ action: "update", id: I1, note: "x" }))) as any).status).toBe(500);
    expect(audits).toHaveLength(0);
  });
  it("resolve needs a summary", async () => {
    expect(((await POST(req({ action: "resolve", id: I1, summary: "" }))) as any).status).toBe(400);
  });
  it("drill — recorded with who did it; a future backup date — 400", async () => {
    answers["insert:ops_restore_drills"] = { data: { id: "d1" }, error: null };
    const res: any = await POST(req({ action: "drill", backup_date: "2026-11-25", method: "verify", result: "passed", tables_checked: 92, rows_checked: 18000, mismatches: 0, notes: "" }));
    expect(res.status).toBe(200);
    expect(ops.find((o) => o.kind === "insert")!.payload).toEqual({ done_by_email: "tal@bloc.co.il", backup_date: "2026-11-25", method: "verify", result: "passed",
      tables_checked: 92, rows_checked: 18000, mismatches: 0, notes: null });
    expect(audits[0][1]).toBe("ops_drill_recorded");
    ops.length = 0;
    expect(((await POST(req({ action: "drill", backup_date: "2099-01-01", method: "verify", result: "passed" }))) as any).status).toBe(400);
    expect(ops).toHaveLength(0);
  });
  it("a viewer is stopped by the guard before anything", async () => {
    guardResult = { ok: false, response: new Response("{}", { status: 403 }) };
    expect(((await POST(req({ action: "open", title: "תקלה", severity: "p1" }))) as any).status).toBe(403);
    expect(ops).toHaveLength(0);
  });
});
