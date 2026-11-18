// א3-1 (bloc, החלטה 444): המצבים של לוח הבקרה כשמשהו לא נטען מ-bloc — כשל, ריק וטעינה הם שלושה מצבים שונים.
//   • ההתראות: מונה שלא נטען (null) — לא 0, ואז גם לא "הכל תקין"; כלום לא נטען — "ההתראות לא נטענו".
//   • הגבייה: לא נטענה — "—" ו"לא נטענה", לא ₪0 ולא "אין נתוני גבייה".
//   • האנליטיקה: גרף של חלק שלא נטען — "לא נטען מ-bloc" (לא "אין נתונים"); ייצוא כבוי עם הסיבה.
//   • המסך החי: מונה null — "—"; חלק שנכשל — שורה שאומרת את זה; הסבב נכשל — "העדכון נכשל", בלי השורה.
//   • viewer: ערך שהוסתר בשרת מוצג כמו שהוא (בלי tel: / mailto: ובלי "מספר לא תקין"); תעודה שקיימת — "צורפה", לא "לא צורפה".
// מרונדר לשרת (renderToStaticMarkup; בפאנל אין happy-dom). recharts מוחלף ברכיב ריק — הבדיקה על מה שסביב הגרף.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("recharts", () => {
  const C = (p: { children?: unknown }) => createElement("i", null, (p?.children ?? null) as never);
  return { BarChart: C, Bar: C, XAxis: C, YAxis: C, Tooltip: C, ResponsiveContainer: C, CartesianGrid: C, PieChart: C, Pie: C, Cell: C,
    LineChart: C, Line: C, Legend: C, AreaChart: C, Area: C, RadialBarChart: C, RadialBar: C };
});
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => createElement("a", null, children as never) }));

import AlertsPanel, { ALERTS_FAILED_TEXT, ALERTS_MISSING_PREFIX } from "../AlertsPanel";
import RevenueChart, { REVENUE_FAILED_TEXT } from "../../charts/RevenueChart";
import AnalyticsCharts, { CHART_MISSING_TEXT } from "../../charts/AnalyticsCharts";
import AnalyticsExportBtn from "../AnalyticsExportBtn";
import { LiveDashboardView, LIVE_PARTIAL_TEXT } from "../LiveDashboard";
import { CompanyFacts } from "../CompanyCard";
import { SupplierVerifyCardView, LICENSE_HIDDEN_TEXT, type Supplier } from "../SupplierVerifyCard";
import { MASKED_NOTE } from "@/lib/mask";
import type { Company } from "@/lib/companies";

const html = (el: unknown) => renderToStaticMarkup(el as never);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("the alerts", () => {
  it("all known and zero → all fine; a known count > 0 → its row", () => {
    expect(html(createElement(AlertsPanel, { stats: { pending_approvals: 0, open_tickets: 0 }, extra: { pendingReports: 0, supplierQueue: 0, declined30: 0 } }))).toContain("הכל תקין");
    const s = html(createElement(AlertsPanel, { stats: { pending_approvals: 2, open_tickets: 0 }, extra: { pendingReports: 0, supplierQueue: 0, declined30: 0 } }));
    expect(s).toContain("דיירים ממתינים לאישור");
    expect(s).not.toContain(ALERTS_MISSING_PREFIX);
  });
  it("nothing loaded → said; never 'all fine'", () => {
    const s = html(createElement(AlertsPanel, { stats: null, extra: { pendingReports: null, supplierQueue: null, declined30: null } }));
    expect(s).toContain(ALERTS_FAILED_TEXT);
    expect(s).not.toContain("הכל תקין");
    expect(s).not.toContain(ALERTS_MISSING_PREFIX);
  });
  it("some did not load and the rest are zero → which did not load, and no 'all fine'", () => {
    const s = html(createElement(AlertsPanel, { stats: null, extra: { pendingReports: 0, supplierQueue: 0, declined30: null } }));
    expect(s).not.toContain("הכל תקין");
    expect(s).toContain(`${ALERTS_MISSING_PREFIX} דיירים ממתינים לאישור · סליקות שנדחו (30 יום) · תקלות פתוחות`);
  });
  it("some did not load and one is > 0 → the row and the line", () => {
    const s = html(createElement(AlertsPanel, { stats: { pending_approvals: 0, open_tickets: 4 }, extra: { pendingReports: null, supplierQueue: 0, declined30: 0 } }));
    expect(s).toContain("4 פריטים");
    expect(s).toContain(`${ALERTS_MISSING_PREFIX} דיווחי תשלום ממתינים לוועד`);
  });
  it("an older caller with no extra: the extra counts are 0 (known), not missing", () => {
    expect(html(createElement(AlertsPanel, { stats: { pending_approvals: 0, open_tickets: 0 } }))).toContain("הכל תקין");
  });
});

describe("the collection chart", () => {
  it("failed → — and 'not loaded' (not ₪0, not 'no data'); empty → 'no data'", () => {
    const f = html(createElement(RevenueChart, { data: [], failed: true }));
    expect(f).toContain(REVENUE_FAILED_TEXT);
    expect(f).not.toContain("₪0");
    expect(f).not.toContain("אין נתוני גבייה");
    const e = html(createElement(RevenueChart, { data: [] }));
    expect(e).toContain("אין נתוני גבייה");
    expect(e).toContain("₪0");
    expect(html(createElement(RevenueChart, { data: [{ month: "נוב׳ 26", amount: 1500 }] }))).toContain("₪1,500");
  });
});

const props = {
  buildingStats: [{ name: "השקד 104", tenant_count: 5, open_tickets: 2, pending_count: 1 }],
  paymentCounts: { paid: 3, pending: 1 }, ticketByUrgency: { high: 1 }, ticketByStatus: { open: 1 },
  growthByMonth: { "נוב׳ 26": 2 }, revenueByMonth: { "נוב׳ 26": 50 }, tenantStatus: { approved: 1 }, planCounts: { building: 1 },
  collectionRate: 75, totalRevenue: 220, totalDebt: 50,
};

describe("the analytics charts", () => {
  it("nothing missing → no 'not loaded'", () => {
    expect(html(createElement(AnalyticsCharts, props))).not.toContain(CHART_MISSING_TEXT);
  });
  it("payments missing → the gauge, the balance and the payments pie say it (3); no ₪ amounts of the balance", () => {
    const s = html(createElement(AnalyticsCharts, { ...props, missing: ["payments"] }));
    expect(count(s, /data-chart-missing/g)).toBe(3);
    expect(s).not.toContain("₪220");
    expect(s).not.toContain("75%");
  });
  it("each part → its own charts: revenue 1, tickets 2, growth 1, tenants 1, buildings 1, topBuildings 1", () => {
    for (const [part, n] of [["revenue", 1], ["tickets", 2], ["growth", 1], ["tenants", 1], ["buildings", 1], ["topBuildings", 1]] as const) {
      const s = html(createElement(AnalyticsCharts, { ...props, missing: [part] }));
      expect([part, count(s, /data-chart-missing/g)]).toEqual([part, n]);
    }
  });
});

describe("the export", () => {
  it("a reason → a disabled button with the reason; none → the button", () => {
    const base = { totalRevenue: 1, totalDebt: 0, collectionRate: 100, active: 1, suspended: 0, archived: 0, approvedTenants: 1, pendingTenants: 0, revenueByMonth: {}, buildingStats: [] };
    const off = html(createElement(AnalyticsExportBtn, { ...base, disabledReason: "הייצוא כבוי" }));
    expect(off).toMatch(/<button[^>]*disabled/);
    expect(off).toContain("הייצוא כבוי");
    expect(html(createElement(AnalyticsExportBtn, base))).not.toMatch(/<button[^>]*disabled/);
  });
});

describe("the live screen", () => {
  const view = (o: Partial<Parameters<typeof LiveDashboardView>[0]>) => html(createElement(LiveDashboardView, {
    stats: { pending_approvals: 1, open_tickets: 2, pending_reports: 3, supplier_queue: 0 }, events: [], lastOk: "2026-11-18T08:30:00.000Z",
    failed: false, partial: false, onRefresh: () => {}, ...o,
  }));
  it("a counter that did not load → —; a part failed → the line", () => {
    const s = view({ stats: { pending_approvals: null, open_tickets: null, pending_reports: 3, supplier_queue: 0 }, partial: true });
    expect(count(s, />—</g)).toBe(2);
    expect(s).toContain(LIVE_PARTIAL_TEXT);
  });
  it("all fine → no line; the poll failed → 'the update failed' and no partial line (the old counters stay)", () => {
    expect(view({})).not.toContain(LIVE_PARTIAL_TEXT);
    const f = view({ failed: true, partial: true });
    expect(f).toContain("העדכון נכשל");
    expect(f).not.toContain(LIVE_PARTIAL_TEXT);
  });
});

describe("a viewer's cards (the values were hidden by the server)", () => {
  const company = {
    id: "c1", name: "נווה ניהול", invite_code: null, phone: "•••4567", email: "o•••@neve.co.il", description: null, tax_id: "•••003",
    coverage_areas: [], status: "pending_approval", created_at: "2026-10-15T08:00:00Z", owner_id: "o1", office_address: "ויצמן 120, כפר סבא",
    portfolio_size: "11-50", submitted_at: "2026-10-15T08:00:00Z", reject_reason: null, details_updated_at: "2026-10-15T08:00:00Z", decided_at: null,
    owner: { id: "o1", full_name: "טל כהן", email: "t•••@x.co", building_id: "b1", building_name: "השקד 104" }, billing: null,
  } as unknown as Company;
  it("company: the hidden values as they are — no tel: / mailto: links, no check-digit verdict on •••003", () => {
    const s = html(createElement(CompanyFacts, { c: company }));
    expect(s).toContain("•••003");
    expect(s).toContain(MASKED_NOTE);
    expect(s).not.toContain("לא תקין");
    expect(s).not.toMatch(/href="(tel|mailto):/);
    expect(s).toContain("•••4567");
    // the same card with real values keeps its links (an admin)
    const real = html(createElement(CompanyFacts, { c: { ...company, phone: "03-1234567", email: "office@neve.co.il", tax_id: "510000003" } as Company }));
    expect(real).toMatch(/href="tel:03-1234567"/);
    expect(real).toMatch(/href="mailto:office@neve.co.il"/);
    expect(real).not.toContain(MASKED_NOTE);
  });
  it("supplier: a certificate the viewer may not open is said to exist — never 'no certificate attached'", () => {
    const sup = { id: "s1", business_name: "כהן חשמל", category: "electric", phone: "•••4321", email: "k•••@elec.co.il", verification_status: "pending",
      business_license_number: "•••789", professional_license_url: null, verification_rejection_reason: null, verified_at: null, rating: null,
      rating_count: 0, created_at: "2026-11-01T10:00:00Z", open_disputes: 0 } as Supplier;
    const props = { canVerify: false, mode: null, reason: "", busy: false, notice: null };
    const hidden = html(createElement(SupplierVerifyCardView, { ...props, s: { ...sup, license_hidden: true } }));
    expect(hidden).toContain(LICENSE_HIDDEN_TEXT);
    expect(hidden).not.toContain("לא צורפה תעודה");
    const none = html(createElement(SupplierVerifyCardView, { ...props, s: { ...sup, license_hidden: false } }));
    expect(none).toContain("לא צורפה תעודה");
  });
});
