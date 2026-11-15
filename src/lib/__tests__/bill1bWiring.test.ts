// BILL-1b wiring: the panel stays read-only on billing_*, never talks to PayPlus, and opens the stop task only through callBloc.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { liveSubscription, LIVE_SUBSCRIPTION_TEXT, liveSubscriptionText } from "@/lib/billing";
import { buildingArchiveSchema, buildingSuspendSchema, managementActionSchema } from "@/lib/validation";

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

describe("BILL-1b wiring", () => {
  it("no insert / update / upsert / delete on any billing_* table anywhere in src; no billing_* RPC", () => {
    const bad: string[] = [];
    for (const { p, s } of files) {
      for (const m of s.matchAll(/from\(\s*["'`](billing_[a-z_]+)["'`]\s*\)([\s\S]{0,300})/g)) {
        const chain = m[2].split(/;\s*\n|\n\s*\n/)[0];
        if (/\.(insert|update|upsert|delete)\s*\(/.test(chain)) bad.push(`${p}: ${m[1]}`);
      }
      if (/\.rpc\(\s*["'`]billing_/.test(s)) bad.push(`${p}: rpc billing_*`);
    }
    expect(bad).toEqual([]);
  });
  it("no fetch to PayPlus, and no PayPlus host anywhere in src", () => {
    const bad: string[] = [];
    for (const { p, s } of files) {
      if (/payplus\.co\.il|restapi\.payplus|payplus\.com/i.test(s)) bad.push(`${p}: host`);
      for (const m of s.matchAll(/fetch\(([^)]{0,200})\)/g)) if (/payplus/i.test(m[1])) bad.push(`${p}: fetch ${m[1].slice(0, 40)}`);
    }
    expect(bad).toEqual([]);
  });
  it("open_stop_task is mentioned only in liveSubscriptionFlow.ts (and the blocApi path union has no such action)", () => {
    const where = files.filter(({ s }) => s.includes("open_stop_task")).map(({ p }) => p);
    expect(where).toEqual(["lib/liveSubscriptionFlow.ts"]);
  });
  it("liveSubscriptionFlow reaches bloc only through callBloc('/api/internal/billing'), with no db write and no direct fetch", () => {
    const s = read("lib/liveSubscriptionFlow.ts");
    expect(s).toMatch(/callBloc\(\s*"\/api\/internal\/billing"/);
    expect(s).not.toMatch(/\bfetch\(/);
    expect(s).not.toMatch(/adminClient|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(s).toContain("catch");   // never throws: a failure is 'failed'
  });
  it("the three routes check BEFORE the write and never name the bloc action themselves (the building's two moved to bloc)", () => {
    const b = read("app/api/buildings/[id]/route.ts");
    const c = read("app/api/management-companies/route.ts");
    // PANEL-PAY א2 (decision 367): suspending / archiving a building runs in bloc, which checks the live subscription before its
    // own write and opens the stop task; the panel forwards the confirmation and maps bloc's 409 to the same LIVE_SUBSCRIPTION.
    expect(b).not.toContain("checkLiveSubscription"); expect(b).not.toContain("openStopTask"); expect(b).not.toContain("open_stop_task");
    expect(b).toContain('if (live) return liveSubscriptionConflict(live.sub, "building", live.action);');
    expect(b.split("...(confirmed ? { confirm_live_subscription: true } : {}),").length - 1).toBe(2);
    expect(c).toContain("checkLiveSubscription"); expect(c).toContain("openStopTask"); expect(c).not.toContain("open_stop_task");
    expect(c.indexOf("checkLiveSubscription")).toBeLessThan(c.indexOf('callBloc("/api/internal/management-companies"'));
    expect(c).toMatch(/confirm_live_subscription: confirmLive, \.\.\.rest/);   // stripped before the decision call
  });
  it("the stop-task audit names exist for the three actions", () => {
    expect(read("app/api/buildings/[id]/route.ts")).toContain("SUSPEND_BUILDING_STOP_TASK_FAILED");
    expect(read("app/api/buildings/[id]/route.ts")).toContain("ARCHIVE_BUILDING_STOP_TASK_FAILED");
    expect(read("app/api/management-companies/route.ts")).toContain("MANAGEMENT_SUSPEND_STOP_TASK_FAILED");
  });
  it("the three strict schemas accept the literal confirmation (and reject anything else)", () => {
    expect(buildingSuspendSchema.safeParse({ is_active: false, confirm_live_subscription: true }).success).toBe(true);
    expect(buildingArchiveSchema.safeParse({ reason: "x", confirm_live_subscription: true }).success).toBe(true);
    const id = "11111111-1111-4111-8111-111111111111";
    expect(managementActionSchema.safeParse({ action: "suspend", id, expected_status: "active", reason: "חוב פתוח של שלושה חודשים", confirm_live_subscription: true }).success).toBe(true);
    for (const bad of [false, "true", 1, null]) {
      expect(buildingSuspendSchema.safeParse({ is_active: false, confirm_live_subscription: bad }).success).toBe(false);
      expect(buildingArchiveSchema.safeParse({ confirm_live_subscription: bad }).success).toBe(false);
    }
  });
  it("liveSubscription: only select + filters (no write methods), PAYING_STATUSES, and a failure is {error}, never 'not live'", async () => {
    const seen: string[] = [];
    const db = (answer: unknown) => ({ from: () => { const c: any = new Proxy({}, { get: (_t, p: string) => p === "then" ? (r: any) => r(answer) : (...a: unknown[]) => { seen.push(p); return c; } }); return c; } });
    const owner = { type: "building" as const, id: "x" };
    expect(await liveSubscription(db({ data: [], error: null }), owner)).toEqual({ live: false, sub: null });
    expect(await liveSubscription(db({ data: [{ status: "active", plan_id: "tower", provider_recurring_uid: "u", current_period_end: null }], error: null }), owner))
      .toEqual({ live: true, sub: { status: "active", plan_id: "tower", has_recurring: true, period_end: null } });
    expect(await liveSubscription(db({ data: null, error: { message: "down" } }), owner)).toEqual({ error: "down" });
    expect(seen.every((m) => ["select", "eq", "in", "limit"].includes(m))).toBe(true);
    expect(await liveSubscription({ from: () => { throw new Error("x"); } }, owner)).toEqual({ error: "x" });
  });
  it("texts: building / archive / company, with the dash and the contract wording", () => {
    expect(LIVE_SUBSCRIPTION_TEXT.building).toBe("לבניין יש מנוי חי עם הוראת קבע. ההשעיה לא עוצרת את החיוב — אשרו כדי להמשיך ולפתוח משימת עצירה ידנית.");
    expect(LIVE_SUBSCRIPTION_TEXT.company).toBe("לחברה יש מנוי חי עם הוראת קבע. ההשעיה לא עוצרת את החיוב — אשרו כדי להמשיך ולפתוח משימת עצירה ידנית.");
    expect(liveSubscriptionText("building", "archive")).toContain("הארכוב לא עוצר");
    expect(liveSubscriptionText("management_company", "suspend")).toBe(LIVE_SUBSCRIPTION_TEXT.company);
  });
  it("the tasks route maps stop_old_recurring to mark_old_stopped and the two new 409 codes", () => {
    const s = read("app/api/billing/tasks/route.ts");
    expect(s).toContain("mark_old_stopped"); expect(s).toContain("use_mark_old_stopped"); expect(s).toContain("system_task");
  });
  it("the UI never sends confirm_live_subscription before a 409 (only the 'confirmLive' paths add it)", () => {
    for (const rel of ["components/ui/BuildingsTable.tsx", "components/ui/BuildingActions.tsx", "components/ui/CompanyDecisionModal.tsx"]) {
      const s = read(rel);
      expect(s).toContain("parseLiveConflict");
      const all = [...s.matchAll(/confirm_live_subscription: true/g)].length;
      const guarded = [...s.matchAll(/confirmLive \? \{ confirm_live_subscription: true \}/g)].length;
      if (!rel.endsWith("CompanyDecisionModal.tsx")) { expect(all, rel).toBeGreaterThan(0); expect(guarded, rel).toBe(all); }
    }
    expect(read("components/ui/CompanyDecisionModal.tsx")).toMatch(/confirmLive[\s\S]{0,400}confirm_live_subscription: true/);
  });
});
