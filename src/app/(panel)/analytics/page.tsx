import { adminClient } from "@/lib/supabase";
import AnalyticsCharts from "@/components/charts/AnalyticsCharts";
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [
    { data: buildingStats },
    { data: allBuildings },
    { data: paymentStats },
    { data: ticketStats },
    { data: tenantGrowth },
    { data: allTenants },
    { data: revenueHistory },
  ] = await Promise.all([
    adminClient.from("panel_buildings_view").select("name,tenant_count,open_tickets,pending_count").order("tenant_count", { ascending: false }).limit(10),
    adminClient.from("buildings").select("id,name,is_active,is_archived,plan,created_at"),
    adminClient.from("payments").select("status,amount,created_at"),
    adminClient.from("service_tickets").select("urgency,status,created_at"),
    adminClient.from("profiles").select("created_at,approval_status").gte("created_at", new Date(Date.now()-365*864e5).toISOString()),
    adminClient.from("profiles").select("approval_status"),
    adminClient.from("payments").select("amount,created_at,status").eq("status","paid").gte("created_at", new Date(Date.now()-365*864e5).toISOString()),
  ]);

  // Buildings
  const active    = (allBuildings??[]).filter(b=>!b.is_archived&&b.is_active!==false).length;
  const suspended = (allBuildings??[]).filter(b=>!b.is_archived&&b.is_active===false).length;
  const archived  = (allBuildings??[]).filter(b=>b.is_archived).length;

  // Payments
  const paymentCounts: Record<string,number> = {};
  let totalRevenue = 0, totalDebt = 0;
  for (const p of paymentStats??[]) {
    paymentCounts[p.status] = (paymentCounts[p.status]??0)+1;
    if (p.status==="paid") totalRevenue += p.amount??0;
    if (p.status==="pending"||p.status==="pending_approval") totalDebt += p.amount??0;
  }

  // Tickets
  const ticketByUrgency: Record<string,number> = {};
  const ticketByStatus: Record<string,number> = {};
  for (const t of ticketStats??[]) {
    ticketByUrgency[t.urgency??"other"] = (ticketByUrgency[t.urgency??"other"]??0)+1;
    ticketByStatus[t.status??"other"]   = (ticketByStatus[t.status??"other"]??0)+1;
  }

  // Monthly revenue - last 12 months
  const revenueByMonth: Record<string,number> = {};
  for (const p of revenueHistory??[]) {
    const m = new Date(p.created_at).toLocaleDateString("he-IL",{month:"short",year:"2-digit"});
    revenueByMonth[m] = (revenueByMonth[m]??0)+(p.amount??0);
  }

  // Monthly growth - last 12 months
  const growthByMonth: Record<string,number> = {};
  for (const t of tenantGrowth??[]) {
    const m = new Date(t.created_at).toLocaleDateString("he-IL",{month:"short",year:"2-digit"});
    growthByMonth[m] = (growthByMonth[m]??0)+1;
  }

  // Tenant status
  const tenantStatus: Record<string,number> = {};
  for (const t of allTenants??[]) {
    tenantStatus[t.approval_status] = (tenantStatus[t.approval_status]??0)+1;
  }

  // Plan distribution
  const planCounts: Record<string,number> = {};
  for (const b of allBuildings??[]) {
    planCounts[b.plan??"free"] = (planCounts[b.plan??"free"]??0)+1;
  }

  // Collection rate
  const totalPayments = Object.values(paymentCounts).reduce((a,b)=>a+b,0);
  const paidCount = paymentCounts["paid"]??0;
  const collectionRate = totalPayments>0 ? Math.round((paidCount/totalPayments)*100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>אנליטיקה</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>תובנות מלאות על הפלטפורמה</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>הכנסות כולל</div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "var(--green)", letterSpacing: "-.03em" }}>₪{totalRevenue.toLocaleString("he-IL")}</div>
          <div style={{ fontSize: "12px", color: "var(--red)", marginTop: "4px" }}>חוב: ₪{totalDebt.toLocaleString("he-IL")}</div>
        </div>
        <div className="card" style={{ padding: "18px", borderColor: collectionRate < 70 ? "#ef444440" : "var(--border)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>שיעור גבייה</div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: collectionRate >= 80 ? "var(--green)" : collectionRate >= 60 ? "var(--yellow)" : "var(--red)", letterSpacing: "-.03em" }}>{collectionRate}%</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>{paidCount} מתוך {totalPayments}</div>
        </div>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>בניינים</div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>{active}</div>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            {suspended>0&&<span style={{ fontSize: "11px", color: "var(--orange)" }}>{suspended} מושהים</span>}
            {archived>0&&<span style={{ fontSize: "11px", color: "var(--text-3)" }}>{archived} בארכיב</span>}
          </div>
        </div>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>דיירים פעילים</div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>{tenantStatus["approved"]??0}</div>
          <div style={{ fontSize: "12px", color: "var(--yellow)", marginTop: "4px" }}>{tenantStatus["pending"]??0} ממתינים</div>
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
      />
    </div>
  );
}
