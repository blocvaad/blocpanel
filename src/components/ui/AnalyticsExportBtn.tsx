"use client";
import { Download } from "lucide-react";

interface Props {
  totalRevenue: number; totalDebt: number; collectionRate: number;
  active: number; suspended: number; archived: number;
  approvedTenants: number; pendingTenants: number;
  revenueByMonth: Record<string, number>;
  buildingStats: { name: string; tenant_count: number; open_tickets: number }[];
}

export default function AnalyticsExportBtn(props: Props) {
  function exportCSV() {
    const rows: string[] = [];
    rows.push("סיכום כללי,,");
    rows.push("מדד,ערך,");
    rows.push(`הכנסות כולל,₪${props.totalRevenue.toLocaleString("he-IL")},`);
    rows.push(`חוב פתוח,₪${props.totalDebt.toLocaleString("he-IL")},`);
    rows.push(`שיעור גבייה,${props.collectionRate}%,`);
    rows.push(`בניינים פעילים,${props.active},`);
    rows.push(`בניינים מושהים,${props.suspended},`);
    rows.push(`בניינים בארכיב,${props.archived},`);
    rows.push(`דיירים מאושרים,${props.approvedTenants},`);
    rows.push(`דיירים ממתינים,${props.pendingTenants},`);
    rows.push(",");
    rows.push("הכנסות לפי חודש,,");
    rows.push("חודש,סכום,");
    for (const [month, amount] of Object.entries(props.revenueByMonth)) {
      rows.push(`${month},₪${amount.toLocaleString("he-IL")},`);
    }
    rows.push(",");
    rows.push("בניינים — עומס,,");
    rows.push("בניין,דיירים,תקלות פתוחות");
    for (const b of props.buildingStats) {
      rows.push(`${b.name},${b.tenant_count},${b.open_tickets}`);
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blocpanel-analytics-${new Date().toLocaleDateString("he-IL").replace(/\//g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={exportCSV} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: "13px", fontWeight: "500", cursor: "pointer", whiteSpace: "nowrap" }}>
      <Download size={15} />ייצוא CSV
    </button>
  );
}
