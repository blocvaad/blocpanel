import { describe, it, expect } from "vitest";
import { PAYMENT_STATUS, PAYMENT_FILTERS, paymentStatusLabel, paymentStatusBadge } from "../paymentStatus";

// מראה של bloc 122 (payments_status_check). 'failed' לא קיים — דחיית סליקה היא failed_at.
const DB_STATUSES = ["pending", "pending_approval", "external_pending", "paid", "exempt", "cancelled", "credited", "refunded", "provider_refunded"];

describe("paymentStatus — mirrors bloc 122 lifecycle", () => {
  it("has a label for every status the DB allows", () => {
    for (const s of DB_STATUSES) expect(PAYMENT_STATUS[s]?.label, s).toBeTruthy();
  });
  it("does not invent a 'failed' status", () => {
    expect(PAYMENT_STATUS.failed).toBeUndefined();
  });
  it("only pending + pending_approval count as debt (external is the company's)", () => {
    const debt = Object.entries(PAYMENT_STATUS).filter(([, v]) => v.debt).map(([k]) => k).sort();
    expect(debt).toEqual(["pending", "pending_approval"]);
  });
  it("unknown status falls back to the raw value, null to pending", () => {
    expect(paymentStatusLabel("weird")).toBe("weird");
    expect(paymentStatusLabel(null)).toBe(PAYMENT_STATUS.pending.label);
    expect(paymentStatusBadge("weird")).toBe("badge-muted");
  });
  it("every filter chip points at a real status (or all)", () => {
    for (const f of PAYMENT_FILTERS) expect(f.status === "" || DB_STATUSES.includes(f.status), f.label).toBe(true);
  });
});
