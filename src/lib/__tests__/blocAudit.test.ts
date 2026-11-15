// PANEL-PAY א1 (bloc החלטה 366): פעולת כסף נרשמת ב-bloc בשתי שורות audit_logs עם אותו details.ref — הפאנל מציג אחת,
// הפנימית. הצורות כאן הן מה ש-bloc כותב (src/lib/panelMoney/common.splitAudit, f9c9e44): הגלויה ראשונה, הפנימית אחריה.
import { describe, it, expect } from "vitest";
import { oneEntryPerAction, auditRef, isInternalAuditRow, blocStaffEmail, blocAuditBuilding } from "../blocAudit";

type Row = { id: string; action: string; building_id?: string | null; created_at: string; details: Record<string, unknown> | null };
const B = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
const ACTOR = { id: "33333333-3333-4333-8333-333333333333", email: "tal@blocvaad.co.il", role: "superadmin" };
const snap = (plan: string) => ({ plan, comp_reason: null, plan_expires: null });

/** מסלול לבניין: הגלויה (building_id, via / ref / before → after) והפנימית (building_id null, target_building_id, panel_actor, panel_note). */
function buildingPair(ref: string, at: string): [Row, Row] {
  const facts = { before: snap("free"), after: snap("tower") };
  return [
    { id: `v-${ref}`, action: "panel_plan_grant", building_id: B, created_at: at, details: { via: "panel", ref, ...facts } },
    { id: `i-${ref}`, action: "panel_plan_grant", building_id: null, created_at: at, details: { via: "panel", ref, target_building_id: B, panel_actor: ACTOR, panel_note: "פיילוט", ...facts } },
  ];
}
/** מסלול לחברה: שתיהן building_id null — הגלויה עם company_id, הפנימית עם target_company_id. */
function companyPair(ref: string, at: string): [Row, Row] {
  const facts = { before: snap("mgmt_start"), after: snap("mgmt_start"), notified: true };
  return [
    { id: `v-${ref}`, action: "panel_company_plan_grant", building_id: null, created_at: at, details: { via: "panel", ref, company_id: C, ...facts } },
    { id: `i-${ref}`, action: "panel_company_plan_grant", building_id: null, created_at: at, details: { via: "panel", ref, target_company_id: C, panel_actor: ACTOR, panel_note: "שותף", ...facts, company: "כרמל" } },
  ];
}
/** קרדיטים ל-AI בלי הערה: בפנימית אין panel_note — panel_actor מספיק. */
function aiPair(ref: string, at: string): [Row, Row] {
  return [
    { id: `v-${ref}`, action: "panel_ai_credits_grant", building_id: B, created_at: at, details: { via: "panel", ref, units: 50, months: 12 } },
    { id: `i-${ref}`, action: "panel_ai_credits_grant", building_id: null, created_at: at, details: { via: "panel", ref, target_building_id: B, panel_actor: ACTOR, units: 50, months: 12, order_id: "o1" } },
  ];
}
const plain = (id: string, details: Record<string, unknown> | null = { via: "panel" }): Row =>
  ({ id, action: "tenant_approved", building_id: B, created_at: "2026-11-15T08:00:00Z", details });
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("oneEntryPerAction — bloc 366 pairs", () => {
  it("a building plan pair → the internal row (staff actor + note); the visible twin is dropped — either order", () => {
    const [v, i] = buildingPair("r1", "2026-11-15T08:00:00Z");
    expect(oneEntryPerAction([v, i])).toEqual([i]);
    expect(oneEntryPerAction([i, v])).toEqual([i]);              // created_at desc: the internal row (written second) comes first
  });
  it("a company pair — both rows have building_id null; the internal one is told by panel_actor / target_company_id", () => {
    const [v, i] = companyPair("r2", "2026-11-15T08:00:00Z");
    expect(oneEntryPerAction([i, v])).toEqual([i]);
  });
  it("an AI-credits pair without a note — panel_actor alone marks the internal row", () => {
    const [v, i] = aiPair("r3", "2026-11-15T08:00:00Z");
    expect(oneEntryPerAction([i, v])).toEqual([i]);
  });
  it("several actions — one entry each (each action has its own ref)", () => {
    const rows = [...buildingPair("a", "2026-11-15T09:00:00Z"), ...aiPair("b", "2026-11-15T08:00:00Z"), ...companyPair("c", "2026-11-15T07:00:00Z")];
    expect(ids(oneEntryPerAction(rows))).toEqual(["i-a", "i-b", "i-c"]);
  });
});

describe("oneEntryPerAction — singles and rows without a ref", () => {
  it("a ref without its internal twin (one write failed, or the limit cut the pair) — kept as it is", () => {
    const [v] = buildingPair("s1", "2026-11-15T08:00:00Z");
    const [, i] = aiPair("s2", "2026-11-15T08:00:00Z");
    expect(oneEntryPerAction([v])).toEqual([v]);
    expect(oneEntryPerAction([i])).toEqual([i]);
  });
  it("rows without a ref are untouched — no details, details null, no ref key, an empty or non-string ref", () => {
    const rows = [plain("n1"), plain("n2", null), plain("n3", { via: "panel", panel_actor: ACTOR }), plain("n4", { ref: "" }), plain("n5", { ref: 7 }), plain("n6", { ref: "  " })];
    const twins = [plain("n7", { via: "panel" }), plain("n8", { via: "panel" })];   // look alike, no ref — both stay
    expect(ids(oneEntryPerAction([...rows, ...twins]))).toEqual(["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"]);
  });
  it("two rows with one ref and no internal row (not what bloc writes) — both kept: nothing is hidden without its twin", () => {
    const a = plain("x1", { via: "panel", ref: "q" }), b = plain("x2", { via: "panel", ref: "q" });
    expect(ids(oneEntryPerAction([a, b]))).toEqual(["x1", "x2"]);
  });
  it("two internal rows with one ref (a repeated write) — the first stays, one entry", () => {
    const [, i] = buildingPair("d", "2026-11-15T08:00:00Z");
    const again = { ...i, id: "i-d-again" };
    expect(ids(oneEntryPerAction([i, again]))).toEqual(["i-d"]);
  });
});

describe("oneEntryPerAction — order and identity", () => {
  it("the order of the kept rows is the order given; the kept row stays where the internal row was", () => {
    const [v1, i1] = buildingPair("o1", "2026-11-15T10:00:00Z");
    const [v2] = aiPair("o2", "2026-11-15T09:00:00Z");                     // single
    const [v3, i3] = companyPair("o3", "2026-11-15T08:00:00Z");
    const rows = [plain("p1"), i1, plain("p2"), v1, v2, v3, plain("p3"), i3];
    expect(ids(oneEntryPerAction(rows))).toEqual(["p1", "i-o1", "p2", "v-o2", "p3", "i-o3"]);
  });
  it("returns the same row objects and leaves the input as it was; empty in → empty out", () => {
    const rows = [plain("p1"), ...buildingPair("o4", "2026-11-15T08:00:00Z")];
    const copy = [...rows];
    const out = oneEntryPerAction(rows);
    expect(out[0]).toBe(rows[0]);
    expect(out[1]).toBe(rows[2]);
    expect(rows).toEqual(copy);
    expect(oneEntryPerAction([])).toEqual([]);
  });
});

describe("auditRef / isInternalAuditRow", () => {
  it("the ref is a non-empty string, or null", () => {
    expect(auditRef({ details: { ref: "r" } })).toBe("r");
    expect([auditRef({ details: null }), auditRef({}), auditRef({ details: { ref: "" } }), auditRef({ details: { ref: 1 } })]).toEqual([null, null, null, null]);
  });
  it("internal = panel_actor (an object) or target_building_id / target_company_id; the visible rows are not", () => {
    const [bv, bi] = buildingPair("t", "2026-11-15T08:00:00Z");
    const [cv, ci] = companyPair("t", "2026-11-15T08:00:00Z");
    expect([isInternalAuditRow(bi), isInternalAuditRow(ci), isInternalAuditRow(bv), isInternalAuditRow(cv)]).toEqual([true, true, false, false]);
    expect(isInternalAuditRow({ details: { target_building_id: B } })).toBe(true);
    expect(isInternalAuditRow({ details: { target_company_id: C } })).toBe(true);
    expect(isInternalAuditRow({ details: { panel_actor: ACTOR } })).toBe(true);
    expect(isInternalAuditRow({ details: { panel_actor: "tal@blocvaad.co.il" } })).toBe(false);   // not the shape bloc writes
    expect(isInternalAuditRow({ details: { panel_actor: null } })).toBe(false);
    expect(isInternalAuditRow({ details: null })).toBe(false);
  });
});

describe("bloc 370 (PANEL-PAY א2): who and which building, from both generations of rows", () => {
  it("blocStaffEmail: details.panel_actor.email (new rows), else details.panel_admin (older rows), else null", () => {
    expect(blocStaffEmail({ via: "panel", panel_actor: { id: "a", email: "ops@bloc.co.il", role: "admin" } })).toBe("ops@bloc.co.il");
    expect(blocStaffEmail({ via: "panel", panel_admin: "old@bloc.co.il" })).toBe("old@bloc.co.il");
    expect(blocStaffEmail({ panel_actor: { id: "a", email: "new@bloc.co.il" }, panel_admin: "old@bloc.co.il" })).toBe("new@bloc.co.il");
    expect(blocStaffEmail({ panel_actor: { id: "a", email: "  " }, panel_admin: "old@bloc.co.il" })).toBe("old@bloc.co.il");
    expect(blocStaffEmail({ panel_actor: "ops@bloc.co.il" })).toBeNull();          // a string is not the actor object
    expect(blocStaffEmail({ panel_actor: { id: "a", email: 7 } })).toBeNull();
    expect(blocStaffEmail({ panel_admin: "  " })).toBeNull();
    expect(blocStaffEmail({ panel_admin: " ops@bloc.co.il " })).toBe("ops@bloc.co.il");
    expect(blocStaffEmail(null)).toBeNull();
    expect(blocStaffEmail(undefined)).toBeNull();
  });
  it("blocAuditBuilding: building_id (visible / older rows), else details.target_building_id (the internal row), else null", () => {
    expect(blocAuditBuilding({ building_id: "b1", details: { target_building_id: "b2" } })).toBe("b1");
    expect(blocAuditBuilding({ building_id: null, details: { target_building_id: "b2" } })).toBe("b2");
    expect(blocAuditBuilding({ details: { target_building_id: "b2" } })).toBe("b2");
    expect(blocAuditBuilding({ building_id: "", details: { target_building_id: "b2" } })).toBe("b2");
    expect(blocAuditBuilding({ building_id: null, details: { target_company_id: "c1" } })).toBeNull();
    expect(blocAuditBuilding({ building_id: null, details: { target_building_id: 5 } })).toBeNull();
    expect(blocAuditBuilding({ building_id: null, details: null })).toBeNull();
  });
});
