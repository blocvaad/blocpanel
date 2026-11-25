// bloc SAFETY-1 (MG-S1241, החלטות 676–677) — הכללים של חבילת הפאנל, נעוצים:
//   • הדיווחים על תוכן — מנהל וסופר-אדמין בלבד (viewer לא רואה גם את התור: יש בו הודעות על מודעה — שיחה של שניים); רק דרך bloc
//     החתום (אין קריאה למסד, אין panel-db); הפתיחה — POST שנרשם, אף פעם לא GET ולא בתוך ה-HTML של הדף.
//   • הפעמון: התראה על תוכן (entity_type 'content_report') — מקשרת לתור, ורק למי שרואה אותו; התפריט; התוויות ביומן.
//   • קריאת התור והפריט (lib/contentReportsServer): הפריט נרשם ביומן הפאנל רק כש-bloc נתן אותו.
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("no direct db"); } } }));
vi.mock("@/lib/auth", () => ({ auditLog: vi.fn(async () => {}) }));
import { can, permissionsFor } from "../permissions";
import { NAV_GROUPS } from "../nav";
import { notificationLink } from "../committee";
import { AUDIT_LABELS } from "../auditLabels";
import { reportRowsFilter, WITHOUT_CONTENT_ROWS, WITHOUT_DM_ROWS, WITHOUT_REPORT_ROWS } from "../dmReports";
import { loadContentReport, loadContentReports } from "../contentReportsServer";
import { crFilterOf } from "../contentReports";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const walk = (d: string): string[] => readdirSync(d).flatMap((n: string) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === "__tests__" ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
const CR_FILES = [
  "src/lib/contentReports.ts", "src/lib/contentReportsServer.ts", "src/components/contentReports/ContentReportsClient.tsx",
  "src/app/(panel)/content-reports/page.tsx", "src/app/api/content-reports/route.ts", "src/app/api/content-reports/one/route.ts",
];
const M1 = "cccc0001-0000-4000-8000-000000000001", B1 = "c0f1cb42-8e52-4a4e-a8d7-5563c10d6a2e";
const ADMIN = { id: "44444444-4444-4444-8444-444444444444", email: "tal@bloc.co.il", full_name: "טל", role: "admin" as const };
const ITEM = { source: "post", source_id: M1, building: { id: B1, name: "הרצל 12" }, author: null, author_open: null, reports: 1, open: 1, reasons: { spam: 1 }, notes: 0,
  first_at: "2026-11-25T08:00:00Z", last_at: "2026-11-25T08:00:00Z", status: "open", hidden: null };
function caller(answer: unknown) {
  const calls: Array<{ path: string; payload: Record<string, unknown> }> = [];
  const call = (async (path: string, payload: Record<string, unknown>) => { calls.push({ path, payload }); return answer; }) as never;
  return { call, calls };
}

describe("SAFETY-1 — content reports in the panel: who", () => {
  it("admin and super admin only; a viewer gets neither the queue nor the actions; the menu entry carries the permission", () => {
    for (const p of ["content_reports.read", "content_reports.manage"] as const) {
      expect([can("viewer", p), can("admin", p), can("superadmin", p)]).toEqual([false, true, true]);
    }
    expect(permissionsFor("viewer").filter((p) => p.startsWith("content_reports"))).toEqual([]);
    expect(NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/content-reports")).toMatchObject({ permission: "content_reports.read", icon: "Flag" });
    expect(read("src/components/layout/Sidebar.tsx")).toMatch(/\bFlag,/);
    expect(read("src/app/(panel)/content-reports/page.tsx")).toContain('requirePageSession("content_reports.read")');
    expect(read("src/app/(panel)/content-reports/page.tsx")).toContain('can(session.role, "content_reports.manage")');
  });
  it("the routes: the queue and an item with read, the decisions with manage — checked before anything", () => {
    const r = read("src/app/api/content-reports/route.ts");
    expect(r.indexOf('guard({ permission: "content_reports.read" })')).toBeLessThan(r.indexOf("loadContentReports("));
    expect(r.indexOf('guard({ permission: "content_reports.manage" })')).toBeLessThan(r.indexOf("parseBody(req, crActionSchema)"));
    const one = read("src/app/api/content-reports/one/route.ts");
    expect(one).toContain('guard({ permission: "content_reports.read" })');
    expect(one).toContain("export async function POST");
    expect(one).not.toContain("export async function GET");
  });
});

describe("SAFETY-1 — only through the signed bloc", () => {
  it("no direct database, no panel-db, no fetch of bloc around callBloc", () => {
    for (const f of CR_FILES) {
      const c = read(f);
      expect([f, /adminClient|@\/lib\/supabase|panelDb|panel-db/.test(c)]).toEqual([f, false]);
    }
    const reach = walk(join(ROOT, "src")).filter((f) => readFileSync(f, "utf8").includes('"/api/internal/content-reports"')).map((f) => f.slice(ROOT.length + 1)).sort();
    // blocApi: the allowed path (the type of callBloc); the two callers
    expect(reach).toEqual(["src/app/api/content-reports/route.ts", "src/lib/blocApi.ts", "src/lib/contentReportsServer.ts"]);
  });
  it("the page is a shell: the data comes from /api (no-store), never inside the page the service worker keeps", () => {
    const page = read("src/app/(panel)/content-reports/page.tsx");
    expect(page).not.toContain("loadContentReports");
    expect(page).not.toContain("loadContentReport(");
    const client = read("src/components/contentReports/ContentReportsClient.tsx");
    expect(client).toContain('fetch("/api/content-reports/one", { method: "POST"');
    expect(client).toContain('cache: "no-store"');
  });
});

describe("SAFETY-1 — the bell, the log", () => {
  it("a content alert links to the queue, and only a role that sees the queue gets it", () => {
    expect(notificationLink({ type: "content_report", entity_type: "content_report", entity_id: B1 })).toBe("/content-reports");
    expect(reportRowsFilter(true, true)).toBeNull();
    expect(reportRowsFilter(true, false)).toBe(WITHOUT_CONTENT_ROWS);
    expect(reportRowsFilter(false, true)).toBe(WITHOUT_DM_ROWS);
    expect(reportRowsFilter(false, false)).toBe(WITHOUT_REPORT_ROWS);
    expect(WITHOUT_CONTENT_ROWS).toBe("entity_type.is.null,entity_type.neq.content_report");
    expect(WITHOUT_REPORT_ROWS).toBe("entity_type.is.null,and(entity_type.neq.dm_report,entity_type.neq.content_report)");
    // the roles as they are today: a viewer sees neither kind
    expect(reportRowsFilter(can("viewer", "dm_reports.read"), can("viewer", "content_reports.read"))).toBe(WITHOUT_REPORT_ROWS);
    expect(read("src/components/layout/TopBar.tsx")).toContain('content_report: "🚩"');
  });
  it("the panel log names the four actions in Hebrew", () => {
    for (const a of ["CONTENT_REPORT_VIEW", "CONTENT_REPORT_HIDE", "CONTENT_REPORT_RESTORE", "CONTENT_REPORT_REFER"]) expect(AUDIT_LABELS[a]?.label).toMatch(/[א-ת]/);
  });
});

describe("SAFETY-1 — lib/contentReportsServer", () => {
  it("the queue: the signed route with the staff member and the filter; missing; a failure is the sentence, never an empty queue", async () => {
    const c = caller({ ok: true, status: 200, data: { ok: true, items: [ITEM], open_total: 1, truncated: false } });
    const r = await loadContentReports(ADMIN, crFilterOf({ source: "post" }), c.call);
    expect(c.calls).toEqual([{ path: "/api/internal/content-reports", payload: { actor: { id: ADMIN.id, email: ADMIN.email, role: "admin" }, action: "list", status: "open", order: "newest", source: "post" } }]);
    expect(r.state === "ok" && [r.items.length, r.openTotal]).toEqual([1, 1]);
    expect(await loadContentReports(ADMIN, crFilterOf({}), caller({ ok: false, status: 503, code: "sql_missing", error: "x" }).call)).toEqual({ state: "missing" });
    expect(await loadContentReports(ADMIN, crFilterOf({}), caller({ ok: false, status: 403, code: "forbidden", error: "x" }).call)).toEqual({ state: "error", message: "אין הרשאה לדיווחים על תוכן." });
    expect((await loadContentReports(ADMIN, crFilterOf({}), caller({ ok: true, status: 200, data: { items: [] } }).call)).state).toBe("error");
  });
  it("one item: logged in the panel only when bloc gave it; not found / missing / a strange answer — no log", async () => {
    const log = vi.fn(async () => {});
    const ok = caller({ ok: true, status: 200, data: { ok: true, report: { item: ITEM, reports: [], snapshots: ["x"], current: null } } });
    const r = await loadContentReport(ADMIN, { source: "post", id: M1 }, { call: ok.call, log: log as never });
    expect(ok.calls[0].payload).toEqual({ actor: { id: ADMIN.id, email: ADMIN.email, role: "admin" }, action: "one", source: "post", id: M1 });
    expect(r.state).toBe("ok");
    expect(log).toHaveBeenCalledWith(ADMIN, "CONTENT_REPORT_VIEW", "content_report", M1, { source: "post", building_id: B1 });
    log.mockClear();
    expect(await loadContentReport(ADMIN, { source: "post", id: M1 }, { call: caller({ ok: false, status: 404, code: "not_found", error: "x" }).call, log: log as never })).toEqual({ state: "not_found" });
    expect(await loadContentReport(ADMIN, { source: "post", id: M1 }, { call: caller({ ok: false, status: 503, code: "sql_missing", error: "x" }).call, log: log as never })).toEqual({ state: "missing" });
    const w = await loadContentReport(ADMIN, { source: "post", id: M1 }, { call: caller({ ok: false, status: 503, code: "write_failed", error: "x" }).call, log: log as never });
    expect(w).toEqual({ state: "error", message: "הפתיחה לא נרשמה ביומן, ולכן התוכן לא מוצג. נסו שוב בעוד רגע." });
    expect((await loadContentReport(ADMIN, { source: "post", id: M1 }, { call: caller({ ok: true, status: 200, data: { ok: true } }).call, log: log as never })).state).toBe("error");
    expect(log).not.toHaveBeenCalled();
  });
});
