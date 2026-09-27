import { adminClient } from "@/lib/supabase";
import { requirePageSession } from "@/lib/pageAuth";
import AnalyticsCharts from "@/components/charts/AnalyticsCharts";
import AnalyticsExportBtn from "@/components/ui/AnalyticsExportBtn";
import { fetchAll } from "@/lib/fetchAll";
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await requirePageSession("buildings.read");
  const since365 = new Date(Date.now()-365*864e5).toISOString();
  // PostgREST מחזיר עד 1000 שורות לבקשה; בלי דפדוף כל הסכומים כאן נחתכו בשקט.
  const [
    { data: buildingStats },
    { data: allBuildings },
    paymentsAll,
    ticketsAll,
    growthAll,
    tenantsAll,
    revenueAll,
  ] = await Promise.all([
    adminClient.from("panel_buildings_view").select("name,tenant_count,open_tickets,pending_count").order("tenant_count", { ascending: false }).limit(10),
    adminClient.from("buildings").select("id,name,is_active,is_archived,plan,created_at").limit(5000),
    fetchAll<{ status: string | null; amount: number | string | null }>((f, t) =>
      adminClient.from("payments").select("id,status,amount").order("id").range(f, t)),
    fetchAll<{ urgency: string | null; status: string | null }>((f, t) =>
      adminClient.from("service_tickets").select("id,urgency,status").order("id").range(f, t)),
    fetchAll<{ created_at: string }>((f, t) =>
      adminClient.from("profiles").select("id,created_at").gte("created_at", since365).order("created_at").order("id").range(f, t)),
    fetchAll<{ approval_status: string | null }>((f, t) =>
      adminClient.from("profiles").select("id,approval_status").order("id").range(f, t)),
    fetchAll<{ amount: number | string | null; paid_at: string | null; created_at: string | null }>((f, t) =>
      adminClient.from("payments").select("id,amount,paid_at,created_at").eq("status","paid").gte("paid_at", since365).order("paid_at").order("id").range(f, t)),
  ]);
  const paymentStats = paymentsAll.rows, ticketStats = ticketsAll.rows, tenantGrowth = growthAll.rows,
        allTenants = tenantsAll.rows, revenueHistory = revenueAll.rows;
  const partial = [paymentsAll, ticketsAll, growthAll, tenantsAll, revenueAll].some((r) => r.truncated);
  const heMonth = (iso: string) => new Date(iso).toLocaleDateString("he-IL",{month:"short",year:"2-digit",timeZone:"Asia/Jerusalem"});

  // Buildings
  const active    = (allBuildings??[]).filter(b=>!b.is_archived&&b.is_active!==false).length;
  const suspended = (allBuildings??[]).filter(b=>!b.is_archived&&b.is_active===false).length;
  const archived  = (allBuildings??[]).filter(b=>b.is_archived).length;

  // Payments
  const paymentCounts: Record<string,number> = {};
  let totalRevenue = 0, totalDebt = 0;
  for (const p of paymentStats) {
    const st = p.status ?? "pending";
    paymentCounts[st] = (paymentCounts[st]??0)+1;
    if (st==="paid") totalRevenue += Number(p.amount??0);
    if (st==="pending"||st==="pending_approval") totalDebt += Number(p.amount??0);
  }

  // Tickets
  const ticketByUrgency: Record<string,number> = {};
  const ticketByStatus: Record<string,number> = {};
  for (const t of ticketStats) {
    ticketByUrgency[t.urgency??"other"] = (ticketByUrgency[t.urgency??"other"]??0)+1;
    ticketByStatus[t.status??"other"]   = (ticketByStatus[t.status??"other"]??0)+1;
  }

  // Monthly revenue - last 12 months
  const revenueByMonth: Record<string,number> = {};
  for (const p of revenueHistory) {
    const m = heMonth(p.paid_at ?? p.created_at ?? new Date().toISOString());
    revenueByMonth[m] = (revenueByMonth[m]??0)+Number(p.amount??0);
  }

  // Monthly growth - last 12 months
  const growthByMonth: Record<string,number> = {};
  for (const t of tenantGrowth) {
    const m = heMonth(t.created_at);
    growthByMonth[m] = (growthByMonth[m]??0)+1;
  }

  // Tenant status
  const tenantStatus: Record<string,number> = {};
  for (const t of allTenants) {
    const st = t.approval_status ?? "none";
    tenantStatus[st] = (tenantStatus[st]??0)+1;
  }

  // Plan distribution
  const planCounts: Record<string,number> = {};
  for (const b of allBuildings??[]) {
    planCounts[b.plan??"free"] = (planCounts[b.plan??"free"]??0)+1;
  }

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
          {partial && (
            <p style={{ fontSize: "12px", color: "var(--yellow)", marginTop: "6px" }}>
              חלק מהנתונים חלקיים (מעל 20,000 שורות או שגיאת קריאה) — המספרים מוצגים כתחתית.
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
        />
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
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>{paidCount} מתוך {dueCount} שנדרשו</div>
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
