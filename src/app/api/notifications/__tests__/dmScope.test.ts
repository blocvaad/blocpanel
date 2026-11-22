// MOD-1 (bloc MG-S1179; סקירה #1): הפעמון — התראה על דיווח חדש על שיחה פרטית רק למי שרואה דיווחים (מנהל וסופר-אדמין). viewer לא
// מקבל אותה ולא יכול לסמן אותה כנקראה לכולם. קריאה שנכשלה — 503 עם שגיאה, לא "אין התראות".
import { describe, it, expect, beforeEach, vi } from "vitest";

let role = "admin";
const seen: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
let answer: { data: unknown; error: unknown } = { data: [], error: null };
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "a", email: "t@bloc.co.il", full_name: "ט", role, auth_level: "mfa" } }) }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from(table: string) {
      const rec = { table, ops: [] as Array<[string, unknown[]]> };
      seen.push(rec);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "update", "eq", "or", "order", "limit"]) q[m] = (...a: unknown[]) => { rec.ops.push([m, a]); return q; };
      q.then = (r: (v: unknown) => unknown) => Promise.resolve(answer).then(r);
      return q;
    },
  },
}));

import { GET } from "../route";
import { POST as READ_ALL } from "../read-all/route";
const orOf = () => seen.flatMap((s) => s.ops).filter(([m]) => m === "or").map(([, a]) => a[0]);

beforeEach(() => { seen.length = 0; answer = { data: [], error: null }; role = "admin"; });

describe("the bell and private-message reports", () => {
  it("a viewer gets no dm_report rows and cannot mark them read; admin and super admin get everything", async () => {
    role = "viewer";
    await GET();
    expect(orOf()).toEqual(["entity_type.is.null,entity_type.neq.dm_report"]);
    seen.length = 0;
    await READ_ALL();
    expect(orOf()).toEqual(["entity_type.is.null,entity_type.neq.dm_report"]);
    for (const r of ["admin", "superadmin"]) {
      role = r; seen.length = 0;
      await GET(); await READ_ALL();
      expect(orOf()).toEqual([]);
    }
  });

  it("a dm_report row links to the report; a failed read is 503, not an empty bell", async () => {
    answer = { data: [{ id: "n1", type: "dm_report", title: "דיווח חדש על שיחה פרטית", body: "איום או הפחדה", is_read: false, entity_type: "dm_report", entity_id: "77777777-7777-4777-8777-777777777771", created_at: "x" }], error: null };
    const ok: any = await GET();
    expect((await ok.json()).data[0].link).toBe("/dm-reports/77777777-7777-4777-8777-777777777771");
    answer = { data: null, error: { code: "BLOC_UNAVAILABLE", message: "x" } };
    const failed: any = await GET();
    expect(failed.status).toBe(503);
    expect((await failed.json()).error).toBe("ההתראות לא נטענו");
  });
});
