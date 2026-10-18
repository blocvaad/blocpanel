// bloc REG-2 — /api/management-companies.
//   PATCH: ההחלטה נחתמת ונשלחת ל-bloc (/api/internal/management-companies) — הפאנל לא כותב ל-DB ולא שולח הודעה
//          בעצמו; על המצב והפרטים שעל המסך; סיבה לחברה בדחייה ובהשעיה; יומן הפאנל רק אחרי הצלחה.
//   GET:   מה שצריך כדי להחליט (186 + 187), הבעלים והבניין שלו, canDecide; ?history=<id> — מה קרה עם חברה.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let guardResult: any;
const calls: any[] = [];
const audits: any[] = [];
let blocAnswer: any;
const selects: Array<{ table: string; cols: string; filters: string[] }> = [];
let tables: Record<string, { data: any; error: any }>;
let rpcAnswer: { data: any; error: any };

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => (typeof guardResult === "function" ? guardResult(opts) : guardResult) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const rec = { table, cols: "", filters: [] as string[] };
      const chain: any = {
        select: (cols: string) => { rec.cols = cols; selects.push(rec); return chain; },
        eq: (c: string, v: unknown) => { rec.filters.push(`eq ${c} ${v}`); return chain; },
        in: (c: string, v: unknown[]) => { rec.filters.push(`in ${c} ${v.join("|")}`); return chain; },
        like: (c: string, v: string) => { rec.filters.push(`like ${c} ${v}`); return chain; },
        order: () => chain,
        limit: () => chain,
        then: (resolve: any) => resolve(tables[table] ?? { data: [], error: null }),
        update: () => { throw new Error("the panel must not write management_companies / profiles"); },
        insert: () => { throw new Error("the panel must not write here"); },
      };
      return chain;
    },
    rpc: async (fn: string) => {
      if (fn !== "panel_company_billing") throw new Error(`the panel must not call ${fn}`);
      return rpcAnswer;
    },
  },
}));

let PATCH: any, GET: any;
// כמו panel_admins.id — uuid (bloc בודק את המבנה של actor.id).
const ADMIN = { id: "5b1f0a3c-8d2e-4f6a-9b7c-1e2d3f4a5b6c", email: "ops@bloc.co.il", role: "admin" };
const C = "11111111-1111-4111-8111-111111111111";
const SEEN = "2026-10-18T09:12:13.456789+00:00";
const REASON = "לא מצאנו את החברה ברשם החברות";
const req = (body: any, ip: string | null = null): any => ({ json: async () => body, headers: { get: (h: string) => (h === "x-forwarded-for" ? ip : null) } });
const getReq = (q = "") => new Request(`https://panel.blocvaad.co.il/api/management-companies${q}`);
const OK = { ok: true, status: 200, data: { ok: true, company_id: C, company_name: "נווה ניהול", previous_status: "pending_approval", status: "active", decided_at: SEEN, notified: true, email: "sent" } };

beforeEach(async () => {
  ({ PATCH, GET } = await import("../route"));
  guardResult = { ok: true, session: ADMIN };
  blocAnswer = OK;
  calls.length = 0; audits.length = 0; selects.length = 0;
  tables = {};
  rpcAnswer = { data: [], error: null };
});

describe("PATCH — the decision goes to bloc, signed", () => {
  it("requires management.approve (a viewer never reaches bloc)", async () => {
    let asked: any;
    guardResult = (opts: any) => { asked = opts; return { ok: false, response: { status: 403 } }; };
    const r = await PATCH(req({ id: C, action: "approve", expected_status: "pending_approval", seen_details_at: SEEN }));
    expect(r.status).toBe(403);
    expect(asked).toEqual({ permission: "management.approve" });
    expect(calls).toHaveLength(0);
  });

  it("approve: the state and the details seen, the actor, the internal note as panel_note; audited after bloc said yes", async () => {
    const r = await PATCH(req({ id: C, action: "approve", expected_status: "pending_approval", seen_details_at: SEEN, note: "  אומת ברשם  " }, "1.2.3.4, 10.0.0.1"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(OK.data);   // ok: true, and what bloc answered
    expect(calls).toEqual([{ path: "/api/internal/management-companies", payload: {
      action: "approve", expected_status: "pending_approval", seen_details_at: SEEN, company_id: C, panel_note: "אומת ברשם", actor: ADMIN,
    } }]);
    expect(audits).toHaveLength(1);
    expect(audits[0].slice(1, 4)).toEqual(["MANAGEMENT_APPROVE", "management_company", C]);
    expect(audits[0][4]).toEqual({ action: "approve", company: "נווה ניהול", from: "pending_approval", to: "active", note: "אומת ברשם", notified: true, email: "sent" });
    expect(audits[0][5]).toBe("1.2.3.4");
  });

  it("reject / suspend carry the reason (trimmed); reactivate carries nothing extra", async () => {
    await PATCH(req({ id: C, action: "reject", expected_status: "pending_approval", seen_details_at: SEEN, reason: `  ${REASON}  ` }));
    expect(calls[0].payload).toEqual({ action: "reject", expected_status: "pending_approval", seen_details_at: SEEN, reason: REASON, company_id: C, actor: ADMIN });
    await PATCH(req({ id: C, action: "suspend", expected_status: "active", reason: REASON }));
    expect(calls[1].payload).toEqual({ action: "suspend", expected_status: "active", reason: REASON, company_id: C, actor: ADMIN });
    await PATCH(req({ id: C, action: "reactivate", expected_status: "suspended" }));
    expect(calls[2].payload).toEqual({ action: "reactivate", expected_status: "suspended", company_id: C, actor: ADMIN });
    expect(audits.map((a) => a[1])).toEqual(["MANAGEMENT_REJECT", "MANAGEMENT_SUSPEND", "MANAGEMENT_REACTIVATE"]);
    expect(audits[0][4]).toMatchObject({ reason: REASON });
    expect(audits[2][4]).not.toHaveProperty("reason");
  });

  it("the actor is who is signed in (a superadmin stays a superadmin for bloc)", async () => {
    guardResult = { ok: true, session: { ...ADMIN, role: "superadmin" } };
    await PATCH(req({ id: C, action: "reactivate", expected_status: "suspended" }));
    expect(calls[0].payload.actor).toEqual({ id: ADMIN.id, email: "ops@bloc.co.il", role: "superadmin" });
  });

  it("no reason for the company — 400 in Hebrew, nothing sent", async () => {
    const r = await PATCH(req({ id: C, action: "reject", expected_status: "pending_approval", seen_details_at: SEEN, reason: "קצר" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("כתבו לחברה את הסיבה (10 תווים לפחות)");
    const s = await PATCH(req({ id: C, action: "suspend", expected_status: "active" }));
    expect(s.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("without the state / the details seen, or with an unknown action — 400, nothing sent", async () => {
    for (const b of [
      { id: C, action: "approve", seen_details_at: SEEN },
      { id: C, action: "approve", expected_status: "pending_approval" },
      { id: C, action: "delete", expected_status: "active" },
      { id: "c1", action: "reactivate", expected_status: "suspended" },
      { id: C, action: "reactivate", expected_status: "suspended", reason: REASON },
    ]) expect((await PATCH(req(b))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("a refusal of bloc keeps its status, code and Hebrew message — and nothing is audited", async () => {
    blocAnswer = { ok: false, status: 409, code: "DETAILS_CHANGED", error: "החברה עדכנה את פרטי הבקשה אחרי שנפתחה אצלכם. רעננו ועברו על הפרטים שוב." };
    const r = await PATCH(req({ id: C, action: "approve", expected_status: "pending_approval", seen_details_at: SEEN }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "החברה עדכנה את פרטי הבקשה אחרי שנפתחה אצלכם. רעננו ועברו על הפרטים שוב.", code: "DETAILS_CHANGED" });
    expect(audits).toHaveLength(0);
  });

  it("REG-2 review: bloc did not answer in time — the panel log says the outcome is unknown (bloc may have decided); a refusal is not logged", async () => {
    blocAnswer = { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב." };
    const r = await PATCH(req({ id: C, action: "suspend", expected_status: "active", reason: REASON, note: "חוב" }));
    expect(r.status).toBe(504);
    expect(audits).toHaveLength(1);
    expect(audits[0].slice(1, 4)).toEqual(["MANAGEMENT_DECISION_UNKNOWN", "management_company", C]);
    expect(audits[0][4]).toEqual({ action: "suspend", from: "active", outcome: "unknown", error: "TIMEOUT", reason: REASON, note: "חוב" });
    blocAnswer = { ok: false, status: 502, code: "NETWORK", error: "שגיאת רשת מול bloc" };
    await PATCH(req({ id: C, action: "reactivate", expected_status: "suspended" }));
    expect(audits).toHaveLength(2);
    blocAnswer = { ok: false, status: 409, code: "CHANGED", error: "השתנה" };
    await PATCH(req({ id: C, action: "reactivate", expected_status: "suspended" }));
    expect(audits).toHaveLength(2);
  });

  it("REGRESSION: the panel no longer calls admin_set_management_status itself, writes nothing, sends no notice of its own", async () => {
    await PATCH(req({ id: C, action: "approve", expected_status: "pending_approval", seen_details_at: SEEN }));
    expect(selects).toHaveLength(0);   // not even a read: bloc answers with the company name
    const src = readFileSync(join(process.cwd(), "src/app/api/management-companies/route.ts"), "utf8");
    expect(src).not.toMatch(/\.rpc\(\s*["']admin_set_management_status/);
    expect(src).not.toMatch(/import[^;]*\bnotifyUser\b/);
  });
});

describe("GET — what is needed to decide", () => {
  it("the request details (186 + 187), the owner and their building, canDecide by permission", async () => {
    tables = {
      management_companies: { data: [{ id: C, name: "נווה ניהול", owner_id: "o1", status: "pending_approval", created_at: SEEN }], error: null },
      profiles: { data: [{ id: "o1", full_name: "טל כהן", email: "tal@x.co", building_id: "b1" }], error: null },
      buildings: { data: [{ id: "b1", name: "השקד 104" }], error: null },
    };
    const r = await GET(getReq());
    const d = await r.json();
    const cols = selects.find((s) => s.table === "management_companies")!.cols;
    for (const c of ["office_address", "portfolio_size", "submitted_at", "reject_reason", "details_updated_at", "decided_at", "invite_code", "tax_id"]) expect(cols).toContain(c);
    expect(d.companies[0].owner).toEqual({ id: "o1", full_name: "טל כהן", email: "tal@x.co", building_id: "b1", building_name: "השקד 104" });
    expect(d).toMatchObject({ canDecide: true, canGrant: false });
    guardResult = { ok: true, session: { ...ADMIN, role: "viewer" } };
    expect(await (await GET(getReq())).json()).toMatchObject({ canDecide: false });
  });

  it("an owner without a building: no buildings query; no companies — an empty list", async () => {
    tables = {
      management_companies: { data: [{ id: C, name: "נ", owner_id: "o1", status: "active", created_at: SEEN }], error: null },
      profiles: { data: [{ id: "o1", full_name: "טל", email: null, building_id: null }], error: null },
    };
    const d = await (await GET(getReq())).json();
    expect(d.companies[0].owner.building_name).toBeNull();
    expect(selects.map((s) => s.table)).not.toContain("buildings");
    tables = { management_companies: { data: [], error: null } };
    expect(await (await GET(getReq())).json()).toEqual({ companies: [], canGrant: false, canDecide: true });
  });

  it("a failed read — 500 in Hebrew that points at SQL 187", async () => {
    tables = { management_companies: { data: null, error: { message: "column management_companies.decided_at does not exist" } } };
    const r = await GET(getReq());
    expect(r.status).toBe(500);
    expect((await r.json()).error).toContain("SQL 187");
  });

  it("?history=<id>: the bloc log (by the company) and the panel decisions, merged; a bad id — 400", async () => {
    tables = {
      audit_logs: { data: [{ id: "1", action: "mgmt_company_rejected", created_at: "2026-10-11T08:00:00+00:00", details: { via: "panel", panel_admin: "ops@bloc.co.il", reason: REASON } }], error: null },
      panel_audit_logs: { data: [{ id: "p", action: "MANAGEMENT_REJECT", created_at: "2026-10-11T08:00:01+00:00", admin_email: "ops@bloc.co.il", metadata: { reason: REASON } }], error: null },
    };
    const d = await (await GET(getReq(`?history=${C}`))).json();
    expect(d.history).toEqual([{ id: "b-1", at: "2026-10-11T08:00:00+00:00", label: "נדחתה", who: "צוות bloc", email: "ops@bloc.co.il", reason: REASON, note: null }]);
    expect(selects.find((s) => s.table === "audit_logs")!.filters).toEqual(["eq target_type management_company", `eq target_id ${C}`]);
    expect(selects.find((s) => s.table === "panel_audit_logs")!.filters).toEqual([`eq entity_id ${C}`, "like action MANAGEMENT_%"]);
    expect(selects.map((s) => s.table)).not.toContain("management_companies");
    expect((await GET(getReq("?history=abc"))).status).toBe(400);
  });

  it("history needs a session too; a failed log read — 500", async () => {
    guardResult = { ok: false, response: { status: 401 } };
    expect((await GET(getReq(`?history=${C}`))).status).toBe(401);
    guardResult = { ok: true, session: ADMIN };
    tables = { audit_logs: { data: null, error: { message: "x" } }, panel_audit_logs: { data: [], error: null } };
    expect((await GET(getReq(`?history=${C}`))).status).toBe(500);
    tables = { audit_logs: { data: [], error: null }, panel_audit_logs: { data: null, error: { message: "x" } } };
    expect((await GET(getReq(`?history=${C}`))).status).toBe(500);
  });
});
