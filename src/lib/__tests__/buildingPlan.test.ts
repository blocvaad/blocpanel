// PANEL-PAY א1 (החלטה 363): "מסלול בלי חיוב" של בניין — מה הכרטיס מציג, מי העניק (מיומן הפאנל), הגופים שנשלחים,
// והמעברים אחרי פעולה. טהור.
import { describe, it, expect } from "vitest";
import {
  planCardMode, canGrantIn, canEnd, modeLine, isGrantedPlan, hasPlanField, checkReason, grantBody, endBody,
  planEvents, grantOrigin, afterPlanAction, planFactsFrom, PLAN_MOVED_TEXT, UNCHANGED_TEXT, GRANTABLE_PLANS,
  datedKind, datedLine, datedGrantWarning, longDate, escapeCloses, DATED_TAG, REFRESH_CODES,
  type AuditRow, type BuildingPlanInfo, type PlanFacts,
} from "../buildingPlan";

const FREE: BuildingPlanInfo = { plan: "free", compReason: null, planExpires: null };
const GRANTED: BuildingPlanInfo = { plan: "tower", compReason: "בניין בדיקות", planExpires: null };
const BARE: BuildingPlanInfo = { plan: "large", compReason: null, planExpires: null };
const facts = (o: Partial<{ payingStatus: string | null; companyState: string | null; companyName: string | null; subscriptionStatus: string | null }> = {}): PlanFacts =>
  ({ state: "ok", payingStatus: null, companyState: null, companyName: null, ...o });

describe("planCardMode", () => {
  it("free → none (grant); plan + reason → granted (end); plan without reason → undocumented (document first — bloc ends only a documented grant)", () => {
    expect(planCardMode(FREE, facts())).toBe("none");
    expect(planCardMode({ ...FREE, plan: null }, facts())).toBe("none");
    expect(planCardMode(GRANTED, facts())).toBe("granted");
    expect(planCardMode(BARE, facts())).toBe("undocumented");
    expect(planCardMode({ ...GRANTED, compReason: "   " }, facts())).toBe("undocumented");
    expect([canGrantIn("none"), canEnd("none", FREE)]).toEqual([true, false]);
    expect([canGrantIn("granted"), canEnd("granted", GRANTED)]).toEqual([false, true]);
    expect([canGrantIn("undocumented"), canEnd("undocumented", BARE)]).toEqual([true, false]);
  });
  it("a paying subscription (PAYING_STATUSES) wins over everything — read-only", () => {
    for (const st of ["trialing", "active", "past_due", "cancel_pending"]) {
      expect(planCardMode(GRANTED, facts({ payingStatus: st }))).toBe("paying");
      expect(planCardMode(FREE, facts({ payingStatus: st }))).toBe("paying");
    }
    expect(planCardMode(FREE, facts({ payingStatus: "cancelled" }))).toBe("none");
    expect([canGrantIn("paying"), canEnd("paying", GRANTED)]).toEqual([false, false]);   // bloc: 409 paying_subscription
  });
  it("covered by its company (active / grace) → company, read-only; exit_grace / managed_unpaid are not coverage", () => {
    expect(planCardMode(FREE, facts({ companyState: "active", companyName: "נווה ניהול" }))).toBe("company");
    expect(planCardMode(FREE, facts({ companyState: "grace" }))).toBe("company");
    expect(planCardMode(FREE, facts({ companyState: "exit_grace" }))).toBe("none");
    expect(planCardMode(FREE, facts({ companyState: "managed_unpaid" }))).toBe("none");
    expect([canGrantIn("company"), canEnd("company", FREE)]).toEqual([false, false]);
    // review #3: an existing grant is shown and can be ended while the company covers the building (bloc's end has no coverage rule)
    expect(planCardMode(GRANTED, facts({ companyState: "active", companyName: "נווה ניהול" }))).toBe("company");
    expect(canEnd("company", GRANTED)).toBe(true);
    expect(modeLine("company", GRANTED, facts({ companyState: "active", companyName: "נווה ניהול" }))).toContain("אפשר לסיים אותה");
  });
  it("facts that failed to load: by the stored plan only (bloc checks again before any change)", () => {
    expect(planCardMode(FREE, { state: "error" })).toBe("none");
    expect(planCardMode(GRANTED, { state: "error" })).toBe("granted");
  });
  it("the lines say why, in Hebrew (status label, company name)", () => {
    expect(modeLine("paying", FREE, facts({ payingStatus: "active" }))).toContain("מנוי משלם (פעיל)");
    expect(modeLine("company", FREE, facts({ companyState: "active", companyName: "נווה ניהול" }))).toContain("נווה ניהול");
    expect(modeLine("undocumented", BARE, facts())).toContain("Plus");
    expect(modeLine("granted", GRANTED, facts())).toBe("");
    expect(isGrantedPlan(GRANTED)).toBe(true);
  });
});

describe("request bodies", () => {
  it("hasPlanField catches every plan column in an edit / create body", () => {
    expect(hasPlanField({ plan: "free" })).toBe(true);
    expect(hasPlanField({ comp_reason: "x" })).toBe(true);
    expect(hasPlanField({ plan_expires: null })).toBe(true);
    expect(hasPlanField({ name: "x" })).toBe(false);
    expect(hasPlanField(null)).toBe(false);
    expect(PLAN_MOVED_TEXT).toContain("מסלול בלי חיוב");
  });
  it("checkReason: 3–300 after trim", () => {
    expect(checkReason("  פיילוט ")).toEqual({ ok: true, value: "פיילוט" });
    expect(checkReason(" ab ").ok).toBe(false);
    expect(checkReason("x".repeat(301)).ok).toBe(false);
  });
  it("grant / end bodies carry the plan the screen showed (expected_plan), never a building id", () => {
    expect(grantBody("tower", "  פיילוט ", "free")).toEqual({ action: "grant", plan: "tower", comp_reason: "פיילוט", expected_plan: "free" });
    expect(grantBody("tower", "פיילוט", null)).toEqual({ action: "grant", plan: "tower", comp_reason: "פיילוט" });
    expect(endBody("tower")).toEqual({ action: "end_grant", expected_plan: "tower" });
    expect(GRANTABLE_PLANS.map((p) => p.value)).toEqual(["building", "large", "tower", "company"]);
  });
});

describe("who granted — from the panel log", () => {
  const row = (action: string, metadata: Record<string, unknown>, at: string, who = "tal@bloc.co.il"): AuditRow => ({ action, admin_email: who, created_at: at, metadata });
  it("the latest grant of the current plan, from this card or from the old edit / create forms", () => {
    const rows = [
      row("BUILDING_PLAN_GRANTED", { plan: "tower", comp_reason: "בניין בדיקות" }, "2026-11-15T09:00:00Z"),
      row("UPDATE_BUILDING", { changes: { name: "x" } }, "2026-11-10T09:00:00Z"),
      row("UPDATE_BUILDING", { changes: { plan: "large", comp_reason: "פיילוט" } }, "2026-10-01T09:00:00Z", "ops@bloc.co.il"),
    ];
    const ev = planEvents(rows);
    expect(ev.map((e) => e.kind)).toEqual(["granted", "legacy"]);    // a name edit is not a plan event
    expect(grantOrigin(ev, GRANTED)).toEqual({ who: "tal@bloc.co.il", at: "2026-11-15T09:00:00Z" });
    expect(grantOrigin(planEvents(rows.slice(2)), BARE)).toEqual({ who: "ops@bloc.co.il", at: "2026-10-01T09:00:00Z" });
    expect(grantOrigin(planEvents([row("CREATE_BUILDING", { plan: "large", comp_reason: "שותף" }, "2026-09-01T00:00:00Z")]), BARE).who).toBe("tal@bloc.co.il");
  });
  it("a newer end, or a newer different plan, means the current one's origin is not in the log → unknown", () => {
    const ended = planEvents([row("BUILDING_PLAN_GRANT_ENDED", {}, "2026-11-15T09:00:00Z"), row("BUILDING_PLAN_GRANTED", { plan: "tower" }, "2026-11-01T09:00:00Z")]);
    expect(grantOrigin(ended, GRANTED)).toEqual({ who: null, at: null });
    const other = planEvents([row("BUILDING_PLAN_GRANTED", { plan: "large" }, "2026-11-15T09:00:00Z"), row("BUILDING_PLAN_GRANTED", { plan: "tower" }, "2026-11-01T09:00:00Z")]);
    expect(grantOrigin(other, GRANTED)).toEqual({ who: null, at: null });
    expect(grantOrigin([], GRANTED)).toEqual({ who: null, at: null });
    expect(grantOrigin(planEvents([row("BUILDING_PLAN_GRANTED", { plan: "tower" }, "2026-11-01T09:00:00Z")]), FREE)).toEqual({ who: null, at: null });
  });
});

describe("afterPlanAction", () => {
  const ok = (building: unknown, extra: Record<string, unknown> = {}) => ({ ok: true, status: 200, j: { building: building as any, ...extra } });
  it("grant ok: the row from bloc becomes the card's plan; the reason field clears", () => {
    const o = afterPlanAction(ok({ plan: "tower", comp_reason: "פיילוט", plan_expires: null }), "grant", FREE, "tower");
    expect(o.info).toEqual({ plan: "tower", compReason: "פיילוט", planExpires: null });
    expect(o.msg).toEqual({ ok: true, text: "מסלול Pro הוענק לבניין, בלי חיוב." });
    expect(o.clearReason).toBe(true);
  });
  it("end ok: back to 'no plan'; a missing row still shows the end", () => {
    expect(afterPlanAction(ok(null), "end_grant", GRANTED).info).toEqual({ plan: "free", compReason: null, planExpires: null });
    expect(afterPlanAction(ok(null), "end_grant", GRANTED).msg.text).toContain("ללא מסלול");
  });
  it("unchanged: says nothing changed", () => {
    expect(afterPlanAction(ok({ plan: "tower", comp_reason: "בניין בדיקות", plan_expires: null }, { unchanged: true }), "grant", GRANTED, "tower").msg.text).toBe(UNCHANGED_TEXT);
  });
  it("failure keeps the card as it was, with the server's sentence; 'changed' closes the confirmation (refresh first)", () => {
    const o = afterPlanAction({ ok: false, status: 409, j: { error: "המסלול השתנה", code: "changed" } }, "end_grant", GRANTED);
    expect(o.info).toBe(GRANTED);
    expect(o.msg).toEqual({ ok: false, text: "המסלול השתנה", code: "changed" });
    expect(o.closeConfirm).toBe(true);
    expect(afterPlanAction(null, "grant", FREE).msg.text).toContain("אין חיבור לשרת");
  });
});

describe("planFactsFrom", () => {
  it("a failed read is 'error' (never 'no subscription'); a row → the facts", () => {
    expect(planFactsFrom({ data: null, error: { message: "x" } })).toEqual({ state: "error" });
    expect(planFactsFrom({ data: [{ live_subscription_status: "active", company_state: null, company_name: null, subscription_status: "active" }], error: null }))
      .toEqual({ state: "ok", payingStatus: "active", companyState: null, companyName: null, subscriptionStatus: "active" });
    expect(planFactsFrom({ data: [], error: null })).toEqual({ state: "ok", payingStatus: null, companyState: null, companyName: null, subscriptionStatus: null });
  });
  it("review #7: an answer that is not a list (no error) is a failed read — never 'no subscription, no company'", () => {
    for (const data of [null, undefined, {}, { live_subscription_status: "active" }, "x", 0]) {
      expect(planFactsFrom({ data, error: null }), JSON.stringify(data)).toEqual({ state: "error" });
    }
  });
});

// ── review #1: a plan with an end date (trial, handover, grace, dormant, cancelled-but-paid) ──
describe("dated plans (plan ≠ free, no reason, a plan_expires)", () => {
  const T0 = Date.parse("2026-11-15T10:00:00Z");
  const DAY = 86_400_000;
  const dated = (days: number, plan = "tower"): BuildingPlanInfo => ({ plan, compReason: null, planExpires: new Date(T0 + days * DAY).toISOString() });
  it("the mode is 'dated' — not 'undocumented' — and there is no 'document' action (only an explicit grant)", () => {
    expect(planCardMode(dated(12), facts({ subscriptionStatus: "trial" }))).toBe("dated");
    expect(planCardMode(dated(-30), facts({ subscriptionStatus: "trial" }))).toBe("dated");
    expect(planCardMode(dated(12), { state: "error" })).toBe("dated");
    expect(planCardMode(BARE, facts())).toBe("undocumented");            // no end date → a permanent plan, documenting is right
    expect(canGrantIn("dated")).toBe(true);                              // the explicit grant
    expect(canEnd("dated", dated(12))).toBe(false);                      // nothing to end — it is not a grant
    expect(isGrantedPlan(dated(12))).toBe(false);
  });
  it("what it is, from the facts the page loads: trial / paid / cancelled-but-paid / past due / handover / grace / dormant", () => {
    expect(datedKind(dated(12), facts({ subscriptionStatus: "trial" }), T0)).toBe("trial");
    expect(datedKind(dated(20), facts({ subscriptionStatus: "active" }), T0)).toBe("paid");
    expect(datedKind(dated(20), facts({ subscriptionStatus: "canceled" }), T0)).toBe("canceled");
    expect(datedKind(dated(20), facts({ subscriptionStatus: "past_due" }), T0)).toBe("past_due");
    expect(datedKind(dated(5), facts({ subscriptionStatus: "succession" }), T0)).toBe("handover");
    expect(datedKind(dated(-1), facts({ subscriptionStatus: "succession" }), T0)).toBe("dormant");   // handover: no grace, like bloc
    expect(datedKind(dated(-3), facts({ subscriptionStatus: "trial" }), T0)).toBe("grace");
    expect(datedKind(dated(-6.9), facts({ subscriptionStatus: "canceled" }), T0)).toBe("grace");
    expect(datedKind(dated(-7), facts({ subscriptionStatus: "trial" }), T0)).toBe("dormant");
    expect(datedKind(dated(-40), facts({ subscriptionStatus: "active" }), T0)).toBe("dormant");
  });
  it("the page does not know → unknown (a neutral 'plan with an end date')", () => {
    expect(datedKind(dated(12), { state: "error" }, T0)).toBe("unknown");
    expect(datedKind(dated(-40), { state: "error" }, T0)).toBe("unknown");      // not "dormant" — the page does not know
    expect(datedKind(dated(12), facts({ subscriptionStatus: null }), T0)).toBe("unknown");
    expect(datedKind(dated(12), facts({ subscriptionStatus: "refunded" }), T0)).toBe("unknown");
    expect(datedKind({ plan: "tower", compReason: null, planExpires: "not a date" }, facts({ subscriptionStatus: "trial" }), T0)).toBe("unknown");
    expect(DATED_TAG.unknown.text).toBe("עם תאריך סיום");
    expect(datedLine("unknown", dated(12), T0)).toContain("מסלול עם תאריך סיום");
  });
  it("the date in words, in Israel time", () => {
    expect(longDate("2026-12-14T22:30:00Z")).toBe("15 בדצמבר 2026");      // after midnight in Israel
    expect(longDate("2026-12-14T10:00:00Z", 7)).toBe("21 בדצמבר 2026");
    expect(longDate(null)).toBe("");
    expect(longDate("x")).toBe("");
  });
  it("still Israel time when the server clock is UTC (Vercel)", () => {
    const prev = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      expect(longDate("2026-12-14T22:30:00Z")).toBe("15 בדצמבר 2026");
    } finally {
      if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
    }
  });
  it("each line says what it is and until when", () => {
    const d = longDate(dated(12).planExpires);
    expect(datedLine("trial", dated(12), T0)).toBe(`ניסיון של Pro — 12 ימים לסיום, עד ${d}. אם לא ישולם עד אז, הבניין יוצא מהמסלול.`);
    expect(datedLine("trial", dated(0.5), T0)).toContain("יום אחד לסיום");
    expect(datedLine("canceled", dated(12), T0)).toContain(`המנוי בוטל — Pro שולם עד ${d}`);
    expect(datedLine("handover", dated(12), T0)).toContain("לוועד החדש יש עד");
    expect(datedLine("grace", dated(-3), T0)).toContain("ימי חסד עד");
    expect(datedLine("dormant", dated(-40), T0)).toContain("רדום (קריאה בלבד)");
    expect(modeLine("dated", dated(12), facts({ subscriptionStatus: "trial" }), T0)).toBe(datedLine("trial", dated(12), T0));
  });
  it("granting one says the end date is removed and the building stays on the plan without an end date", () => {
    const w = datedGrantWarning(dated(12));
    expect(w).toContain("ההענקה מוחקת את תאריך הסיום");
    expect(w).toContain(longDate(dated(12).planExpires));
    expect(w).toContain("בלי תאריך סיום ובלי חיוב");
  });
  it("the paying line names the plan and its date", () => {
    expect(modeLine("paying", dated(20, "large"), facts({ payingStatus: "active" }), T0)).toContain(`על Plus, בתוקף עד ${longDate(dated(20).planExpires)}`);
  });
});

describe("review #7: an unchanged re-send is not 'who granted'", () => {
  const row = (action: string, metadata: Record<string, unknown>, at: string, who: string): AuditRow => ({ action, admin_email: who, created_at: at, metadata });
  it("grantOrigin skips events marked unchanged; the real grant is found", () => {
    const ev = planEvents([
      row("BUILDING_PLAN_GRANTED", { plan: "tower", comp_reason: "בניין בדיקות", unchanged: true }, "2026-11-16T09:00:00Z", "ops@bloc.co.il"),
      row("BUILDING_PLAN_GRANTED", { plan: "tower", comp_reason: "בניין בדיקות" }, "2026-11-15T09:00:00Z", "tal@bloc.co.il"),
    ]);
    expect(ev[0].unchanged).toBe(true);
    expect(ev[1].unchanged).toBeUndefined();
    expect(grantOrigin(ev, GRANTED)).toEqual({ who: "tal@bloc.co.il", at: "2026-11-15T09:00:00Z" });
    expect(grantOrigin(ev.slice(0, 1), GRANTED)).toEqual({ who: null, at: null });
  });
});

describe("refresh codes and Escape", () => {
  it("changed / bad_shape / timeout / network close the confirmation and offer a refresh; a refusal does not", () => {
    for (const code of ["changed", "bad_shape", "TIMEOUT", "NETWORK"]) {
      expect(REFRESH_CODES.has(code)).toBe(true);
      expect(afterPlanAction({ ok: false, status: 502, j: { error: "x", code } }, "end_grant", GRANTED).closeConfirm).toBe(true);
    }
    expect(afterPlanAction({ ok: false, status: 409, j: { error: "x", code: "paying_subscription" } }, "end_grant", GRANTED).closeConfirm).toBe(false);
  });
  it("Escape closes the end confirmation, but not in the middle of sending", () => {
    expect(escapeCloses("Escape", false)).toBe(true);
    expect(escapeCloses("Escape", true)).toBe(false);
    expect(escapeCloses("Enter", false)).toBe(false);
  });
});

