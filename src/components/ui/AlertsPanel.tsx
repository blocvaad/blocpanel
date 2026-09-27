import Link from "next/link";
import { Clock, XCircle, AlertTriangle, ChevronLeft, BadgeCheck, Receipt } from "lucide-react";

interface Props {
  stats: { pending_approvals?:number; open_tickets?:number } | null;
  extra?: { pendingReports?: number; supplierQueue?: number; declined30?: number };
}

// failed_payments מ-panel_stats_view תמיד 0 — אין סטטוס 'failed' ב-payments.
// ההתראות מבוססות על מה שבאמת דורש פעולה.
export default function AlertsPanel({ stats, extra }: Props) {
  const alerts = [
    { c:(stats?.pending_approvals??0)>0, icon:Clock,          label:"דיירים ממתינים לאישור",  value:stats?.pending_approvals??0, href:"/tenants",   color:"#eab308" },
    { c:(extra?.pendingReports??0)>0,    icon:Receipt,        label:"דיווחי תשלום ממתינים לוועד", value:extra?.pendingReports??0, href:"/debt",      color:"#eab308" },
    { c:(extra?.supplierQueue??0)>0,     icon:BadgeCheck,     label:"ספקים ממתינים לאימות",   value:extra?.supplierQueue??0,     href:"/suppliers", color:"#3b82f6" },
    { c:(extra?.declined30??0)>0,        icon:XCircle,        label:"סליקות שנדחו (30 יום)",  value:extra?.declined30??0,        href:"/money",     color:"#ef4444" },
    { c:(stats?.open_tickets??0)>0,      icon:AlertTriangle,  label:"תקלות פתוחות",           value:stats?.open_tickets??0,      href:"/tickets",   color:"#ef4444" },
  ].filter(a => a.c);

  return (
    <div className="card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>התראות</div>
        {alerts.length > 0 && (
          <span className="badge badge-red">{alerts.length}</span>
        )}
      </div>
      {alerts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>✅</div>
          <div style={{ fontSize: "14px", color: "var(--text-3)" }}>הכל תקין</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {alerts.map(a => (
            <Link key={a.label} href={a.href} style={{
              display: "flex", alignItems: "center", gap: "14px",
              padding: "14px", borderRadius: "10px",
              background: "var(--surface)", border: `1px solid ${a.color}30`,
              textDecoration: "none", transition: "border-color .15s",
            }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: a.color+"18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <a.icon size={18} color={a.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "15px", fontWeight: "500", color: "var(--text)" }}>{a.label}</div>
                <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "2px" }}>{a.value} פריטים</div>
              </div>
              <ChevronLeft size={16} color="var(--text-3)" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
