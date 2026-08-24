import { adminClient } from "@/lib/supabase";
import PaymentsTable from "@/components/ui/PaymentsTable";
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const { data: payments, count } = await adminClient
    .from("panel_payments_view")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(100);

  const totalRevenue = (payments ?? [])
    .filter(p => p.status === "paid")
    .reduce((s, p) => s + (p.amount ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>תשלומים</h1>
          <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>{count ?? 0} תשלומים</p>
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "var(--green)", letterSpacing: "-.03em" }}>
            ₪{(totalRevenue).toLocaleString("he-IL")}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>סה״כ שולם</div>
        </div>
      </div>
      <PaymentsTable initialData={payments ?? []} />
    </div>
  );
}
