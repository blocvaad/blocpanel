// א3-1 (bloc, החלטה 444): הכללים שנועלים את המעבר של לוח הבקרה לקריאה דרך bloc.
//   • /overview, /analytics ו-/api/live לא קוראים טבלאות של bloc — רק readBloc (הסקירה: הפעילות האחרונה מטבלת הפאנל עצמו).
//   • הנתיבים שאף מסך לא קרא להם (stats, export, logs, payments, tickets) — נמחקו, ולא חוזרים בשקט.
//   • readBloc — בערוץ החתום של הפעולות (callBloc), לנתיב אחד.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).split("\n").map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, "$1")).join("\n");

describe("א3-1 — the dashboard reads through bloc", () => {
  it("analytics and live never touch the database; overview reads only the panel's own audit table", () => {
    for (const f of ["src/app/(panel)/analytics/page.tsx", "src/app/api/live/route.ts"]) {
      expect(code(f)).not.toContain("adminClient");
      expect(code(f)).toContain("readBloc(");
    }
    const o = code("src/app/(panel)/overview/page.tsx");
    expect(o).toContain('readBloc("overview", {}, actorOf(session))');
    expect([...o.matchAll(/adminClient\.from\("([a-z_]+)"\)/g)].map((m) => m[1])).toEqual(["panel_audit_logs"]);
    expect(o).not.toMatch(/\.rpc\(/);
  });
  it("the routes no screen called are gone (stats, export, logs, payments, tickets)", () => {
    for (const r of ["stats", "export", "logs", "payments", "tickets"]) expect(existsSync(join(ROOT, `src/app/api/${r}/route.ts`))).toBe(false);
  });
  it("readBloc goes through the signed channel of the actions, to one path", () => {
    const b = code("src/lib/blocRead.ts");
    expect(b).toContain('await callBloc("/api/internal/panel-read", { ...params, read, actor: { id: actor.id, email: actor.email, role: actor.role } }, { timeoutMs: READ_TIMEOUT_MS, ...opts })');
    expect(b).toContain("export const READ_TIMEOUT_MS = 8_000;");
    expect(code("src/lib/blocApi.ts")).toContain("setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS)");
    expect(code("src/lib/blocApi.ts")).toContain('| "/api/internal/panel-read"');
    // S345 (שלב 4): וכל שאר השאילתות — /api/internal/panel-db (lib/supabase)
    expect(code("src/lib/blocApi.ts")).toContain('| "/api/internal/panel-db"');
    // MOD-1: ואחריו הדיווחים על הודעות פרטיות (/api/internal/dm-reports)
  });
  it("the live screen takes bloc's failed list (the view is tested on its own; the polling container is pinned here)", () => {
    const l = code("src/components/ui/LiveDashboard.tsx");
    expect(l).toContain("setPartial(Array.isArray(j.failed) && j.failed.length > 0);");
    expect(l).toContain("return <LiveDashboardView stats={stats} events={events} lastOk={lastOk} failed={failed} partial={partial} onRefresh={() => void poll()} />;");
    expect(code("src/app/api/live/route.ts")).toContain("stats: d.stats, failed: d.failed }");
  });
  it("a viewer gets the contact details hidden on the companies and the suppliers lists (no license link signed)", () => {
    expect(code("src/app/api/management-companies/route.ts")).toContain("return canDecide ? row : {");
    expect(code("src/app/api/suppliers/route.ts")).toContain("const signed = canVerify ? await signLicenses(");
  });
});
