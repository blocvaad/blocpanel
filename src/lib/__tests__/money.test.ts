import { describe, it, expect } from "vitest";
import { summarizeMoney, REVIEW_REASON, TRANSIENT_REVIEW, BILLING_REASON, reviewLine, billingRejection } from "../money";

const base = { webhookReviews: [], staleReports: 0, disputes: 0, recurringNotStopped: 0, stuckCheckouts: 0, staleExternal: 0 };

describe("summarizeMoney — review queue ordering", () => {
  it("all clear → nothing critical", () => {
    expect(summarizeMoney(base).every((t) => t.severity === "info")).toBe(true);
  });
  it("unreconciled online payments and unstopped recurring orders are critical and first", () => {
    const tiles = summarizeMoney({ ...base, webhookReviews: [{ reason: "closed_payment" }], recurringNotStopped: 2, staleReports: 9 });
    expect(tiles[0].severity).toBe("critical");
    expect(tiles[1].severity).toBe("critical");
    expect(tiles.slice(0, 2).map((t) => t.key).sort()).toEqual(["recurring_not_stopped", "webhook_review"]);
    expect(tiles[2].key).toBe("stale_reports");
  });
  it("disputes=null — the read failed (LEDGER-1b; 123 ran long ago): \"—\" with the failed-read warning, never 0", () => {
    const t = summarizeMoney({ ...base, disputes: null }).find((x) => x.key === "disputes")!;
    expect(t.severity).toBe("warning");
    expect(t.count).toBeNull();
    expect(t.hint).toBe("הקריאה נכשלה — נסו לרענן.");
    const none = summarizeMoney({ ...base, disputes: 0 }).find((x) => x.key === "disputes")!;
    expect([none.count, none.severity]).toEqual([0, "info"]);
    const some = summarizeMoney({ ...base, disputes: 2 }).find((x) => x.key === "disputes")!;
    expect([some.count, some.severity, some.hint]).toEqual([2, "warning", "ספק דיווח שהתשלום לא הגיע או הגיע בסכום שגוי."]);
  });
  it("every review reason bloc writes has a Hebrew explanation", () => {
    // PAY-0: כל מה ש-/api/payments/webhook כותב עם reason (כולל מה שנוסף ב-PAY-0) — אחרת השורה בפאנל מראה מזהה באנגלית.
    for (const r of ["closed_payment", "unknown_status", "missing_url_token", "double_payment", "amount_mismatch",
      "duplicate_reference", "not_a_charge", "ledger_write_failed", "unknown_payment", "db_error"]) {
      expect(REVIEW_REASON[r], r).toMatch(/[\u0590-\u05FF]/);
    }
  });
});

// PAY-0 (אודיט BLOC PAY C#2, C#11)
describe("summarizeMoney — PAY-0", () => {
  it("the counts from the DB win over the list (the list stops at 50)", () => {
    const tiles = summarizeMoney({ ...base, webhookReviews: [{ reason: "amount_mismatch" }], reviewTotal: 63, transientTotal: 4 });
    expect(tiles.find((t) => t.key === "webhook_review")).toMatchObject({ count: 63, severity: "critical" });
    expect(tiles.find((t) => t.key === "webhook_db_error")).toMatchObject({ count: 4, severity: "warning" });
  });
  it("a count that was not read: null and a warning that says so — not 0", () => {
    const tiles = summarizeMoney({ ...base, reviewTotal: null, transientTotal: null, billingRejected: null });
    for (const k of ["webhook_review", "webhook_db_error", "billing_rejected"]) {
      expect(tiles.find((t) => t.key === k), k).toMatchObject({ count: null, severity: "warning" });
      expect(tiles.find((t) => t.key === k)?.hint, k).toContain("הקריאה נכשלה");
    }
  });
  it("a DB hiccup (the provider retries) is not 'money waiting for a decision': its own warning tile", () => {
    const tiles = summarizeMoney({ ...base, webhookReviews: [{ reason: "db_error" }, { reason: "db_error" }] });
    expect(tiles.find((t) => t.key === "webhook_review")).toMatchObject({ count: 0, severity: "info" });
    expect(tiles.find((t) => t.key === "webhook_db_error")).toMatchObject({ count: 2, severity: "warning" });
    expect(TRANSIENT_REVIEW.has("amount_mismatch")).toBe(false);
  });
  it("a verified amount mismatch is critical", () => {
    const tiles = summarizeMoney({ ...base, webhookReviews: [{ reason: "amount_mismatch" }, { reason: "db_error" }] });
    expect(tiles[0]).toMatchObject({ key: "webhook_review", count: 1, severity: "critical" });
  });
  it("platform subscription callbacks that were not applied: a critical tile (money that may need a refund)", () => {
    const tiles = summarizeMoney({ ...base, billingRejected: 3 });
    expect(tiles[0]).toMatchObject({ key: "billing_rejected", count: 3, severity: "critical" });
    expect(summarizeMoney(base).find((t) => t.key === "billing_rejected")).toMatchObject({ count: 0, severity: "info" });
  });
});

describe("reviewLine / billingRejection", () => {
  it("amount mismatch: what was paid and what is owed, and why", () => {
    expect(reviewLine({ reason: "amount_mismatch", amount: 200, owed: 250, detail: "underpaid" })).toContain("שולם ₪200, החיוב ₪250");
    expect(reviewLine({ reason: "amount_mismatch", amount: 250, owed: 300, detail: "changed" })).toContain("השתנה");
    expect(reviewLine({ reason: "amount_mismatch", amount: 250, owed: 250, detail: "currency" })).toContain("מטבע");
  });
  it("a refund names its kind; an unknown reason shows the id as is", () => {
    expect(reviewLine({ reason: "not_a_charge", kind: "Refund" })).toContain("Refund");
    expect(reviewLine({ reason: "something_new" })).toBe("something_new");
    expect(reviewLine({ reason: "closed_payment" })).toBe(REVIEW_REASON.closed_payment);
  });
  it("bloc's JSON, an old free-text error and none", () => {
    expect(billingRejection(JSON.stringify({ reason: "amount_mismatch", amount: 99, agreed: 119 }))).toEqual({ reason: "amount_mismatch", label: BILLING_REASON.amount_mismatch, amount: 99 });
    expect(billingRejection(JSON.stringify({ reason: "brand_new" })).label).toBe("brand_new");
    expect(billingRejection("subscription_not_found")).toEqual({ reason: null, label: "subscription_not_found", amount: null });
    expect(billingRejection(null).label).toBe("נדחה");
    for (const r of Object.keys(BILLING_REASON)) expect(BILLING_REASON[r]).toMatch(/[\u0590-\u05FF]/);
  });
});
