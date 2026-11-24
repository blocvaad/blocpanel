// bloc COMPANY-1 (D5, החלטות 650, 654) — הבקשות של חברות לנהל בניין בלי ועד: השורה של הבניין, הסדר, הטקסט אחרי החלטה;
// המונה שליד "חברות ניהול" בתפריט; הקישור מהפעמון לבקשה.
import { describe, it, expect } from "vitest";
import { LINK_STATUS_LABEL, linkBuildingLine, linkDoneText, sortLinks, type LinkRequest } from "../companyLinks";
import { NAV_GROUPS, badgeCount } from "../nav";
import { notificationLink } from "../committee";

const row = (over: Partial<LinkRequest> = {}): LinkRequest => ({
  id: "l1", status: "pending", created_at: "2026-11-20T08:00:00Z", decided_at: null,
  company: { id: "c1", name: "נווה ניהול" }, building: null, new_building: null,
  signer_name: "דנה כהן", signer_role: "מנכ״לית", declaration_version: "company-link-2026-11-24", requester: "דנה כהן", decline_reason: null,
  ...over,
});

describe("the building line", () => {
  it("an existing building: its name and address", () => {
    expect(linkBuildingLine(row({ building: { id: "b1", name: "השקד 4", address: "השקד 4, רחובות", invite_code: "B-AB12CD" } })))
      .toEqual({ title: "השקד 4", detail: "השקד 4, רחובות", isNew: false });
  });
  it("a new building: name, address and city, the apartments when given", () => {
    expect(linkBuildingLine(row({ new_building: { name: "הרימון 7", address: "הרימון 7", city: "חולון", units: 24 } })))
      .toEqual({ title: "הרימון 7", detail: "הרימון 7, חולון · 24 דירות", isNew: true });
    expect(linkBuildingLine(row({ new_building: { name: " ", address: "הרימון 7", city: "", units: 0 } })))
      .toEqual({ title: "בניין חדש", detail: "הרימון 7", isNew: true });
    expect(linkBuildingLine(row()).isNew).toBe(true);
  });
});

describe("order and words", () => {
  it("pending first (oldest first), then decided (newest first)", () => {
    const out = sortLinks([
      row({ id: "d-old", status: "declined", decided_at: "2026-11-10T08:00:00Z" }),
      row({ id: "p-new", created_at: "2026-11-22T08:00:00Z" }),
      row({ id: "a-new", status: "approved", decided_at: "2026-11-21T08:00:00Z" }),
      row({ id: "p-old", created_at: "2026-11-18T08:00:00Z" }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["p-old", "p-new", "a-new", "d-old"]);
  });
  it("statuses and the line after a decision", () => {
    expect(LINK_STATUS_LABEL).toMatchObject({ pending: "ממתינה", approved: "אושרה", declined: "נדחתה", cancelled: "בוטלה ע״י החברה" });
    expect(linkDoneText("decline", null)).toContain("עם הסיבה");
    expect(linkDoneText("approve", { created: true })).toContain("נפתח ב-bloc");
    expect(linkDoneText("approve", { created: false })).toContain("והדיירים קיבלו הודעה");
  });
});

describe("the menu badge (654)", () => {
  it("companies + link requests; unknown (both null) — no number, never 0; no badge key — nothing", () => {
    expect(badgeCount("companies", { companies: 2, links: 3 })).toBe(5);
    expect(badgeCount("companies", { companies: null, links: 1 })).toBe(1);
    expect(badgeCount("companies", { companies: null, links: null })).toBeNull();
    expect(badgeCount("companies", null)).toBeNull();
    expect(badgeCount(undefined, { companies: 4, links: 0 })).toBeNull();
  });
  it("only the management companies item carries it", () => {
    const withBadge = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.badge);
    expect(withBadge.map((i) => [i.href, i.badge])).toEqual([["/management-companies", "companies"]]);
  });
});

describe("the bell links (654)", () => {
  it("a company registration → the companies queue; a link request → the requests on that screen", () => {
    const n = (entity_type: string) => ({ type: "x", entity_type, entity_id: "e1" });
    expect(notificationLink(n("management_company") as never)).toBe("/management-companies");
    expect(notificationLink(n("management_link") as never)).toBe("/management-companies#links");
  });
});
