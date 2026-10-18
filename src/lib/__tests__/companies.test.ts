// bloc REG-2 — חברות ניהול בפאנל (lib/companies): מה מותר מכל מצב, מה נשלח ל-bloc, הסיבה, הפרטים לתצוגה,
// הזמנים (שעון ישראל), סדר התור, וההיסטוריה (בלי כפילות של החלטה שנרשמה בשני היומנים).
import { describe, it, expect } from "vitest";
import {
  ACTIONS_FROM, DECISION_COPY, actionsFor, buttonLabel, reasonIssue, reasonLength, decisionPayload, deliveredAll, deliveryOf, doneText, needsReason, offersRefresh, onSeenDetails,
  PORTFOLIO_LABEL, businessKind, validBusinessNumber, taxText, daysSince, whenText, waitingText, editedAfterSend, sortCompanies,
  companyHistory, STATUS_LABEL, type BlocAuditRow, type PanelAuditRow,
} from "../companies";

const NOW = new Date("2026-10-18T12:00:00Z"); // 15:00 בישראל
const SEEN = "2026-10-18T09:12:13.456789+00:00";

describe("what may be decided from each state (as in SQL 187)", () => {
  it("each status, and nothing for an unknown one", () => {
    expect(ACTIONS_FROM).toEqual({ pending_approval: ["approve", "reject"], active: ["suspend"], rejected: ["approve"], suspended: ["reactivate"] });
    expect(actionsFor("deleted")).toEqual([]);
    expect(actionsFor(null)).toEqual([]);
    expect(actionsFor("active")).toEqual(["suspend"]);
    expect(actionsFor("constructor")).toEqual([]);
    expect(actionsFor("toString")).toEqual([]);
  });
  it("a reason for reject and suspend; what was seen for approve and reject", () => {
    expect((["approve", "reject", "suspend", "reactivate"] as const).filter(needsReason)).toEqual(["reject", "suspend"]);
    expect((["approve", "reject", "suspend", "reactivate"] as const).filter(onSeenDetails)).toEqual(["approve", "reject"]);
  });
  it("labels: approving a rejected request is 'approve anyway'", () => {
    expect(buttonLabel("approve", "pending_approval")).toBe("אישור החברה");
    expect(buttonLabel("approve", "rejected")).toBe("אישור בכל זאת");
    expect(buttonLabel("suspend", "active")).toBe("השעיה");
    expect(STATUS_LABEL).toEqual({ pending_approval: "ממתינה לאישור", active: "פעילה", rejected: "נדחתה", suspended: "מושעית" });
    expect(DECISION_COPY.reject.tone).toBe("danger");
    expect(DECISION_COPY.approve.consequence).toContain("מייל עם קוד החברה");
  });
});

describe("the reason", () => {
  it("only where needed; counted after trimming", () => {
    expect(reasonIssue("approve", "")).toBeNull();
    expect(reasonIssue("reject", "   ")).toBe("כתבו לחברה את הסיבה.");
    expect(reasonIssue("reject", "  קצר מדי ")).toBe("עוד 3 תווים לפחות.");
    expect(reasonIssue("suspend", "א".repeat(9))).toBe("עוד תו אחד לפחות.");
    expect(reasonIssue("suspend", "א".repeat(10))).toBeNull();
    expect(reasonIssue("suspend", "א".repeat(1000))).toBeNull();
    expect(reasonIssue("suspend", "א".repeat(1001))).toBe("הסיבה ארוכה מדי (עד 1,000 תווים, יש 1,001).");
  });
  it("counted in characters like bloc and SQL: 5 emoji are 5, not 10", () => {
    expect(reasonLength(" 😀😀😀😀😀 ")).toBe(5);
    expect(reasonIssue("reject", "😀".repeat(5))).toBe("עוד 5 תווים לפחות.");
    expect(reasonIssue("reject", "😀".repeat(10))).toBeNull();
  });
});

describe("what is sent to bloc", () => {
  const c = { id: "c1", status: "pending_approval" as const, details_updated_at: SEEN };
  it("approve: the state and the details seen; a note only when written", () => {
    expect(decisionPayload(c, "approve")).toEqual({ id: "c1", action: "approve", expected_status: "pending_approval", seen_details_at: SEEN });
    expect(decisionPayload(c, "approve", { note: "  אומת ברשם  ", reason: "לא נשלח" })).toEqual({
      id: "c1", action: "approve", expected_status: "pending_approval", seen_details_at: SEEN, note: "אומת ברשם",
    });
    expect(decisionPayload({ id: "c1", status: "rejected" }, "approve")).toEqual({ id: "c1", action: "approve", expected_status: "rejected", seen_details_at: null });
  });
  it("reject: the reason trimmed and the details seen; suspend: the reason only; reactivate: the state only", () => {
    expect(decisionPayload(c, "reject", { reason: "  לא נמצא ברשם החברות  " })).toEqual({
      id: "c1", action: "reject", expected_status: "pending_approval", seen_details_at: SEEN, reason: "לא נמצא ברשם החברות",
    });
    expect(decisionPayload({ id: "c1", status: "active", details_updated_at: SEEN }, "suspend", { reason: "חוב פתוח של חודשיים" })).toEqual({
      id: "c1", action: "suspend", expected_status: "active", reason: "חוב פתוח של חודשיים",
    });
    expect(decisionPayload({ id: "c1", status: "suspended", details_updated_at: SEEN }, "reactivate", { reason: "x", note: " " })).toEqual({
      id: "c1", action: "reactivate", expected_status: "suspended",
    });
  });
  it("after a refusal: refresh offered when the screen may be stale, or when bloc may have decided (timeout, network)", () => {
    for (const c of ["CHANGED", "DETAILS_CHANGED", "INVALID_TRANSITION", "NOT_FOUND", "TIMEOUT", "NETWORK"]) expect(offersRefresh(c)).toBe(true);
    for (const c of ["OWNER_CONFLICT", "TAX_ID_TAKEN", "VALIDATION", "FORBIDDEN", "NOT_MIGRATED", "", undefined, null, "constructor"]) expect(offersRefresh(c)).toBe(false);
  });
  it("what went out is read from bloc's answer; an app notice only when bloc said it was saved", () => {
    expect(deliveryOf({ notified: true, email: "sent" })).toEqual({ notified: true, email: "sent" });
    expect(deliveryOf({ notified: true, email: "failed" })).toEqual({ notified: true, email: "failed" });
    expect(deliveryOf({ notified: false, email: "none" })).toEqual({ notified: false, email: "none" });
    expect(deliveryOf({ email: "sent" })).toEqual({ notified: false, email: "sent" });
    expect(deliveryOf({ notified: "yes", email: "maybe" })).toEqual({ notified: false, email: "none" });
    expect(deliveryOf(null)).toEqual({ notified: false, email: "none" });
  });
  it("all went out (a success) or not (a warning): the notice saved, and the email sent or no email at all", () => {
    expect(deliveredAll({ notified: true, email: "sent" })).toBe(true);
    expect(deliveredAll({ notified: true, email: "none" })).toBe(true);
    expect(deliveredAll({ notified: true, email: "failed" })).toBe(false);
    expect(deliveredAll({ notified: false, email: "sent" })).toBe(false);
    expect(deliveredAll({ notified: false, email: "none" })).toBe(false);
  });
  it("after the decision: only what really went out to the owner (bloc says)", () => {
    expect(doneText("approve", { notified: true, email: "sent" })).toBe("החברה אושרה. הבעלים קיבל הודעה באפליקציה ומייל.");
    expect(doneText("suspend", { notified: true, email: "none" })).toBe("החברה הושעתה. לבעלים אין מייל בחשבון, אז נשלחה הודעה באפליקציה בלבד.");
    expect(doneText("reject", { notified: true, email: "failed" })).toBe("הבקשה נדחתה. ההודעה באפליקציה נשלחה, אבל המייל לא (תקלה בשליחה). כדאי לעדכן את הבעלים.");
    expect(doneText("reactivate", { notified: false, email: "sent" })).toBe("ההשעיה בוטלה. המייל נשלח, אבל ההודעה באפליקציה לא נשמרה.");
    expect(doneText("approve", { notified: false, email: "failed" })).toBe("החברה אושרה. ההודעה לבעלים לא נשלחה (תקלה). כדאי לעדכן אותו ישירות.");
    expect(doneText("approve", { notified: false, email: "none" })).toBe("החברה אושרה. ההודעה לבעלים לא נשלחה (תקלה). כדאי לעדכן אותו ישירות.");
  });
});

describe("the details of the request", () => {
  it("the business number: digits, the kind (as in bloc), or invalid", () => {
    expect(validBusinessNumber("51-000000-3")).toBe(true);
    expect(validBusinessNumber("510000004")).toBe(false);
    expect(validBusinessNumber("000000000")).toBe(false);
    expect(businessKind("510000003")).toBe("company");
    expect(businessKind("520000001")).toBe("company");
    expect(validBusinessNumber("580000008")).toBe(true);   // a doubled 8 folds to 7 (16 → 1 + 6)
    expect(businessKind("580000008")).toBe("nonprofit");
    expect(businessKind("580000004")).toBe(null);
    expect(taxText(" 51-000000-3 ")).toEqual({ digits: "510000003", note: "חברה בע״מ", ok: true });
    expect(taxText("123")).toEqual({ digits: "123", note: "מספר לא תקין", ok: false });
    expect(taxText(null)).toBeNull();
    expect(taxText("---")).toBeNull();
  });
  it("the portfolio sizes of REG-1", () => {
    expect(Object.keys(PORTFOLIO_LABEL)).toEqual(["0", "1-10", "11-50", "51-200", "200+"]);
    expect(PORTFOLIO_LABEL["200+"]).toBe("מעל 200 בניינים");
  });
});

describe("times (Israel)", () => {
  it("days by the Israeli calendar, not by 24 hours", () => {
    expect(daysSince("2026-10-17T21:30:00Z", NOW)).toBe(0);   // 00:30 בישראל, אותו יום
    expect(daysSince("2026-10-17T20:30:00Z", NOW)).toBe(1);   // 23:30 בישראל, אתמול
    expect(daysSince("2026-10-15T10:00:00Z", NOW)).toBe(3);
    expect(daysSince("bad", NOW)).toBeNull();
    expect(daysSince(null, NOW)).toBeNull();
  });
  it("when: today / yesterday with the hour, otherwise the date", () => {
    expect(whenText("2026-10-18T06:05:00Z", NOW)).toBe("היום, 09:05");
    expect(whenText("2026-10-17T06:05:00Z", NOW)).toBe("אתמול, 09:05");
    expect(whenText("2026-10-12T06:05:00Z", NOW)).toBe("12/10/2026");
    expect(whenText(undefined, NOW)).toBeNull();
  });
  it("how long a request waits", () => {
    expect(waitingText("2026-10-18T06:00:00Z", NOW)).toBe("נשלחה היום");
    expect(waitingText("2026-10-17T06:00:00Z", NOW)).toBe("ממתינה מאתמול");
    expect(waitingText("2026-10-14T06:00:00Z", NOW)).toBe("ממתינה 4 ימים");
  });
  it("edited after it was sent: more than a minute later", () => {
    expect(editedAfterSend({ submitted_at: "2026-10-18T06:00:00Z", details_updated_at: "2026-10-18T06:00:59Z" })).toBe(false);
    expect(editedAfterSend({ submitted_at: "2026-10-18T06:00:00Z", details_updated_at: "2026-10-18T06:01:01Z" })).toBe(true);
    expect(editedAfterSend({ submitted_at: null, created_at: "2026-10-01T06:00:00Z", details_updated_at: "2026-10-18T06:00:00Z" })).toBe(true);
    expect(editedAfterSend({ submitted_at: "2026-10-18T06:00:00Z", details_updated_at: null })).toBe(false);
  });
});

describe("the order", () => {
  it("pending first, the oldest first (a queue); then the latest decision first", () => {
    const list = [
      { id: "a", status: "active", created_at: "2026-01-01T00:00:00Z", decided_at: "2026-10-10T00:00:00Z" },
      { id: "p2", status: "pending_approval", created_at: "2026-09-01T00:00:00Z", submitted_at: "2026-10-17T00:00:00Z" },
      { id: "r", status: "rejected", created_at: "2026-02-01T00:00:00Z", decided_at: "2026-10-12T00:00:00Z" },
      { id: "p1", status: "pending_approval", created_at: "2026-10-15T00:00:00Z", submitted_at: null },
      { id: "old", status: "suspended", created_at: "2026-03-01T00:00:00Z", decided_at: null },
    ];
    expect(sortCompanies(list).map((c) => c.id)).toEqual(["p1", "p2", "r", "a", "old"]);
  });
});

describe("the history", () => {
  const bloc: BlocAuditRow[] = [
    { id: "1", action: "mgmt_company_registered", created_at: "2026-10-10T08:00:00.123456+00:00", details: { name: "נווה" } },
    { id: "2", action: "mgmt_company_rejected", created_at: "2026-10-11T08:00:00.000001+00:00", details: { via: "panel", panel_admin: "ops@bloc.co.il", reason: "לא נמצא ברשם", panel_note: "בדקתי ברשם" } },
    { id: "3", action: "mgmt_company_resubmitted", created_at: "2026-10-12T08:00:00+00:00", details: null },
    { id: "4", action: "payment_created", created_at: "2026-10-12T09:00:00+00:00", details: null },
  ];
  const panel: PanelAuditRow[] = [
    // the same rejection, in the panel log (since REG-2 both log it) — shown once
    { id: "p1", action: "MANAGEMENT_REJECT", created_at: "2026-10-11T08:00:02.500+00:00", admin_email: "ops@bloc.co.il", metadata: { reason: "לא נמצא ברשם" } },
    // an old decision (before REG-2) — only in the panel log
    { id: "p2", action: "MANAGEMENT_SUSPEND", created_at: "2026-09-01T08:00:00+00:00", admin_email: "a@bloc.co.il", metadata: { reason: "חוב" } },
    { id: "p3", action: "MANAGEMENT_PLAN_GRANTED", created_at: "2026-09-02T08:00:00+00:00", admin_email: null, metadata: { reason: "פיילוט" } },
    { id: "p4", action: "LOGIN", created_at: "2026-09-03T08:00:00+00:00", admin_email: null, metadata: null },
  ];
  it("both logs, newest first; a decision logged twice — once; who did it; the reason for the company and the internal note apart", () => {
    const h = companyHistory(bloc, panel);
    expect(h.map((x) => x.id)).toEqual(["b-3", "b-2", "b-1", "p-p3", "p-p2"]);
    expect(h[1]).toEqual({ id: "b-2", at: bloc[1].created_at, label: "נדחתה", who: "צוות bloc", email: "ops@bloc.co.il", reason: "לא נמצא ברשם", note: "בדקתי ברשם" });
    expect(h[0]).toMatchObject({ label: "הבקשה הוגשה מחדש", who: "הבעלים", email: null, reason: null, note: null });
    expect(h[3]).toMatchObject({ label: "הוענק מסלול ללא תשלום", who: "צוות bloc", email: null, reason: null, note: "פיילוט" });
    expect(h[4]).toMatchObject({ label: "הושעתה", who: "צוות bloc", email: "a@bloc.co.il", reason: "חוב" });
  });
  it("an owner event never shows a note (notes are the bloc team's)", () => {
    const owner: BlocAuditRow = { id: "o", action: "mgmt_company_request_updated", created_at: "2026-10-12T08:00:00+00:00", details: { panel_note: "x", via: "app" } };
    expect(companyHistory([owner], [])[0]).toMatchObject({ who: "הבעלים", email: null, note: null });
  });
  it("a panel decision more than 10 minutes from the bloc one is a separate event; the list is capped", () => {
    const late: PanelAuditRow = { ...panel[0], id: "p9", created_at: "2026-10-11T08:11:00+00:00" };
    expect(companyHistory(bloc, [late]).map((x) => x.id)).toContain("p-p9");
    const many: BlocAuditRow[] = Array.from({ length: 50 }, (_, i) => ({ id: String(i), action: "mgmt_company_request_updated", created_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), details: null }));
    expect(companyHistory(many, [])).toHaveLength(30);
  });
});
