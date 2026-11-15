// PANEL-PAY א1 wiring (החלטות 362–365): פעולות הכסף לא נכתבות יותר מהפאנל ישירות — רק דרך bloc החתום; כל route של כסף
// דורש אישור בקוד (requireStepUp) אחרי הבדיקה ולפני bloc; כל import בקבצים החדשים קיים ב-package.json של הפאנל.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AUDIT_LABELS } from "@/lib/auditLabels";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
function files(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "__tests__" && n !== "node_modules" && !n.startsWith(".")) files(p, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) && !n.startsWith(".__mt")) out.push(p);
  }
  return out;
}
const ALL = files(SRC).map((f) => ({ f: relative(SRC, f), src: readFileSync(f, "utf8") }));
/** every statement (up to the next ';') that starts at .from("<table>") */
function statementsOn(table: string): Array<{ f: string; stmt: string }> {
  const out: Array<{ f: string; stmt: string }> = [];
  for (const { f, src } of ALL) {
    let i = 0;
    const needle = `.from("${table}")`;
    while ((i = src.indexOf(needle, i)) >= 0) {
      const end = src.indexOf(";", i);
      out.push({ f, stmt: src.slice(i, end < 0 ? undefined : end) });
      i += needle.length;
    }
  }
  return out;
}
const WRITE = /\.(update|insert|upsert|delete)\(/;

describe("no direct money writes remain in src", () => {
  it("buildings: no insert / update carries plan, comp_reason or plan_expires", () => {
    const bad = statementsOn("buildings").filter((s) => WRITE.test(s.stmt) && /\bplan\b|comp_reason|plan_expires/.test(s.stmt.slice(s.stmt.search(WRITE))));
    expect(bad.map((b) => b.f)).toEqual([]);
    // PANEL-PAY א2: no write on buildings at all any more (panelPayA2Wiring) — the edit sends only buildingUpdateSchema's
    // fields to bloc, and refuses plan fields first
    const patch = read("app/api/buildings/[id]/route.ts");
    expect(patch.indexOf('if (hasPlanField(raw)) return NextResponse.json({ error: PLAN_MOVED_TEXT, code: "plan_moved" }, { status: 400 });'))
      .toBeLessThan(patch.indexOf('action: "update", building_id: id, patch: body'));
    const create = read("app/api/buildings/route.ts");
    expect(create.indexOf('if (hasPlanField(raw)) return NextResponse.json({ error: PLAN_MOVED_TEXT, code: "plan_moved" }, { status: 400 });'))
      .toBeLessThan(create.indexOf('action: "create", building'));
  });
  it("management_companies: never written by the panel", () => {
    expect(statementsOn("management_companies").filter((s) => WRITE.test(s.stmt)).map((s) => s.f)).toEqual([]);
  });
  it("platform_payment_providers: never written by the panel", () => {
    expect(statementsOn("platform_payment_providers").filter((s) => WRITE.test(s.stmt)).map((s) => s.f)).toEqual([]);
  });
  it('no .rpc("ai_topup_grant" anywhere in src', () => {
    expect(ALL.filter(({ src }) => src.includes('.rpc("ai_topup_grant"')).map((x) => x.f)).toEqual([]);
  });
  it("the company grant route no longer notifies the owner itself (bloc does)", () => {
    expect(read("app/api/management-companies/billing/route.ts")).not.toMatch(/notifyUser|adminClient/);
  });
});

describe("the money routes", () => {
  const ROUTES: Array<[string, string, string]> = [
    ["app/api/buildings/[id]/plan/route.ts", "/api/internal/plans", "session"],
    ["app/api/buildings/[id]/ai-credits/route.ts", "/api/internal/ai-credits", "session"],
    ["app/api/management-companies/billing/route.ts", "/api/internal/plans", "g.session"],
    ["app/api/collection-providers/route.ts", "/api/internal/collection-providers", "session"],
  ];
  for (const [file, path, who] of ROUTES) {
    it(`${file}: superadmin → body → step-up → bloc (${path}) with the session's actor`, () => {
      const src = read(file);
      const g = src.indexOf('await guard({ role: "superadmin" })');
      const p = src.indexOf("await parseBody(");
      const s = src.indexOf(`requireStepUp(${who}, req)`);
      const c = src.indexOf(`callBloc("${path}"`);
      expect(g, "guard").toBeGreaterThan(-1);
      expect(p, "parseBody").toBeGreaterThan(g);
      expect(s, "requireStepUp").toBeGreaterThan(p);
      expect(c, "callBloc").toBeGreaterThan(s);
      expect(src).toContain(`actor: actorOf(${who})`);
      expect(src).toContain("if (!su.ok) return su.response;");
      expect(src).not.toMatch(/actor: (body|parsed|req|p\.data)/);
    });
  }
  it("committee execute and members set_role / remove / transfer ask for the step-up before bloc", () => {
    const c = read("app/api/committee/route.ts");
    const post = c.slice(c.indexOf("export async function POST"));
    expect(post).toContain('if (body.action === "execute") {\n    const su = requireStepUp(g.session, req);');
    expect(post.indexOf("requireStepUp(")).toBeLessThan(post.indexOf("callBloc("));
    const m = read("app/api/members/route.ts");
    expect(m).toContain('const STEP_UP_ACTIONS: ReadonlySet<string> = new Set(["set_role", "remove", "transfer"]);');
    expect(m).toContain("if (STEP_UP_ACTIONS.has(p.data.action)) {\n    const su = requireStepUp(s, req);");
    expect(m.indexOf("requireStepUp(")).toBeLessThan(m.indexOf("callBloc("));
  });
  it("building creation with a committee head asks for the step-up before bloc creates it (the retry must not open a second building)", () => {
    const b = read("app/api/buildings/route.ts");
    const post = b.slice(b.indexOf("export async function POST"));
    const gate = post.indexOf("if (admin_email) {\n    const su = requireStepUp(session, req);\n    if (!su.ok) return su.response;\n  }");
    expect(gate).toBeGreaterThan(post.indexOf("await parseBody("));
    expect(post).not.toContain(".insert(");          // PANEL-PAY א2: bloc creates the building
    expect(gate).toBeLessThan(post.indexOf("callBloc("));
    expect(read("app/(panel)/buildings/new/page.tsx")).toContain('await stepUpFetch("/api/buildings"');
  });
  it("callBloc knows the three money paths", () => {
    const b = read("lib/blocApi.ts");
    for (const p of ["/api/internal/plans", "/api/internal/ai-credits", "/api/internal/collection-providers"]) expect(b).toContain(`"${p}"`);
  });
  it("review #6: success only with ok === true (and the entity) — otherwise badShape (unknown)", () => {
    expect(read("app/api/buildings/[id]/plan/route.ts")).toContain("if (r.data.ok !== true || !building) {");
    expect(read("app/api/management-companies/billing/route.ts")).toContain("if (r.data.ok !== true || !company) {");
    expect(read("app/api/buildings/[id]/ai-credits/route.ts")).toContain("if (r.data.ok !== true) {");
    expect((read("app/api/collection-providers/route.ts").match(/if \(r\.data\.ok !== true \|\| !row\) \{/g) ?? []).length).toBe(2);
    for (const [file] of ROUTES) expect(read(file)).toContain("badShape(");
  });
  it("maxDuration 60 like the sibling callBloc routes", () => {
    for (const [file] of ROUTES) expect(read(file)).toMatch(/^export const maxDuration = 60;$/m);
  });
});

describe("step-up and audit plumbing", () => {
  it("the step-up's session cookie name is the session cookie of lib/auth and the middleware", () => {
    expect(read("lib/stepUp.ts")).toContain('export const PANEL_SESSION_COOKIE = "blocpanel_session";');
    expect(read("lib/auth.ts")).toContain('const COOKIE_NAME = "blocpanel_session";');
    expect(read("middleware.ts")).toContain('req.cookies.get("blocpanel_session")');
  });
  it("auditLog checks the insert error and keeps the first X-Forwarded-For address", () => {
    const a = read("lib/auth.ts");
    expect(a).toContain('if (error) console.error("[auditLog] insert failed:", action);');
    expect(a).toContain("ip_address: auditIp(ip)");
  });
  it("the staff role change reads the previous row before it writes", () => {
    const r = read("app/api/settings/admin/[id]/route.ts");
    expect(r.indexOf('.select("id, role, is_active")')).toBeLessThan(r.indexOf(".update(updates)"));
    expect(r).toContain("role: { from: before.role ?? null, to: role }");
  });
  it("every new action has a Hebrew label in the log", () => {
    for (const k of ["BUILDING_PLAN_GRANTED", "BUILDING_PLAN_GRANT_ENDED", "MANAGEMENT_PLAN_GRANTED", "MANAGEMENT_PLAN_GRANT_ENDED",
      "MONEY_ACTION_FAILED", "MONEY_ACTION_UNKNOWN", "STEPUP_SENT", "STEPUP_VERIFIED", "STEPUP_LOCKED",
      "COLLECTION_PROVIDER_GATE_CLOSED", "COLLECTION_PROVIDER_GATE_REOPENED", "UPDATE_ADMIN"]) {
      expect(AUDIT_LABELS[k]?.label, k).toMatch(/[א-ת]/);
    }
  });
});

describe("bloc's audit_logs: one entry per action (bloc decision 366 — two rows share details.ref)", () => {
  it("every file that reads bloc audit_logs passes the rows through oneEntryPerAction", () => {
    const readers = ALL.filter(({ src }) => src.includes('.from("audit_logs")'));
    expect(readers.map((r) => r.f).sort()).toEqual(expect.arrayContaining(["app/api/management-companies/route.ts", "lib/people.ts"]));
    for (const { f, src } of readers) {
      expect(src, f).toMatch(/import \{ (?:[\w, ]+, )?oneEntryPerAction(?:, [\w, ]+)? \} from "@\/lib\/blocAudit";/);   // א2: + blocStaffEmail / blocAuditBuilding
      expect(src.split("oneEntryPerAction(").length - 1, f).toBeGreaterThanOrEqual(1);
    }
    expect(read("app/api/management-companies/route.ts")).toContain("companyHistory(oneEntryPerAction((bloc.data ?? []) as BlocAuditRow[]),");
    expect(read("lib/people.ts")).toContain('const blocRows = (blog.data ?? []) as PersonDetail["blocLog"];');
    expect(read("lib/people.ts")).toContain("blocLog: oneEntryPerAction(blocRows),");
  });
  it("the helper is pure — no imports, no database, no network", () => {
    const h = read("lib/blocAudit.ts");
    expect(h).not.toMatch(/^\s*import /m);
    expect(h).not.toMatch(/\.from\(|fetch\(|adminClient|callBloc/);
  });
});

describe("every import exists in the panel's package.json", () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  const BUILTIN = new Set(["crypto", "node:crypto", "node:fs", "node:path", "fs", "path"]);
  const NEW = [
    "lib/otp.ts", "lib/stepUp.ts", "lib/stepUpShared.ts", "lib/stepUpClient.ts", "lib/panelSecret.ts", "lib/moneyActions.ts", "lib/buildingPlan.ts", "lib/blocAudit.ts",
    "components/ui/StepUpDialog.tsx", "components/ui/BuildingPlanCard.tsx", "components/ui/BuildingEditForm.tsx",
    "app/api/auth/stepup/route.ts", "app/api/buildings/[id]/plan/route.ts", "app/api/auth/2fa/route.ts",
    "app/api/buildings/[id]/ai-credits/route.ts", "app/api/management-companies/billing/route.ts", "app/api/collection-providers/route.ts",
    "app/(panel)/buildings/[id]/edit/page.tsx", "app/(panel)/buildings/new/page.tsx",
  ];
  it("no package outside dependencies / devDependencies (no happy-dom, no testing-library)", () => {
    const bad: string[] = [];
    for (const f of NEW) {
      for (const m of read(f).matchAll(/(?:^|\n)\s*import[^"']*["']([^"']+)["']/g)) {
        const spec = m[1];
        if (spec.startsWith(".") || spec.startsWith("@/") || BUILTIN.has(spec)) continue;
        const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (!deps.has(name)) bad.push(`${f}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
    expect(deps.has("happy-dom")).toBe(false);
    expect(deps.has("@testing-library/react")).toBe(false);
  });
});
