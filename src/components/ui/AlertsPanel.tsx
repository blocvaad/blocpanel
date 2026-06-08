import Link from "next/link";
import { Clock, XCircle, AlertTriangle, ChevronLeft } from "lucide-react";

interface Props { stats: { pending_approvals?:number; failed_payments?:number; open_tickets?:number } | null; }

export default function AlertsPanel({ stats }: Props) {
  const alerts = [
    { c:(stats?.pending_approvals??0)>0, icon:Clock,          label:"ממתינים לאישור",  value:stats?.pending_approvals??0, href:"/tenants",  color:"#eab308" },
    { c:(stats?.failed_payments??0)>0,   icon:XCircle,        label:"תשלומים נכשלו",   value:stats?.failed_payments??0,   href:"/payments", color:"#ef4444" },
    { c:(stats?.open_tickets??0)>0,      icon:AlertTriangle,  label:"תקלות פתוחות",    value:stats?.open_tickets??0,      href:"/tickets",  color:"#ef4444" },
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
