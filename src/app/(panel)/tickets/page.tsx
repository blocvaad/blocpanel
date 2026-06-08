import { adminClient } from "@/lib/supabase";
import TicketsTable from "@/components/ui/TicketsTable";
export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const { data: tickets, count } = await adminClient
    .from("panel_tickets_view")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(100);

  const open = (tickets ?? []).filter(t => t.status === "פתוח" || t.status === "open").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>תקלות ותחזוקה</h1>
          <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>{count ?? 0} תקלות סה״כ</p>
        </div>
        {open > 0 && (
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "var(--red)", letterSpacing: "-.03em" }}>{open}</div>
            <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>פתוחות</div>
          </div>
        )}
      </div>
      <TicketsTable initialData={tickets ?? []} />
    </div>
  );
}
