import { describe, it, expect } from "vitest";
import { buildingEntitlementView, companyLifecycle, companySummary, type BuildingBillingFacts, type CompanyBillingFacts } from "../entitlementView";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const DAY = 86_400_000;
const iso = (d: number) => new Date(NOW + d * DAY).toISOString();
const b = (o: Partial<BuildingBillingFacts>): BuildingBillingFacts => ({
  plan: null, plan_expires: null, subscription_status: null, comp_reason: null,
  company_name: null, company_state: null, company_access_until: null, live_subscription_status: null, ...o,
});

describe("buildingEntitlementView — what the building gets and who pays", () => {
  it("free building", () => {
    expect(buildingEntitlementView(b({}), NOW).source).toBe("free");
  });
  it("company active → Pro via company, company pays", () => {
    const v = buildingEntitlementView(b({ company_state: "active", company_name: "יהואלה נכסים" }), NOW);
    expect(v.source).toBe("company");
    expect(v.effectivePlan).toBe("tower");
    expect(v.payer).toBe("יהואלה נכסים");
  });
  it("company grace → still Pro, yellow", () => {
    const v = buildingEntitlementView(b({ company_state: "grace", company_name: "X", company_access_until: iso(3) }), NOW);
    expect(v.source).toBe("company_grace");
    expect(v.tone).toBe("yellow");
  });
  it("exit grace → nobody pays, capabilities kept until date", () => {
    const v = buildingEntitlementView(b({ company_state: "exit_grace", company_access_until: iso(10) }), NOW);
    expect(v.source).toBe("exit_grace");
    expect(v.note).toBeTruthy();
  });
  it("own paid plan", () => {
    const v = buildingEntitlementView(b({ plan: "tower", plan_expires: iso(20), subscription_status: "active", live_subscription_status: "active" }), NOW);
    expect(v.source).toBe("paid");
    expect(v.payer).toBe("הבניין");
  });
  it("own plan without payer and future expiry → trial", () => {
    expect(buildingEntitlementView(b({ plan: "tower", plan_expires: iso(5) }), NOW).source).toBe("trial");
  });
  it("comp_reason or no expiry → comp (bloc pays)", () => {
    expect(buildingEntitlementView(b({ plan: "tower", plan_expires: iso(5), comp_reason: "פיילוט" }), NOW).source).toBe("comp");
    expect(buildingEntitlementView(b({ plan: "tower" }), NOW).source).toBe("comp");
  });
  it("expired < 7 days → grace; ≥ 7 → dormant (read-only)", () => {
    expect(buildingEntitlementView(b({ plan: "tower", plan_expires: iso(-3) }), NOW).source).toBe("grace");
    const d = buildingEntitlementView(b({ plan: "tower", plan_expires: iso(-8) }), NOW);
    expect(d.source).toBe("dormant");
    expect(d.effectivePlan).toBe("free");
  });
  it("managed_unpaid keeps own plan but explains the company", () => {
    const v = buildingEntitlementView(b({ plan: "tower", plan_expires: iso(20), subscription_status: "active", company_state: "managed_unpaid", company_name: "X" }), NOW);
    expect(v.source).toBe("paid");
    expect(v.note).toBeTruthy();
  });
});

const c = (o: Partial<CompanyBillingFacts>): CompanyBillingFacts => ({
  plan: null, plan_expires: null, comp_reason: null, trial_ends_at: null, grant_state: null, grant_basis: null,
  access_until: null, active_buildings: 0, pending_buildings: 0, live_subscription_status: null, live_amount: null, ...o,
});

describe("companyLifecycle", () => {
  it.each([
    [c({}), "free"],
    [c({ plan: "mgmt_free" }), "free"],
    [c({ plan: "mgmt_start", grant_state: "none" }), "free"],
    [c({ plan: "mgmt_start", grant_state: "active", grant_basis: "comp" }), "comp"],
    [c({ plan: "mgmt_start", grant_state: "active", grant_basis: "trial" }), "trial"],
    [c({ plan: "mgmt_start", grant_state: "active", grant_basis: "paid" }), "active"],
    [c({ plan: "mgmt_start", grant_state: "grace", grant_basis: "paid" }), "grace"],
    [c({ plan: "mgmt_start", grant_state: "lapsed", grant_basis: "paid" }), "lapsed"],
  ])("%# → %s", (facts, expected) => {
    expect(companyLifecycle(facts)).toBe(expected);
  });
  it("summary mentions the comp reason", () => {
    expect(companySummary(c({ plan: "mgmt_growth", grant_state: "active", grant_basis: "comp", comp_reason: "שותפות" }))).toContain("שותפות");
  });
});
