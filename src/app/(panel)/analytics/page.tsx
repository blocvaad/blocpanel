import { adminClient } from "@/lib/supabase";
import AnalyticsCharts from "@/components/charts/AnalyticsCharts";
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const { data: buildingStats } = await adminClient
    .from("panel_buildings_view")
    .select("name,tenant_count,open_tickets")
    .order("tenant_count", { ascending: false })
    .limit(10);

  const { data: allBuildings } = await adminClient
    .from("buildings")
    .select("id,name,is_active,is_archived,plan,created_at");

  const active   = (allBuildings ?? []).filter(b => !b.is_archived && b.is_active !== false).length;
  const suspended = (allBuildings ?? []).filter(b => !b.is_archived && b.is_active === false).length;
  const archived  = (allBuildings ?? []).filter(b => b.is_archived).length;

  const { data: paymentStats } = await adminClient.from("payments").select("status,amount");
  const paymentCounts: Record<string,number> = {};
  for (const p of paymentStats ?? []) paymentCounts[p.status] = (paymentCounts[p.status]??0)+1;

  const totalRevenue = (paymentStats ?? []).filter(p => p.status==="paid").reduce((s,p)=>s+(p.amount??0),0);
  const totalDebt    = (paymentStats ?? []).filter(p => p.status==="pending"||p.status==="pending_approval").reduce((s,p)=>s+(p.amount??0),0);

  const { data: ticketStats } = await adminClient.from("service_tickets").select("urgency,status");
  const ticketByUrgency: Record<string,number> = {};
  const ticketByStatus: Record<string,number> = {};
  for (const t of ticketStats ?? []) {
    ticketByUrgency[t.urgency??"other"] = (ticketByUrgency[t.urgency??"other"]??0)+1;
    ticketByStatus[t.status??"other"]   = (ticketByStatus[t.status??"other"]??0)+1;
  }

  const { data: tenantGrowth } = await adminClient
    .from("profiles").select("created_at")
    .gte("created_at", new Date(Date.now()-180*864e5).toISOString());

  const growthByMonth: Record<string,number> = {};
  for (const t of tenantGrowth ?? []) {
    const m = new Date(t.created_at).toLocaleDateString("he-IL",{month:"short",year:"2-digit"});
    growthByMonth[m] = (growthByMonth[m]??0)+1;
  }

  // Plan distribution
  const planCounts: Record<string,number> = {};
  for (const b of allBuildings ?? []) {
    const p = b.plan ?? "free";
    planCounts[p] = (planCounts[p]??0)+1;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>אנליטיקה</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>תובנות על הפלטפורמה</p>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>בניינים פעילים</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--green)", letterSpacing: "-.03em" }}>{active}</div>
          <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
            {suspended > 0 && <span style={{ fontSize: "11px", color: "var(--orange)" }}>{suspended} מושהים</span>}
            {archived > 0 && <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{archived} בארכיב</span>}
          </div>
        </div>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>סה״כ הכנסות</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--green)", letterSpacing: "-.03em" }}>₪{totalRevenue.toLocaleString("he-IL")}</div>
          <div style={{ fontSize: "12px", color: "var(--red)", marginTop: "6px" }}>חוב: ₪{totalDebt.toLocaleString("he-IL")}</div>
        </div>

        {/* Plan distribution */}
        <div className="card" style={{ padding: "18px", gridColumn: "1/-1" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "14px" }}>התפלגות תוכניות</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {Object.entries(planCounts).map(([plan, count]) => {
              const colors: Record<string,string> = { free:"#52525b", basic:"#3b82f6", pro:"#22c55e" };
              const total = Object.values(planCounts).reduce((a,b)=>a+b,0);
              const pct = Math.round((count/total)*100);
              return (
                <div key={plan} style={{ flex: count, background: (colors[plan]??"#52525b")+"20", border: `1px solid ${colors[plan]??"#52525b"}30`, borderRadius: "8px", padding: "10px 12px", textAlign: "center" as const }}>
                  <div style={{ fontSize: "18px", fontWeight: "700", color: colors[plan]??"var(--text)" }}>{count}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>{plan}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AnalyticsCharts
        buildingStats={buildingStats ?? []}
        paymentCounts={paymentCounts}
        ticketByUrgency={ticketByUrgency}
        ticketByStatus={ticketByStatus}
        growthByMonth={growthByMonth}
      />
    </div>
  );
}
