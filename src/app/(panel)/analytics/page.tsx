import { adminClient } from "@/lib/supabase";
import AnalyticsCharts from "@/components/charts/AnalyticsCharts";
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const { data: buildingStats } = await adminClient
    .from("panel_buildings_view")
    .select("name,tenant_count,open_tickets")
    .order("tenant_count", { ascending: false })
    .limit(10);

  const { data: paymentStats } = await adminClient
    .from("payments").select("status");

  const paymentCounts: Record<string, number> = {};
  for (const p of paymentStats ?? []) {
    paymentCounts[p.status] = (paymentCounts[p.status] ?? 0) + 1;
  }

  const { data: ticketStats } = await adminClient
    .from("service_tickets").select("urgency,status");

  const ticketByUrgency: Record<string, number> = {};
  const ticketByStatus: Record<string, number> = {};
  for (const t of ticketStats ?? []) {
    ticketByUrgency[t.urgency ?? "other"] = (ticketByUrgency[t.urgency ?? "other"] ?? 0) + 1;
    ticketByStatus[t.status ?? "other"]   = (ticketByStatus[t.status ?? "other"] ?? 0) + 1;
  }

  const { data: tenantGrowth } = await adminClient
    .from("profiles").select("created_at")
    .gte("created_at", new Date(Date.now() - 180 * 864e5).toISOString());

  const growthByMonth: Record<string, number> = {};
  for (const t of tenantGrowth ?? []) {
    const m = new Date(t.created_at).toLocaleDateString("he-IL", { month: "short", year: "2-digit" });
    growthByMonth[m] = (growthByMonth[m] ?? 0) + 1;
  }

  // Summary stats
  const totalPayments = Object.values(paymentCounts).reduce((a, b) => a + b, 0);
  const paidPayments  = paymentCounts["paid"] ?? 0;
  const totalTickets  = Object.values(ticketByStatus).reduce((a, b) => a + b, 0);
  const openTickets   = (ticketByStatus["פתוח"] ?? 0) + (ticketByStatus["open"] ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>אנליטיקה</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>תובנות על הפלטפורמה</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>תשלומים שולמו</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--green)", letterSpacing: "-.03em" }}>{paidPayments}</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>מתוך {totalPayments} סה״כ</div>
        </div>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>תקלות פתוחות</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: openTickets > 0 ? "var(--red)" : "var(--green)", letterSpacing: "-.03em" }}>{openTickets}</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>מתוך {totalTickets} סה״כ</div>
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
