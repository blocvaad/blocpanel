// BILL-1d wiring: the new close action is gated by billing.manage, goes only through the signed blocApi client, and the panel
// still never writes billing_* tables.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { can, permissionsFor } from "@/lib/permissions";

const SRC = join(process.cwd(), "src");
function walk(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "__tests__" && n !== "node_modules") walk(p, out); }
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const files = walk(SRC).map((p) => ({ p: p.replace(SRC + "/", ""), s: readFileSync(p, "utf8") }));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("BILL-1d wiring", () => {
  it("close_stuck_event appears only in the stuck-events route", () => {
    expect(files.filter(({ s }) => s.includes("close_stuck_event")).map(({ p }) => p)).toEqual(["app/api/billing/stuck-events/route.ts"]);
  });
  it("the route's first gate is guard({ permission: 'billing.manage' }), before the body is read", () => {
    const s = read("app/api/billing/stuck-events/route.ts");
    expect(s).toMatch(/guard\(\{\s*permission:\s*"billing\.manage"\s*\}\)/);
    expect(s.indexOf("guard(")).toBeLessThan(s.indexOf("req.json"));
    expect(s.indexOf("guard(")).toBeLessThan(s.indexOf("callBloc("));
    expect(s).not.toMatch(/role:\s*"/);              // the same gate as the other task actions: a permission, not a hand-rolled role
  });
  it("billing.manage is super-admin only (admin / viewer cannot close a stuck callback)", () => {
    expect(can("superadmin", "billing.manage")).toBe(true);
    expect(permissionsFor("admin")).not.toContain("billing.manage");
    expect(permissionsFor("viewer")).not.toContain("billing.manage");
  });
  it("same gate as the tasks route", () => {
    const t = read("app/api/billing/tasks/route.ts").match(/guard\(\{[^}]*\}\)/)![0];
    const c = read("app/api/billing/stuck-events/route.ts").match(/guard\(\{[^}]*\}\)/)![0];
    expect(c).toBe(t);
  });
  it("the signed client is the only way out: callBloc('/api/internal/billing'), no direct fetch, no db client", () => {
    const s = read("app/api/billing/stuck-events/route.ts");
    expect(s).toMatch(/callBloc\(\s*"\/api\/internal\/billing"/);
    expect(s).not.toMatch(/\bfetch\(|adminClient|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
  it("no write to billing_webhook_events (or any billing_*) anywhere in src", () => {
    const bad: string[] = [];
    for (const { p, s } of files) {
      for (const m of s.matchAll(/from\(\s*["'`](billing_[a-z_]+)["'`]\s*\)([\s\S]{0,300})/g)) {
        const chain = m[2].split(/;\s*\n|\n\s*\n/)[0];
        if (/\.(insert|update|upsert|delete)\s*\(/.test(chain)) bad.push(`${p}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("the page posts the close to /api/billing/stuck-events and renders StuckEvents with it; the list is hidden from nobody who can see the page", () => {
    const s = read("app/(panel)/billing/page.tsx");
    expect(s).toContain('fetch("/api/billing/stuck-events"');
    expect(s).toMatch(/<StuckEvents[^>]*onClose=\{closeStuck\}/);
    expect(s).toMatch(/stuck_events\s*\?\?\s*null/);   // a missing field = failed read, never an empty list
  });
  it("the dialog sends nothing while the note is short (submit is guarded by noteOk)", () => {
    const s = read("components/ui/BillingTasks.tsx");
    expect(s).toMatch(/if \(!sel \|\| !onClose \|\| busy \|\| !noteOk\(note\)\) return;/);
  });
  it("the dialog closes only on success and stays open (with the message) on failure", () => {
    const s = read("components/ui/BillingTasks.tsx");
    expect(s).toContain("if (r.ok) { setSel(null);");
    expect(s).toContain("else setMsg({ ok: false, text: r.message })");
  });
  it("times are shown in Israel time", () => {
    const s = read("components/ui/BillingTasks.tsx");
    expect(s).toMatch(/const whenTime = [^\n]*timeZone: "Asia\/Jerusalem"/);
  });
  it("the page shows the task answer through taskResultText (the 'resumed' message)", () => {
    expect(read("app/(panel)/billing/page.tsx")).toContain("message: taskResultText(j.result)");
  });
  it("blocApi has no new path: the close rides the existing /api/internal/billing path", () => {
    const s = read("lib/blocApi.ts");
    expect(s).not.toContain("stuck");
  });
});
