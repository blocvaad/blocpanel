// bloc REG-2 — הכרטיס והחלון של חברת ניהול בפאנל (מרונדר לשרת, בלי דפדפן):
//   • מה שצריך כדי להחליט: מספר העסק וסוגו (או "לא תקין"), כתובת המשרד, היקף התיק, הבעלים והבניין שלו, מתי
//     נשלחה, ושהבקשה עודכנה אחרי שנשלחה.
//   • רק ההחלטות שאפשר מהמצב, ורק למי שרשאי; הסיבה של ההחלטה האחרונה (גם של השעיה מאז REG-2).
//   • החלון: מה יקרה, שדה סיבה רק בדחייה ובהשעיה, תיעוד פנימי, ואזהרה כשהבקשה עודכנה.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CompanyCard, { CompanyFacts, HistoryList, cardWhen } from "../CompanyCard";
import CompanyDecisionModal, { patchCompany } from "../CompanyDecisionModal";
import type { Company } from "@/lib/companies";

const NOW = new Date("2026-10-18T12:00:00Z");
const base = (o: Partial<Company> = {}): Company => ({
  id: "c1", name: "נווה ניהול", invite_code: "MC-NEVE01", phone: "03-1234567", email: "office@neve.co.il", description: "חברה ותיקה\nבמרכז",
  tax_id: "510000003", coverage_areas: ["רמת גן", "גבעתיים"], status: "pending_approval", created_at: "2026-10-15T08:00:00Z", owner_id: "o1",
  office_address: "ויצמן 120, כפר סבא", portfolio_size: "11-50", submitted_at: "2026-10-15T08:00:00Z", reject_reason: null,
  details_updated_at: "2026-10-15T08:00:00Z", decided_at: null,
  owner: { id: "o1", full_name: "טל כהן", email: "tal@x.co", building_id: "b1", building_name: "השקד 104" },
  billing: null, ...o,
});
const card = (c: Company, canDecide = true) =>
  renderToStaticMarkup(createElement(CompanyCard, { c, canGrant: false, canDecide, onAction: () => {}, onDecide: () => {}, defaultOpen: true }));
const actions = (html: string) => [...html.matchAll(/data-company-action="([a-z]+)"/g)].map((m) => m[1]);

describe("the facts for the decision", () => {
  it("number and kind, phone, email, office, portfolio, owner and building, the code, when sent", () => {
    const html = renderToStaticMarkup(createElement(CompanyFacts, { c: base() }));
    expect(html).toContain("510000003");
    expect(html).toContain("חברה בע״מ");
    expect(html).toContain('href="tel:03-1234567"');
    expect(html).toContain("ויצמן 120, כפר סבא");
    expect(html).toContain("11-50 בניינים");
    expect(html).toContain("טל כהן");
    expect(html).toContain("גר/ה בהשקד 104");
    expect(html).toContain("MC-NEVE01");
    expect(html).not.toContain("data-fact-edited");
    expect(html).not.toContain('data-fact="decided"');
  });
  it("an old request: an invalid number said so; nothing given — said so; no owner building", () => {
    const html = renderToStaticMarkup(createElement(CompanyFacts, { c: base({ tax_id: "123", office_address: null, portfolio_size: null, email: null, owner: { id: "o1", full_name: null, email: null, building_id: null } }) }));
    expect(html).toContain("מספר לא תקין");
    expect(html.match(/לא נמסר/g)?.length).toBe(3);   // email, office, portfolio
    expect(html).toContain("בלי בניין ב-bloc");
    expect(html).toContain("ללא שם");
  });
  it("edited after it was sent, and the last decision", () => {
    const html = renderToStaticMarkup(createElement(CompanyFacts, { c: base({ details_updated_at: "2026-10-16T10:00:00Z", decided_at: "2026-10-17T10:00:00Z" }) }));
    expect(html).toContain("data-fact-edited");
    expect(html).toContain('data-fact="decided"');
  });
});

describe("the card", () => {
  it("pending: approve and reject; waiting time in the header; the edited flag and warning", () => {
    const html = card(base({ details_updated_at: "2026-10-16T10:00:00Z" }));
    expect(actions(html)).toEqual(["approve", "reject"]);
    expect(html).toContain("אישור החברה");
    expect(html).toContain("עודכנה אחרי השליחה");
    expect(html).toContain("הבעלים עדכן את הבקשה אחרי שנשלחה");
    expect(html).toContain('data-company-status="pending_approval"');
    expect(html).toContain("ערים (2)");
  });
  it("each state offers what SQL 187 allows; a viewer gets no buttons", () => {
    expect(actions(card(base({ status: "active" })))).toEqual(["suspend"]);
    expect(actions(card(base({ status: "suspended", decided_at: "2026-10-17T10:00:00Z", reject_reason: "חוב" })))).toEqual(["reactivate"]);
    const rejected = card(base({ status: "rejected", reject_reason: "לא נמצא ברשם" }));
    expect(actions(rejected)).toEqual(["approve"]);
    expect(rejected).toContain("אישור בכל זאת");
    expect(actions(card(base(), false))).toEqual([]);
    expect(card(base(), false)).not.toContain("data-company-actions");
  });
  it("the reason given to the company: rejected; suspended since REG-2 only (an old one may be a stale rejection)", () => {
    expect(card(base({ status: "rejected", reject_reason: "לא נמצא ברשם" }))).toContain("לא נמצא ברשם");
    expect(card(base({ status: "suspended", reject_reason: "חוב פתוח", decided_at: "2026-10-17T10:00:00Z" }))).toContain("data-company-reason");
    expect(card(base({ status: "suspended", reject_reason: "סיבה ישנה של דחייה", decided_at: null }))).not.toContain("data-company-reason");
    expect(card(base({ status: "active", reject_reason: "x" }))).not.toContain("data-company-reason");
  });
  it("the header time: waiting in the queue, decided, or opened (before REG-2)", () => {
    expect(cardWhen(base(), NOW)).toBe("ממתינה 3 ימים");
    expect(cardWhen(base({ created_at: "2026-09-01T08:00:00Z", submitted_at: "2026-10-17T08:00:00Z" }), NOW)).toBe("ממתינה מאתמול");   // sent again: the queue counts from then
    expect(cardWhen(base({ status: "active", decided_at: "2026-10-18T06:00:00Z" }), NOW)).toBe("פעילה מאז היום, 09:00");   // approved or reactivated
    expect(cardWhen(base({ status: "rejected", decided_at: "2026-10-17T06:00:00Z" }), NOW)).toBe("נדחתה אתמול, 09:00");
    expect(cardWhen(base({ status: "suspended", decided_at: null, created_at: "2026-01-02T08:00:00Z" }), NOW)).toBe("נפתחה 02/01/2026");
  });
  it("no middle-dot chains in what the card says", () => {
    expect(card(base({ status: "active" }))).not.toContain("·");
  });
});

describe("the history", () => {
  it("who, when, the reason for the company and the internal note — apart", () => {
    const html = renderToStaticMarkup(createElement(HistoryList, { items: [
      { id: "b-1", at: "2026-10-11T08:00:00Z", label: "נדחתה", who: "צוות bloc", email: "ops@bloc.co.il", reason: "לא נמצא ברשם", note: "בדקתי ברשם" },
      { id: "b-2", at: "2026-10-10T08:00:00Z", label: "הבקשה נשלחה", who: "הבעלים", email: null, reason: null, note: null },
    ] }));
    expect(html).toContain("הסיבה לחברה: לא נמצא ברשם");
    expect(html).toMatch(/>צוות bloc<\/span><bdi[^>]*>ops@bloc\.co\.il<\/bdi>/);   // the address isolated (RTL text, LTR address)
    expect(html.match(/<bdi/g)?.length).toBe(1);   // the owner's own events — no address
    expect(html).toContain("תיעוד: בדקתי ברשם");
    expect(html.match(/data-history-item=/g)?.length).toBe(2);
    expect(renderToStaticMarkup(createElement(HistoryList, { items: [] }))).toContain("אין עדיין רישום.");
  });
});

describe("the decision window", () => {
  const modal = (action: "approve" | "reject" | "suspend" | "reactivate", c: Company = base()) =>
    renderToStaticMarkup(createElement(CompanyDecisionModal, { company: c, action, onClose: () => {}, onDone: () => {}, onStale: () => {} }));
  it("reject / suspend ask for a reason for the company; approve / reactivate do not; every one has an internal note", () => {
    expect(modal("reject")).toContain("data-decision-reason");
    expect(modal("suspend")).toContain("data-decision-reason");
    expect(modal("approve")).not.toContain("data-decision-reason");
    expect(modal("reactivate")).not.toContain("data-decision-reason");
    for (const a of ["approve", "reject", "suspend", "reactivate"] as const) {
      const html = modal(a, base({ status: a === "suspend" ? "active" : a === "reactivate" ? "suspended" : "pending_approval" }));
      expect(html).toContain("data-decision-note");
      expect(html).toContain(`data-decision-submit="${a}"`);
    }
  });
  it("what will happen is said; the submit waits for a reason", () => {
    const html = modal("reject");
    expect(html).toContain("הבעלים יראה את הסיבה");
    expect(html).toMatch(/data-decision-submit="reject"[^>]*disabled=""|disabled=""[^>]*data-decision-submit="reject"/);
    expect(modal("approve")).not.toMatch(/data-decision-submit="approve"[^>]*disabled=""|disabled=""[^>]*data-decision-submit="approve"/);
  });
  it("approving a request edited after it was sent — a warning to look again", () => {
    expect(modal("approve", base({ details_updated_at: "2026-10-16T10:00:00Z" }))).toContain("הבעלים עדכן את הבקשה אחרי שנשלחה");
    expect(modal("approve")).not.toContain("הבעלים עדכן את הבקשה");
  });
});

describe("the request from the window", () => {
  it("bloc's refusal as is; no proper answer (502–504) — unknown, like a timeout; no connection — NETWORK; success — bloc's answer", async () => {
    const orig = globalThis.fetch;
    const answer = (body: string, status: number) => { globalThis.fetch = (async () => new Response(body, { status })) as unknown as typeof fetch; };
    try {
      answer(JSON.stringify({ error: "המצב של החברה השתנה בינתיים.", code: "CHANGED" }), 409);
      expect(await patchCompany({})).toEqual({ ok: false, error: "המצב של החברה השתנה בינתיים.", code: "CHANGED" });
      answer("<html>Gateway Timeout</html>", 504);
      expect(await patchCompany({})).toEqual({ ok: false, error: "לא התקבלה תשובה. ייתכן שההחלטה נשמרה — רעננו לפני שמנסים שוב.", code: "TIMEOUT" });
      answer("<html>Bad Gateway</html>", 502);
      expect(await patchCompany({})).toMatchObject({ ok: false, code: "TIMEOUT" });
      answer("oops", 500);
      expect(await patchCompany({})).toEqual({ ok: false, error: "ההחלטה נכשלה. נסו שוב.", code: undefined });
      globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
      expect(await patchCompany({})).toEqual({ ok: false, error: "אין חיבור לשרת. בדקו את החיבור, רעננו ונסו שוב.", code: "NETWORK" });
      answer(JSON.stringify({ ok: true, notified: true, email: "sent" }), 200);
      expect(await patchCompany({})).toEqual({ ok: true, data: { ok: true, notified: true, email: "sent" } });
    } finally { globalThis.fetch = orig; }
  });
  it("wiring: the page's message after a decision is a warning when not everything went out", () => {
    const src = readFileSync(join(process.cwd(), "src/app/(panel)/management-companies/page.tsx"), "utf8");
    expect(src).toContain("setDone({ text: doneText(d.action, d), warn: !deliveredAll(d) })");
    expect(src).toContain('<Banner tone={done.warn ? "warn" : "ok"}>{done.text}</Banner>');
  });
  it("wiring: after a refusal the window offers the refresh exactly when offersRefresh says (the click is not rendered here)", () => {
    const src = readFileSync(join(process.cwd(), "src/components/ui/CompanyDecisionModal.tsx"), "utf8");
    expect(src).toContain("setError({ text: r.error, stale: offersRefresh(r.code) })");
    expect(src).toMatch(/action=\{error\.stale \? <button[^>]*onClick=\{onStale\}/);
  });
});
