import { describe, it, expect } from "vitest";
import { summarizeMoney, REVIEW_REASON } from "../money";

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
  it("disputes=null (123 not applied) is not an alert and says why", () => {
    const t = summarizeMoney({ ...base, disputes: null }).find((x) => x.key === "disputes")!;
    expect(t.severity).toBe("info");
    expect(t.count).toBe(0);
    expect(t.hint).toContain("123");
  });
  it("every review reason bloc writes has a Hebrew explanation", () => {
    for (const r of ["closed_payment", "unknown_status", "missing_url_token"]) expect(REVIEW_REASON[r]).toBeTruthy();
  });
});
