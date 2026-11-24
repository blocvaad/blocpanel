// bloc COMPANY-1 (MG-S1252, החלטה 654) — /api/nav-counts: המונה שליד "חברות ניהול" בתפריט. כל תפקיד בפאנל (מונים בלבד);
// מונה שלא נטען — null (התפריט לא מציג מספר), לעולם לא 0; בלי cache.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
const reads: Array<{ table: string; cols: string; opts: any; filters: string[] }> = [];
let answers: Record<string, { count: number | null; error: any }>;
vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const rec = { table, cols: "", opts: null as any, filters: [] as string[] };
      const chain: any = {
        select: (cols: string, opts: any) => { rec.cols = cols; rec.opts = opts; reads.push(rec); return chain; },
        eq: (c: string, v: unknown) => { rec.filters.push(`eq ${c} ${v}`); return chain; },
        then: (resolve: any) => resolve({ data: null, ...(answers[table] ?? { count: 0, error: null }) }),
      };
      return chain;
    },
  },
}));

let GET: any;
beforeEach(async () => {
  ({ GET } = await import("../route"));
  guardResult = { ok: true, session: { id: "v1", email: "view@bloc.co.il", role: "viewer" } };
  reads.length = 0;
  answers = { management_companies: { count: 2, error: null }, management_link_requests: { count: 3, error: null } };
});

describe("GET /api/nav-counts", () => {
  it("companies waiting for approval and pending link requests — head counts only, no rows; not cached", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ companies: 2, links: 3 });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(reads).toEqual([
      { table: "management_companies", cols: "id", opts: { count: "exact", head: true }, filters: ["eq status pending_approval"] },
      { table: "management_link_requests", cols: "id", opts: { count: "exact", head: true }, filters: ["eq status pending"] },
    ]);
  });
  it("a count that failed is null (no number in the menu), the other still shows", async () => {
    answers.management_link_requests = { count: null, error: { code: "42P01", message: "relation does not exist" } };
    expect(await (await GET()).json()).toEqual({ companies: 2, links: null });
  });
  it("not signed in — the guard answers", async () => {
    guardResult = { ok: false, response: new Response(null, { status: 401 }) };
    expect((await GET()).status).toBe(401);
  });
});
