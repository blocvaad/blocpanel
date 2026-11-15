// PAY-1b — לוגיקת שער G14 (טהורה): תצוגה, חסימת הדלקה, פתיחה מחדש, ולידציה של הראיה.
import { describe, it, expect } from "vitest";
import {
  providersView, switchAction, turnOnBlocked, turnOffLine, canReopenGate, validateGateEvidence, gateFromDb, isMissing225, isGatedProvider,
} from "../collectionProviders";

const CLOSED = { gate_closed_at: "2026-11-14T09:00:00Z", gate_closed_by: "tal@bloc.co.il", gate_evidence: "אושר במייל מהספק" };
const NONE = { gate_closed_at: null, gate_closed_by: null, gate_evidence: null };
const view = (rows: any[], g?: boolean) => Object.fromEntries(providersView(rows, null, g).map((r) => [r.id, r]));

describe("providersView gate", () => {
  it("gate only for payplus / cardcom / grow; management has none", () => {
    const v = view([{ provider: "cardcom", offered: false, ...NONE }]);
    expect(["payplus", "cardcom", "grow"].every((id) => v[id].gate.required)).toBe(true);
    expect(v.management.gate.required).toBe(false);
    expect(isGatedProvider("management")).toBe(false);
  });
  it("closed = all three set; a partial row counts as open", () => {
    const v = view([{ provider: "cardcom", ...CLOSED }, { provider: "grow", ...CLOSED, gate_evidence: null }, { provider: "payplus", ...NONE }]);
    expect(v.cardcom.gate).toMatchObject({ closed: true, closedBy: "tal@bloc.co.il", evidence: "אושר במייל מהספק" });
    expect(v.grow.gate.closed).toBe(false);
    expect(v.grow.gate.evidence).toBeNull();
    expect(v.payplus.gate.closed).toBe(false);
  });
  it("columns missing (SQL 225 not run): unsupported, nothing required, nothing blocked — as before", () => {
    const v = view([{ provider: "payplus", offered: true }, { provider: "cardcom", offered: false }]);
    expect(v.cardcom.gate).toMatchObject({ supported: false, required: false, closed: false });
    expect(turnOnBlocked(v.cardcom)).toBe(false);
    expect(switchAction(v.cardcom, true, false)).toBe("turn_on");
    expect(view([], false).cardcom.gate.supported).toBe(false);
    expect(view([], true).cardcom.gate.required).toBe(true);
  });
});

describe("switch and reopen rules", () => {
  const v = view([{ provider: "cardcom", offered: false, ...NONE }, { provider: "grow", offered: false, ...CLOSED }, { provider: "payplus", offered: true, ...NONE }, { provider: "management", offered: false, ...NONE }]);
  it("OFF→ON blocked while the gate is open; allowed when closed; management plain", () => {
    expect(turnOnBlocked(v.cardcom)).toBe(true);
    expect(switchAction(v.cardcom, true, false)).toBe("none");
    expect(switchAction(v.grow, true, false)).toBe("turn_on");
    expect(switchAction(v.management, true, false)).toBe("turn_on");
  });
  it("OFF is always allowed, even with an open gate (PayPlus ON without a record)", () => {
    expect(turnOnBlocked(v.payplus)).toBe(false);
    expect(switchAction(v.payplus, true, false)).toBe("confirm");
  });
  it("reopen only: gate closed, provider OFF, superadmin", () => {
    expect(canReopenGate(v.grow, true)).toBe(true);
    expect(canReopenGate(v.grow, false)).toBe(false);
    expect(canReopenGate({ ...v.grow, offered: true }, true)).toBe(false);
    expect(canReopenGate(v.cardcom, true)).toBe(false);
    expect(canReopenGate(v.management, true)).toBe(false);
  });
});

describe("evidence + errors", () => {
  it("10 chars after trim, up to 1000", () => {
    expect(validateGateEvidence("123456789").ok).toBe(false);
    expect(validateGateEvidence("   123456789   ").ok).toBe(false);
    expect(validateGateEvidence("  1234567890  ")).toEqual({ ok: true, value: "1234567890" });
    expect(validateGateEvidence("x".repeat(1000)).ok).toBe(true);
    expect(validateGateEvidence("x".repeat(1001)).ok).toBe(false);
  });
  it("gateFromDb on a bad value is open, not a crash", () => {
    expect(gateFromDb("grow", { gate_closed_at: 5 } as any, true).closed).toBe(false);
    expect(gateFromDb("grow", undefined, true).closed).toBe(false);
  });
  it("isMissing225 knows the column errors, not others", () => {
    expect(isMissing225({ code: "42703" })).toBe(true);
    expect(isMissing225({ code: "PGRST204" })).toBe(true);
    expect(isMissing225({ message: "column gate_evidence does not exist" })).toBe(true);
    expect(isMissing225({ code: "57014", message: "timeout" })).toBe(false);
    expect(isMissing225(null)).toBe(false);
  });
});

describe("turnOffLine — a gated provider with no record says it cannot come back on (review P3)", () => {
  it("open gate: the extra sentence; closed gate and management: none", () => {
    const v = view([{ provider: "payplus", offered: true, ...NONE }, { provider: "grow", offered: true, ...CLOSED }, { provider: "management", offered: true }], true);
    const pp = turnOffLine({ ...v.payplus, buildings: 3 });
    expect(pp).toContain("אחרי הכיבוי אפשר יהיה להדליק את PayPlus שוב רק אחרי שתתעדו את סגירת שער G14.");
    expect(turnOffLine({ ...v.grow, buildings: 0 })).not.toContain("שער G14");
    expect(turnOffLine({ ...v.management, buildings: 0 })).not.toContain("שער G14");
  });
});
