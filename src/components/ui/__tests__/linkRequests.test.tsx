// bloc COMPANY-1 (D5, החלטות 650, 654) — המסכים בפאנל, מרונדרים לשרת (renderToStaticMarkup; בפאנל אין happy-dom) עם הצורה
// ש-/api/management-companies/links מחזיר:
//   • הרשימה: ממתינה — אישור / דחייה (רק למי שרשאי להחליט); viewer — בלי כפתורים; נדחתה — עם הסיבה; בניין חדש — מסומן;
//     כשל — הודעה עם "נסו שוב" (לא "אין בקשות"); אין בקשות ואין כשל — כלום.
//   • חלון ההחלטה: דחייה — הכפתור סגור עד שיש סיבה; אישור — פתוח, ואומר מה יקרה (בניין קיים / חדש).
//   • ההתראות בלוח הבקרה: חברות שממתינות ובקשות לבניינים בלי ועד — שורה לכל אחד, עם קישור למקום.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never) }));
import { LinkRequestsView, DecisionModal } from "../LinkRequestsPanel";
import AlertsPanel from "../AlertsPanel";
import type { LinkRequest } from "@/lib/companyLinks";

const html = (el: unknown) => renderToStaticMarkup(el as never);
const noop = () => {};
const pending: LinkRequest = {
  id: "l1", status: "pending", created_at: "2026-11-20T08:00:00Z", decided_at: null,
  company: { id: "c1", name: "נווה ניהול" }, building: { id: "b1", name: "השקד 4", address: "השקד 4, רחובות", invite_code: "B-AB12CD" },
  new_building: null, signer_name: "דנה כהן", signer_role: "מנכ״לית", declaration_version: "company-link-2026-11-24", requester: "יוסי לוי", decline_reason: null,
};
const declinedNew: LinkRequest = {
  ...pending, id: "l2", status: "declined", decided_at: "2026-11-21T08:00:00Z", building: null,
  new_building: { name: "הרימון 7", address: "הרימון 7", city: "חולון", units: 12 }, decline_reason: "לא הצלחנו לאמת שהחברה מוסמכת",
};
const view = (p: Partial<Parameters<typeof LinkRequestsView>[0]> = {}) =>
  html(createElement(LinkRequestsView, { links: [pending, declinedNew], canDecide: true, error: "", done: "", onRetry: noop, onDecide: noop, ...p }));

describe("the list", () => {
  it("a pending request: the company, the building with its code, who signed and in what role, who sent it, and the two buttons", () => {
    const s = view();
    expect(s).toContain('id="links"');
    expect(s).toContain('data-link-requests="1"');
    expect(s).toContain("1 ממתינות");
    expect(s).toContain("נווה ניהול");
    expect(s).toContain("B-AB12CD");
    expect(s).toContain("ההצהרה: דנה כהן, מנכ״לית · נשלחה ע״י יוסי לוי");
    // מי שחתם/ה הוא/היא גם מי ששלח/ה — בלי לחזור על השם
    expect(view({ links: [{ ...pending, requester: "דנה כהן" }] })).toContain("ההצהרה: דנה כהן, מנכ״לית · ");
    expect(view({ links: [{ ...pending, requester: "דנה כהן" }] })).not.toContain("נשלחה ע״י");
    expect(s).toContain('data-link-approve="l1"');
    expect(s).toContain('data-link-decline="l1"');
  });
  it("a declined new building: marked new, its city and apartments, the reason; no buttons on a decided row", () => {
    const s = view();
    expect(s).toContain("הרימון 7 · בניין חדש");
    expect(s).toContain("הרימון 7, חולון · 12 דירות");
    expect(s).toContain("הסיבה: לא הצלחנו לאמת שהחברה מוסמכת");
    expect(s).not.toContain('data-link-approve="l2"');
  });
  it("a viewer sees the rows (the server already hid the signer and the code) and no buttons", () => {
    const s = view({ canDecide: false, links: [{ ...pending, signer_name: null, requester: null, building: { ...pending.building!, invite_code: null } }] });
    expect(s).toContain("ההצהרה: מנכ״לית");
    expect(s).not.toContain("B-AB12CD");
    expect(s).not.toContain("data-link-approve");
  });
  it("a failed load: the error with a retry — not an empty list; nothing and no error: nothing at all", () => {
    const s = view({ links: [], error: "הבקשות לא נטענו מ-bloc. נסו שוב." });
    expect(s).toContain('role="alert"');
    expect(s).toContain("הבקשות לא נטענו מ-bloc");
    expect(s).toContain("נסו שוב");
    expect(view({ links: [] })).toBe("");
  });
  it("after a decision — the line in words", () => {
    expect(view({ done: "אושר. הבניין נכנס לתיק של החברה, והחברה והדיירים קיבלו הודעה." })).toContain('role="status"');
  });
});

describe("the decision window", () => {
  it("decline: a reason for the company is required — the button starts closed; an internal note too (not sent)", () => {
    const s = html(createElement(DecisionModal, { d: { r: pending, action: "decline" }, onClose: noop, onDone: noop }));
    expect(s).toContain('data-link-decision="decline"');
    expect(s).toContain("הסיבה לחברה (נשלחת בהודעה)");
    expect(s).toContain("תיעוד פנימי: מה נבדק (לא נשלח לחברה)");
    expect(s).toMatch(/<button[^>]*disabled=""[^>]*data-link-submit="decline"/);
  });
  it("approve: open; says what happens — an existing building joins the company and the tenants hear; a new one opens", () => {
    const a = html(createElement(DecisionModal, { d: { r: pending, action: "approve" }, onClose: noop, onDone: noop }));
    expect(a).not.toMatch(/<button[^>]*disabled=""[^>]*data-link-submit="approve"/);
    expect(a).toContain("הבניין ייכנס לתיק של החברה, והדיירים יקבלו הודעה");
    expect(a).toContain("עד שיהיה בו ועד, החברה מאשרת את הדיירים שמצטרפים");
    const n = html(createElement(DecisionModal, { d: { r: declinedNew, action: "approve" }, onClose: noop, onDone: noop }));
    expect(n).toContain("הבניין ייפתח ב-bloc עם קוד הצטרפות");
  });
});

describe("the alerts on the dashboard (654)", () => {
  it("companies waiting and link requests — a row each, to the right place", () => {
    const s = html(createElement(AlertsPanel, { stats: { pending_approvals: 0, open_tickets: 0 },
      extra: { pendingReports: 0, supplierQueue: 0, declined30: 0, companiesPending: 2, linkRequests: 1 } }));
    expect(s).toContain("חברות ניהול ממתינות לאישור");
    expect(s).toContain('href="/management-companies"');
    expect(s).toContain("בקשות לנהל בניין בלי ועד");
    expect(s).toContain('href="/management-companies#links"');
    expect(s).not.toContain("הכל תקין");
  });
  it("not loaded (null) — said, never 'all fine'", () => {
    const s = html(createElement(AlertsPanel, { stats: { pending_approvals: 0, open_tickets: 0 },
      extra: { pendingReports: 0, supplierQueue: 0, declined30: 0, companiesPending: null, linkRequests: null } }));
    expect(s).not.toContain("הכל תקין");
    expect(s).toContain("חברות ניהול ממתינות לאישור · בקשות לנהל בניין בלי ועד");
  });
});
