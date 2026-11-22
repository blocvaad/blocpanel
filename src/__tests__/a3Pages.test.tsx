// א3-1 (bloc, החלטה 444): /overview ו-/analytics — הנתונים מ-bloc (readBloc), מרונדרים לשרת עם הצורה ש-bloc מחזיר.
//   • המספרים מגיעים לכרטיסים ולגרפים כמו שהם; החודשים בעברית ובסדר.
//   • כשל בערוץ — "לא נטען" עם הסיבה (בשורה משלה), לא אפסים; חלק שנכשל — "—", והגרף / ההתראות "לא נטען" (לא ₪0, לא "הכל תקין");
//     מעל התקרה — "תחתית"; באנליטיקה, כשחלק לא נטען — אין ייצוא.
//   • אף מסך כאן לא קורא את טבלאות bloc ישירות (רק הפעילות האחרונה — טבלה של הפאנל עצמו, עד הקבוצה האחרונה של א3).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({ result: {} as Record<string, unknown>, tables: [] as string[], ors: [] as string[] }));
vi.mock("@/lib/pageAuth", () => ({ requirePageSession: async () => ({ id: "00000000-0000-4000-8000-000000000092", email: "view@bloc.co.il", role: "viewer" }) }));
vi.mock("@/lib/blocRead", () => ({ readBloc: async (read: string) => h.result[read] }));
vi.mock("@/lib/supabase", () => ({
  adminClient: { from: (t: string) => { h.tables.push(t); const c: any = { select: () => c, or: (e: string) => { h.ors.push(e); return c; }, order: () => c, limit: async () => ({ data: [{ id: "l1", action: "LOGIN", admin_email: "a@x.co", entity_type: null, created_at: "2026-11-18T09:00:00Z" }], error: null }) }; return c; } },
}));
// הרכיבים — תצוגה של מה שהם מקבלים (הבדיקה היא על הנתונים שעוברים, לא על העיצוב). lucide-react — האמיתי (לא Proxy: vitest עושה
// await לתוצאת ה-factory, ו-Proxy שעונה על then הוא thenable שלא נגמר — הקובץ נתקע).
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => createElement("a", null, children as never) }));
vi.mock("@/components/ui/StatCard", () => ({ default: (p: { label: string; value: unknown }) => createElement("div", { "data-stat": p.label }, String(p.value)) }));
vi.mock("@/components/charts/RevenueChart", () => ({ default: (p: { data: unknown; failed?: boolean }) => createElement("div", { "data-revenue": JSON.stringify(p.data), "data-revenue-failed": String(!!p.failed) }) }));
vi.mock("@/components/ui/AlertsPanel", () => ({ default: (p: unknown) => createElement("div", { "data-alerts": JSON.stringify(p) }) }));
vi.mock("@/components/ui/RecentActivity", () => ({ default: (p: { logs: unknown[] }) => createElement("div", { "data-logs": p.logs.length }) }));
vi.mock("@/components/charts/AnalyticsCharts", () => ({ default: (p: unknown) => createElement("div", { "data-charts": JSON.stringify(p) }) }));
vi.mock("@/components/ui/AnalyticsExportBtn", () => ({ default: (p: unknown) => createElement("div", { "data-export": JSON.stringify(p) }) }));

import OverviewPage from "../app/(panel)/overview/page";
import AnalyticsPage from "../app/(panel)/analytics/page";
import {
  OVERVIEW_FAILED_TEXT, OVERVIEW_PARTIAL_TEXT, OVERVIEW_CAPPED_TEXT,
  ANALYTICS_FAILED_TEXT, ANALYTICS_MISSING_TEXT, ANALYTICS_PARTIAL_TEXT, ANALYTICS_EXPORT_OFF_TEXT,
} from "@/lib/dashboardTexts";
import { heMonthLabel } from "@/lib/months";

const B1 = "c0f1cb42-8e52-4a4e-a8d7-5563c10d6a2e";
const overview = {
  stats: { total_buildings: 2, active_buildings: 1, total_tenants: 7, pending_approvals: 1, open_tickets: 3, payments_30d: 4, revenue_30d: 1500 },
  recentBuildings: [{ id: B1, name: "השקד 104", created_at: "2026-10-09T10:00:00Z", plan: "building" }],
  revenueByMonth: [{ month: "2026-10", amount: 100 }, { month: "2026-11", amount: 50 }],
  counts: { pendingReports: 2, supplierQueue: 1, declined30: 1 }, partial: false, failed: [] as string[],
};
const analytics = {
  topBuildings: [{ name: "השקד 104", tenant_count: 5, open_tickets: 2, pending_count: 1 }],
  buildings: { active: 1, suspended: 1, archived: 0, byPlan: { building: 1, free: 1 } },
  payments: { byStatus: { paid: 3, pending: 1, pending_approval: 1 }, totalRevenue: 220, totalDebt: 50 },
  tickets: { byUrgency: { high: 1 }, byStatus: { open: 1 } },
  revenueByMonth: [{ month: "2026-05", amount: 70 }, { month: "2026-11", amount: 50 }],
  growthByMonth: [{ month: "2026-11", count: 2 }],
  tenantsByStatus: { pending: 2, approved: 1 }, partial: false, failed: [] as string[],
};
const html = async (el: Promise<unknown>) => renderToStaticMarkup((await el) as never);
const attr = (s: string, name: string) => JSON.parse(new RegExp(`${name}="([^"]*)"`).exec(s)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));

beforeEach(() => { h.tables.length = 0; h.ors.length = 0; });

describe("/overview", () => {
  it("the numbers of bloc reach the cards, the chart (Hebrew months, in order) and the alerts; only the panel table is read here", async () => {
    h.result = { overview: { ok: true, data: overview } };
    const s = await html(OverviewPage({ searchParams: Promise.resolve({}) }));
    expect(s).toContain('data-stat="דיירים פעילים">7<');
    expect(s).toContain('data-stat="דיווחים ממתינים לוועד">2<');
    expect(s).toContain("₪1,500");
    expect(attr(s, "data-revenue")).toEqual([{ month: heMonthLabel("2026-10"), amount: 100 }, { month: heMonthLabel("2026-11"), amount: 50 }]);
    expect(attr(s, "data-alerts")).toEqual({ stats: { pending_approvals: 1, open_tickets: 3 }, extra: { pendingReports: 2, supplierQueue: 1, declined30: 1 } });
    expect(s).toContain('data-revenue-failed="false"');
    expect(s).toContain("השקד 104");
    expect(s).not.toMatch(/data-overview-(failed|partial|capped)/);
    expect(h.tables).toEqual(["panel_audit_logs"]);
    // MOD-1 (סקירה #7): צופה — בלי פעולות על דיווחים על שיחות פרטיות בפעילות האחרונה
    expect(h.ors).toEqual(["entity_type.is.null,entity_type.neq.dm_report"]);
  });
  it("the channel failed: said with the reason, and the cards say — (never 0)", async () => {
    h.result = { overview: { ok: false, error: "bloc לא ענה בזמן", code: "TIMEOUT" } };
    const s = await html(OverviewPage({ searchParams: Promise.resolve({}) }));
    expect(s).toContain(OVERVIEW_FAILED_TEXT);
    expect(s).toContain("הסיבה: bloc לא ענה בזמן");          // the reason on a line of its own (no "bloc: bloc" run in RTL)
    expect(s).toContain('data-stat="דיירים פעילים">—<');
    expect(s).toContain('data-stat="דיווחים ממתינים לוועד">—<');
    expect(s).toContain("הבניינים האחרונים לא נטענו");
    expect(s).not.toContain("אין בניינים עדיין");
    // the chart and the alerts are told nothing loaded (not ₪0, not "all fine")
    expect(s).toContain('data-revenue-failed="true"');
    expect(attr(s, "data-alerts")).toEqual({ stats: null, extra: { pendingReports: null, supplierQueue: null, declined30: null } });
  });
  it("a part that failed: — on its cards and a note that part did not load", async () => {
    h.result = { overview: { ok: true, data: { ...overview, stats: null, counts: { pendingReports: null, supplierQueue: 1, declined30: 1 }, failed: ["stats", "pendingReports"] } } };
    const s = await html(OverviewPage({ searchParams: Promise.resolve({}) }));
    expect(s).toContain(OVERVIEW_PARTIAL_TEXT);
    expect(s).toContain('data-stat="סה״כ בניינים">—<');
    expect(s).toContain('data-stat="דיווחים ממתינים לוועד">—<');
    expect(attr(s, "data-alerts")).toEqual({ stats: null, extra: { pendingReports: null, supplierQueue: 1, declined30: 1 } });
    expect(s).toContain('data-revenue-failed="false"');
    expect(s).not.toContain("data-overview-failed");
  });
  it("the revenue scan failed: the chart is told (no ₪0); past the cap: the chart is a floor, said", async () => {
    h.result = { overview: { ok: true, data: { ...overview, revenueByMonth: [], failed: ["revenue"] } } };
    expect(await html(OverviewPage({ searchParams: Promise.resolve({}) }))).toContain('data-revenue-failed="true"');
    h.result = { overview: { ok: true, data: { ...overview, partial: true } } };
    const s = await html(OverviewPage({ searchParams: Promise.resolve({}) }));
    expect(s).toContain(OVERVIEW_CAPPED_TEXT);
    expect(s).not.toContain("data-overview-partial");
  });
});

describe("/analytics", () => {
  it("everything summed in bloc reaches the charts and the export; the collection rate from the counts", async () => {
    h.result = { analytics: { ok: true, data: analytics } };
    const s = await html(AnalyticsPage());
    const charts = attr(s, "data-charts");
    expect(charts.paymentCounts).toEqual(analytics.payments.byStatus);
    expect(charts.planCounts).toEqual({ building: 1, free: 1 });
    expect(charts.revenueByMonth).toEqual({ [heMonthLabel("2026-05")]: 70, [heMonthLabel("2026-11")]: 50 });
    expect(charts.growthByMonth).toEqual({ [heMonthLabel("2026-11")]: 2 });
    expect(charts.collectionRate).toBe(60);               // 3 paid of 5 due
    expect(attr(s, "data-export")).toMatchObject({ totalRevenue: 220, totalDebt: 50, active: 1, suspended: 1, approvedTenants: 1, pendingTenants: 2 });
    expect(s).not.toContain("data-analytics-partial");
    expect(h.tables).toEqual([]);
  });
  it("the channel failed: a screen of its own with the reason — no charts of zeros", async () => {
    h.result = { analytics: { ok: false, error: "bloc דחה את הבקשה", code: "REJECTED" } };
    const s = await html(AnalyticsPage());
    expect(s).toContain(ANALYTICS_FAILED_TEXT);
    expect(s).toContain("הסיבה: bloc דחה את הבקשה");
    expect(s).not.toContain("data-charts");
  });
  it("a failed part: — on its cards (never ₪0 / 0%), the charts are told which, and no export of zeros", async () => {
    h.result = { analytics: { ok: true, data: { ...analytics, payments: { byStatus: {}, totalRevenue: 0, totalDebt: 0 }, revenueByMonth: [], failed: ["payments", "revenue"] } } };
    const s = await html(AnalyticsPage());
    expect(s).toContain(ANALYTICS_MISSING_TEXT.replace(/"/g, "&quot;"));
    expect(s).not.toContain("₪0");
    expect(s).not.toContain(">0%<");
    expect(s).toContain("לא נטען");
    expect(attr(s, "data-charts").missing).toEqual(["payments", "revenue"]);
    expect(attr(s, "data-export").disabledReason).toBe(ANALYTICS_EXPORT_OFF_TEXT);
    expect(s).not.toContain("data-analytics-partial");
    // buildings and tenants failed too: their cards say — as well
    h.result = { analytics: { ok: true, data: { ...analytics, failed: ["buildings", "tenants"] } } };
    const t = await html(AnalyticsPage());
    expect((t.match(/>—</g) ?? []).length).toBe(2);
    expect(t).not.toContain("1 מושהים");
  });
  it("past the cap (partial): a floor, said — the export stays", async () => {
    h.result = { analytics: { ok: true, data: { ...analytics, partial: true } } };
    const s = await html(AnalyticsPage());
    expect(s).toContain(ANALYTICS_PARTIAL_TEXT);
    expect(s).not.toContain("data-analytics-missing");
    expect(attr(s, "data-export").disabledReason).toBeNull();
  });
});
