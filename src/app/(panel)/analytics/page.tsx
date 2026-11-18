import { requirePageSession } from "@/lib/pageAuth";
import AnalyticsCharts from "@/components/charts/AnalyticsCharts";
import AnalyticsExportBtn from "@/components/ui/AnalyticsExportBtn";
import { readBloc } from "@/lib/blocRead";
import { byHeMonth } from "@/lib/months";
import { actorOf } from "@/lib/moneyActions";
import { ANALYTICS_FAILED_TEXT, ANALYTICS_PARTIAL_TEXT, ANALYTICS_MISSING_TEXT, ANALYTICS_EXPORT_OFF_TEXT } from "@/lib/dashboardTexts";
export const dynamic = "force-dynamic";


export default async function AnalyticsPage() {
  const session = await requirePageSession("buildings.read");
  // א3-1 (bloc, החלטה 444): הכל מסוכם ב-bloc (lib/blocRead) — לפאנל מגיעים רק המספרים. עד עכשיו הפאנל קרא כאן כל שורה של
  // תשלומים, פרופילים ותקלות (עד 20,000 מכל אחד) כדי לסכם אצלו.
  const r = await readBloc("analytics", {}, actorOf(session));
  if (!r.ok) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>אנליטיקה</h1>
          <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>תובנות מלאות על הפלטפורמה</p>
        </div>
        <div role="alert" data-analytics-failed="" className="card" style={{ padding: "16px", fontSize: "13px", color: "var(--red)", borderColor: "#ef444440" }}>
          <div style={{ fontWeight: 600 }}>{ANALYTICS_FAILED_TEXT}</div>
          <div style={{ marginTop: "4px", color: "var(--text-2)" }}>הסיבה: {r.error}</div>
        </div>
      </div>
    );
  }
  const d = r.data;
  const gone = new Set(d.failed);
  const dash = (part: string, v: string | number) => (gone.has(part) ? "—" : v);
  const buildingStats = d.topBuildings.map((b) => ({ ...b, name: b.name ?? "—" }));
  const { active, suspended, archived } = d.buildings;
  const planCounts = d.buildings.byPlan;
  const paymentCounts = d.payments.byStatus;
  const { totalRevenue, totalDebt } = d.payments;
  const ticketByUrgency = d.tickets.byUrgency;
  const ticketByStatus = d.tickets.byStatus;
  const revenueByMonth = byHeMonth(d.revenueByMonth, (m) => m.amount);
  const growthByMonth = byHeMonth(d.growthByMonth, (m) => m.count);
  const tenantStatus = d.tenantsByStatus;

  // Collection rate
  // שיעור גבייה = שולם מתוך מה שנדרש ובאחריות bloc. בוטל/פטור/זוכה/חיצוני לא במכנה.
  const paidCount = paymentCounts["paid"]??0;
  const dueCount = paidCount + (paymentCounts["pending"]??0) + (paymentCounts["pending_approval"]??0);
  const collectionRate = dueCount>0 ? Math.round((paidCount/dueCount)*100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>אנליטיקה</h1>
          <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>תובנות מלאות על הפלטפורמה</p>
          {gone.size > 0 && (
            <p data-analytics-missing="" style={{ fontSize: "12px", color: "var(--red)", marginTop: "6px" }}>
              {ANALYTICS_MISSING_TEXT}
            </p>
          )}
          {d.partial && (
            <p data-analytics-partial="" style={{ fontSize: "12px", color: "var(--yellow)", marginTop: "6px" }}>
              {ANALYTICS_PARTIAL_TEXT}
            </p>
          )}
        </div>
        <AnalyticsExportBtn
          totalRevenue={totalRevenue}
          totalDebt={totalDebt}
          collectionRate={collectionRate}
          active={active}
          suspended={suspended}
          archived={archived}
          approvedTenants={tenantStatus["approved"]??0}
          pendingTenants={tenantStatus["pending"]??0}
          revenueByMonth={revenueByMonth}
          buildingStats={buildingStats??[]}
          disabledReason={gone.size > 0 ? ANALYTICS_EXPORT_OFF_TEXT : null}
        />
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>נגבה בבניינים — סה״כ</div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "var(--green)", letterSpacing: "-.03em" }}>{dash("payments", `₪${totalRevenue.toLocaleString("he-IL")}`)}</div>
          <div style={{ fontSize: "12px", color: "var(--red)", marginTop: "4px" }}>חוב: {dash("payments", `₪${totalDebt.toLocaleString("he-IL")}`)}</div>
        </div>
        <div className="card" style={{ padding: "18px", borderColor: !gone.has("payments") && collectionRate < 70 ? "#ef444440" : "var(--border)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>שיעור גבייה</div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: gone.has("payments") ? "var(--text-3)" : collectionRate >= 80 ? "var(--green)" : collectionRate >= 60 ? "var(--yellow)" : "var(--red)", letterSpacing: "-.03em" }}>{dash("payments", `${collectionRate}%`)}</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>{gone.has("payments") ? "לא נטען" : `${paidCount} מתוך ${dueCount} שנדרשו`}</div>
        </div>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>בניינים</div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>{dash("buildings", active)}</div>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            {!gone.has("buildings")&&suspended>0&&<span style={{ fontSize: "11px", color: "var(--orange)" }}>{suspended} מושהים</span>}
            {!gone.has("buildings")&&archived>0&&<span style={{ fontSize: "11px", color: "var(--text-3)" }}>{archived} בארכיב</span>}
          </div>
        </div>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>דיירים פעילים</div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>{dash("tenants", tenantStatus["approved"]??0)}</div>
          <div style={{ fontSize: "12px", color: "var(--yellow)", marginTop: "4px" }}>{gone.has("tenants") ? "לא נטען" : `${tenantStatus["pending"]??0} ממתינים`}</div>
        </div>
      </div>

      <AnalyticsCharts
        buildingStats={buildingStats??[]}
        paymentCounts={paymentCounts}
        ticketByUrgency={ticketByUrgency}
        ticketByStatus={ticketByStatus}
        growthByMonth={growthByMonth}
        revenueByMonth={revenueByMonth}
        tenantStatus={tenantStatus}
        planCounts={planCounts}
        collectionRate={collectionRate}
        totalRevenue={totalRevenue}
        totalDebt={totalDebt}
        missing={d.failed}
      />
    </div>
  );
}
