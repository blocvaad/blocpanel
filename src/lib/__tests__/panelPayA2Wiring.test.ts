// PANEL-PAY א2 wiring (החלטות 367–369): מחזור החיים של בניין ואימות ספק לא נכתבים יותר מהפאנל — רק דרך bloc החתום
// (/api/internal/buildings, /api/internal/suppliers); ארכוב, השעיה / הפעלה ואימות / דחייה / הסרת אימות דורשים אישור בקוד
// (requireStepUp) אחרי הבדיקה ולפני bloc, והמסכים שולחים דרך stepUpFetch; הודעות המוצר נשלחות מ-bloc (lib/notify נמחק).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
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
/** the part of a route file from `export async function <name>` to the next export (or the end) */
function handler(src: string, name: string): string {
  const at = src.indexOf(`export async function ${name}(`);
  if (at < 0) return "";
  const next = src.indexOf("\nexport ", at + 10);
  return src.slice(at, next < 0 ? undefined : next);
}

describe("no direct writes for the building lifecycle / supplier verification remain in src", () => {
  it("buildings: no .insert / .update / .upsert / .delete anywhere (reads stay until א3)", () => {
    expect(statementsOn("buildings").filter((s) => WRITE.test(s.stmt)).map((s) => s.f)).toEqual([]);
    expect(statementsOn("buildings").length).toBeGreaterThan(0);   // the scan sees the reads
  });
  it('no .rpc("admin_archive_building" anywhere', () => {
    expect(ALL.filter(({ src }) => src.includes('.rpc("admin_archive_building"') || src.includes("admin_archive_building\"")).map((x) => x.f)).toEqual([]);
  });
  it("supplier_profiles: never written by the panel (the queue GET still reads it)", () => {
    expect(statementsOn("supplier_profiles").filter((s) => WRITE.test(s.stmt)).map((s) => s.f)).toEqual([]);
    expect(statementsOn("supplier_profiles").length).toBeGreaterThan(0);
  });
  it('bloc\'s product notifications: no .from("notifications") in src; lib/notify is gone and nobody imports it', () => {
    expect(ALL.filter(({ src }) => src.includes('.from("notifications")')).map((x) => x.f)).toEqual([]);
    expect(existsSync(join(SRC, "lib", "notify.ts"))).toBe(false);
    expect(ALL.filter(({ src }) => /from\s+["']@\/lib\/notify["']|notifyUser\(/.test(src)).map((x) => x.f)).toEqual([]);
  });
  it("the building route no longer decides the live-subscription rule or opens the stop task itself (bloc does)", () => {
    const r = read("app/api/buildings/[id]/route.ts");
    expect(r).not.toMatch(/checkLiveSubscription\(|openStopTask\(|billing_subscriptions/);
    expect(r).toContain("const live = liveConflictOf(r, \"suspend\");");
    expect(r).toContain("const live = liveConflictOf(r, \"archive\");");
  });
});

describe("the moved routes: guard → body → step-up (decision 369) → bloc, with the session's actor", () => {
  const order = (src: string, marks: string[]) => marks.map((m) => src.indexOf(m));
  it("DELETE /api/buildings/[id] (archive): super-admin → body → requireStepUp → callBloc archive", () => {
    const d = handler(read("app/api/buildings/[id]/route.ts"), "DELETE");
    const [g, p, s, c] = order(d, ['await guard({ role: "superadmin" })', "await parseBody(", "requireStepUp(session, req)", 'callBloc("/api/internal/buildings"']);
    expect(g).toBeGreaterThan(-1);
    expect(p).toBeGreaterThan(g);
    expect(s).toBeGreaterThan(p);
    expect(c).toBeGreaterThan(s);
    expect(d).toContain('action: "archive", building_id: id, reason');
  });
  it("PATCH suspend / activate: buildings.modify → the suspend schema → requireStepUp → callBloc set_active; the edit branch asks no code", () => {
    const patch = handler(read("app/api/buildings/[id]/route.ts"), "PATCH");
    const split = patch.indexOf("// PANEL-PAY א1 (החלטה 363): המסלול עבר לכרטיס");
    const suspend = patch.slice(0, split);
    const edit = patch.slice(split);
    const [g, p, s, c] = order(suspend, ['await guard({ permission: "buildings.modify" })', "buildingSuspendSchema)", "requireStepUp(session, req)", 'callBloc("/api/internal/buildings"']);
    expect(g).toBeGreaterThan(-1);
    expect(p).toBeGreaterThan(g);
    expect(s).toBeGreaterThan(p);
    expect(c).toBeGreaterThan(s);
    expect(suspend).toContain('action: "set_active", building_id: id, is_active: s.data.is_active');
    expect(edit).not.toContain("requireStepUp(");
    expect(edit).toContain('action: "update", building_id: id, patch: body');
  });
  it("PATCH /api/suppliers: suppliers.verify → body → requireStepUp → callBloc", () => {
    const sp = handler(read("app/api/suppliers/route.ts"), "PATCH");
    const [g, p, s, c] = order(sp, ['await guard({ permission: "suppliers.verify" })', "await parseBody(", "requireStepUp(session, req)", 'callBloc("/api/internal/suppliers"']);
    expect(g).toBeGreaterThan(-1);
    expect(p).toBeGreaterThan(g);
    expect(s).toBeGreaterThan(p);
    expect(c).toBeGreaterThan(s);
  });
  it("POST /api/buildings: a code only with a committee head (decision 364); a plain create asks none (369)", () => {
    const post = handler(read("app/api/buildings/route.ts"), "POST");
    expect(post.split("requireStepUp(").length - 1).toBe(1);
    expect(post).toContain("if (admin_email) {\n    const su = requireStepUp(session, req);\n    if (!su.ok) return su.response;\n  }");
    expect(post.indexOf("requireStepUp(")).toBeLessThan(post.indexOf('callBloc("/api/internal/buildings"'));
  });
  it("every bloc call takes the actor from the session (never the body), and success needs ok === true and the row", () => {
    const b = read("app/api/buildings/route.ts");
    const id = read("app/api/buildings/[id]/route.ts");
    const sp = read("app/api/suppliers/route.ts");
    for (const src of [b, id, sp]) {
      expect(src).toContain("actor: actorOf(session)");
      expect(src).not.toMatch(/actor: (body|parsed|req|p\.data|raw)/);
      expect(src).toContain("actionBadShape(");
      expect(src).toContain("if (!su.ok) return su.response;");
      expect(src).toMatch(/^export const maxDuration = 60;$/m);
    }
    expect(b).toContain("if (r.data.ok !== true || !row) {");
    expect(id).toContain("if (r.data.ok !== true || !row || !stopTask) {");
    expect(id).toContain("if (r.data.ok !== true || !row || row.id !== id) {");
    expect(id).toContain("const done = archiveAnswer(r.data);");
    expect(sp).toContain("if (r.data.ok !== true || !row || row.id !== body.id) {");
  });
  it("callBloc knows the two new paths", () => {
    const b = read("lib/blocApi.ts");
    for (const p of ["/api/internal/buildings", "/api/internal/suppliers"]) expect(b).toContain(`"${p}"`);
  });
});

describe("the screens go through stepUpFetch (one retry after the code) and never call the old paths with plain fetch", () => {
  it("archive (building page + list), suspend / activate (list), supplier verification, new building", () => {
    const actions = read("components/ui/BuildingActions.tsx");
    const table = read("components/ui/BuildingsTable.tsx");
    const card = read("components/ui/SupplierVerifyCard.tsx");
    expect(actions).toContain("await stepUpFetch(`/api/buildings/${buildingId}`, {\n        method: \"DELETE\"");
    expect(table.split("await stepUpFetch(`/api/buildings/${target.id}`").length - 1).toBe(2);
    expect(card).toContain('await stepUpFetch("/api/suppliers", {\n        method: "PATCH"');
    expect(read("app/(panel)/buildings/new/page.tsx")).toContain('await stepUpFetch("/api/buildings"');
    for (const src of [actions, table, card]) expect(src).not.toMatch(/await fetch\(/);
    expect(read("app/(panel)/suppliers/page.tsx")).not.toMatch(/method: "PATCH"/);
  });
  it("the code dialog says what is being confirmed (STEP_UP_WHAT) in each of them", () => {
    expect(read("components/ui/BuildingActions.tsx")).toContain("{ what: STEP_UP_WHAT.archive(buildingName) }");
    expect(read("components/ui/BuildingsTable.tsx")).toContain("{ what: STEP_UP_WHAT.archive(target.name) }");
    expect(read("components/ui/BuildingsTable.tsx")).toContain("{ what: target.is_active ? STEP_UP_WHAT.suspend(target.name) : STEP_UP_WHAT.activate(target.name) }");
    expect(read("components/ui/SupplierVerifyCard.tsx")).toContain("{ what: STEP_UP_WHAT[action](s.business_name) }");
    expect(read("app/(panel)/buildings/new/page.tsx")).toContain("{ what: STEP_UP_WHAT.create(form.name) }");
    expect(read("components/ui/StepUpDialog.tsx")).toContain("registerStepUpHost((d, what) => setOpen({ done: d, what }))");
  });
  it("success on the screens only when the answer says it happened", () => {
    expect(read("components/ui/BuildingActions.tsx")).toContain("if (res.ok && j.archived === true) {");
    const table = read("components/ui/BuildingsTable.tsx");
    expect(table).toContain("if (res.ok && j.data?.is_active === !target.is_active) {");
    expect(table).toContain("if (res.ok && j.archived === true) {");
    expect(read("components/ui/SupplierVerifyCard.tsx")).toContain("const o = afterSupplierAction(res, j, action, s.business_name);");
    expect(read("app/(panel)/buildings/new/page.tsx")).toContain("const o = newBuildingOutcome(res, json, form.name);");
  });
  it("the confirmation dialogs say a code comes next (StepUpNote)", () => {
    for (const f of ["components/ui/DeleteBuildingModal.tsx", "components/ui/SuspendBuildingModal.tsx", "components/ui/SupplierVerifyCard.tsx"]) {
      expect(read(f), f).toMatch(/<StepUpNote[ />]/);
    }
  });
  it("browser files import the browser-safe helpers, not the server mapping", () => {
    for (const { f, src } of ALL.filter(({ src }) => /^["']use client["']/.test(src))) {
      expect(src, f).not.toMatch(/from\s+["']@\/lib\/(blocActions|blocApi|stepUp|supabase)["']/);
    }
  });
});

describe("labels and imports", () => {
  it("every action this package logs has a Hebrew label", () => {
    for (const k of ["BLOC_ACTION_FAILED", "BLOC_ACTION_UNKNOWN", "SUPPLIER_VERIFY", "SUPPLIER_REJECT", "SUPPLIER_REVOKE",
      "SUSPEND_BUILDING_STOP_TASK_FAILED", "ARCHIVE_BUILDING_STOP_TASK_FAILED", "CREATE_BUILDING", "UPDATE_BUILDING",
      "SUSPEND_BUILDING", "ACTIVATE_BUILDING", "ARCHIVE_BUILDING", "STEPUP_SENT", "STEPUP_VERIFIED", "STEPUP_LOCKED"]) {
      expect(AUDIT_LABELS[k]?.label, k).toMatch(/[א-ת]/);
    }
    expect(AUDIT_LABELS.STEPUP_VERIFIED.label).not.toContain("כסף");
  });
  it("every import in the new / changed files exists in the panel's package.json (no happy-dom, no testing-library)", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
    const BUILTIN = new Set(["crypto", "node:crypto", "node:fs", "node:path", "fs", "path"]);
    const NEW = [
      "lib/blocActions.ts", "lib/blocActionsUi.ts", "lib/blocApi.ts", "lib/stepUpClient.ts", "lib/stepUpShared.ts", "lib/email.ts",
      "app/api/buildings/route.ts", "app/api/buildings/[id]/route.ts", "app/api/suppliers/route.ts",
      "components/ui/StepUpNote.tsx", "components/ui/SupplierVerifyCard.tsx", "components/ui/NewBuildingNotice.tsx", "components/ui/NewBuildingForm.tsx",
      "components/ui/BuildingActions.tsx", "components/ui/BuildingsTable.tsx", "components/ui/DeleteBuildingModal.tsx", "components/ui/SuspendBuildingModal.tsx",
      "components/ui/StepUpDialog.tsx", "app/(panel)/suppliers/page.tsx", "app/(panel)/buildings/new/page.tsx", "app/(panel)/buildings/[id]/edit/page.tsx",
    ];
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

describe("review fixes (PANEL-PAY א2)", () => {
  it("#3 the new-building page and form both lock on createLocked; a dropped connection is unclear, never \"try again\"", () => {
    const page = read("app/(panel)/buildings/new/page.tsx");
    expect(page).toContain("const created = createLocked(outcome);");
    expect(page).toContain('catch { setOutcome({ kind: "error", text: CREATE_NETWORK_TEXT, unclear: true }); }');
    expect(read("components/ui/NewBuildingForm.tsx")).toContain("const created = createLocked(outcome);");
  });
  it("#6 suppliers: a failed load is never \"no suppliers\" or \"0 pending\"; a failed refresh says the list may be stale", () => {
    const p = read("app/(panel)/suppliers/page.tsx");
    expect(p).toContain("{!loading && !error && shown.length === 0 && ");
    expect(p).toContain("{loadedOnce && <p ");
    expect(p).toContain("setError(loadedOnce ? STALE_TEXT : (j.error ?? LOAD_FAILED_TEXT));");
    expect(p).toContain("catch { setError(loadedOnce ? STALE_TEXT : LOAD_FAILED_TEXT); }");
  });
});
